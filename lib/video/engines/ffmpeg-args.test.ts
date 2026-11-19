import { describe, expect, test } from "vitest";
import { buildFfmpegArgs, ffmpegAssetUrls, parseFfmpegProbe, parseFfmpegTime } from "@/lib/video/engines/ffmpeg-args";

const PLAN = { width: 1280, height: 720, videoBps: 1_500_000, audioBps: 128_000, steppedDown: false };

describe("buildFfmpegArgs", () => {
  test("trimmed encode with audio", () => {
    expect(buildFfmpegArgs({ inPath: "/in/input.mov", outPath: "/out.mp4", trim: { start: 2, end: 12 }, plan: PLAN })).toEqual([
      "-hide_banner", "-ss", "2", "-i", "/in/input.mov", "-t", "10",
      "-map", "0:v:0", "-map", "0:a:0?",
      "-vf", "scale=1280:720:flags=bicubic,setsar=1,format=yuv420p",
      "-c:v", "libx264", "-preset", "veryfast", "-b:v", "1500000", "-maxrate", "1800000", "-bufsize", "3000000",
      "-c:a", "aac", "-b:a", "128000", "-ac", "2",
      "-movflags", "+faststart", "-y", "/out.mp4",
    ]);
  });

  test("audioBps 0 drops audio and no trim omits seek flags", () => {
    const args = buildFfmpegArgs({ inPath: "/in/a.mp4", outPath: "/out.mp4", trim: null, plan: { ...PLAN, audioBps: 0 } });
    expect(args).toContain("-an");
    expect(args).not.toContain("0:a:0?");
    expect(args).not.toContain("-c:a");
    expect(args).not.toContain("-ss");
    expect(args).not.toContain("-t");
  });
});

describe("parseFfmpegTime", () => {
  test("reads the encoded time from a progress line", () => {
    expect(parseFfmpegTime("frame=  50 fps=12 q=28.0 size=256kB time=00:01:02.50 bitrate=33.5kbits/s")).toBe(62.5);
  });

  test("returns null when there is no usable time", () => {
    expect(parseFfmpegTime("time=N/A")).toBeNull();
    expect(parseFfmpegTime("Stream mapping:")).toBeNull();
  });
});

const HEVC_ROTATED = [
  "Input #0, mov,mp4,m4a,3gp,3g2,mj2, from '/in/input.mov':",
  "  Duration: 00:00:12.34, start: 0.000000, bitrate: 15000 kb/s",
  "  Stream #0:0[0x1](und): Video: hevc (Main) (hvc1 / 0x31637668), yuv420p(tv, bt709), 1920x1080, 14800 kb/s, 29.97 fps, 29.97 tbr, 600 tbn (default)",
  "      Side data:",
  "        displaymatrix: rotation of -90.00 degrees",
  "  Stream #0:1[0x2](und): Audio: aac (LC) (mp4a / 0x6134706D), 44100 Hz, stereo, fltp, 128 kb/s (default)",
].join("\n");

describe("parseFfmpegProbe", () => {
  test("reads a rotated HEVC phone clip as display size", () => {
    expect(parseFfmpegProbe(HEVC_ROTATED)).toEqual({
      durationSec: 12.34,
      width: 1080,
      height: 1920,
      rotation: 90,
      videoCodec: "hevc",
      audioCodec: "aac",
      hasAudio: true,
    });
  });

  test("reads the legacy rotate metadata line", () => {
    const log = [
      "  Duration: 00:01:00.00, start: 0.000000, bitrate: 900 kb/s",
      "    Stream #0:0(und): Video: h264 (High) (avc1 / 0x31637661), yuv420p, 1280x720, 800 kb/s, 30 fps",
      "    Metadata:",
      "      rotate          : 270",
    ].join("\n");
    expect(parseFfmpegProbe(log)).toEqual({
      durationSec: 60,
      width: 720,
      height: 1280,
      rotation: 270,
      videoCodec: "h264",
      audioCodec: null,
      hasAudio: false,
    });
  });

  test("returns null when there is no video stream", () => {
    expect(
      parseFfmpegProbe("  Duration: 00:00:05.00, start: 0.0\n  Stream #0:0: Audio: mp3, 44100 Hz, stereo, fltp, 128 kb/s")
    ).toBeNull();
  });
});

describe("ffmpegAssetUrls", () => {
  test("serves from the site root", () => {
    expect(ffmpegAssetUrls("")).toEqual({
      coreURL: "/ffmpeg/core/ffmpeg-core.js",
      wasmURL: "/ffmpeg/core/ffmpeg-core.wasm",
      classWorkerURL: "/ffmpeg/esm/worker.js",
    });
  });

  test("prefixes the GitHub Pages base path", () => {
    expect(ffmpegAssetUrls("/zimonza-photo-tools").coreURL).toBe("/zimonza-photo-tools/ffmpeg/core/ffmpeg-core.js");
  });
});
