import { create, type StoreApi, type UseBoundStore } from "zustand";
import type { VideoInfo } from "@/lib/video/engines/types";
import { isMobileDevice } from "@/lib/video/estimate";
import { remapCrop } from "@/lib/video/frame";
import { describeExportError, describeStudioStatus } from "@/lib/video/messages";
import { applyPreset, VIDEO_PRESETS, type PresetId } from "@/lib/video/presets";
import { BASE_RECIPE, MB, type EditRecipe } from "@/lib/video/recipe";
import type { ExportOptions, ExportResult, ExportStatus, SamplePreview } from "@/lib/video/export";

/** Quiet time after the last edit before a quality sample starts. */
export const QUALITY_DEBOUNCE_MS = 1000;

const DEFAULT_TARGET_MB = 10;

export type ToolId = "trim" | "crop" | "size" | "rotate" | "sound";

/** What a probe reports while it reads a file the fast reader can't: the switch to ffmpeg's reader and its download. */
export type ProbeStatus = Extract<ExportStatus, { phase: "probe-fallback" | "loading-engine" }>;

export type LoadState =
  | { kind: "empty" }
  /** `statusText` replaces "Reading the video…" while the backup reader is used (and downloaded). */
  | { kind: "probing"; file: File; statusText: string | null }
  | { kind: "preparing-preview"; file: File; info: VideoInfo }
  | { kind: "ready"; file: File; info: VideoInfo; previewUrl: string | null; proxy: boolean }
  | { kind: "error"; file: File; message: string };

export type ExportState =
  | { kind: "idle" }
  | {
      kind: "running";
      statusText: string;
      /** The current pass's progress, 0..1; every pass starts again from 0. */
      progress: number;
      /** Which encoding pass is running (a target size can take several); 0 until encoding starts. */
      attempt: number;
      startedAt: number;
      /**
       * When the current pass started encoding: at its "encoding" status, or at its first progress
       * after an engine download it waited for. The time-left guess divides this pass's time only.
       */
      passStartedAt: number;
      confirm: { reason: string; estimatedSec: number } | null;
    }
  | { kind: "done"; result: ExportResult; url: string }
  | { kind: "error"; message: string; hint?: string };

export interface QualityState {
  enabled: boolean;
  mode: "original" | "compressed";
  status: "idle" | "working" | "ready" | "unavailable";
  url: string | null;
  estimatedBytes: number | null;
}

/** A user-initiated seek; `id` changes on every call, so seeking to the same time twice still moves the video. */
export interface SeekRequest {
  time: number;
  id: number;
}

export interface VideoStoreDeps {
  /** Read the file's details; says when it falls back to ffmpeg's reader and how that one's download goes. */
  probe(file: File, onStatus: (s: ProbeStatus) => void): Promise<VideoInfo>;
  canPlay(file: File): Promise<boolean>;
  makeProxy(file: File, info: VideoInfo, signal: AbortSignal): Promise<Blob | null>;
  exportVideo(recipe: EditRecipe, options: ExportOptions): Promise<ExportResult>;
  previewSample(recipe: EditRecipe, atSec: number, options: { signal?: AbortSignal }): Promise<SamplePreview | null>;
  objectUrl(b: Blob | File): string;
  revoke(url: string): void;
  isMobile(): boolean;
  now(): number;
}

export type RecipeEdits = Omit<EditRecipe, "file">;

export interface VideoState {
  load: LoadState;
  recipe: RecipeEdits;
  presetId: PresetId;
  /** The last target size in MB, from the Form upload field or the export view; Form upload starts from it. */
  targetMb: number;
  tool: ToolId;
  /** Where the clip was last paused, looped or sought. Quality samples start here. */
  playhead: number;
  /** The video's live time for the timeline; changes while playing and never restarts a quality sample. */
  currentTime: number;
  seekRequest: SeekRequest;
  quality: QualityState;
  exportState: ExportState;
  /**
   * Why the size typed in the Size panel can't be used (it never reaches the recipe). While set,
   * the estimate line shows it and Export stays disabled.
   */
  sizeDraftError: string | null;

