import type { FFFSType, FFmpeg, LogEventCallback } from "@ffmpeg/ffmpeg";
import { buildFfmpegArgs, ffmpegAssetUrls, parseFfmpegProbe, parseFfmpegTime } from "@/lib/video/engines/ffmpeg-args";
import type { EncodeJob, VideoEngine, VideoInfo } from "@/lib/video/engines/types";
import { EngineUnsupportedError, ExportCanceledError } from "@/lib/video/errors";

type DownloadListener = (loaded: number, total: number | null) => void;

const BASE_PATH = process.env.NEXT_PUBLIC_BASE_PATH ?? "";
const MOUNT = "/in";
const OUT = "/out.mp4";

/** One shared ffmpeg instance; dropped (and rebuilt on next use) after a cancel terminates it. */
let instance: Promise<FFmpeg> | null = null;

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

function getFFmpeg(onDownload?: DownloadListener): Promise<FFmpeg> {
  instance ??= (async () => {
    const { FFmpeg } = await import("@ffmpeg/ffmpeg");
    const urls = ffmpegAssetUrls(BASE_PATH);
    const abs = (path: string) => new URL(path, location.href).href;
    const wasmURL = await downloadWithProgress(abs(urls.wasmURL), onDownload);
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

/** Probe any container ffmpeg understands (AVI, WMV, FLV…). */
export async function probeWithFfmpeg(file: File, onEngineDownload?: DownloadListener): Promise<VideoInfo> {
  const ffmpeg = await getFFmpeg(onEngineDownload);
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

async function encode(job: EncodeJob): Promise<Blob> {
  const { file, info, trim, plan, signal, onProgress } = job;
  if (signal.aborted) throw new ExportCanceledError();
  const ffmpeg = await getFFmpeg(job.onEngineDownload);
  if (signal.aborted) throw new ExportCanceledError();

  const duration = trim ? trim.end - trim.start : info.durationSec;
  const onLog: LogEventCallback = ({ message }) => {
    const t = parseFfmpegTime(message);
    if (t !== null && duration > 0) onProgress(Math.min(1, t / duration));
  };
  let terminated = false;
  const onAbort = () => {
    terminated = true;
    instance = null;
    ffmpeg.terminate();
  };

  ffmpeg.on("log", onLog);
  signal.addEventListener("abort", onAbort, { once: true });
  try {
    const code = await withInput(ffmpeg, file, (inPath) =>
      ffmpeg.exec(buildFfmpegArgs({ inPath, outPath: OUT, trim, plan }))
    );
    if (code !== 0) throw new Error(`The backup engine failed (ffmpeg exit code ${code}).`);
    const data = await ffmpeg.readFile(OUT);
    await ffmpeg.deleteFile(OUT);
    if (typeof data === "string") throw new Error("The backup engine returned text instead of video.");
    return new Blob([data as BlobPart], { type: "video/mp4" });
  } catch (e) {
    if (terminated || signal.aborted) throw new ExportCanceledError();
    throw e;
  } finally {
    signal.removeEventListener("abort", onAbort);
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
