import type { FFFSType, FFmpeg, LogEventCallback } from "@ffmpeg/ffmpeg";
import { buildFfmpegArgs, ffmpegAssetUrls, parseFfmpegProbe, parseFfmpegTime } from "@/lib/video/engines/ffmpeg-args";
import { createJobQueue } from "@/lib/video/engines/job-queue";
import type { EncodeJob, VideoEngine, VideoInfo } from "@/lib/video/engines/types";
import { EngineUnsupportedError, ExportCanceledError } from "@/lib/video/errors";

type DownloadListener = (loaded: number, total: number | null) => void;

const BASE_PATH = process.env.NEXT_PUBLIC_BASE_PATH ?? "";
const MOUNT = "/in";
/** How much of ffmpeg's log to keep for error messages. */
const LOG_TAIL_LINES = 20;

/** One shared ffmpeg instance; dropped (and rebuilt on next use) after a cancel terminates it. */
let instance: Promise<FFmpeg> | null = null;
/** Instances that have run a command (a probe or an encode); see the WebM rule in `encodeNow`. */
const usedInstances = new WeakSet<FFmpeg>();
/**
 * Every probe and encode runs alone: they share one instance and its fixed MOUNT path (a second
 * mount there fails), and one heavy job at a time is all a phone can take. The download runs
 * outside the queue, so a caller waiting its turn still sees its progress.
 */
const exclusive = createJobQueue();
/**
 * The core's wasm as a blob URL: downloaded once per page, then reused by every instance. Cleared
 * only when the download itself fails, so the next use retries.
 */
let wasmBlobUrl: Promise<string> | null = null;
/** While the download runs: who hears its progress, and the latest report (for late joiners). */
let downloading = false;
const downloadListeners = new Set<DownloadListener>();
let lastDownload: [number, number | null] | null = null;

/** Start the one-time download, or join the one running; `onProgress` hears it either way. */
function loadWasm(onProgress?: DownloadListener): Promise<string> {
  if (onProgress && (!wasmBlobUrl || downloading)) {
    downloadListeners.add(onProgress);
    if (lastDownload) onProgress(...lastDownload);
  }
  if (!wasmBlobUrl) {
    const url = new URL(ffmpegAssetUrls(BASE_PATH).wasmURL, location.href).href;
    downloading = true;
    const download = downloadWithProgress(url, (loaded, total) => {
      lastDownload = [loaded, total];
      downloadListeners.forEach((listener) => listener(loaded, total));
    });
    const settle = () => {
      downloading = false;
      downloadListeners.clear();
      lastDownload = null;
    };
    wasmBlobUrl = download.then(
      (blobUrl) => {
        settle();
        return blobUrl;
      },
      (e) => {
        settle();
        wasmBlobUrl = null;
        throw e;
      }
    );
  }
  return wasmBlobUrl;
}

async function downloadWithProgress(url: string, onProgress?: DownloadListener): Promise<string> {
  const res = await fetch(url);
  if (!res.ok || !res.body) throw new Error(`Could not download the video engine (${res.status}).`);
  const total = Number(res.headers.get("Content-Length")) || null;
  const reader = res.body.getReader();
  const chunks: Uint8Array[] = [];
  let loaded = 0;
  for (;;) {
    const { done, value } = await reader.read();
    if (done) break;
    chunks.push(value);
    loaded += value.length;
    onProgress?.(loaded, total);
  }
  return URL.createObjectURL(new Blob(chunks as BlobPart[], { type: "application/wasm" }));
}

/** The shared instance; only called inside `exclusive`, after `loadWasm`. */
function getFFmpeg(): Promise<FFmpeg> {
  instance ??= (async () => {
    const { FFmpeg } = await import("@ffmpeg/ffmpeg");
    const urls = ffmpegAssetUrls(BASE_PATH);
    const abs = (path: string) => new URL(path, location.href).href;
    const wasmURL = await loadWasm();
    const ffmpeg = new FFmpeg();
    await ffmpeg.load({ coreURL: abs(urls.coreURL), wasmURL, classWorkerURL: abs(urls.classWorkerURL) });
    return ffmpeg;
  })().catch((e) => {
    instance = null;
    throw e;
  });
  return instance;
}

function extension(name: string): string {
  const dot = name.lastIndexOf(".");
  return dot > 0 ? name.slice(dot).toLowerCase() : "";
}

/** Expose the file to ffmpeg without copying it into wasm memory (WORKERFS). */
async function withInput<T>(ffmpeg: FFmpeg, file: File, run: (path: string) => Promise<T>): Promise<T> {
  const name = `input${extension(file.name)}`;
  await ffmpeg.createDir(MOUNT).catch(() => {});
  await ffmpeg.mount("WORKERFS" as FFFSType, { blobs: [{ name, data: file }] }, MOUNT);
  try {
    return await run(`${MOUNT}/${name}`);
  } finally {
    await ffmpeg.unmount(MOUNT).catch(() => {});
  }
}

