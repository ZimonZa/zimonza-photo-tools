/**
 * Live preview drawing: the engines' rotate → flip H → flip V → crop → fit, one frame at a time.
 * `previewFrame` and `previewCanvasSize` are pure; drawing needs a browser (OffscreenCanvas).
 */
import { createBlurFitter } from "@/lib/video/engines/blur-fit";
import type { VideoInfo } from "@/lib/video/engines/types";
import { resolveFrame, type CropRect, type FitMode, type FrameEdits, type OutputFrame } from "@/lib/video/frame";
import { capLongSide, displaySize, type Size } from "@/lib/video/geometry";
import { planOutput } from "@/lib/video/plan-output";
import { normalizeTrim, type EditRecipe, type TrimRange } from "@/lib/video/recipe";

type Context2D = CanvasRenderingContext2D | OffscreenCanvasRenderingContext2D;

/** What the preview draws: the export's frame size, its edits, and the range that plays. */
export interface PreviewFrame {
  out: Size;
  edits: FrameEdits;
  trim: TrimRange | null;
}

/** The preview canvas's backing size: `out` with the long side at most `maxLong`, never scaled up, even sides. */
export function previewCanvasSize(out: Size, maxLong = 960): Size {
  return capLongSide(out, maxLong);
}

/**
 * The export's frame for `recipe` (plan size, clamped crop, resolved fit, normalized trim). When the
 * settings can't produce a file, still preview the picture: the requested frame if it resolves,
 * else the turned and cropped picture at its own size; a trim that is too short plays the whole clip.
 */
export function previewFrame(info: VideoInfo, recipe: EditRecipe): PreviewFrame {
  const orientation = { rotate: recipe.rotate, flipH: recipe.flipH, flipV: recipe.flipV };
  try {
    const { plan, crop, fit, trim } = planOutput(info, recipe);
    return { out: { width: plan.width, height: plan.height }, edits: { ...orientation, crop, fit }, trim };
  } catch {
    let trim: TrimRange | null = null;
    try {
      trim = normalizeTrim(recipe.trim, info.durationSec);
    } catch {
      trim = null;
    }
    const display = { width: info.width, height: info.height };
    const frames: OutputFrame[] = [recipe.frame, { kind: "source", maxLongSide: null }];
    for (const frame of frames) {
      try {
        const { base, crop, fit } = resolveFrame(display, recipe.rotate, recipe.crop, frame);
        return { out: base, edits: { ...orientation, crop, fit }, trim };
      } catch {
        // Try the next, simpler frame.
      }
    }
    return { out: displaySize(display, recipe.rotate), edits: { ...orientation, crop: null, fit: null }, trim };
  }
}

/** The oriented, cropped picture, redrawn each frame into one reused canvas. */
let picture: { canvas: OffscreenCanvas; ctx: OffscreenCanvasRenderingContext2D } | null = null;
/** The blurred-background fitter for the last output size. */
let blur: { width: number; height: number; fit: ReturnType<typeof createBlurFitter> } | null = null;

function pictureSurface(width: number, height: number): OffscreenCanvasRenderingContext2D {
  if (!picture) {
    const canvas = new OffscreenCanvas(width, height);
    const ctx = canvas.getContext("2d");
    if (!ctx) throw new Error("No 2D canvas context.");
    picture = { canvas, ctx };
  }
  const { canvas, ctx } = picture;
  // Resizing resets the context, so only do it when the size changes.
  if (canvas.width !== width || canvas.height !== height) {
    canvas.width = width;
    canvas.height = height;
  }
  ctx.setTransform(1, 0, 0, 1, 0, 0);
  ctx.imageSmoothingEnabled = true;
  ctx.imageSmoothingQuality = "high";
  ctx.clearRect(0, 0, width, height);
  return ctx;
}

function blurFitter(out: Size): ReturnType<typeof createBlurFitter> {
  if (!blur || blur.width !== out.width || blur.height !== out.height) {
    blur = { width: out.width, height: out.height, fit: createBlurFitter(out) };
  }
  return blur.fit;
}

/** How much the fit scales the picture; the picture is never kept sharper than that. */
function fitScale(fit: FitMode | null, crop: Size, out: Size): number {
  const x = out.width / crop.width;
  const y = out.height / crop.height;
  return fit === "blur" ? Math.min(x, y) : Math.max(x, y);
}

/**
 * Turn, flip and crop `source` into the reused picture canvas, `width`×`height` px. The canvas
 * transform maps a source pixel to the oriented picture (turn, then flip H, then flip V), moves the
 * crop's corner to the origin and scales the crop to the canvas.
 */
function orient(source: CanvasImageSource, size: Size, edits: FrameEdits, crop: CropRect, width: number, height: number) {
  const ctx = pictureSurface(width, height);
  const turned = displaySize(size, edits.rotate);
  ctx.scale(width / crop.width, height / crop.height);
  ctx.translate(-crop.left, -crop.top);
  if (edits.flipV) {
    ctx.translate(0, turned.height);
    ctx.scale(1, -1);
  }
  if (edits.flipH) {
    ctx.translate(turned.width, 0);
    ctx.scale(-1, 1);
  }
  if (edits.rotate === 90) ctx.translate(size.height, 0);
  else if (edits.rotate === 180) ctx.translate(size.width, size.height);
  else if (edits.rotate === 270) ctx.translate(0, size.width);
  ctx.rotate((edits.rotate * Math.PI) / 180);
  ctx.drawImage(source, 0, 0, size.width, size.height);
}

/**
 * Draw one frame of `source` (`sourceSize` px) with `edits` into `ctx`, filling `out` (the canvas
 * size, the export frame's shape). The crop is in the clip's display picture after turning and
 * flipping, `clipSize` before them (default `sourceSize`); a smaller proxy source scales it down.
 * Fit: none = scale to the frame, cover = fill and cut the overflow, blur = `createBlurFitter`.
 */
export function drawPreviewFrame(
  ctx: Context2D,
  source: CanvasImageSource,
  sourceSize: Size,
  edits: FrameEdits,
  out: Size,
  clipSize: Size = sourceSize
): void {
  const turned = displaySize(sourceSize, edits.rotate);
  const clipTurned = displaySize(clipSize, edits.rotate);
  const sx = turned.width / clipTurned.width;
  const sy = turned.height / clipTurned.height;
  const crop: CropRect = edits.crop
    ? { left: edits.crop.left * sx, top: edits.crop.top * sy, width: edits.crop.width * sx, height: edits.crop.height * sy }
    : { left: 0, top: 0, width: turned.width, height: turned.height };

  // Keep the picture canvas no larger than the frame needs (a 4K source previews at ~960 px).
  const keep = Math.min(1, fitScale(edits.fit, crop, out));
  const width = Math.max(1, Math.round(crop.width * keep));
  const height = Math.max(1, Math.round(crop.height * keep));
  orient(source, sourceSize, edits, crop, width, height);
  const pic = picture!.canvas;

  ctx.imageSmoothingEnabled = true;
  ctx.imageSmoothingQuality = "high";
  if (edits.fit === "blur") {
    ctx.drawImage(blurFitter(out)(pic, width, height), 0, 0, out.width, out.height);
  } else if (edits.fit === "cover") {
    const s = Math.max(out.width / width, out.height / height);
    const w = width * s;
    const h = height * s;
    ctx.drawImage(pic, (out.width - w) / 2, (out.height - h) / 2, w, h);
  } else {
    ctx.drawImage(pic, 0, 0, out.width, out.height);
  }
}
