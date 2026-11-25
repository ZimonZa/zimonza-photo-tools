/** User-facing text for export progress and errors. */
import type { VideoInfo } from "@/lib/video/engines/types";
import {
  ExportCanceledError,
  InvalidSizeError,
  InvalidTrimError,
  TargetNotReachedError,
  TargetTooSmallError,
} from "@/lib/video/errors";
import { MAX_TARGET_ATTEMPTS } from "@/lib/video/bitrate";
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

/** Size of the backup engine's one-time download, for when the server doesn't say. */
const ENGINE_DOWNLOAD_MB = "~32";

/**
 * Status copy for the editor (the lab keeps `describeStatus`'s detail): plain words, never an
 * engine's own error text.
 */
export function describeStudioStatus(s: ExportStatus): string {
  switch (s.phase) {
    case "probed":
      return "Checked the video";
    case "loading-engine": {
      const total = s.totalBytes ? (s.totalBytes / MB).toFixed(1) : ENGINE_DOWNLOAD_MB;
      return `Downloading the video engine… ${(s.loadedBytes / MB).toFixed(1)} of ${total} MB`;
    }
    case "smaller":
      return `Lowered to ${s.width}×${s.height} so this device can encode it`;
    case "probe-fallback":
      return "Reading the video with the backup engine…";
    case "fallback":
      return "Switching to the backup engine…";
    default:
      return describeStatus(s);
  }
}

/** The fast engine's refusals (`checkFastEngine`) as phrases; anything else is an engine's own error text. */
const FALLBACK_REASONS: [RegExp, (m: RegExpMatchArray) => string][] = [
  [/^This browser has no built-in video encoder\.$/, () => "it has no built-in video encoder"],
  [/^The fast engine can't read this file type\.$/, () => "it can't read this file type"],
  [/^This browser can't encode Opus audio for WebM\.$/, () => "it can't encode WebM sound"],
  [/^This browser can't encode (H\.264|VP9) at (\d+×\d+)\.$/, (m) => `it can't encode ${m[1]} at ${m[2]}`],
];

/**
 * Why the fast engine can't do it, for the slow-engine question's brackets ("Your browser can't do
 * this with the fast engine (…)"). Engine error text stays in the lab; it reads as a plain phrase.
 */
export function fallbackReasonText(reason: string): string {
  for (const [pattern, phrase] of FALLBACK_REASONS) {
    const m = reason.match(pattern);
    if (m) return phrase(m);
  }
  return "it ran into a problem with this video";
}

/**
 * The running export's bar. `progress` is the current pass's (0..1); the percent stops at 99 because
 * the file isn't ready until the export ends. A target size can take up to MAX_TARGET_ATTEMPTS
 * passes, each starting from 0, so those name the pass (null before encoding starts or for a
 * one-pass export).
 */
export function exportProgress(progress: number, attempt: number, targetSize: boolean): { percent: number; pass: string | null } {
  const share = Number.isFinite(progress) ? Math.min(1, Math.max(0, progress)) : 0;
  const percent = Math.min(99, Math.round(share * 100));
  if (!targetSize || attempt < 1) return { percent, pass: null };
  const pass = `Pass ${attempt} of up to ${MAX_TARGET_ATTEMPTS}`;
  return { percent, pass: attempt === 1 ? pass : `${pass} — adjusting size` };
}

/** Below this share of a pass, or this long into it, a guess at the time left is too wild to show. */
const TIME_LEFT_MIN_PROGRESS = 0.05;
const TIME_LEFT_MIN_ELAPSED_MS = 2000;

/**
 * "About N s left" (or "About N min left") for the running pass, from how long it has run and how
 * far it got, rounded up and never under 1 s. A target size can take more passes, so it says "in
 * this pass". Null until the pass is 5% done and 2 s in, and once it reports 100%.
 */
export function timeLeft(progress: number, passElapsedMs: number, targetSize: boolean): string | null {
  if (!Number.isFinite(progress) || !Number.isFinite(passElapsedMs)) return null;
  if (progress < TIME_LEFT_MIN_PROGRESS || progress >= 1 || passElapsedMs < TIME_LEFT_MIN_ELAPSED_MS) return null;
  // The epsilon keeps float noise (12.000000001) from rounding up a whole second.
  const sec = Math.max(1, Math.ceil(((passElapsedMs / 1000) * (1 - progress)) / progress - 1e-9));
  const amount = sec < 60 ? `${sec} s` : `${Math.ceil(sec / 60 - 1e-9)} min`;
  return `About ${amount} left${targetSize ? " in this pass" : ""}`;
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
