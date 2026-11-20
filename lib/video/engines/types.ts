import type { EncodePlan } from "@/lib/video/bitrate";
import type { FrameEdits } from "@/lib/video/frame";
import type { Rotation } from "@/lib/video/geometry";
import type { Container, TrimRange } from "@/lib/video/recipe";

export type EngineId = "webcodecs" | "ffmpeg";

/**
 * What we know about an input clip. `width`/`height` are the display size (rotation applied).
 * `durationSec` is the clip's length; trims are relative to `startSec`, the first timestamp in the file.
 */
export interface VideoInfo {
  durationSec: number;
  startSec: number;
  width: number;
  height: number;
  rotation: Rotation;
  videoCodec: string | null;
  audioCodec: string | null;
  hasAudio: boolean;
  /** Whether Mediabunny can read the container (the fast engine needs this). */
  readableByMediabunny: boolean;
}

export type SupportCheck = { ok: true } | { ok: false; reason: string; smallerMayWork?: boolean };

/** One encode pass. Engines reject with `ExportCanceledError` when `signal` aborts. */
export interface EncodeJob {
  file: File;
  info: VideoInfo;
  trim: TrimRange | null;
  plan: EncodePlan;
  edits: FrameEdits;
  container: Container;
  signal: AbortSignal;
  onProgress(p: number): void;
  /** Reports the one-time download of an engine's binary, when it has one. */
  onEngineDownload?(loaded: number, total: number | null): void;
}

export interface VideoEngine {
  id: EngineId;
  /** Cheap capability check before committing to this engine. */
  precheck(info: VideoInfo, plan: EncodePlan): Promise<SupportCheck>;
  /** Produces an MP4 (H.264 + AAC, faststart, upright, even size) honouring the plan. */
  encode(job: EncodeJob): Promise<Blob>;
}
