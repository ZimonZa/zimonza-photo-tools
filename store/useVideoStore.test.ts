import { afterEach, beforeEach, describe, expect, test, vi } from "vitest";
import { createJobQueue } from "@/lib/video/engines/job-queue";
import type { VideoInfo } from "@/lib/video/engines/types";
import { ExportCanceledError, TargetNotReachedError } from "@/lib/video/errors";
import type { ExportOptions, ExportResult, SamplePreview } from "@/lib/video/export";
import { MB, type EditRecipe } from "@/lib/video/recipe";
import { createVideoStore, QUALITY_DEBOUNCE_MS, type ProbeStatus, type VideoStoreDeps } from "@/store/useVideoStore";

const INFO: VideoInfo = {
  durationSec: 60,
  startSec: 0,
  width: 1920,
  height: 1080,
  rotation: 0,
  videoCodec: "avc1",
  audioCodec: "mp4a",
  hasAudio: true,
  readableByMediabunny: true,
};

const file = (name = "a.mp4") => new File(["x"], name, { type: "video/mp4" });

interface Deferred<T> {
  promise: Promise<T>;
  resolve(v: T): void;
  reject(e: unknown): void;
}
function deferred<T>(): Deferred<T> {
  let resolve!: (v: T) => void;
  let reject!: (e: unknown) => void;
  const promise = new Promise<T>((res, rej) => {
    resolve = res;
    reject = rej;
  });
  return { promise, resolve, reject };
}

const result = (): ExportResult => ({
  blob: new Blob(["out"]),
  fileName: "a-zimonza.mp4",
  engine: "webcodecs",
  width: 1920,
  height: 1080,
  attempts: 1,
  steppedDown: false,
  elapsedMs: 10,
  info: INFO,
});
const sample = (bytes = 5_000_000): SamplePreview =>
  ({ blob: new Blob(["s"]), window: { start: 0, end: 3 }, estimatedBytes: bytes, plan: {} }) as unknown as SamplePreview;

let urlCount = 0;
function makeDeps(over: Partial<VideoStoreDeps> = {}) {
  const revoked: string[] = [];
  const deps: VideoStoreDeps = {
    probe: vi.fn(async () => INFO),
    canPlay: vi.fn(async () => true),
    makeProxy: vi.fn(async () => null),
    exportVideo: vi.fn(async () => result()),
    previewSample: vi.fn(async () => sample()),
    objectUrl: vi.fn(() => `blob:${++urlCount}`),
    revoke: vi.fn((u: string) => void revoked.push(u)),
    isMobile: vi.fn(() => false),
    now: vi.fn(() => 1000),
    ...over,
  };
  return { deps, revoked };
}

async function ready(over: Partial<VideoStoreDeps> = {}) {
  const made = makeDeps(over);
  const store = createVideoStore(made.deps);
  await store.getState().openFile(file());
  return { ...made, store };
}

beforeEach(() => {
  vi.useFakeTimers();
  urlCount = 0;
});
afterEach(() => vi.useRealTimers());

