import {
  ALL_FORMATS,
  BlobSource,
  BufferTarget,
  canEncodeAudio,
  canEncodeVideo,
  Conversion,
  ConversionCanceledError,
  Input,
  Mp4OutputFormat,
  Output,
  Quality,
} from "mediabunny";
import type { EncodeJob, VideoEngine, VideoInfo } from "@/lib/video/engines/types";
import { EngineUnsupportedError, ExportCanceledError } from "@/lib/video/errors";

/** Read a clip's basics. Throws when Mediabunny can't read the container or finds no video. */
export async function probeWithMediabunny(file: File): Promise<VideoInfo> {
  const input = new Input({ source: new BlobSource(file), formats: ALL_FORMATS });
  try {
    const video = await input.getPrimaryVideoTrack();
    if (!video) throw new EngineUnsupportedError("No video track found.");
    const audio = await input.getPrimaryAudioTrack();
    return {
      durationSec: await input.computeDuration(),
      width: video.displayWidth,
      height: video.displayHeight,
      rotation: video.rotation,
      videoCodec: video.codec,
      audioCodec: audio?.codec ?? null,
      hasAudio: audio !== null,
      readableByMediabunny: true,
    };
  } finally {
    input.dispose();
  }
}

let aacReady: Promise<void> | null = null;

/** Some browsers (older iOS Safari) can't encode AAC natively; load the free software encoder only then. */
function ensureAacEncoder(): Promise<void> {
  aacReady ??= (async () => {
    if (!(await canEncodeAudio("aac"))) {
      const { registerAacEncoder } = await import("@mediabunny/aac-encoder");
      registerAacEncoder();
    }
  })();
  return aacReady;
}

async function encode(job: EncodeJob): Promise<Blob> {
  const { file, info, trim, plan, signal, onProgress } = job;
  if (signal.aborted) throw new ExportCanceledError();
  const wantAudio = plan.audioBps > 0 && info.hasAudio;
  if (wantAudio) await ensureAacEncoder();

  const input = new Input({ source: new BlobSource(file), formats: ALL_FORMATS });
  const output = new Output({
    format: new Mp4OutputFormat({ fastStart: "in-memory" }),
    target: new BufferTarget(),
  });

  try {
    const conversion = await Conversion.init({
      input,
      output,
      tracks: "primary",
      ...(trim ? { trim: { start: trim.start, end: trim.end } } : {}),
      video: {
        width: plan.width,
        height: plan.height,
        fit: "fill",
        codec: "avc",
        // Constant mode tracks the requested bitrate far more closely (measured 1.00x vs 1.35x at 3 Mbps),
        // which keeps target-size encodes to one or two passes.
        quality: new Quality({ bitrate: plan.videoBps, bitrateMode: "constant" }),
        forceTranscode: true,
        allowTransformationMetadata: false,
      },
      audio: wantAudio
        ? {
            codec: "aac",
            quality: new Quality({ bitrate: plan.audioBps }),
            numberOfChannels: 2,
            sampleRate: 48_000,
            forceTranscode: true,
          }
        : { discard: true },
    });

    // A conversion can be "valid" while silently dropping a track we need (e.g. undecodable audio).
    const lost = conversion.discardedTracks.filter(
      (d) => d.reason !== "discarded_by_user" && (d.track.isVideoTrack() || (wantAudio && d.track.isAudioTrack()))
    );
    if (!conversion.isValid || lost.length > 0) {
      const reasons = lost.map((d) => `${d.track.type}: ${d.reason}`).join(", ") || "invalid conversion";
      throw new EngineUnsupportedError(`The fast engine can't process this file (${reasons}).`);
    }

    conversion.onProgress = (p) => onProgress(p);
    const onAbort = () => void conversion.cancel();
    signal.addEventListener("abort", onAbort, { once: true });
    try {
      await conversion.execute();
    } catch (e) {
      if (e instanceof ConversionCanceledError || signal.aborted) throw new ExportCanceledError();
      throw e;
    } finally {
      signal.removeEventListener("abort", onAbort);
    }

    const bytes = output.target.buffer;
    if (!bytes) throw new Error("The fast engine produced no data.");
    return new Blob([bytes], { type: "video/mp4" });
  } finally {
    input.dispose();
  }
}

export const webcodecsEngine: VideoEngine = {
  id: "webcodecs",
  async precheck(info, plan) {
    if (typeof VideoEncoder === "undefined") {
      return { ok: false, reason: "This browser has no built-in video encoder." };
    }
    if (!info.readableByMediabunny) {
      return { ok: false, reason: "The fast engine can't read this file type." };
    }
    if (!(await canEncodeVideo("avc", { width: plan.width, height: plan.height }))) {
      return { ok: false, reason: `This browser can't encode H.264 at ${plan.width}×${plan.height}.` };
    }
    return { ok: true };
  },
  encode,
};
