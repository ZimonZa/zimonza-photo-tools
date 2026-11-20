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
  WebMOutputFormat,
  type ConversionVideoOptions,
} from "mediabunny";
import type { EncodePlan } from "@/lib/video/bitrate";
import { createBlurFitter } from "@/lib/video/engines/blur-fit";
import type { EncodeJob, SupportCheck, VideoEngine, VideoInfo } from "@/lib/video/engines/types";
import { EngineUnsupportedError, ExportCanceledError } from "@/lib/video/errors";
import { mediabunnyTransform, type FrameEdits } from "@/lib/video/frame";
import type { Container } from "@/lib/video/recipe";

export type BitrateMode = "constant" | "variable";

/** What each output container holds. */
const FORMATS = {
  mp4: { video: "avc", audio: "aac", videoName: "H.264", mimeType: "video/mp4" },
  webm: { video: "vp9", audio: "opus", videoName: "VP9", mimeType: "video/webm" },
} as const;

function outputFormat(container: Container): Mp4OutputFormat | WebMOutputFormat {
  return container === "webm" ? new WebMOutputFormat() : new Mp4OutputFormat({ fastStart: "in-memory" });
}

/** Read a clip's basics. Throws when Mediabunny can't read the container or finds no video. */
export async function probeWithMediabunny(file: File): Promise<VideoInfo> {
  const input = new Input({ source: new BlobSource(file), formats: ALL_FORMATS });
  try {
    const video = await input.getPrimaryVideoTrack();
    if (!video) throw new EngineUnsupportedError("No video track found.");
    const audio = await input.getPrimaryAudioTrack();
    // computeDuration() is the last end timestamp, not the length, when the file doesn't start at 0.
    const startSec = Math.max(0, await input.getFirstTimestamp());
    return {
      durationSec: (await input.computeDuration()) - startSec,
      startSec,
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

interface Discarded {
  reason: string;
  track: { isVideoTrack(): boolean };
}

/**
 * Constant bitrate tracks targets most closely, but not every device encoder offers it.
 * When the video track can't be encoded in constant mode, set up again in variable mode.
 */
export async function initWithBitrateFallback<C extends { discardedTracks: readonly Discarded[] }>(
  init: (mode: BitrateMode) => Promise<C>,
  dispose: (c: C) => Promise<void>
): Promise<{ conversion: C; mode: BitrateMode }> {
  const constant = await init("constant");
  const unencodable = constant.discardedTracks.some(
    (d) => d.reason === "no_encodable_target_codec" && d.track.isVideoTrack()
  );
  if (!unencodable) return { conversion: constant, mode: "constant" };
  await dispose(constant);
  return { conversion: await init("variable"), mode: "variable" };
}

/**
 * Mediabunny turns, flips horizontally, crops, then resizes: our edit order, once `mediabunnyTransform`
 * has folded a vertical flip into a half turn plus a horizontal flip. The crop is in the turned and
 * flipped picture. The blurred background is drawn by hand after all of that.
 */
function pictureOptions(edits: FrameEdits, plan: EncodePlan): ConversionVideoOptions {
  const { rotate, flip } = mediabunnyTransform(edits.rotate, edits.flipH, edits.flipV);
  const transform = { rotate, flip, crop: edits.crop ?? undefined };
  if (edits.fit !== "blur") {
    return { ...transform, width: plan.width, height: plan.height, fit: edits.fit === "cover" ? "cover" : "fill" };
  }
  const fit = createBlurFitter(plan);
  return {
    ...transform,
    // `process` gets each frame after rotate/flip/crop (and no resize, since width/height are unset).
    // Draw its raw pixels: `sample.draw()` would apply the file's own rotation a second time when
    // Mediabunny skips re-rendering. Mediabunny closes the sample and the frame made from our canvas.
    process: (sample) => fit(sample.toCanvasImageSource(), sample.squarePixelWidth, sample.squarePixelHeight),
    processedWidth: plan.width,
    processedHeight: plan.height,
  };
}

interface Attempt {
  conversion: Conversion;
  input: Input;
  output: Output<Mp4OutputFormat | WebMOutputFormat, BufferTarget>;
  discardedTracks: Conversion["discardedTracks"];
}

async function encode(job: EncodeJob): Promise<Blob> {
  const { file, info, trim, plan, edits, container, signal, onProgress } = job;
  const format = FORMATS[container];
  if (signal.aborted) throw new ExportCanceledError();
  const wantAudio = plan.audioBps > 0 && info.hasAudio;
  if (wantAudio && format.audio === "aac") await ensureAacEncoder();
  if (signal.aborted) throw new ExportCanceledError();
  const picture = pictureOptions(edits, plan);

  // Each set-up attempt needs its own fresh input and output.
  const setUp = async (mode: BitrateMode): Promise<Attempt> => {
    const input = new Input({ source: new BlobSource(file), formats: ALL_FORMATS });
    const output = new Output({ format: outputFormat(container), target: new BufferTarget() });
    const conversion = await Conversion.init({
      input,
      output,
      tracks: "primary",
      // Mediabunny trims in absolute file time; our trims are relative to the clip's start.
      ...(trim ? { trim: { start: info.startSec + trim.start, end: info.startSec + trim.end } } : {}),
      video: {
        ...picture,
        codec: format.video,
        // Constant mode tracks the requested bitrate far more closely (measured 1.00x vs 1.35x at 3 Mbps).
        quality: new Quality({ bitrate: plan.videoBps, bitrateMode: mode }),
        forceTranscode: true,
        allowTransformationMetadata: false,
      },
      audio: wantAudio
        ? {
            codec: format.audio,
            quality: new Quality({ bitrate: plan.audioBps }),
            numberOfChannels: 2,
            sampleRate: 48_000,
            forceTranscode: true,
          }
        : { discard: true },
    });
    return { conversion, input, output, discardedTracks: conversion.discardedTracks };
  };
  const tearDown = async (a: Attempt) => {
    await a.conversion.cancel().catch(() => {});
    a.input.dispose();
  };

  const { conversion: attempt } = await initWithBitrateFallback(setUp, tearDown);
  const { conversion, output } = attempt;

  try {
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
      // An abort during setup above fired before the listener existed.
      if (signal.aborted) {
        await conversion.cancel();
        throw new ExportCanceledError();
      }
      await conversion.execute();
    } catch (e) {
      if (e instanceof ConversionCanceledError || signal.aborted) throw new ExportCanceledError();
      throw e;
    } finally {
      signal.removeEventListener("abort", onAbort);
    }

    const bytes = output.target.buffer;
    if (!bytes) throw new Error("The fast engine produced no data.");
    return new Blob([bytes], { type: format.mimeType });
  } finally {
    attempt.input.dispose();
  }
}

/** What the device can encode. Injectable so the precheck's rules can be tested outside a browser. */
export interface DeviceEncoders {
  hasVideoEncoder(): boolean;
  canEncodeVideo(codec: "avc" | "vp9", plan: EncodePlan, mode: BitrateMode): Promise<boolean>;
  canEncodeAudio(codec: "aac" | "opus", plan: EncodePlan): Promise<boolean>;
}

const deviceEncoders: DeviceEncoders = {
  hasVideoEncoder: () => typeof VideoEncoder !== "undefined",
  canEncodeVideo: (codec, plan, bitrateMode) =>
    canEncodeVideo(codec, {
      width: plan.width,
      height: plan.height,
      quality: new Quality({ bitrate: plan.videoBps, bitrateMode }),
    }),
  canEncodeAudio: (codec, plan) =>
    canEncodeAudio(codec, { numberOfChannels: 2, sampleRate: 48_000, quality: new Quality({ bitrate: plan.audioBps }) }),
};

/** The fast engine's precheck: can this device read the file and encode `plan` into `container`? */
export async function checkFastEngine(
  info: VideoInfo,
  plan: EncodePlan,
  container: Container,
  encoders: DeviceEncoders = deviceEncoders
): Promise<SupportCheck> {
  if (!encoders.hasVideoEncoder()) {
    return { ok: false, reason: "This browser has no built-in video encoder." };
  }
  if (!info.readableByMediabunny) {
    return { ok: false, reason: "The fast engine can't read this file type." };
  }
  const { video, videoName, audio } = FORMATS[container];
  // AAC falls back to a software encoder (see `ensureAacEncoder`); Opus has none. Checked before
  // the video size because no smaller size would fix it.
  const wantAudio = plan.audioBps > 0 && info.hasAudio;
  if (wantAudio && audio === "opus" && !(await encoders.canEncodeAudio("opus", plan))) {
    return { ok: false, reason: "This browser can't encode Opus audio for WebM." };
  }
  const canEncodeIn = (bitrateMode: BitrateMode) => encoders.canEncodeVideo(video, plan, bitrateMode);
  if (!(await canEncodeIn("constant")) && !(await canEncodeIn("variable"))) {
    return { ok: false, reason: `This browser can't encode ${videoName} at ${plan.width}×${plan.height}.`, smallerMayWork: true };
  }
  return { ok: true };
}

export const webcodecsEngine: VideoEngine = {
  id: "webcodecs",
  precheck: (info, plan, container) => checkFastEngine(info, plan, container),
  encode,
};
