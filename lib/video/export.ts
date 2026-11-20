import {
  judgeAttempt,
  MAX_TARGET_ATTEMPTS,
  nextVideoBps,
  STEP_DOWN_SHORT_SIDES,
  videoCeilingBps,
  type EncodePlan,
} from "@/lib/video/bitrate";
import { estimateBackupSeconds, isMobileDevice } from "@/lib/video/estimate";
import type { EngineId, EncodeJob, SupportCheck, VideoEngine, VideoInfo } from "@/lib/video/engines/types";
import { scaleToShortSide, type Size } from "@/lib/video/geometry";
import { EngineUnsupportedError, ExportCanceledError, TargetNotReachedError } from "@/lib/video/errors";
import { estimateBytes, planOutput, type OutputPlan } from "@/lib/video/plan-output";
import { outputFileName, type Container, type EditRecipe, type TrimRange } from "@/lib/video/recipe";

export type ExportStatus =
  | { phase: "probing" }
  | { phase: "probed"; info: VideoInfo }
  | { phase: "loading-engine"; engine: "ffmpeg"; loadedBytes: number; totalBytes: number | null }
  | { phase: "encoding"; engine: EngineId; attempt: number }
  | { phase: "smaller"; width: number; height: number; reason: string }
  | { phase: "probe-fallback"; reason: string }
  | { phase: "fallback"; reason: string; estimatedSec: number };

export interface ExportOptions {
  /** "auto" (default) prefers WebCodecs and falls back to ffmpeg once. A forced engine never falls back. */
  engine?: "auto" | EngineId;
  signal?: AbortSignal;
  /** Progress of the current pass, 0..1. */
  onProgress?(p: number): void;
  onStatus?(s: ExportStatus): void;
  /** Auto mode asks before every run on the slow backup engine; false cancels the export. */
  confirmFallback?(f: { reason: string; estimatedSec: number }): Promise<boolean>;
}

export interface ExportResult {
  blob: Blob;
  fileName: string;
  engine: EngineId;
  width: number;
  height: number;
  attempts: number;
  steppedDown: boolean;
  elapsedMs: number;
  info: VideoInfo;
}

type DownloadListener = (loaded: number, total: number | null) => void;

export interface ProbeOptions {
  /** Progress of the backup engine's one-time download, when its reader is needed. */
  onEngineDownload?: DownloadListener;
  /** Says why, when the fast reader fails and ffmpeg's is used instead. */
  onFallback?(reason: string): void;
  /** Only the fast reader: reject with `EngineUnsupportedError` instead of downloading ffmpeg's. */
  fastOnly?: boolean;
}

export interface ExportDeps {
  probe(file: File, options?: ProbeOptions): Promise<VideoInfo>;
  engines: Record<EngineId, VideoEngine>;
  /** Defaults to `isMobileDevice`. */
  isMobile?: () => boolean;
}

/** Probe with the fast reader; when it can't read the file, say why and use ffmpeg's (unless `fastOnly`). */
export function createProbe(
  fast: (file: File) => Promise<VideoInfo>,
  full: (file: File, onEngineDownload?: DownloadListener) => Promise<VideoInfo>
): ExportDeps["probe"] {
  return async (file, { onEngineDownload, onFallback, fastOnly = false } = {}) => {
    try {
      return await fast(file);
    } catch (e) {
      const reason = `Fast engine can't read this file: ${e instanceof Error ? e.message : String(e)}`;
      if (fastOnly) throw new EngineUnsupportedError(reason);
      onFallback?.(reason);
      return full(file, onEngineDownload);
    }
  };
}

/** Read a video's details with the default probe (the fast reader, then ffmpeg's); engines load on demand. */
export async function probeVideo(file: File, options?: ProbeOptions): Promise<VideoInfo> {
  return (await loadDefaultDeps()).probe(file, options);
}

/** Real engines, loaded only when an export actually runs. */
async function loadDefaultDeps(): Promise<ExportDeps> {
  const [wc, ff] = await Promise.all([import("@/lib/video/engines/webcodecs"), import("@/lib/video/engines/ffmpeg")]);
  return {
    probe: createProbe(wc.probeWithMediabunny, ff.probeWithFfmpeg),
    engines: { webcodecs: wc.webcodecsEngine, ffmpeg: ff.ffmpegEngine },
  };
}

