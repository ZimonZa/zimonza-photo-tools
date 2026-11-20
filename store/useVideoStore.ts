import { create, type StoreApi, type UseBoundStore } from "zustand";
import type { VideoInfo } from "@/lib/video/engines/types";
import { isMobileDevice } from "@/lib/video/estimate";
import { remapCrop } from "@/lib/video/frame";
import { describeExportError, describeStatus } from "@/lib/video/messages";
import { applyPreset, VIDEO_PRESETS, type PresetId } from "@/lib/video/presets";
import { BASE_RECIPE, type EditRecipe } from "@/lib/video/recipe";
import type { ExportOptions, ExportResult, SamplePreview } from "@/lib/video/export";

/** Quiet time after the last edit before a quality sample starts. */
export const QUALITY_DEBOUNCE_MS = 1000;

const DEFAULT_TARGET_MB = 10;

export type ToolId = "trim" | "crop" | "size" | "rotate" | "sound";

export type LoadState =
  | { kind: "empty" }
  | { kind: "probing"; file: File }
  | { kind: "preparing-preview"; file: File; info: VideoInfo }
  | { kind: "ready"; file: File; info: VideoInfo; previewUrl: string | null; proxy: boolean }
  | { kind: "error"; file: File; message: string };

export type ExportState =
  | { kind: "idle" }
  | {
      kind: "running";
      statusText: string;
      progress: number;
      startedAt: number;
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

export interface VideoStoreDeps {
  probe(file: File): Promise<VideoInfo>;
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
  targetMb: number;
  tool: ToolId;
  playhead: number;
  quality: QualityState;
  exportState: ExportState;

  openFile(file: File): Promise<void>;
  reset(): void;
  /** Edit the recipe by hand; marks the preset Custom. Rotate/flip changes keep an existing crop on the same picture area. */
  updateRecipe(patch: Partial<RecipeEdits>): void;
  choosePreset(id: PresetId): void;
  setTargetMb(mb: number): void;
  setTool(t: ToolId): void;
  setPlayhead(t: number): void;
  setQualityEnabled(on: boolean): void;
  setPreviewMode(m: "original" | "compressed"): void;
  startExport(): Promise<void>;
  cancelExport(): void;
  answerFallback(ok: boolean): void;
  closeResult(): void;
}

/** Real engines; export.ts pulls in the encoders, so it is only imported when an export or sample runs. */
export const defaultDeps: VideoStoreDeps = {
  probe: async (file) => (await import("@/lib/video/export")).probeVideo(file),
  // Task 4 swaps these two placeholders for the real playback helpers.
  canPlay: async () => true,
  makeProxy: async () => null,
  exportVideo: async (recipe, options) => (await import("@/lib/video/export")).exportVideo(recipe, options),
  previewSample: async (recipe, atSec, options) => (await import("@/lib/video/export")).previewSample(recipe, atSec, options),
  objectUrl: (b) => URL.createObjectURL(b),
  revoke: (url) => URL.revokeObjectURL(url),
  isMobile: isMobileDevice,
  now: () => Date.now(),
};

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
  let fallbackResolve: ((ok: boolean) => void) | null = null;

  const initialQuality = (enabled: boolean, mode: QualityState["mode"] = "compressed"): QualityState => ({
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
      if (!recipe || !get().quality.enabled || get().exportState.kind === "running") return;
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
      if (load.kind !== "ready" || exportState.kind === "running") return;
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
      proxyAbort?.abort();
      proxyAbort = null;
      stopSample();
      const { load, quality, exportState } = get();
      if (load.kind === "ready" && load.previewUrl) deps.revoke(load.previewUrl);
      if (quality.url) deps.revoke(quality.url);
      if (exportState.kind === "done") deps.revoke(exportState.url);
    };

    const clipDefaults = (): Pick<VideoState, "recipe" | "presetId" | "targetMb" | "tool" | "playhead" | "exportState"> => ({
      recipe: { ...BASE_RECIPE },
      presetId: "custom",
      targetMb: DEFAULT_TARGET_MB,
      tool: "trim",
      playhead: 0,
      exportState: { kind: "idle" },
    });

    return {
      load: { kind: "empty" },
      ...clipDefaults(),
      quality: initialQuality(!deps.isMobile()),

      async openFile(file) {
        releaseClip();
        const run = loadRun;
        set({ ...clipDefaults(), load: { kind: "probing", file }, quality: initialQuality(get().quality.enabled, get().quality.mode) });
        let info: VideoInfo;
        try {
          info = await deps.probe(file);
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
        set({ recipe: next, presetId: "custom" });
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

      setTool: (tool) => set({ tool }),

      setPlayhead(t) {
        set({ playhead: t });
        scheduleSample();
      },

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

      async startExport() {
        const recipe = fullRecipe();
        if (!recipe || get().exportState.kind === "running") return;
        stopSample();
        const previous = get().exportState;
        if (previous.kind === "done") deps.revoke(previous.url);
        set((s) => ({
          quality: { ...s.quality, status: s.quality.status === "working" ? "idle" : s.quality.status },
          exportState: { kind: "running", statusText: "Starting…", progress: 0, startedAt: deps.now(), confirm: null },
        }));
        const controller = new AbortController();
        exportAbort = controller;
        const patchRunning = (patch: Partial<Extract<ExportState, { kind: "running" }>>) =>
          set((s) => (s.exportState.kind === "running" ? { exportState: { ...s.exportState, ...patch } } : s));
        const targetBytes = recipe.size.kind === "target" ? recipe.size.bytes : null;

        try {
          const result = await deps.exportVideo(recipe, {
            signal: controller.signal,
            onProgress: (progress) => patchRunning({ progress }),
            onStatus: (status) => patchRunning({ statusText: describeStatus(status) }),
            confirmFallback: (confirm) =>
              new Promise<boolean>((resolve) => {
                fallbackResolve = resolve;
                patchRunning({ confirm });
              }),
          });
          if (controller.signal.aborted) set({ exportState: { kind: "idle" } });
          else set({ exportState: { kind: "done", result, url: deps.objectUrl(result.blob) } });
        } catch (e) {
          const described = describeExportError(e, targetBytes);
          set({
            exportState: described
              ? { kind: "error", message: described.message, ...(described.hint ? { hint: described.hint } : {}) }
              : { kind: "idle" },
          });
        } finally {
          exportAbort = null;
          fallbackResolve = null;
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
