import { planQuality, planTarget, type EncodePlan } from "@/lib/video/bitrate";
import type { VideoInfo } from "@/lib/video/engines/types";
import { resolveFrame, type CropRect, type FitMode } from "@/lib/video/frame";
import type { Size } from "@/lib/video/geometry";
import { normalizeTrim, type EditRecipe, type TrimRange } from "@/lib/video/recipe";

export interface OutputPlan {
  plan: EncodePlan;
  crop: CropRect | null;
  fit: FitMode | null;
  durationSec: number;
  trim: TrimRange | null;
  /** Estimated size of the export; never above the target in target mode. */
  estimatedBytes: number;
  /** Size before any fit, and the whole-file source bitrate: the engine step-down and target loop need them. */
  base: Size;
  sourceBps: number | null;
  /** The plan for another source size (the step-down sizes). */
  planFor: (src: Size) => EncodePlan;
}

/** Estimated output bytes for a plan: bitrate times length, capped at the target when there is one. */
export function estimateBytes(plan: EncodePlan, durationSec: number, targetBytes: number | null): number {
  const bytes = Math.round(((plan.videoBps + plan.audioBps) * durationSec) / 8);
  return targetBytes === null ? bytes : Math.min(bytes, targetBytes);
}

/**
 * Plan an export without encoding: normalize the trim, resolve the frame, and pick the bitrate.
 * Throws `InvalidTrimError`, `InvalidSizeError` or `TargetTooSmallError` like an export would.
 */
export function planOutput(info: VideoInfo, recipe: EditRecipe): OutputPlan {
  const trim = normalizeTrim(recipe.trim, info.durationSec);
  const durationSec = trim ? trim.end - trim.start : info.durationSec;
  const { crop, base, fit } = resolveFrame(
    { width: info.width, height: info.height },
    recipe.rotate,
    recipe.crop,
    recipe.frame
  );
  // Whole-file average bitrate: re-encoding never needs more than the source already spent.
  const sourceBps = info.durationSec > 0 ? (recipe.file.size * 8) / info.durationSec : null;
  const planFor = (src: Size): EncodePlan =>
    recipe.size.kind === "target"
      ? planTarget({
          source: src,
          durationSec,
          targetBytes: recipe.size.bytes,
          hasAudio: info.hasAudio,
          muted: recipe.muted,
          maxLongSide: null,
          sourceBps,
        })
      : planQuality({
          source: src,
          level: recipe.size.level,
          hasAudio: info.hasAudio,
          muted: recipe.muted,
          maxLongSide: null,
          sourceBps,
        });
  const plan = planFor(base);
  const targetBytes = recipe.size.kind === "target" ? recipe.size.bytes : null;
  return {
    plan,
    crop,
    fit,
    durationSec,
    trim,
    estimatedBytes: estimateBytes(plan, durationSec, targetBytes),
    base,
    sourceBps,
    planFor,
  };
}