interface EngineRun {
  blob: Blob;
  plan: EncodePlan;
  attempts: number;
}

interface Prepared {
  d: ExportDeps;
  info: VideoInfo;
  trim: TrimRange | null;
  durationSec: number;
  crop: OutputPlan["crop"];
  base: Size;
  fit: OutputPlan["fit"];
  sourceBps: number | null;
  planFor: (src: Size) => EncodePlan;
  initialPlan: EncodePlan;
  targetBytes: number | null;
  onEngineDownload: DownloadListener;
}

/**
 * Shared by export and preview: probe, normalize the trim, resolve the frame, plan the bitrate.
 * `fastOnly` probes with the fast reader alone (see `ProbeOptions`).
 */
async function prepare(
  recipe: EditRecipe,
  deps: ExportDeps | undefined,
  status: (s: ExportStatus) => void,
  checkAbort: () => void,
  { fastOnly = false }: { fastOnly?: boolean } = {}
): Promise<Prepared> {
  const onEngineDownload = (loadedBytes: number, totalBytes: number | null) =>
    status({ phase: "loading-engine", engine: "ffmpeg", loadedBytes, totalBytes });
  const d = deps ?? (await loadDefaultDeps());
  status({ phase: "probing" });
  const info = await d.probe(recipe.file, {
    onEngineDownload,
    onFallback: (reason) => status({ phase: "probe-fallback", reason }),
    fastOnly,
  });
  status({ phase: "probed", info });
  checkAbort();

  const { plan, trim, durationSec, crop, base, fit, sourceBps, planFor } = planOutput(info, recipe);
  return {
    d,
    info,
    trim,
    durationSec,
    crop,
    base,
    fit,
    sourceBps,
    planFor,
    initialPlan: plan,
    targetBytes: recipe.size.kind === "target" ? recipe.size.bytes : null,
    onEngineDownload,
  };
}

/**
 * The plan the fast engine can run: the full-size one or, when only the size stopped it, the first
 * smaller step it can encode. `check` is the verdict on the plan returned. Shared by export and preview.
 */
async function fastEnginePlan(
  p: Prepared,
  container: Container,
  status: (s: ExportStatus) => void
): Promise<{ plan: EncodePlan; check: SupportCheck }> {
  const engine = p.d.engines.webcodecs;
  const check = await engine.precheck(p.info, p.initialPlan, container);
  if (check.ok || !check.smallerMayWork) return { plan: p.initialPlan, check };
  const baseShort = Math.min(p.base.width, p.base.height);
  for (const s of STEP_DOWN_SHORT_SIDES.filter((x) => x < baseShort)) {
    const smaller = { ...p.planFor(scaleToShortSide(p.base, s)), steppedDown: true };
    const c = await engine.precheck(p.info, smaller, container);
    if (c.ok) {
      status({ phase: "smaller", width: smaller.width, height: smaller.height, reason: check.reason });
      return { plan: smaller, check: c };
    }
  }
  return { plan: p.initialPlan, check };
}

export const SAMPLE_SECONDS = 3;

/**
 * A SAMPLE_SECONDS window around the playhead, kept inside the trim (or whole clip). Times are
 * clip-relative. A playhead that isn't a finite number counts as the start of that range.
 */
export function sampleWindow(trim: TrimRange | null, durationSec: number, atSec: number): TrimRange {
  const range = trim ?? { start: 0, end: durationSec };
  const at = Number.isFinite(atSec) ? atSec : range.start;
  const length = Math.min(SAMPLE_SECONDS, range.end - range.start);
  const start = Math.min(Math.max(at - length / 2, range.start), range.end - length);
  return { start, end: start + length };
}

export interface SamplePreview {
  blob: Blob;
  window: TrimRange;
  /** Estimated size of the full export. */
  estimatedBytes: number;
  plan: EncodePlan;
}

/**
 * A sample must never block or slow an export: they would share the one ffmpeg instance and the
 * device's hardware encoders. So an export stops every sample in flight and waits for it to settle
 * before it starts, and no sample starts while an export is running.
 */
