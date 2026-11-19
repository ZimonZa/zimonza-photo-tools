import type { EncodePlan } from "@/lib/video/bitrate";
import type { VideoInfo } from "@/lib/video/engines/types";
import { displaySize, type Rotation } from "@/lib/video/geometry";
import type { TrimRange } from "@/lib/video/recipe";

/** Seconds as ffmpeg wants them: up to millisecond precision, no trailing zeros. */
function secs(n: number): string {
  return Number(n.toFixed(3)).toString();
}

/** ffmpeg command for one encode pass. ffmpeg auto-rotates, so `plan` is in display orientation. */
export function buildFfmpegArgs(a: {
  inPath: string;
  outPath: string;
  trim: TrimRange | null;
  plan: EncodePlan;
}): string[] {
  const { plan, trim } = a;
  const withAudio = plan.audioBps > 0;
  return [
    "-hide_banner",
    ...(trim ? ["-ss", secs(trim.start)] : []),
    "-i", a.inPath,
    ...(trim ? ["-t", secs(trim.end - trim.start)] : []),
    "-map", "0:v:0",
    ...(withAudio ? ["-map", "0:a:0?"] : []),
    "-vf", `scale=${plan.width}:${plan.height}:flags=bicubic,setsar=1,format=yuv420p`,
    "-c:v", "libx264", "-preset", "veryfast",
    "-b:v", String(plan.videoBps),
    "-maxrate", String(Math.round(plan.videoBps * 1.2)),
    "-bufsize", String(plan.videoBps * 2),
    ...(withAudio ? ["-c:a", "aac", "-b:a", String(plan.audioBps), "-ac", "2"] : ["-an"]),
    "-movflags", "+faststart",
    "-y", a.outPath,
  ];
}

function hmsToSeconds(h: string, m: string, s: string): number {
  return Number(h) * 3600 + Number(m) * 60 + Number(s);
}

/** Encoded position in seconds from an ffmpeg progress log line, or null. */
export function parseFfmpegTime(line: string): number | null {
  const m = /time=(\d+):(\d{2}):(\d{2}(?:\.\d+)?)/.exec(line);
  return m ? hmsToSeconds(m[1], m[2], m[3]) : null;
}

function toRotation(clockwiseDegrees: number): Rotation {
  const r = (((Math.round(clockwiseDegrees / 90) * 90) % 360) + 360) % 360;
  return r as Rotation;
}

/** Read clip basics from the log of `ffmpeg -i <file>`. Null when there's no video stream. */
export function parseFfmpegProbe(log: string): Omit<VideoInfo, "readableByMediabunny"> | null {
  const video = /Stream #\d+:\d+.*?: Video: (\w+).*?[ ,](\d{2,5})x(\d{2,5})[ ,[]/.exec(log);
  if (!video) return null;

  // ffmpeg's Duration already excludes the start time, and its -ss is relative to it.
  const duration = /Duration:\s*(\d+):(\d{2}):(\d{2}(?:\.\d+)?)/.exec(log);
  const start = /Duration:[^\n]*?start:\s*(-?[\d.]+)/.exec(log);
  const audio = /Stream #\d+:\d+.*?: Audio: (\w+)/.exec(log);

  // displaymatrix gives the counter-clockwise angle; legacy `rotate` metadata is already clockwise.
  const matrix = /displaymatrix: rotation of (-?[\d.]+) degrees/.exec(log);
  const legacy = /rotate\s*:\s*(-?\d+)/.exec(log);
  const rotation = matrix ? toRotation(-Number(matrix[1])) : legacy ? toRotation(Number(legacy[1])) : 0;

  const size = displaySize({ width: Number(video[2]), height: Number(video[3]) }, rotation);
  return {
    durationSec: duration ? hmsToSeconds(duration[1], duration[2], duration[3]) : 0,
    startSec: start ? Number(start[1]) : 0,
    width: size.width,
    height: size.height,
    rotation,
    videoCodec: video[1],
    audioCodec: audio ? audio[1] : null,
    hasAudio: audio !== null,
  };
}

/** Same-origin paths of the self-hosted ffmpeg files (see scripts/copy-ffmpeg-assets.mjs). */
export function ffmpegAssetUrls(basePath: string): { coreURL: string; wasmURL: string; classWorkerURL: string } {
  return {
    coreURL: `${basePath}/ffmpeg/core/ffmpeg-core.js`,
    wasmURL: `${basePath}/ffmpeg/core/ffmpeg-core.wasm`,
    classWorkerURL: `${basePath}/ffmpeg/esm/worker.js`,
  };
}
