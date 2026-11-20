import type { EncodePlan } from "@/lib/video/bitrate";
import type { VideoInfo } from "@/lib/video/engines/types";
import type { FrameEdits } from "@/lib/video/frame";
import { displaySize, toEven, type Rotation, type Size } from "@/lib/video/geometry";
import type { Container, TrimRange } from "@/lib/video/recipe";

/** Seconds as ffmpeg wants them: up to millisecond precision, no trailing zeros. */
function secs(n: number): string {
  return Number(n.toFixed(3)).toString();
}

/** Video filter for the edits, in the order rotate, flip H, flip V, crop, then resize or fit into `out`. */
export function buildVideoFilter(edits: FrameEdits, out: Size): { complex: boolean; graph: string } {
  const steps: string[] = [];
  if (edits.rotate === 90) steps.push("transpose=1");
  else if (edits.rotate === 180) steps.push("transpose=1", "transpose=1");
  else if (edits.rotate === 270) steps.push("transpose=2");
  if (edits.flipH) steps.push("hflip");
  if (edits.flipV) steps.push("vflip");
  if (edits.crop) {
    const c = edits.crop;
    steps.push(`crop=${c.width}:${c.height}:${c.left}:${c.top}`);
  }
  const { width: w, height: h } = out;

  if (edits.fit === "blur") {
    // Blur a quarter-size copy (cheap), darken it, and lay the whole picture on top.
    const bw = toEven(w / 4);
    const bh = toEven(h / 4);
    const head = ["[0:v]", ...(steps.length ? [steps.join(",") + ","] : [])].join("");
    return {
      complex: true,
      graph:
        `${head}split=2[bgsrc][fgsrc];` +
        `[bgsrc]scale=${bw}:${bh}:force_original_aspect_ratio=increase,crop=${bw}:${bh},boxblur=10:2,scale=${w}:${h},eq=brightness=-0.08[bg];` +
        `[fgsrc]scale=${w}:${h}:force_original_aspect_ratio=decrease:force_divisible_by=2:flags=bicubic[fg];` +
        "[bg][fg]overlay=(W-w)/2:(H-h)/2,setsar=1,format=yuv420p[v]",
    };
  }
  if (edits.fit === "cover") {
    steps.push(`scale=${w}:${h}:force_original_aspect_ratio=increase:flags=bicubic`, `crop=${w}:${h}`);
  } else {
    steps.push(`scale=${w}:${h}:flags=bicubic`);
  }
  steps.push("setsar=1", "format=yuv420p");
  return { complex: false, graph: steps.join(",") };
}

/** ffmpeg command for one encode pass. ffmpeg auto-rotates, so edits apply to the picture as the user sees it. */
export function buildFfmpegArgs(a: {
  inPath: string;
  outPath: string;
  trim: TrimRange | null;
  plan: EncodePlan;
  edits: FrameEdits;
  container: Container;
}): string[] {
  const { plan, trim } = a;
  const withAudio = plan.audioBps > 0;
  const webm = a.container === "webm";
  const filter = buildVideoFilter(a.edits, { width: plan.width, height: plan.height });
  return [
    "-hide_banner",
    ...(trim ? ["-ss", secs(trim.start)] : []),
    "-i", a.inPath,
    ...(trim ? ["-t", secs(trim.end - trim.start)] : []),
    ...(filter.complex ? ["-filter_complex", filter.graph, "-map", "[v]"] : ["-map", "0:v:0"]),
    ...(withAudio ? ["-map", "0:a:0?"] : []),
    // Keep each frame's original timing — phone clips are often variable frame rate.
    "-fps_mode", "passthrough",
    ...(filter.complex ? [] : ["-vf", filter.graph]),
    // The self-hosted single-thread core's libvpx-vp9 crashes ("memory access out of bounds") on
    // inter-predicted frames and with -deadline realtime at -cpu-used 5+, and its libopus crashes above
    // compression level 3. So: all-intra VP9 (-g 1) and a low Opus complexity. Drop both workarounds
    // (and prefer -deadline realtime -cpu-used 8) once the core is rebuilt or upgraded.
    ...(webm
      ? ["-c:v", "libvpx-vp9", "-cpu-used", "5", "-g", "1"]
      : ["-c:v", "libx264", "-preset", "veryfast"]),
    "-b:v", String(plan.videoBps),
    "-maxrate", String(Math.round(plan.videoBps * 1.2)),
    "-bufsize", String(plan.videoBps * 2),
    ...(withAudio ? [...(webm ? ["-c:a", "libopus", "-compression_level", "3"] : ["-c:a", "aac"]), "-b:a", String(plan.audioBps), "-ac", "2"] : ["-an"]),
    ...(webm ? [] : ["-movflags", "+faststart"]),
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