describe("loading", () => {
  test("openFile probes, then uses the file directly when the browser can play it", async () => {
    const { store, deps } = await ready();
    const s = store.getState();
    expect(deps.probe).toHaveBeenCalled();
    expect(s.load.kind).toBe("ready");
    if (s.load.kind !== "ready") throw new Error();
    expect(s.load.proxy).toBe(false);
    expect(s.load.previewUrl).toBe("blob:1");
    expect(s.load.info).toBe(INFO);
  });

  test("unplayable file gets a proxy preview", async () => {
    const proxy = new Blob(["p"]);
    const { store, deps } = await ready({ canPlay: async () => false, makeProxy: vi.fn(async () => proxy) });
    const s = store.getState();
    if (s.load.kind !== "ready") throw new Error("not ready");
    expect(s.load.proxy).toBe(true);
    expect(s.load.previewUrl).toBe("blob:1");
    expect(deps.objectUrl).toHaveBeenCalledWith(proxy);
  });

  test("unplayable and no proxy → thumbnails-only (previewUrl null), not an error", async () => {
    const { store } = await ready({ canPlay: async () => false, makeProxy: async () => null });
    const s = store.getState();
    expect(s.load.kind).toBe("ready");
    if (s.load.kind === "ready") {
      expect(s.load.previewUrl).toBeNull();
      expect(s.load.proxy).toBe(false);
    }
  });

  test("probe failure → error state with message", async () => {
    const { store } = await ready({
      probe: async () => {
        throw new Error("bad file");
      },
    });
    const s = store.getState();
    expect(s.load.kind).toBe("error");
    if (s.load.kind === "error") expect(s.load.message).toContain("bad file");
  });

  test("opening a new file revokes old URLs and resets recipe, preset, trim and quality", async () => {
    const { store, revoked } = await ready();
    store.getState().choosePreset("ig-reel");
    store.getState().updateRecipe({ trim: { start: 1, end: 5 }, muted: true });
    await vi.advanceTimersByTimeAsync(QUALITY_DEBOUNCE_MS + 10);
    expect(store.getState().quality.url).not.toBeNull();
    const old = store.getState().load;
    const oldPreview = old.kind === "ready" ? old.previewUrl : null;
    const oldSample = store.getState().quality.url;
    await store.getState().openFile(file("b.mp4"));
    const s = store.getState();
    expect(revoked).toContain(oldPreview);
    expect(revoked).toContain(oldSample);
    expect(s.recipe.trim).toBeNull();
    expect(s.recipe.muted).toBe(false);
    expect(s.recipe.frame).toEqual({ kind: "source", maxLongSide: null });
    expect(s.presetId).toBe("custom");
    expect(s.quality.url).toBeNull();
    expect(s.quality.status).toBe("idle");
    expect(s.quality.estimatedBytes).toBeNull();
    expect(s.playhead).toBe(0);
  });
});

describe("recipe and presets", () => {
  test("updateRecipe marks the preset Custom", async () => {
    const { store } = await ready();
    store.getState().choosePreset("ig-reel");
    expect(store.getState().presetId).toBe("ig-reel");
    store.getState().updateRecipe({ muted: true });
    const s = store.getState();
    expect(s.presetId).toBe("custom");
    expect(s.recipe.muted).toBe(true);
    expect(s.recipe.frame).toEqual({ kind: "exact", width: 1080, height: 1920, fit: "cover" });
  });

  test("changing only the fit of a preset's exact frame keeps the preset", async () => {
    const { store } = await ready();
    store.getState().choosePreset("ig-reel");
    const frame = store.getState().recipe.frame;
    if (frame.kind !== "exact") throw new Error("expected an exact frame");
    store.getState().updateRecipe({ frame: { ...frame, fit: "blur" } });
    expect(store.getState().presetId).toBe("ig-reel");
    expect(store.getState().recipe.frame).toEqual({ kind: "exact", width: 1080, height: 1920, fit: "blur" });
    // Back to cover: still the preset.
    store.getState().updateRecipe({ frame: { ...frame, fit: "cover" } });
    expect(store.getState().presetId).toBe("ig-reel");
    // A fit change together with anything else is a hand edit.
    store.getState().updateRecipe({ frame: { ...frame, fit: "blur" }, muted: true });
    expect(store.getState().presetId).toBe("custom");
  });

  test("a new exact size, or a fit on a non-exact frame, still turns the preset Custom", async () => {
    const { store } = await ready();
    store.getState().choosePreset("ig-reel");
    store.getState().updateRecipe({ frame: { kind: "exact", width: 1080, height: 1350, fit: "cover" } });
    expect(store.getState().presetId).toBe("custom");
    store.getState().choosePreset("whatsapp");
    store.getState().updateRecipe({ frame: { kind: "exact", width: 1280, height: 720, fit: "blur" } });
    expect(store.getState().presetId).toBe("custom");
  });

  test("rotating after a crop remaps the crop", async () => {
    const { store } = await ready({ probe: async () => ({ ...INFO, width: 640, height: 360 }) });
    store.getState().updateRecipe({ crop: { left: 0, top: 0, width: 100, height: 50 } });
    store.getState().updateRecipe({ rotate: 90 });
    expect(store.getState().recipe.crop).toEqual({ left: 310, top: 0, width: 50, height: 100 });
  });

  test("choosePreset form uses targetMb", async () => {
    const { store } = await ready();
    store.getState().setTargetMb(25);
    store.getState().choosePreset("form");
    const s = store.getState();
    expect(s.recipe.size).toEqual({ kind: "target", bytes: 25 * MB });
    expect(s.recipe.container).toBe("mp4");
    expect(s.presetId).toBe("form");
  });

  test("a size typed but not usable is held as a message, never in the recipe; a new file or reset clears it", async () => {
    const { store } = await ready();
    const recipe = store.getState().recipe;
    store.getState().setSizeDraftError("That output size is too small. Use at least 16 × 16 pixels.");
    expect(store.getState().sizeDraftError).toBe("That output size is too small. Use at least 16 × 16 pixels.");
    expect(store.getState().recipe).toBe(recipe);
    expect(store.getState().presetId).toBe("custom");
    await store.getState().openFile(file("b.mp4"));
    expect(store.getState().sizeDraftError).toBeNull();
    store.getState().setSizeDraftError("x");
    store.getState().reset();
    expect(store.getState().sizeDraftError).toBeNull();
  });
});