/** Probe any container ffmpeg understands (AVI, WMV, FLV…). Waits for any other ffmpeg job to finish. */
export async function probeWithFfmpeg(file: File, onEngineDownload?: DownloadListener): Promise<VideoInfo> {
  await loadWasm(onEngineDownload);
  return exclusive(() => probe(file));
}

async function probe(file: File): Promise<VideoInfo> {
  const ffmpeg = await getFFmpeg();
  usedInstances.add(ffmpeg);
  const logs: string[] = [];
  const onLog: LogEventCallback = ({ message }) => logs.push(message);
  ffmpeg.on("log", onLog);
  try {
    // `-i` alone exits non-zero (no output given) after printing the stream info we need.
    await withInput(ffmpeg, file, (path) => ffmpeg.exec(["-hide_banner", "-i", path]));
  } finally {
    ffmpeg.off("log", onLog);
  }
  const parsed = parseFfmpegProbe(logs.join("\n"));
  if (!parsed) throw new EngineUnsupportedError("No video stream found in this file.");
  return { ...parsed, readableByMediabunny: false };
}

/** Encode once any other ffmpeg job has finished; aborting while it waits cancels it at once. */
async function encode(job: EncodeJob): Promise<Blob> {
  if (job.signal.aborted) throw new ExportCanceledError();
  await loadWasm(job.onEngineDownload);
  return exclusive(() => encodeNow(job), job.signal);
}

async function encodeNow(job: EncodeJob): Promise<Blob> {
  const { file, info, trim, plan, edits, container, signal, onProgress } = job;
  const OUT = container === "webm" ? "/out.webm" : "/out.mp4";
  if (signal.aborted) throw new ExportCanceledError();
  // Workaround: the self-hosted core's libvpx-vp9 can crash ("memory access out of bounds") in a heap
  // that an earlier command used (seen after a probe's non-zero exit), so a WebM encode always starts
  // on a fresh instance. Only the instance is rebuilt; the wasm download is reused. Remove this (and
  // `usedInstances`) when the core is rebuilt or upgraded, with the VP9 workarounds in ffmpeg-args.
  const current = instance;
  if (container === "webm" && current) {
    const previous = await current.catch(() => null);
    if (previous && usedInstances.has(previous)) {
      if (instance === current) instance = null;
      previous.terminate();
    }
  }
  const ffmpeg = await getFFmpeg();
  if (signal.aborted) throw new ExportCanceledError();
  usedInstances.add(ffmpeg);

  const duration = trim ? trim.end - trim.start : info.durationSec;
  const tail: string[] = [];
  const onLog: LogEventCallback = ({ message }) => {
    tail.push(message);
    if (tail.length > LOG_TAIL_LINES) tail.shift();
    const t = parseFfmpegTime(message);
    if (t !== null && duration > 0) onProgress(Math.min(1, t / duration));
  };
  let terminated = false;
  const discardInstance = () => {
    terminated = true;
    instance = null;
    ffmpeg.terminate();
  };
  /** ffmpeg ran and exited non-zero: the instance is healthy, the input or settings were not. */
  let cleanFailure = false;

  ffmpeg.on("log", onLog);
  signal.addEventListener("abort", discardInstance, { once: true });
  try {
    const code = await withInput(ffmpeg, file, (inPath) =>
      ffmpeg.exec(buildFfmpegArgs({ inPath, outPath: OUT, trim, plan, edits, container }))
    );
    if (code !== 0) {
      cleanFailure = true;
      throw new Error(`The backup engine failed (exit code ${code}):\n${tail.join("\n")}`);
    }
    const data = await ffmpeg.readFile(OUT);
    await ffmpeg.deleteFile(OUT);
    if (typeof data === "string") throw new Error("The backup engine returned text instead of video.");
    return new Blob([data as BlobPart], { type: container === "webm" ? "video/webm" : "video/mp4" });
  } catch (e) {
    if (terminated || signal.aborted) throw new ExportCanceledError();
    if (cleanFailure) {
      await ffmpeg.deleteFile(OUT).catch(() => {});
    } else {
      // The wasm itself failed (e.g. out of memory) — never reuse a broken instance.
      discardInstance();
    }
    throw e;
  } finally {
    signal.removeEventListener("abort", discardInstance);
    if (!terminated) ffmpeg.off("log", onLog);
  }
}

export const ffmpegEngine: VideoEngine = {
  id: "ffmpeg",
  async precheck() {
    return { ok: true };
  },
  encode,
};
