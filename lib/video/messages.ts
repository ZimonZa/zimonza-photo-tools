/** User-facing text for export progress and errors. */
import type { VideoInfo } from "@/lib/video/engines/types";
import {
  ExportCanceledError,
  InvalidSizeError,
  InvalidTrimError,
  TargetNotReachedError,
  TargetTooSmallError,
} from "@/lib/video/errors";
import type { ExportStatus } from "@/lib/video/export";
import { MB } from "@/lib/video/recipe";

const mb = (bytes: number) => `${(bytes / MB).toFixed(2)} MB`;

/** One-line summary of a probed file. */
export function describeInfo(i: VideoInfo): string {
  return `${i.videoCodec ?? "?"} + ${i.audioCodec ?? "no audio"} · ${i.width}×${i.height} · rotation ${i.rotation} · ${i.durationSec.toFixed(2)} s (starts at ${i.startSec.toFixed(2)} s) · fast engine can read: ${i.readableByMediabunny ? "yes" : "no"}`;
}

export function describeStatus(s: ExportStatus): string {
  switch (s.phase) {
    case "probing":
      return "Reading the video…";
    case "probed":
      return `Found ${describeInfo(s.info)}`;
    case "loading-engine":
      return `Downloading backup engine… ${mb(s.loadedBytes)} of ${s.totalBytes ? mb(s.totalBytes) : "~32 MB"}`;
    case "encoding":
      return `Encoding with the ${s.engine === "webcodecs" ? "fast" : "backup"} engine — pass ${s.attempt}`;
    case "smaller":
      return `Lowered to ${s.width}×${s.height}: ${s.reason}`;
    case "probe-fallback":
      return `Reading with the backup engine: ${s.reason}`;
    case "fallback":
      return `Switching to the backup engine: ${s.reason}`;
  }
}

/** A message (and an optional hint) for a failed export; null when the user canceled. */
export function describeExportError(e: unknown, targetBytes: number | null): { message: string; hint?: string } | null {
  if (e instanceof ExportCanceledError) return null;
  if (e instanceof TargetTooSmallError) {
    return {
      message: "That size is too small for a video this long.",
      hint: `Try at least ${Math.ceil(e.minBytes / 100_000) / 10} MB, or trim it shorter.`,
    };
  }
  if (e instanceof InvalidTrimError) return { message: "The trimmed part is too short — keep at least 0.1 seconds." };
  if (e instanceof InvalidSizeError) return { message: "That output size is too small. Use at least 16 × 16 pixels." };
  if (e instanceof TargetNotReachedError) {
    const target = targetBytes === null ? "the target" : `${(targetBytes / MB).toFixed(1).replace(/\.0$/, "")} MB`;
    return {
      message: `Couldn't get the video under ${target}.`,
      hint: "Try a lower resolution or a bigger target.",
    };
  }
  if (e instanceof Error) return { message: `Something went wrong: ${e.message}` };
  return { message: "Something went wrong." };
}
