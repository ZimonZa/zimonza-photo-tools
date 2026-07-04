import { OUTPUT_FORMATS, RESIZE_PRESETS } from "@/lib/formats";
import type { CropRect, ProcessResult, ProcessSettings } from "@/lib/types";

/* ----------------------------- pica (lazy) ----------------------------- */

type PicaInstance = {
  resize: (
    from: HTMLCanvasElement,
    to: HTMLCanvasElement,
    options?: { alpha?: boolean }
  ) => Promise<HTMLCanvasElement>;
};

let picaInstance: PicaInstance | null = null;
async function getPica(): Promise<PicaInstance> {
  if (!picaInstance) {
    const Pica = (await import("pica")).default;
    picaInstance = Pica() as unknown as PicaInstance;
  }
  return picaInstance;
}

/* ------------------------------ helpers ------------------------------- */

function makeCanvas(width: number, height: number): HTMLCanvasElement {
  const canvas = document.createElement("canvas");
  canvas.width = Math.max(1, Math.round(width));
  canvas.height = Math.max(1, Math.round(height));
  return canvas;
}

function get2d(canvas: HTMLCanvasElement): CanvasRenderingContext2D {
  const ctx = canvas.getContext("2d");
  if (!ctx) throw new Error("Canvas 2D context unavailable.");
  return ctx;
}

function toBlob(
  canvas: HTMLCanvasElement,
  mime: string,
  quality?: number
): Promise<Blob> {
  return new Promise((resolve, reject) => {
    canvas.toBlob(
      (blob) => (blob ? resolve(blob) : reject(new Error("Encoding failed."))),
      mime,
      quality
    );
  });
}

/**
 * Render the source into a canvas applying crop, rotation (0/90/180/270)
 * and flips. The returned canvas holds the full-resolution, oriented image.
 */
/**
 * Intersect a crop rect with the source bounds. Returns null when the rect
 * lies (almost) entirely outside the image — callers then skip cropping,
 * so a stale/invalid rect can never produce a blank output.
 */
function clampCrop(crop: CropRect, srcW: number, srcH: number): CropRect | null {
  const x = Math.max(0, Math.min(crop.x, srcW - 1));
  const y = Math.max(0, Math.min(crop.y, srcH - 1));
  const width = Math.min(crop.width - (x - crop.x), srcW - x);
  const height = Math.min(crop.height - (y - crop.y), srcH - y);
  if (width < 1 || height < 1) return null;
  return { x, y, width, height };
}

function buildOrientedCanvas(
  source: CanvasImageSource,
  srcW: number,
  srcH: number,
  s: ProcessSettings
): HTMLCanvasElement {
  const full: CropRect = { x: 0, y: 0, width: srcW, height: srcH };
  const crop: CropRect = (s.crop && clampCrop(s.crop, srcW, srcH)) || full;
  const swap = s.rotation === 90 || s.rotation === 270;
  const canvas = makeCanvas(swap ? crop.height : crop.width, swap ? crop.width : crop.height);
  const ctx = get2d(canvas);

  ctx.save();
  ctx.translate(canvas.width / 2, canvas.height / 2);
  ctx.rotate((s.rotation * Math.PI) / 180);
  ctx.scale(s.flipH ? -1 : 1, s.flipV ? -1 : 1);
  ctx.drawImage(
    source,
    crop.x,
    crop.y,
    crop.width,
    crop.height,
    -crop.width / 2,
    -crop.height / 2,
    crop.width,
    crop.height
  );
  ctx.restore();
  return canvas;
}

/**
 * Effective source size after crop + 90/270 rotation swap — i.e. the dimensions
 * the resize math actually operates on. Used for the live "New size" readout.
 */
export function effectiveSourceSize(
  srcW: number,
  srcH: number,
  s: ProcessSettings
): { width: number; height: number } {
  const clamped = s.crop ? clampCrop(s.crop, srcW, srcH) : null;
  const cw = clamped ? clamped.width : srcW;
  const ch = clamped ? clamped.height : srcH;
  const swap = s.rotation === 90 || s.rotation === 270;
  return { width: swap ? ch : cw, height: swap ? cw : ch };
}

