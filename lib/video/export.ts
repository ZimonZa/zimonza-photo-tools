import {
  judgeAttempt,
  MAX_TARGET_ATTEMPTS,
  nextVideoBps,
  planQuality,
  planTarget,
  STEP_DOWN_SHORT_SIDES,
  videoCeilingBps,
  type EncodePlan,
} from "@/lib/video/bitrate";
import { estimateBackupSeconds, isMobileDevice } from "@/lib/video/estimate";
import { resolveFrame } from "@/lib/video/frame";
import type { EngineId, EncodeJob, VideoEngine, VideoInfo } from "@/lib/video/engines/types";
import { scaleToShortSide, type Size } from "@/lib/video/geometry";
import { ExportCanceledError, TargetNotReachedError } from "@/lib/video/errors";
import { normalizeTrim, outputFileName, type EditRecipe } from "@/lib/video/recipe";

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

export interface ExportDeps {
  probe(file: File, onEngineDownload?: DownloadListener, onFallback?: (reason: string) => void): Promise<VideoInfo>;
  engines: Record<EngineId, VideoEngine>;
  /** Defaults to `isMobileDevice`. */
  isMobile?: () => boolean;
}

/** Probe with the fast reader; when it can't read the file, say why and use ffmpeg's. */
export function createProbe(
  fast: (file: File) => Promise<VideoInfo>,
  full: (file: File, onEngineDownload?: DownloadListener) => Promise<VideoInfo>
): ExportDeps["probe"] {
  return async (file, onEngineDownload, onFallback) => {
    try {
      return await fast(file);
    } catch (e) {
      onFallback?.(`Fast engine can't read this file: ${e instanceof Error ? e.message : String(e)}`);
      return full(file, onEngineDownload);
    }
  };
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

export async function exportVideo(
  recipe: EditRecipe,
  options: ExportOptions = {},
  deps?: ExportDeps
): Promise<ExportResult> {
  const started = Date.now();
  const signal = options.signal ?? new AbortController().signal;
  const status = (s: ExportStatus) => options.onStatus?.(s);
  const onEngineDownload = (loadedBytes: number, totalBytes: number | null) =>
    status({ phase: "loading-engine", engine: "ffmpeg", loadedBytes, totalBytes });
  const checkAbort = () => {
    if (signal.aborted) throw new ExportCanceledError();
  };

  checkAbort();
  const d = deps ?? (await loadDefaultDeps());
  status({ phase: "probing" });
  const info = await d.probe(recipe.file, onEngineDownload, (reason) => status({ phase: "probe-fallback", reason }));
  status({ phase: "probed", info });
  checkAbort();

  const trim = normalizeTrim(recipe.trim, info.durationSec);
  const durationSec = trim ? trim.end - trim.start : info.durationSec;
  const { crop, base, fit } = resolveFrame(
    { width: info.width, height: info.height },
    recipe.rotate,
    recipe.crop,
    recipe.frame
  );
  const source = base;
  // Whole-file average bitrate: re-encoding never needs more than the source already spent.
  const sourceBps = info.durationSec > 0 ? (recipe.file.size * 8) / info.durationSec : null;
  const planFor = (src: Size): EncodePlan =>
    recipe.size.kind === "target"
      ? planTarget({
          source: src,
          durationSec,
          targetBytes: recipe.size.bytes,
          hasAudio: info.hasAudio,
          muted: recipe.muted,
          maxLongSide: null,
          sourceBps,
        })
      : planQuality({
          source: src,
          level: recipe.size.level,
          hasAudio: info.hasAudio,
          muted: recipe.muted,
          maxLongSide: null,
          sourceBps,
        });
  const initialPlan = planFor(source);

  const targetBytes = recipe.size.kind === "target" ? recipe.size.bytes : null;

  const runOn = async (engine: VideoEngine, startPlan: EncodePlan): Promise<EngineRun> => {
    const baseJob: Omit<EncodeJob, "plan"> = {
      file: recipe.file,
      info,
      trim,
      edits: { rotate: recipe.rotate, flipH: recipe.flipH, flipV: recipe.flipV, crop, fit },
      container: recipe.container,
      signal,
      onProgress: (p) => options.onProgress?.(p),
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
    let plan = initialPlan;
    let check = await d.engines.webcodecs.precheck(info, plan);
    if (!check.ok && check.smallerMayWork) {
      const baseShort = Math.min(base.width, base.height);
      for (const s of STEP_DOWN_SHORT_SIDES.filter((x) => x < baseShort)) {
        const smaller = { ...planFor(scaleToShortSide(base, s)), steppedDown: true };
        const c = await d.engines.webcodecs.precheck(info, smaller);
        if (c.ok) {
          status({ phase: "smaller", width: smaller.width, height: smaller.height, reason: check.reason });
          plan = smaller;
          check = c;
          break;
        }
      }
    }
    if (check.ok) {
      try {
        engineId = "webcodecs";
        run = await runOn(d.engines.webcodecs, plan);
      } catch (e) {
        if (e instanceof ExportCanceledError) throw e;
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