const samplesInFlight = new Set<{ stop(): void; settled: Promise<void> }>();
let exportsRunning = 0;

/**
 * Encode a short sample around `atSec` with the real settings, on the fast engine only. Resolves
 * null when it can't run: the fast engine can't read or encode the file, or an export is running
 * (or starts meanwhile). Rejects with `ExportCanceledError` when `options.signal` aborts.
 */
export async function previewSample(
  recipe: EditRecipe,
  atSec: number,
  options: { signal?: AbortSignal } = {},
  deps?: ExportDeps
): Promise<SamplePreview | null> {
  const callerSignal = options.signal;
  if (callerSignal?.aborted) throw new ExportCanceledError();
  if (exportsRunning > 0) return null;

  const controller = new AbortController();
  const onCallerAbort = () => controller.abort();
  callerSignal?.addEventListener("abort", onCallerAbort, { once: true });
  let stoppedByExport = false;
  const work = encodeSample(recipe, atSec, controller.signal, deps);
  const entry = {
    stop: () => {
      stoppedByExport = true;
      controller.abort();
    },
    settled: work.then(
      () => {},
      () => {}
    ),
  };
  samplesInFlight.add(entry);
  try {
    return await work;
  } catch (e) {
    if (e instanceof EngineUnsupportedError) return null;
    if (e instanceof ExportCanceledError && stoppedByExport && !callerSignal?.aborted) return null;
    throw e;
  } finally {
    samplesInFlight.delete(entry);
    callerSignal?.removeEventListener("abort", onCallerAbort);
  }
}

async function encodeSample(
  recipe: EditRecipe,
  atSec: number,
  signal: AbortSignal,
  deps: ExportDeps | undefined
): Promise<SamplePreview | null> {
  const checkAbort = () => {
    if (signal.aborted) throw new ExportCanceledError();
  };
  // Fast reader only: a sample must never download or run ffmpeg.
  const p = await prepare(recipe, deps, () => {}, checkAbort, { fastOnly: true });
  const { plan, check } = await fastEnginePlan(p, recipe.container, () => {});
  if (!check.ok) return null;
  checkAbort();
  const sampleTrim = sampleWindow(p.trim, p.info.durationSec, atSec);
  const blob = await p.d.engines.webcodecs.encode({
    file: recipe.file,
    info: p.info,
    plan,
    trim: sampleTrim,
    edits: { rotate: recipe.rotate, flipH: recipe.flipH, flipV: recipe.flipV, crop: p.crop, fit: p.fit },
    container: recipe.container,
    signal,
    onProgress: () => {},
    onEngineDownload: p.onEngineDownload,
  });
  const estimatedBytes = estimateBytes(plan, p.durationSec, p.targetBytes);
  return { blob, window: sampleTrim, estimatedBytes, plan };
}

export async function exportVideo(
  recipe: EditRecipe,
  options: ExportOptions = {},
  deps?: ExportDeps
): Promise<ExportResult> {
  const started = Date.now();
  exportsRunning++;
  try {
    const samples = Array.from(samplesInFlight);
    for (const s of samples) s.stop();
    await Promise.all(samples.map((s) => s.settled));
    return await runExport(recipe, options, deps, started);
  } finally {
    exportsRunning--;
  }
}