  openFile(file: File): Promise<void>;
  reset(): void;
  /**
   * Edit the recipe by hand; marks the preset Custom. Rotate/flip changes keep an existing crop on the
   * same picture area. A target size set here (the export view) becomes `targetMb` too.
   */
  updateRecipe(patch: Partial<RecipeEdits>): void;
  choosePreset(id: PresetId): void;
  setTargetMb(mb: number): void;
  setSizeDraftError(message: string | null): void;
  setTool(t: ToolId): void;
  /**
   * The player reports where the video paused or looped. Use `seek` to move the video. The time it
   * already holds changes nothing, so a short loop wrapping to its start keeps its quality sample.
   */
  setPlayhead(t: number): void;
  /** Move the video (and the playhead) to `t`; the preview seeks on every call, even to the same time. */
  seek(t: number): void;
  /** The player reports its live time. */
  reportTime(t: number): void;
  setQualityEnabled(on: boolean): void;
  setPreviewMode(m: "original" | "compressed"): void;
  /**
   * The export view covers the preview (true) or uncovers it (false). While covered no quality
   * sample is made; one in progress stops, and uncovering schedules a fresh one.
   */
  setPreviewSuspended(on: boolean): void;
  startExport(): Promise<void>;
  cancelExport(): void;
  answerFallback(ok: boolean): void;
  closeResult(): void;
}

/** Real engines; export.ts pulls in the encoders, so it is only imported when an export or sample runs. */
export const defaultDeps: VideoStoreDeps = {
  probe: async (file, onStatus) =>
    (await import("@/lib/video/export")).probeVideo(file, {
      onFallback: (reason) => onStatus({ phase: "probe-fallback", reason }),
      onEngineDownload: (loadedBytes, totalBytes) => onStatus({ phase: "loading-engine", engine: "ffmpeg", loadedBytes, totalBytes }),
    }),
  canPlay: async (file) => (await import("@/lib/video/playback")).canPlayNatively(file),
  makeProxy: async (file, info, signal) => (await import("@/lib/video/playback")).makePreviewProxy(file, info, signal),
  exportVideo: async (recipe, options) => (await import("@/lib/video/export")).exportVideo(recipe, options),
  previewSample: async (recipe, atSec, options) => (await import("@/lib/video/export")).previewSample(recipe, atSec, options),
  objectUrl: (b) => URL.createObjectURL(b),
  revoke: (url) => URL.revokeObjectURL(url),
  isMobile: isMobileDevice,
  now: () => Date.now(),
};

/**
 * Whether `next` differs from `prev` in nothing but the fit of the same exact frame. Choosing Crop
 * to fill or Blurred background keeps a preset's size and format, so it keeps the preset's name.
 */
function onlyFitChanged(prev: RecipeEdits, next: RecipeEdits): boolean {
  const a = prev.frame;
  const b = next.frame;
  if (a.kind !== "exact" || b.kind !== "exact" || a.width !== b.width || a.height !== b.height) return false;
  return (Object.keys(next) as (keyof RecipeEdits)[]).every((k) => k === "frame" || next[k] === prev[k]);
}

function describeProbeError(e: unknown): string {
  return e instanceof Error && e.message ? e.message : "Couldn't read this video.";
}

