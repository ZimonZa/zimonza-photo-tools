/** Frame math for video edits: crop clamping, output size and fit, and the flip/rotate mapping. */
import { InvalidSizeError } from "@/lib/video/errors";
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

/**
 * The picture edits an engine applies, in this order: rotate (clockwise, on top of the file's own
 * rotation), flip horizontally, flip vertically, crop, then fit into the frame. The crop is in the
 * picture after rotating and flipping.
 */
export interface FrameEdits {
  rotate: Rotation;
  flipH: boolean;
  flipV: boolean;
  crop: CropRect | null;
  fit: FitMode | null;
}

/** Smallest side, in px, of a crop we keep and of an output we encode. The one place this limit lives. */
export const MIN_SIDE = 16;
/** Largest side a Custom output size may be typed with, in px. */
export const MAX_CUSTOM_SIDE = 4096;
/** Aspect ratios this close count as the same shape. */
const SAME_SHAPE_TOLERANCE = 0.01;

/** Round down to an even number of px (encoders want even sides). */
export const floorEven = (n: number) => Math.floor(n / 2) * 2;

/**
 * Clip a crop to the picture and snap it to even numbers.
 * Returns `null` for no crop, a value that isn't a finite number, a side under 16 px, or a crop
 * that covers the whole picture.
 */
export function clampCrop(crop: CropRect | null, within: Size): CropRect | null {
  if (!crop) return null;
  if (![crop.left, crop.top, crop.width, crop.height].every(Number.isFinite)) return null;
  const left = floorEven(Math.max(0, crop.left));
  const top = floorEven(Math.max(0, crop.top));
  const width = floorEven(Math.min(within.width, crop.left + crop.width) - left);
  const height = floorEven(Math.min(within.height, crop.top + crop.height) - top);
  if (width < MIN_SIDE || height < MIN_SIDE) return null;
  if (left === 0 && top === 0 && width === within.width && height === within.height) return null;
  return { left, top, width, height };
}

/**
 * A side typed for a Custom output size: whole px from 16 to 4096 (rounded), or what is wrong with
 * it. Empty or not a number counts as too small.
 */
export function checkCustomSide(text: string): { px: number } | { problem: "too-small" | "too-big" } {
  const t = text.trim();
  const n = Number(t);
  if (t === "" || Number.isNaN(n)) return { problem: "too-small" };
  if (n > MAX_CUSTOM_SIDE) return { problem: "too-big" };
  const px = Math.round(n);
  return px >= MIN_SIDE ? { px } : { problem: "too-small" };
}

/** An output size an engine can encode: finite and at least 16 px a side. */
function checkedOutput(size: Size): Size {
  const ok = (side: number) => Number.isFinite(side) && side >= MIN_SIDE;
  if (!ok(size.width) || !ok(size.height)) throw new InvalidSizeError();
  return size;
}

/**
 * Work out the crop to apply, the size before any fit (`base`), and whether the picture needs
 * a fit mode to fill the frame. `display` is the source's display size, before the user's rotation.
 * Throws `InvalidSizeError` when the output would be under 16 px a side or isn't a number.
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
    return { crop: clamped, base: checkedOutput(capLongSide(picture, frame.maxLongSide)), fit: null };
  }
  if (frame.kind === "percent") {
    const p = Math.min(100, Math.max(1, frame.percent));
    return {
      crop: clamped,
      base: checkedOutput({ width: toEven((picture.width * p) / 100), height: toEven((picture.height * p) / 100) }),
      fit: null,
    };
  }
  const base = checkedOutput({ width: toEven(frame.width), height: toEven(frame.height) });
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

/** The picture's orientation edits: clockwise turn first, then horizontal flip, then vertical flip. */
export interface Orientation {
  rotate: Rotation;
  flipH: boolean;
  flipV: boolean;
}

/** Mirror a crop left-to-right across a picture `pictureWidth` px wide. */
export function mirrorCropH(crop: CropRect, pictureWidth: number): CropRect {
  return { ...crop, left: pictureWidth - crop.left - crop.width };
}

function mirrorCropV(crop: CropRect, pictureHeight: number): CropRect {
  return { ...crop, top: pictureHeight - crop.top - crop.height };
}

/** Turn a crop a quarter turn clockwise with its picture; returns the crop and the picture's new size. */
function quarterTurn(crop: CropRect, size: Size): { crop: CropRect; size: Size } {
  return {
    crop: { left: size.height - crop.top - crop.height, top: crop.left, width: crop.height, height: crop.width },
    size: { width: size.height, height: size.width },
  };
}

function turnCw(crop: CropRect, size: Size, degrees: number): { crop: CropRect; size: Size } {
  let state = { crop, size };
  for (let i = 0; i < (degrees / 90) % 4; i++) state = quarterTurn(state.crop, state.size);
  return state;
}

/**
 * Keep a crop on the same part of the picture when the orientation changes. `crop` lives in the
 * picture oriented by `from`; `display` is the picture before any of the user's edits.
 */
export function remapCrop(crop: CropRect, display: Size, from: Orientation, to: Orientation): CropRect {
  if (from.rotate === to.rotate && from.flipH === to.flipH && from.flipV === to.flipV) return crop;
  const fromSize = displaySize(display, from.rotate);
  // Undo `from`: flips undo themselves (in reverse order), then turn back to the display picture.
  let c = crop;
  if (from.flipV) c = mirrorCropV(c, fromSize.height);
  if (from.flipH) c = mirrorCropH(c, fromSize.width);
  const shown = turnCw(c, fromSize, (360 - from.rotate) % 360);
  // Apply `to`.
  const turned = turnCw(shown.crop, shown.size, to.rotate);
  c = turned.crop;
  if (to.flipH) c = mirrorCropH(c, turned.size.width);
  if (to.flipV) c = mirrorCropV(c, turned.size.height);
  return clampCrop(c, turned.size) ?? c;
}