/** Compute output dimensions from the (already cropped/oriented) source size. */
export function computeDimensions(
  srcW: number,
  srcH: number,
  s: ProcessSettings
): { width: number; height: number } {
  let w = srcW;
  let h = srcH;

  if (s.dimensionMode === "percent") {
    w = (srcW * s.percent) / 100;
    h = (srcH * s.percent) / 100;
  } else if (s.dimensionMode === "px") {
    const tw = s.width || 0;
    const th = s.height || 0;
    if (s.lockAspect) {
      if (tw && th) {
        const r = Math.min(tw / srcW, th / srcH);
        w = srcW * r;
        h = srcH * r;
      } else if (tw) {
        w = tw;
        h = (tw * srcH) / srcW;
      } else if (th) {
        h = th;
        w = (th * srcW) / srcH;
      }
    } else {
      w = tw || srcW;
      h = th || srcH;
    }
  } else if (s.dimensionMode === "preset") {
    const preset = RESIZE_PRESETS.find((p) => p.id === s.preset);
    if (preset) {
      const r = Math.min(preset.width / srcW, preset.height / srcH);
      w = srcW * r;
      h = srcH * r;
    }
  }

  if (s.noEnlarge) {
    if (w > srcW) {
      w = srcW;
      h = srcH;
    }
  }

  return { width: Math.max(1, Math.round(w)), height: Math.max(1, Math.round(h)) };
}

/** Flatten a (possibly transparent) canvas onto a solid background color. */
function flatten(canvas: HTMLCanvasElement, bg: string): HTMLCanvasElement {
  const out = makeCanvas(canvas.width, canvas.height);
  const ctx = get2d(out);
  ctx.fillStyle = bg;
  ctx.fillRect(0, 0, out.width, out.height);
  ctx.drawImage(canvas, 0, 0);
  return out;
}

/** Binary-search quality so the encoded blob fits within targetBytes. */
async function encodeToTargetSize(
  canvas: HTMLCanvasElement,
  mime: string,
  targetBytes: number
): Promise<Blob> {
  let lo = 0.05;
  let hi = 0.97;
  let best: Blob | null = null;

  for (let i = 0; i < 8; i++) {
    const mid = (lo + hi) / 2;
    const blob = await toBlob(canvas, mime, mid);
    if (blob.size <= targetBytes) {
      best = blob;
      lo = mid; // try higher quality
    } else {
      hi = mid; // too big, lower quality
    }
  }
  // Fall back to the lowest quality if even that overshoots the target.
  return best ?? (await toBlob(canvas, mime, lo));
}

/**
 * Run the full pipeline: crop/orient -> resize (pica) -> flatten -> encode.
 * Returns the output blob, final dimensions and an object URL for preview.
 */
export async function processImage(
  source: CanvasImageSource,
  srcW: number,
  srcH: number,
  s: ProcessSettings
): Promise<ProcessResult> {
  const format = OUTPUT_FORMATS[s.format];
  const oriented = buildOrientedCanvas(source, srcW, srcH, s);
  const { width, height } = computeDimensions(oriented.width, oriented.height, s);

  let working = oriented;
  if (width !== oriented.width || height !== oriented.height) {
    const dest = makeCanvas(width, height);
    const pica = await getPica();
    await pica.resize(oriented, dest, { alpha: format.supportsAlpha });
    working = dest;
  }

  if (!format.supportsAlpha) {
    working = flatten(working, s.bgColor);
  }

  let blob: Blob;
  if (s.targetSizeEnabled && format.lossy) {
    blob = await encodeToTargetSize(working, format.mime, s.targetSizeKB * 1024);
  } else {
    blob = await toBlob(working, format.mime, format.lossy ? s.quality : undefined);
  }

  return { blob, width, height, url: URL.createObjectURL(blob) };
}

/** Generate a small thumbnail data URL for the queue UI. */
export function makeThumbnail(
  source: CanvasImageSource,
  srcW: number,
  srcH: number,
  max = 256
): string {
  const r = Math.min(1, max / Math.max(srcW, srcH));
  const canvas = makeCanvas(srcW * r, srcH * r);
  const ctx = get2d(canvas);
  ctx.drawImage(source, 0, 0, canvas.width, canvas.height);
  return canvas.toDataURL("image/png");
}

/**
 * PNG object URL of the source for display (crop editor / compare view).
 * Optionally downscaled to `maxSize` (longest edge) for performance on big images.
 * Returns the object URL plus `scale` = factor to map display pixels back to
 * full-resolution source pixels (multiply display coords by `scale`).
 */
export function sourceToDisplayUrl(
  source: CanvasImageSource,
  srcW: number,
  srcH: number,
  maxSize?: number
): Promise<{ url: string; scale: number }> {
  const r = maxSize ? Math.min(1, maxSize / Math.max(srcW, srcH)) : 1;
  const w = Math.max(1, Math.round(srcW * r));
  const h = Math.max(1, Math.round(srcH * r));
  const canvas = makeCanvas(w, h);
  get2d(canvas).drawImage(source, 0, 0, w, h);
  return toBlob(canvas, "image/png").then((b) => ({
    url: URL.createObjectURL(b),
    scale: srcW / w,
  }));
}