describe("quality sample", () => {
  test("quality default: on for computers, off for phones", () => {
    expect(createVideoStore(makeDeps({ isMobile: () => false }).deps).getState().quality.enabled).toBe(true);
    expect(createVideoStore(makeDeps({ isMobile: () => true }).deps).getState().quality.enabled).toBe(false);
  });

  test("the preview starts on the live Original view", () => {
    expect(createVideoStore(makeDeps().deps).getState().quality.mode).toBe("original");
  });

  test("seek sets the playhead and gives every call its own request id", () => {
    const store = createVideoStore(makeDeps().deps);
    store.getState().seek(5);
    const first = store.getState().seekRequest;
    expect(store.getState().playhead).toBe(5);
    expect(first.time).toBe(5);
    store.getState().seek(5);
    const second = store.getState().seekRequest;
    expect(second.time).toBe(5);
    expect(second.id).not.toBe(first.id);
  });

  test("runs 1 s after the last change and only the latest result is kept", async () => {
    const first = deferred<SamplePreview | null>();
    const second = deferred<SamplePreview | null>();
    const signals: (AbortSignal | undefined)[] = [];
    const previewSample = vi.fn((_r: EditRecipe, _at: number, o: { signal?: AbortSignal }) => {
      signals.push(o.signal);
      return previewSample.mock.calls.length === 1 ? first.promise : second.promise;
    });
    const { store } = await ready({ previewSample });
    store.getState().setPlayhead(12);
    store.getState().updateRecipe({ muted: true });
    await vi.advanceTimersByTimeAsync(300);
    store.getState().updateRecipe({ muted: false, rotate: 180 });
    await vi.advanceTimersByTimeAsync(QUALITY_DEBOUNCE_MS - 1);
    expect(previewSample).not.toHaveBeenCalled();
    await vi.advanceTimersByTimeAsync(1);
    expect(previewSample).toHaveBeenCalledTimes(1);
    expect(previewSample.mock.calls[0][1]).toBe(12);
    expect(previewSample.mock.calls[0][0].file).toBeInstanceOf(File);
    expect(store.getState().quality.status).toBe("working");

    store.getState().updateRecipe({ flipH: true });
    expect(signals[0]?.aborted).toBe(true);
    await vi.advanceTimersByTimeAsync(QUALITY_DEBOUNCE_MS);
    expect(previewSample).toHaveBeenCalledTimes(2);

    first.resolve(sample(1));
    second.resolve(sample(7_000_000));
    await vi.advanceTimersByTimeAsync(0);
    const q = store.getState().quality;
    expect(q.status).toBe("ready");
    expect(q.estimatedBytes).toBe(7_000_000);
    expect(q.url).not.toBeNull();
  });

  test("a replaced sample url is revoked", async () => {
    const { store, revoked } = await ready();
    store.getState().updateRecipe({ muted: true });
    await vi.advanceTimersByTimeAsync(QUALITY_DEBOUNCE_MS);
    const url1 = store.getState().quality.url;
    store.getState().updateRecipe({ muted: false });
    await vi.advanceTimersByTimeAsync(QUALITY_DEBOUNCE_MS);
    expect(store.getState().quality.url).not.toBe(url1);
    expect(revoked).toContain(url1);
  });

  test("unavailable when previewSample resolves null", async () => {
    const { store } = await ready({ previewSample: async () => null });
    store.getState().updateRecipe({ muted: true });
    await vi.advanceTimersByTimeAsync(QUALITY_DEBOUNCE_MS);
    expect(store.getState().quality.status).toBe("unavailable");
    expect(store.getState().quality.url).toBeNull();
  });

  test("no quality sample while the export view covers the preview; one in progress stops; uncovering schedules one", async () => {
    const inflight = deferred<SamplePreview | null>();
    let signal: AbortSignal | undefined;
    const previewSample = vi.fn((_r: EditRecipe, _a: number, o: { signal?: AbortSignal }) => {
      signal = o.signal;
      return previewSample.mock.calls.length === 1 ? inflight.promise : Promise.resolve(sample(3_000_000));
    });
    const { store } = await ready({ previewSample });
    await vi.advanceTimersByTimeAsync(QUALITY_DEBOUNCE_MS);
    expect(store.getState().quality.status).toBe("working");

    store.getState().setPreviewSuspended(true);
    expect(signal?.aborted).toBe(true);
    expect(store.getState().quality.status).toBe("idle");
    // Edits in the export view (format, target) don't start one.
    store.getState().updateRecipe({ container: "webm" });
    store.getState().setPlayhead(2);
    await vi.advanceTimersByTimeAsync(QUALITY_DEBOUNCE_MS * 3);
    expect(previewSample).toHaveBeenCalledTimes(1);

    store.getState().setPreviewSuspended(false);
    await vi.advanceTimersByTimeAsync(QUALITY_DEBOUNCE_MS);
    expect(previewSample).toHaveBeenCalledTimes(2);
    expect(store.getState().quality).toMatchObject({ status: "ready", estimatedBytes: 3_000_000 });
  });

  test("no quality sample while exporting", async () => {
    const run = deferred<ExportResult>();
    const { store, deps } = await ready({ exportVideo: () => run.promise });
    void store.getState().startExport();
    expect(store.getState().exportState.kind).toBe("running");
    store.getState().updateRecipe({ muted: true });
    await vi.advanceTimersByTimeAsync(QUALITY_DEBOUNCE_MS * 3);
    expect(deps.previewSample).not.toHaveBeenCalled();
    run.resolve(result());
  });
});