async function runExport(
  recipe: EditRecipe,
  options: ExportOptions,
  deps: ExportDeps | undefined,
  started: number
): Promise<ExportResult> {
  const signal = options.signal ?? new AbortController().signal;
  const status = (s: ExportStatus) => options.onStatus?.(s);
  const checkAbort = () => {
    if (signal.aborted) throw new ExportCanceledError();
  };

  checkAbort();
  const p = await prepare(recipe, deps, status, checkAbort);
  const { d, info, trim, durationSec, crop, fit, sourceBps, initialPlan, targetBytes, onEngineDownload } = p;

  const runOn = async (engine: VideoEngine, startPlan: EncodePlan): Promise<EngineRun> => {
    const baseJob: Omit<EncodeJob, "plan"> = {
      file: recipe.file,
      info,
      trim,
      edits: { rotate: recipe.rotate, flipH: recipe.flipH, flipV: recipe.flipV, crop, fit },
      container: recipe.container,
      signal,
      onProgress: (fraction) => options.onProgress?.(fraction),
      onEngineDownload,
    };
    return targetBytes === null
      ? singlePass(engine, baseJob, startPlan, status)
      : targetLoop(engine, baseJob, startPlan, targetBytes, durationSec, sourceBps, status, checkAbort);
  };

  const choice = options.engine ?? "auto";
  let engineId: EngineId = "webcodecs";
  let run: EngineRun;

  const isMobile = d.isMobile ?? isMobileDevice;
  const runBackup = async (reason: string, plan: EncodePlan): Promise<EngineRun> => {
    const estimatedSec = estimateBackupSeconds(durationSec, plan, isMobile());
    status({ phase: "fallback", reason, estimatedSec });
    if (options.confirmFallback && !(await options.confirmFallback({ reason, estimatedSec }))) {
      throw new ExportCanceledError();
    }
    checkAbort();
    engineId = "ffmpeg";
    return runOn(d.engines.ffmpeg, plan);
  };

  if (choice !== "auto") {
    engineId = choice;
    run = await runOn(d.engines[choice], initialPlan);
  } else {
    const { plan, check } = await fastEnginePlan(p, recipe.container, status);
    if (check.ok) {
      try {
        engineId = "webcodecs";
        run = await runOn(d.engines.webcodecs, plan);
      } catch (e) {
        if (e instanceof ExportCanceledError) throw e;
        // Deliberate: the backup reuses the plan that was running (possibly stepped down) so the user-told size and estimate match.
        run = await runBackup(e instanceof Error ? e.message : String(e), plan);
      }
    } else {
      run = await runBackup(check.reason, plan);
    }
  }

  return {
    blob: run.blob,
    fileName: outputFileName(recipe.file.name, recipe.container),
    engine: engineId,
    width: run.plan.width,
    height: run.plan.height,
    attempts: run.attempts,
    steppedDown: run.plan.steppedDown,
    elapsedMs: Date.now() - started,
    info,
  };
}

async function singlePass(
  engine: VideoEngine,
  baseJob: Omit<EncodeJob, "plan">,
  plan: EncodePlan,
  status: (s: ExportStatus) => void
): Promise<EngineRun> {
  status({ phase: "encoding", engine: engine.id, attempt: 1 });
  return { blob: await engine.encode({ ...baseJob, plan }), plan, attempts: 1 };
}

/** Encode, measure, adjust — until the file lands in [90%, 100%] of the target or passes run out. */
async function targetLoop(
  engine: VideoEngine,
  baseJob: Omit<EncodeJob, "plan">,
  initialPlan: EncodePlan,
  targetBytes: number,
  durationSec: number,
  sourceBps: number | null,
  status: (s: ExportStatus) => void,
  checkAbort: () => void
): Promise<EngineRun> {
  const ceiling = (p: EncodePlan) => videoCeilingBps(p, sourceBps, p.audioBps);
  let plan = initialPlan;
  let best: { blob: Blob; plan: EncodePlan } | null = null;
  let attempts = 0;

  for (let attempt = 1; attempt <= MAX_TARGET_ATTEMPTS; attempt++) {
    checkAbort();
    attempts = attempt;
    status({ phase: "encoding", engine: engine.id, attempt });
    const blob = await engine.encode({ ...baseJob, plan });
    const verdict = judgeAttempt(blob.size, targetBytes);
    if (verdict !== "over" && (!best || blob.size > best.blob.size)) best = { blob, plan };
    if (verdict === "ok") break;
    if (verdict === "under-filled" && plan.videoBps >= ceiling(plan)) break;

    let next = nextVideoBps({
      prevVideoBps: plan.videoBps,
      actualBytes: blob.size,
      targetBytes,
      audioBps: plan.audioBps,
      durationSec,
    });
    if (verdict === "under-filled") next = Math.min(next, ceiling(plan));
    plan = { ...plan, videoBps: next };
  }

  if (!best) throw new TargetNotReachedError();
  return { blob: best.blob, plan: best.plan, attempts };
}
