/** Blurred-background fit for the fast engine. Browser-only (needs OffscreenCanvas). */
import type { Size } from "@/lib/video/geometry";

/** The background is drawn at 1/8 size and scaled back up, which blurs it. */
const BLUR_SHRINK = 8;
/** Darkens the background so the picture on top stands out. */
const BACKGROUND_SHADE = "rgba(0,0,0,0.2)";

function context(canvas: OffscreenCanvas): OffscreenCanvasRenderingContext2D {
  const ctx = canvas.getContext("2d");
  if (!ctx) throw new Error("No 2D canvas context.");
  ctx.imageSmoothingEnabled = true;
  ctx.imageSmoothingQuality = "high";
  return ctx;
}

/** Draw `frame` scaled by `scale` and centred in a `box`-sized area. */
function drawCentred(ctx: OffscreenCanvasRenderingContext2D, frame: CanvasImageSource, w: number, h: number, box: Size, scale: number) {
  const dw = w * scale;
  const dh = h * scale;
  ctx.drawImage(frame, (box.width - dw) / 2, (box.height - dh) / 2, dw, dh);
}

/**
 * Returns a function that fits a `width`×`height` frame into `out`: the whole frame, centred,
 * over a blurred and darkened copy of itself scaled to cover. Each call redraws and returns the
 * same canvas, so use the result before the next call.
 *
 * The blur comes from scaling down and back up, not `ctx.filter`, which is unreliable on iOS Safari.
 */
export function createBlurFitter(out: Size): (frame: CanvasImageSource, width: number, height: number) => OffscreenCanvas {
  const canvas = new OffscreenCanvas(out.width, out.height);
  const ctx = context(canvas);
  const small: Size = {
    width: Math.max(1, Math.round(out.width / BLUR_SHRINK)),
    height: Math.max(1, Math.round(out.height / BLUR_SHRINK)),
  };
  const smallCanvas = new OffscreenCanvas(small.width, small.height);
  const smallCtx = context(smallCanvas);

  return (frame, width, height) => {
    drawCentred(smallCtx, frame, width, height, small, Math.max(small.width / width, small.height / height));
    ctx.drawImage(smallCanvas, 0, 0, out.width, out.height);
    ctx.fillStyle = BACKGROUND_SHADE;
    ctx.fillRect(0, 0, out.width, out.height);
    drawCentred(ctx, frame, width, height, out, Math.min(out.width / width, out.height / height));
    return canvas;
  };
}
