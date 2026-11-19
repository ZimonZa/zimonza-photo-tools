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
}

const FPS = 30;
const SAMPLE_RATE = 48_000;

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
        ctx.fillStyle = `hsl(${(i * 12) % 360} 70% 50%)`;
        ctx.fillRect(0, 0, o.width, o.height);
        ctx.fillStyle = "#fff";
        ctx.fillRect((i * 8) % o.width, o.height / 4, o.width / 8, o.height / 2);
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