/** Build the editor store. Tests pass fake deps. */
export function createVideoStore(deps: VideoStoreDeps): UseBoundStore<StoreApi<VideoState>> {
  let sampleTimer: ReturnType<typeof setTimeout> | null = null;
  let sampleAbort: AbortController | null = null;
  let sampleRun = 0;
  let loadRun = 0;
  let proxyAbort: AbortController | null = null;
  let exportAbort: AbortController | null = null;
  let exportRun = 0;
  let fallbackResolve: ((ok: boolean) => void) | null = null;
  let seekId = 0;
  let previewSuspended = false;

  const initialQuality = (enabled: boolean, mode: QualityState["mode"] = "original"): QualityState => ({
    enabled,
    mode,
    status: "idle",
    url: null,
    estimatedBytes: null,
  });

  return create<VideoState>((set, get) => {
    /** Stop any pending or running sample. */
    const stopSample = () => {
      if (sampleTimer) clearTimeout(sampleTimer);
      sampleTimer = null;
      sampleAbort?.abort();
      sampleAbort = null;
      sampleRun++;
    };

    const revokeSampleUrl = () => {
      const { url } = get().quality;
      if (url) deps.revoke(url);
    };

    const fullRecipe = (): EditRecipe | null => {
      const { load, recipe } = get();
      return load.kind === "ready" ? { ...recipe, file: load.file } : null;
    };

    const runSample = async () => {
      const recipe = fullRecipe();
      if (!recipe || !get().quality.enabled || get().exportState.kind === "running" || previewSuspended) return;
      const run = ++sampleRun;
      const controller = new AbortController();
      sampleAbort = controller;
      set((s) => ({ quality: { ...s.quality, status: "working" } }));
      let preview: SamplePreview | null = null;
      try {
        preview = await deps.previewSample(recipe, get().playhead, { signal: controller.signal });
      } catch {
        preview = null;
      }
      if (run !== sampleRun || controller.signal.aborted) return; // superseded
      sampleAbort = null;
      if (!preview) {
        revokeSampleUrl();
        set((s) => ({ quality: { ...s.quality, status: "unavailable", url: null, estimatedBytes: null } }));
        return;
      }
      revokeSampleUrl();
      set((s) => ({
        quality: { ...s.quality, status: "ready", url: deps.objectUrl(preview.blob), estimatedBytes: preview.estimatedBytes },
      }));
    };

    /** (Re)start the debounce; called after every change that affects the sample. */
    const scheduleSample = () => {
      stopSample();
      const { quality, load, exportState } = get();
      if (load.kind !== "ready" || exportState.kind === "running" || previewSuspended) return;
      if (!quality.enabled) {
        if (quality.status === "working") set({ quality: { ...quality, status: "idle" } });
        return;
      }
      sampleTimer = setTimeout(() => {
        sampleTimer = null;
        void runSample();
      }, QUALITY_DEBOUNCE_MS);
    };

    const releaseClip = () => {
      loadRun++;
      // Cancel a running export: answer an open question "no", abort, and make its late results stale.
      exportRun++;
      fallbackResolve?.(false);
      fallbackResolve = null;
      exportAbort?.abort();
      exportAbort = null;
      proxyAbort?.abort();
      proxyAbort = null;
      stopSample();
      const { load, quality, exportState } = get();
      if (load.kind === "ready" && load.previewUrl) deps.revoke(load.previewUrl);
      if (quality.url) deps.revoke(quality.url);
      if (exportState.kind === "done") deps.revoke(exportState.url);
    };

    const clipDefaults = (): Pick<
      VideoState,
      "recipe" | "presetId" | "targetMb" | "tool" | "playhead" | "currentTime" | "exportState" | "sizeDraftError"
    > => ({
      recipe: { ...BASE_RECIPE },
      presetId: "custom",
      targetMb: DEFAULT_TARGET_MB,
      tool: "trim",
      playhead: 0,
      currentTime: 0,
      exportState: { kind: "idle" },
      sizeDraftError: null,
    });

    return {
      load: { kind: "empty" },
      ...clipDefaults(),
      seekRequest: { time: 0, id: 0 },
      quality: initialQuality(!deps.isMobile()),

      async openFile(file) {
        releaseClip();
        const run = loadRun;
        set({
          ...clipDefaults(),
          load: { kind: "probing", file, statusText: null },
          quality: initialQuality(get().quality.enabled, get().quality.mode),
        });
        // A probe can't be stopped; one that was superseded (Cancel, another file) still reports, unheard.
        const onStatus = (status: ProbeStatus) => {
          if (run === loadRun) set({ load: { kind: "probing", file, statusText: describeStudioStatus(status) } });
        };
        let info: VideoInfo;
        try {
          info = await deps.probe(file, onStatus);
        } catch (e) {
          if (run === loadRun) set({ load: { kind: "error", file, message: describeProbeError(e) } });
          return;
        }
        if (run !== loadRun) return;

        let previewUrl: string | null = null;
        let proxy = false;
        let playable = true;
        try {
          playable = await deps.canPlay(file);
        } catch {
          playable = false;
        }
        if (run !== loadRun) return;
        if (playable) {
          previewUrl = deps.objectUrl(file);
        } else {
          set({ load: { kind: "preparing-preview", file, info } });
          const controller = new AbortController();
          proxyAbort = controller;
          let blob: Blob | null = null;
          try {
            blob = await deps.makeProxy(file, info, controller.signal);
          } catch {
            blob = null;
          }
          if (run !== loadRun) return;
          proxyAbort = null;
          if (blob) {
            previewUrl = deps.objectUrl(blob);
            proxy = true;
          }
        }
        set({ load: { kind: "ready", file, info, previewUrl, proxy } });
        scheduleSample();
      },

      reset() {
        releaseClip();
        set({ ...clipDefaults(), load: { kind: "empty" }, quality: initialQuality(get().quality.enabled, get().quality.mode) });
      },

      updateRecipe(patch) {
        const { recipe, load } = get();
        const next: RecipeEdits = { ...recipe, ...patch };
        const turned =
          next.rotate !== recipe.rotate || next.flipH !== recipe.flipH || next.flipV !== recipe.flipV;
        if (turned && next.crop && patch.crop === undefined && (load.kind === "ready" || load.kind === "preparing-preview")) {
          next.crop = remapCrop(
            next.crop,
            { width: load.info.width, height: load.info.height },
            { rotate: recipe.rotate, flipH: recipe.flipH, flipV: recipe.flipV },
            { rotate: next.rotate, flipH: next.flipH, flipV: next.flipV }
          );
        }
        // One target MB wherever it was typed, so a later Form upload starts from it, not from a stale one.
        const targetMb = patch.size?.kind === "target" ? patch.size.bytes / MB : get().targetMb;
        set({ recipe: next, presetId: onlyFitChanged(recipe, next) ? get().presetId : "custom", targetMb });
        scheduleSample();
      },

      choosePreset(id) {
        const preset = VIDEO_PRESETS.find((p) => p.id === id);
        if (!preset) return;
        const { recipe, targetMb } = get();
        const { file: _file, ...applied } = applyPreset({ ...recipe, file: undefined as unknown as File }, preset, targetMb);
        set({ recipe: applied, presetId: id });
        scheduleSample();
      },

      setTargetMb(mb) {
        set({ targetMb: mb });
        if (get().presetId === "form") get().choosePreset("form");
      },

      setSizeDraftError: (sizeDraftError) => set({ sizeDraftError }),

      setTool: (tool) => set({ tool }),

      setPlayhead(t) {
        if (t === get().playhead) return;
        set({ playhead: t });
        scheduleSample();
      },

      seek(t) {
        set({ playhead: t, currentTime: t, seekRequest: { time: t, id: ++seekId } });
        scheduleSample();
      },

      reportTime: (t) => set({ currentTime: t }),

      setQualityEnabled(on) {
        set((s) => ({ quality: { ...s.quality, enabled: on } }));
        if (!on) {
          stopSample();
          revokeSampleUrl();
          set((s) => ({ quality: { ...s.quality, status: "idle", url: null, estimatedBytes: null } }));
          return;
        }
        scheduleSample();
      },

      setPreviewMode: (mode) => set((s) => ({ quality: { ...s.quality, mode } })),

      setPreviewSuspended(on) {
        if (on === previewSuspended) return;
        previewSuspended = on;
        if (!on) return scheduleSample();
        stopSample();
        set((s) => (s.quality.status === "working" ? { quality: { ...s.quality, status: "idle" } } : s));
      },

      async startExport() {
        const recipe = fullRecipe();
        if (!recipe || get().exportState.kind === "running") return;
        stopSample();
        const previous = get().exportState;
        if (previous.kind === "done") deps.revoke(previous.url);
        const startedAt = deps.now();
        set((s) => ({
          quality: { ...s.quality, status: s.quality.status === "working" ? "idle" : s.quality.status },
          exportState: {
            kind: "running",
            statusText: "Starting…",
            progress: 0,
            attempt: 0,
            startedAt,
            passStartedAt: startedAt,
            confirm: null,
          },
        }));
        const run = ++exportRun;
        const controller = new AbortController();
        exportAbort = controller;
        const patchRunning = (patch: Partial<Extract<ExportState, { kind: "running" }>>) =>
          set((s) => (s.exportState.kind === "running" ? { exportState: { ...s.exportState, ...patch } } : s));
        const targetBytes = recipe.size.kind === "target" ? recipe.size.bytes : null;
        // A pass can wait for the backup engine's download; its first progress after that puts the
        // pass's own line back and starts its clock.
        let passText: string | null = null;
        let downloading = false;

        try {
          const result = await deps.exportVideo(recipe, {
            signal: controller.signal,
            onProgress: (progress) => {
              if (run !== exportRun) return;
              if (!downloading) return patchRunning({ progress });
              downloading = false;
              patchRunning({ progress, passStartedAt: deps.now(), ...(passText ? { statusText: passText } : {}) });
            },
            onStatus: (status) => {
              if (run !== exportRun) return;
              const statusText = describeStudioStatus(status);
              downloading = status.phase === "loading-engine";
              if (status.phase !== "encoding") return patchRunning({ statusText });
              passText = statusText;
              patchRunning({ statusText, attempt: status.attempt, progress: 0, passStartedAt: deps.now() });
            },
            confirmFallback: (confirm) =>
              new Promise<boolean>((resolve) => {
                if (run !== exportRun) return resolve(false);
                fallbackResolve?.(false);
                fallbackResolve = resolve;
                patchRunning({ confirm });
              }),
          });
          if (run !== exportRun) return; // superseded by a new clip or export
          if (controller.signal.aborted) set({ exportState: { kind: "idle" } });
          else set({ exportState: { kind: "done", result, url: deps.objectUrl(result.blob) } });
        } catch (e) {
          if (run !== exportRun) return;
          const described = describeExportError(e, targetBytes);
          set({
            exportState: described
              ? { kind: "error", message: described.message, ...(described.hint ? { hint: described.hint } : {}) }
              : { kind: "idle" },
          });
        } finally {
          if (run === exportRun) {
            fallbackResolve?.(false);
            fallbackResolve = null;
            exportAbort = null;
          }
        }
        scheduleSample();
      },

      cancelExport() {
        get().answerFallback(false);
        exportAbort?.abort();
      },

      answerFallback(ok) {
        const resolve = fallbackResolve;
        if (!resolve) return;
        fallbackResolve = null;
        set((s) => (s.exportState.kind === "running" ? { exportState: { ...s.exportState, confirm: null } } : s));
        resolve(ok);
      },

      closeResult() {
        const { exportState } = get();
        if (exportState.kind === "done") deps.revoke(exportState.url);
        set({ exportState: { kind: "idle" } });
        scheduleSample();
      },
    };
  });
}

/** The editor's store, wired to the real engines. */
export const useVideoStore = createVideoStore(defaultDeps);
