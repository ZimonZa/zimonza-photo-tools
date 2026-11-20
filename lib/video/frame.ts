/** Frame math for video edits: crop clamping, output size and fit, and the flip/rotate mapping. */
import { capLongSide, displaySize, toEven, type Rotation, type Size } from "@/lib/video/geometry";

/** How a picture fills an output frame of another shape. */
export type FitMode = "cover" | "blur";

/** A crop in display pixels (after rotation). */
export interface CropRect {
  left: number;
  top: number;
  width: number;
  height: number;
}

export type OutputFrame =
  | { kind: "source"; maxLongSide: number | null }
  | { kind: "percent"; percent: number }
  | { kind: "exact"; width: number; height: number; fit: FitMode };

/** The picture edits an engine applies, in this order: crop, rotate, flip, then fit into the frame. */
export interface FrameEdits {
  rotate: Rotation;
  flipH: boolean;
  flipV: boolean;
  crop: CropRect | null;
  fit: FitMode | null;
}

/** Smallest crop side we keep, in px. */
const MIN_CROP_SIDE = 16;
/** Aspect ratios this close count as the same shape. */
const SAME_SHAPE_TOLERANCE = 0.01;

const floorEven = (n: number) => Math.floor(n / 2) * 2;

/**
 * Clip a crop to the picture and snap it to even numbers.
 * Returns `null` for no crop, a side under 16 px, or a crop that covers the whole picture.
 */
export function clampCrop(crop: CropRect | null, within: Size): CropRect | null {
  if (!crop) return null;
  const left = floorEven(Math.max(0, crop.left));
  const top = floorEven(Math.max(0, crop.top));
  const width = floorEven(Math.min(within.width, crop.left + crop.width) - left);
  const height = floorEven(Math.min(within.height, crop.top + crop.height) - top);
  if (width < MIN_CROP_SIDE || height < MIN_CROP_SIDE) return null;
  if (left === 0 && top === 0 && width === within.width && height === within.height) return null;
  return { left, top, width, height };
}

/**
 * Work out the crop to apply, the size before any fit (`base`), and whether the picture needs
 * a fit mode to fill the frame. `display` is the source's display size, before the user's rotation.
 */
export function resolveFrame(
  display: Size,
  rotate: Rotation,
  crop: CropRect | null,
  frame: OutputFrame
): { crop: CropRect | null; base: Size; fit: FitMode | null } {
  const rotated = displaySize(display, rotate);
  const clamped = clampCrop(crop, rotated);
  const picture: Size = clamped ? { width: clamped.width, height: clamped.height } : rotated;

  if (frame.kind === "source") {
    return { crop: clamped, base: capLongSide(picture, frame.maxLongSide), fit: null };
  }
  if (frame.kind === "percent") {
    const p = Math.min(100, Math.max(1, frame.percent));
    return {
      crop: clamped,
      base: { width: toEven((picture.width * p) / 100), height: toEven((picture.height * p) / 100) },
      fit: null,
    };
  }
  const base = { width: toEven(frame.width), height: toEven(frame.height) };
  const sameShape =
    Math.abs(base.width / base.height / (picture.width / picture.height) - 1) <= SAME_SHAPE_TOLERANCE;
  return { crop: clamped, base, fit: sameShape ? null : frame.fit };
}

/** Mediabunny only flips horizontally, so a vertical flip becomes a 180 degree turn plus a horizontal flip. */
export function mediabunnyTransform(
  rotate: Rotation,
  flipH: boolean,
  flipV: boolean
): { rotate: Rotation; flip: boolean } {
  if (!flipV) return { rotate, flip: flipH };
  return { rotate: ((rotate + 180) % 360) as Rotation, flip: !flipH };
}
