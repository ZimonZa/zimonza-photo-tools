import { AudioBufferSource, BufferTarget, CanvasSource, Mp4OutputFormat, Output, Quality } from "mediabunny";
import type { Rotation } from "@/lib/video/geometry";

export interface TestClipOptions {
  seconds: number;
  /** Coded size. With `rotation` 90/270 the display size is swapped. */
  width: number;
  height: number;
  audio: boolean;
  rotation?: Rotation;
  /** Random noise frames — hard to compress, so encoders actually use the bitrate they're given. */
  noise?: boolean;
  /** First video timestamp in seconds (camera / broadcast files often don't start at 0). Video-only clips. */
  startAt?: number;
  /**
   * What each frame shows (ignored with `noise`). `moving`: a shifting colour with a white bar.
   * `quadrants`: red top-left, green top-right, blue bottom-left, white bottom-right, in coded pixels.
   */
  pattern?: "moving" | "quadrants" | "solid-red";
}

const FPS = 30;
const SAMPLE_RATE = 48_000;

function drawPattern(ctx: OffscreenCanvasRenderingContext2D, o: TestClipOptions, frame: number): void {
  const { width: w, height: h } = o;
  switch (o.pattern ?? "moving") {
    case "quadrants": {
      const fill = (color: string, x: number, y: number) => {
        ctx.fillStyle = color;
        ctx.fillRect(x, y, w / 2, h / 2);
      };
      fill("#f00", 0, 0);
      fill("#0f0", w / 2, 0);
      fill("#00f", 0, h / 2);
      fill("#fff", w / 2, h / 2);
      return;
    }
    case "solid-red":
      ctx.fillStyle = "#f00";
      ctx.fillRect(0, 0, w, h);
      return;
    case "moving":
      ctx.fillStyle = `hsl(${(frame * 12) % 360} 70% 50%)`;
      ctx.fillRect(0, 0, w, h);
      ctx.fillStyle = "#fff";
      ctx.fillRect((frame * 8) % w, h / 4, w / 8, h / 2);
  }
}

/** Synthesize an H.264 (+ AAC) MP4 in the browser. Test-only. */
export async function makeTestClip(o: TestClipOptions): Promise<File> {
  const canvas = new OffscreenCanvas(o.width, o.height);
  const ctx = canvas.getContext("2d");
  if (!ctx) throw new Error("No 2D context");

  const output = new Output({ format: new Mp4OutputFormat({ fastStart: "in-memory" }), target: new BufferTarget() });
  const video = new CanvasSource(canvas, { codec: "avc", quality: new Quality({ bitrate: 2_000_000 }) });
  output.addVideoTrack(video, { frameRate: FPS, rotation: o.rotation ?? 0 });
  const audio = o.audio ? new AudioBufferSource({ codec: "aac", quality: new Quality({ bitrate: 128_000 }) }) : null;
  if (audio) output.addAudioTrack(audio);
  await output.start();

  const noise = o.noise ? ctx.createImageData(o.width, o.height) : null;
  let seed = 0x9e3779b9;
  const totalFrames = Math.round(o.seconds * FPS);

  // Interleave one second of video with one second of audio so the muxer never waits on a track.
  for (let second = 0; second * FPS < totalFrames; second++) {
    const end = Math.min(totalFrames, (second + 1) * FPS);
    for (let i = second * FPS; i < end; i++) {
      if (noise) {
        const px = new Uint32Array(noise.data.buffer);
        for (let p = 0; p < px.length; p++) {
          seed ^= seed << 13;
          seed ^= seed >>> 17;
          seed ^= seed << 5;
          px[p] = seed | 0xff000000;
        }
        ctx.putImageData(noise, 0, 0);
      } else {
        drawPattern(ctx, o, i);
      }
      await video.add((o.startAt ?? 0) + i / FPS, 1 / FPS);
    }
    if (audio) {
      const length = Math.round(((end - second * FPS) / FPS) * SAMPLE_RATE);
      const buffer = new AudioBuffer({ length, numberOfChannels: 2, sampleRate: SAMPLE_RATE });
      const offset = second * SAMPLE_RATE;
      for (let ch = 0; ch < 2; ch++) {
        const data = buffer.getChannelData(ch);
        for (let s = 0; s < length; s++) data[s] = 0.3 * Math.sin((2 * Math.PI * 440 * (offset + s)) / SAMPLE_RATE);
      }
      await audio.add(buffer);
    }
  }

  await output.finalize();
  const bytes = output.target.buffer;
  if (!bytes) throw new Error("Test clip produced no data");
  return new File([bytes], "clip.mp4", { type: "video/mp4" });
}