describe("export", () => {
  test("running → done with url; quality sample stopped first", async () => {
    const inflight = deferred<SamplePreview | null>();
    let sampleSignal: AbortSignal | undefined;
    const run = deferred<ExportResult>();
    let opts!: ExportOptions;
    const { store } = await ready({
      previewSample: (_r, _a, o) => {
        sampleSignal = o.signal;
        return inflight.promise;
      },
      exportVideo: (_r, o) => {
        opts = o;
        return run.promise;
      },
    });
    store.getState().updateRecipe({ muted: true });
    await vi.advanceTimersByTimeAsync(QUALITY_DEBOUNCE_MS);
    expect(store.getState().quality.status).toBe("working");

    const p = store.getState().startExport();
    expect(sampleSignal?.aborted).toBe(true);
    expect(store.getState().quality.status).not.toBe("working");
    expect(store.getState().exportState.kind).toBe("running");
    opts.onProgress?.(0.4);
    opts.onStatus?.({ phase: "probing" });
    const s = store.getState().exportState;
    if (s.kind !== "running") throw new Error();
    expect(s.progress).toBe(0.4);
    expect(s.statusText).toBe("Reading the video…");
    expect(s.startedAt).toBe(1000);

    const r = result();
    run.resolve(r);
    await p;
    const done = store.getState().exportState;
    expect(done.kind).toBe("done");
    if (done.kind === "done") {
      expect(done.result).toBe(r);
      expect(done.url).toMatch(/^blob:/);
    }
  });

  test("each encoding pass is recorded and starts its progress from 0", async () => {
    const run = deferred<ExportResult>();
    let opts!: ExportOptions;
    const { store } = await ready({
      exportVideo: (_r, o) => {
        opts = o;
        return run.promise;
      },
    });
    const p = store.getState().startExport();
    const running = () => {
      const s = store.getState().exportState;
      if (s.kind !== "running") throw new Error("not running");
      return s;
    };
    expect(running().attempt).toBe(0);
    opts.onStatus?.({ phase: "encoding", engine: "webcodecs", attempt: 1 });
    opts.onProgress?.(1);
    expect(running()).toMatchObject({ attempt: 1, progress: 1 });
    // The first pass came out too big: a second pass starts over.
    opts.onStatus?.({ phase: "encoding", engine: "webcodecs", attempt: 2 });
    expect(running()).toMatchObject({ attempt: 2, progress: 0 });
    opts.onProgress?.(0.25);
    // Other statuses keep the pass and its progress.
    opts.onStatus?.({ phase: "smaller", width: 640, height: 360, reason: "x" });
    expect(running()).toMatchObject({ attempt: 2, progress: 0.25 });
    run.resolve(result());
    await p;
  });

  test("confirmFallback opens the question; answerFallback(true) continues, (false) cancels back to idle", async () => {
    for (const answer of [true, false]) {
      const { store } = await ready({
        exportVideo: async (_r, o) => {
          const ok = await o.confirmFallback!({ reason: "slow", estimatedSec: 90 });
          if (!ok) throw new ExportCanceledError();
          return result();
        },
      });
      const p = store.getState().startExport();
      await vi.advanceTimersByTimeAsync(0);
      const s = store.getState().exportState;
      expect(s.kind === "running" && s.confirm).toEqual({ reason: "slow", estimatedSec: 90 });
      store.getState().answerFallback(answer);
      await p;
      expect(store.getState().exportState.kind).toBe(answer ? "done" : "idle");
    }
  });

  test("cancelExport while the question is open answers no and returns to idle", async () => {
    let answered: boolean | null = null;
    const { store } = await ready({
      exportVideo: async (_r, o) => {
        answered = await o.confirmFallback!({ reason: "slow", estimatedSec: 5 });
        if (!answered) throw new ExportCanceledError();
        return result();
      },
    });
    const p = store.getState().startExport();
    await vi.advanceTimersByTimeAsync(0);
    store.getState().cancelExport();
    await p;
    expect(answered).toBe(false);
    expect(store.getState().exportState.kind).toBe("idle");
  });

  test("cancelExport aborts the signal; canceled → idle", async () => {
    let signal: AbortSignal | undefined;
    const { store } = await ready({
      exportVideo: (_r, o) =>
        new Promise((_res, rej) => {
          signal = o.signal;
          o.signal?.addEventListener("abort", () => rej(new ExportCanceledError()));
        }),
    });
    const p = store.getState().startExport();
    store.getState().cancelExport();
    await p;
    expect(signal?.aborted).toBe(true);
    expect(store.getState().exportState.kind).toBe("idle");
  });

  test("errors map to describeExportError text", async () => {
    const { store } = await ready({
      exportVideo: async () => {
        throw new TargetNotReachedError();
      },
    });
    store.getState().choosePreset("form");
    await store.getState().startExport();
    const s = store.getState().exportState;
    expect(s.kind).toBe("error");
    if (s.kind === "error") {
      expect(s.message).toContain("under 10 MB");
      expect(s.hint).toBeTruthy();
    }
  });

  test("a second startExport while running is ignored", async () => {
    const run = deferred<ExportResult>();
    const { store, deps } = await ready({ exportVideo: vi.fn(() => run.promise) });
    const p1 = store.getState().startExport();
    await store.getState().startExport();
    expect(deps.exportVideo).toHaveBeenCalledTimes(1);
    run.resolve(result());
    await p1;
  });

  test("startExport does nothing when no clip is ready", async () => {
    const { deps } = makeDeps();
    const store = createVideoStore(deps);
    await store.getState().startExport();
    expect(deps.exportVideo).not.toHaveBeenCalled();
    expect(store.getState().exportState.kind).toBe("idle");
  });

  test("closeResult revokes the result url and returns to idle", async () => {
    const { store, revoked } = await ready();
    await store.getState().startExport();
    const s = store.getState().exportState;
    if (s.kind !== "done") throw new Error("not done");
    store.getState().closeResult();
    expect(revoked).toContain(s.url);
    expect(store.getState().exportState.kind).toBe("idle");
  });
});

