import { TargetTooSmallError } from "@/lib/video/errors";
import { capLongSide, scaleToShortSide, type Size } from "@/lib/video/geometry";
import type { QualityLevel } from "@/lib/video/recipe";

/** Frame rate assumed when turning bits-per-pixel into a bitrate. */
export const BUDGET_FPS = 30;
/** Below this many bits per pixel per frame the picture falls apart; step down a size instead. */
export const MIN_BPP = 0.02;
export const QUALITY_BPP = { high: 0.1, balanced: 0.06, small: 0.035 } as const;
export const QUALITY_AUDIO_BPS = { high: 128_000, balanced: 128_000, small: 96_000 } as const;
/** First pass aims under the target to leave room for container overhead and encoder overshoot. */
export const FIRST_ATTEMPT_FILL = 0.92;
/** Later passes aim here. */
export const RETRY_FILL = 0.95;
/** A result below this share of the target is worth another, bigger pass. */
export const MIN_FILL = 0.9;
export const MAX_TARGET_ATTEMPTS = 4;
export const STEP_DOWN_SHORT_SIDES = [1080, 720, 540, 480, 360];

export interface EncodePlan {
  width: number;
  height: number;
  videoBps: number;
  /** 0 = no audio track in the output. */
  audioBps: number;
  /** True when the resolution was lowered to make a target size fit. */
  steppedDown: boolean;
}

function bppBitrate(size: Size, bpp: number): number {
  return size.width * size.height * BUDGET_FPS * bpp;
}

/** The "high quality" bitrate for a size — the ceiling for target-size encodes. */
export function maxVideoBps(size: Size): number {
  return Math.round(bppBitrate(size, QUALITY_BPP.high));
}

/**
 * Highest sensible video bitrate: "high" quality for the size, and never more than the source file
 * itself used (re-encoding can't add quality, only bytes). Keeps at least half the source rate for video.
 */
export function videoCeilingBps(size: Size, sourceBps: number | null, audioBps: number): number {
  const sourceCap = sourceBps ? Math.max(sourceBps - audioBps, sourceBps / 2) : Infinity;
  return Math.round(Math.min(maxVideoBps(size), sourceCap));
}

/** Audio bitrate for a total (audio + video) budget in bits per second. */
export function audioBpsForBudget(totalBps: number): number {
  if (totalBps >= 1_000_000) return 128_000;
  if (totalBps >= 400_000) return 96_000;
  return 64_000;
}

export function planQuality(a: {
  source: Size;
  level: QualityLevel;
  hasAudio: boolean;
  muted: boolean;
  maxLongSide: number | null;
  /** Average bitrate of the whole source file, when known. */
  sourceBps?: number | null;
}): EncodePlan {
  const size = capLongSide(a.source, a.maxLongSide);
  const audioBps = a.muted || !a.hasAudio ? 0 : QUALITY_AUDIO_BPS[a.level];
  return {
    ...size,
    videoBps: Math.round(Math.min(bppBitrate(size, QUALITY_BPP[a.level]), videoCeilingBps(size, a.sourceBps ?? null, audioBps))),
    audioBps,
    steppedDown: false,
  };
}

/**
 * Pick resolution and bitrates so the file lands under `targetBytes`.
 * Steps the resolution down when the bitrate would be too thin for the size.
 * Throws `TargetTooSmallError` when even 360p would look broken.
 */
export function planTarget(a: {
  source: Size;
  durationSec: number;
  targetBytes: number;
  hasAudio: boolean;
  muted: boolean;
  maxLongSide: number | null;
  /** Average bitrate of the whole source file, when known. */
  sourceBps?: number | null;
}): EncodePlan {
  const budgetBps = (a.targetBytes * 8 * FIRST_ATTEMPT_FILL) / a.durationSec;
  const audioBps = a.muted || !a.hasAudio ? 0 : audioBpsForBudget(budgetBps);
  const videoBudget = budgetBps - audioBps;

  const base = capLongSide(a.source, a.maxLongSide);
  const baseShort = Math.min(base.width, base.height);
  const candidates = [
    base,
    ...STEP_DOWN_SHORT_SIDES.filter((s) => s < baseShort).map((s) => scaleToShortSide(base, s)),
  ];

  for (const c of candidates) {
    if (videoBudget >= bppBitrate(c, MIN_BPP)) {
      return {
        ...c,
        videoBps: Math.floor(Math.min(videoBudget, videoCeilingBps(c, a.sourceBps ?? null, audioBps))),
        audioBps,
        steppedDown: c !== base,
      };
    }
  }

  const smallest = candidates[candidates.length - 1];
  const minBytes = ((bppBitrate(smallest, MIN_BPP) + audioBps) * a.durationSec) / 8 / FIRST_ATTEMPT_FILL;
  throw new TargetTooSmallError(Math.ceil(minBytes));
}

/** Video bitrate for the next pass, scaling only the video share of the file. */
export function nextVideoBps(a: {
  prevVideoBps: number;
  actualBytes: number;
  targetBytes: number;
  audioBps: number;
  durationSec: number;
}): number {
  const audioBytes = (a.audioBps * a.durationSec) / 8;
  const desiredVideoBytes = a.targetBytes * RETRY_FILL - audioBytes;
  const actualVideoBytes = Math.max(1, a.actualBytes - audioBytes);
  return Math.floor((a.prevVideoBps * desiredVideoBytes) / actualVideoBytes);
}

export function judgeAttempt(actualBytes: number, targetBytes: number): "over" | "under-filled" | "ok" {
  if (actualBytes > targetBytes) return "over";
  if (actualBytes < MIN_FILL * targetBytes) return "under-filled";
  return "ok";
}