describe("opening a file the fast reader can't read", () => {
  const download = (loadedBytes: number, totalBytes: number | null): ProbeStatus => ({
    phase: "loading-engine",
    engine: "ffmpeg",
    loadedBytes,
    totalBytes,
  });

  test("the loading screen says the backup reader is used, then shows its download", async () => {
    const slow = deferred<VideoInfo>();
    let report!: (s: ProbeStatus) => void;
    const { deps } = makeDeps({
      probe: vi.fn((_f: File, onStatus: (s: ProbeStatus) => void) => {
        report = onStatus;
        return slow.promise;
      }),
    });
    const store = createVideoStore(deps);
    const opening = store.getState().openFile(file("a.avi"));
    expect(store.getState().load).toMatchObject({ kind: "probing", statusText: null });
    report({ phase: "probe-fallback", reason: "Fast engine can't read this file: Unsupported container" });
    expect(store.getState().load).toMatchObject({ kind: "probing", statusText: "Reading the video with the backup engine…" });
    report(download(3_200_000, 32_000_000));
    expect(store.getState().load).toMatchObject({
      kind: "probing",
      statusText: "Downloading the video engine… 3.2 of 32.0 MB",
    });
    report(download(1_000_000, null));
    expect(store.getState().load).toMatchObject({ statusText: "Downloading the video engine… 1.0 of ~32 MB" });
    slow.resolve(INFO);
    await opening;
    expect(store.getState().load.kind).toBe("ready");
  });

  test("re-opening during a slow probe: one probe at a time, and the old probe's progress and result are ignored", async () => {
    // The real engine runs one ffmpeg job at a time; the fake probe does the same with the same queue.
    const queue = createJobQueue();
    const gates = [deferred<VideoInfo>(), deferred<VideoInfo>()];
    const reports: ((s: ProbeStatus) => void)[] = [];
    const log: string[] = [];
    const probe = vi.fn((f: File, onStatus: (s: ProbeStatus) => void) => {
      const i = reports.push(onStatus) - 1;
      return queue(async () => {
        log.push(`start ${f.name}`);
        const info = await gates[i].promise;
        log.push(`end ${f.name}`);
        return info;
      });
    });
    const { deps } = makeDeps({ probe });
    const store = createVideoStore(deps);
    const first = store.getState().openFile(file("a.avi"));
    await vi.advanceTimersByTimeAsync(0);
    reports[0](download(5_000_000, 32_000_000));
    store.getState().reset(); // Cancel on the loading screen
    const second = store.getState().openFile(file("b.avi"));
    await vi.advanceTimersByTimeAsync(0);
    expect(log).toEqual(["start a.avi"]);

    // The old probe's progress never reaches the new file's screen; the new one's does.
    reports[0](download(9_000_000, 32_000_000));
    expect(store.getState().load).toMatchObject({ kind: "probing", file: { name: "b.avi" }, statusText: null });
    reports[1](download(9_000_000, 32_000_000));
    expect(store.getState().load).toMatchObject({ statusText: "Downloading the video engine… 9.0 of 32.0 MB" });

    gates[0].resolve({ ...INFO, durationSec: 1 });
    await first;
    await vi.advanceTimersByTimeAsync(0);
    expect(log).toEqual(["start a.avi", "end a.avi", "start b.avi"]);
    expect(store.getState().load).toMatchObject({ kind: "probing", file: { name: "b.avi" } });

    gates[1].resolve({ ...INFO, durationSec: 2 });
    await second;
    const s = store.getState().load;
    expect(s.kind === "ready" && [s.file.name, s.info.durationSec]).toEqual(["b.avi", 2]);
  });
});

describe("superseded work", () => {
  test("a superseded openFile (probe resolving late) is discarded", async () => {
    const slow = deferred<VideoInfo>();
    let n = 0;
    const { deps } = makeDeps({ probe: vi.fn(() => (n++ === 0 ? slow.promise : Promise.resolve({ ...INFO, durationSec: 7 }))) });
    const store = createVideoStore(deps);
    const first = store.getState().openFile(file("a.mp4"));
    await store.getState().openFile(file("b.mp4"));
    slow.resolve(INFO);
    await first;
    const s = store.getState().load;
    expect(s.kind === "ready" && s.file.name).toBe("b.mp4");
    expect(s.kind === "ready" && s.info.durationSec).toBe(7);
  });

  test("a superseded proxy build is aborted and its blob discarded", async () => {
    const proxy = deferred<Blob | null>();
    let signal: AbortSignal | undefined;
    const makeProxy = vi.fn((_f: File, _i: VideoInfo, s: AbortSignal) => {
      signal = s;
      return proxy.promise;
    });
    const { deps } = makeDeps({ canPlay: async () => false, makeProxy });
    const store = createVideoStore(deps);
    const first = store.getState().openFile(file("a.mp4"));
    await vi.advanceTimersByTimeAsync(0);
    expect(store.getState().load.kind).toBe("preparing-preview");
    store.getState().reset();
    expect(signal?.aborted).toBe(true);
    proxy.resolve(new Blob(["p"]));
    await first;
    expect(store.getState().load.kind).toBe("empty");
    expect(deps.objectUrl).not.toHaveBeenCalled();
  });

  test("reset clears the debounce timer and revokes preview, sample and result urls", async () => {
    const { store, deps, revoked } = await ready();
    await store.getState().startExport();
    const done = store.getState().exportState;
    if (done.kind !== "done") throw new Error("not done");
    await vi.advanceTimersByTimeAsync(QUALITY_DEBOUNCE_MS);
    const sampleUrl = store.getState().quality.url;
    const load = store.getState().load;
    store.getState().updateRecipe({ muted: true });
    vi.mocked(deps.previewSample).mockClear();
    store.getState().reset();
    await vi.advanceTimersByTimeAsync(QUALITY_DEBOUNCE_MS * 3);
    expect(deps.previewSample).not.toHaveBeenCalled();
    expect(revoked).toEqual(expect.arrayContaining([done.url, sampleUrl, load.kind === "ready" ? load.previewUrl : null]));
    expect(store.getState().load.kind).toBe("empty");
    expect(store.getState().exportState.kind).toBe("idle");
  });

  test("reset during an export aborts it and a late result never reaches state", async () => {
    const run = deferred<ExportResult>();
    let signal: AbortSignal | undefined;
    const { store, deps } = await ready({
      exportVideo: vi.fn((_r, o) => {
        signal = o.signal;
        return run.promise;
      }),
    });
    const p = store.getState().startExport();
    store.getState().reset();
    expect(signal?.aborted).toBe(true);
    run.resolve(result());
    await p;
    expect(store.getState().exportState.kind).toBe("idle");
    expect(deps.objectUrl).toHaveBeenCalledTimes(1); // only the preview url; no result url
  });

  test("opening a file during an open fallback question answers no, and a new export is not clobbered", async () => {
    let answered: boolean | null = null;
    const second = deferred<ExportResult>();
    let calls = 0;
    const { store } = await ready({
      exportVideo: (_r, o) => {
        if (calls++ > 0) return second.promise;
        return o.confirmFallback!({ reason: "slow", estimatedSec: 5 }).then((ok) => {
          answered = ok;
          throw new ExportCanceledError();
        });
      },
    });
    const p1 = store.getState().startExport();
    await vi.advanceTimersByTimeAsync(0);
    await store.getState().openFile(file("b.mp4"));
    await p1;
    expect(answered).toBe(false);
    expect(store.getState().exportState.kind).toBe("idle");

    const p2 = store.getState().startExport();
    expect(store.getState().exportState.kind).toBe("running");
    second.resolve(result());
    await p2;
    expect(store.getState().exportState.kind).toBe("done");
  });

  test("a second confirmFallback call resolves the previous question with no", async () => {
    const answers: boolean[] = [];
    const { store } = await ready({
      exportVideo: async (_r, o) => {
        void o.confirmFallback!({ reason: "one", estimatedSec: 1 }).then((a) => answers.push(a));
        const ok = await o.confirmFallback!({ reason: "two", estimatedSec: 2 });
        answers.push(ok);
        return result();
      },
    });
    const p = store.getState().startExport();
    await vi.advanceTimersByTimeAsync(0);
    store.getState().answerFallback(true);
    await p;
    expect(answers).toEqual([false, true]);
  });
});
