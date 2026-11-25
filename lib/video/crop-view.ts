/**
 * Crop editor maths: between the cropper's view (react-easy-crop, which shows the clip turned but
 * not flipped, and may play a smaller proxy) and the recipe's crop (clip display px after the
 * user's turn and flips).
 */
import { MIN_SIDE, clampCrop, floorEven, mirrorCropH, type CropRect, type Orientation } from "@/lib/video/frame";
import { displaySize, type Size } from "@/lib/video/geometry";

/** An area as react-easy-crop reports it: pixels, or percent of the turned media. */
export interface CropArea {
  x: number;
  y: number;
  width: number;
  height: number;
}

export type CropAspectId = "free" | "1:1" | "4:5" | "9:16" | "16:9" | "4:3";

/** The Crop panel's ratio chips, in order. Free has no fixed ratio. */
export const CROP_ASPECTS: { id: CropAspectId; label: string; ratio: number | null }[] = [
  { id: "free", label: "Free", ratio: null },
  { id: "1:1", label: "1:1", ratio: 1 },
  { id: "4:5", label: "4:5", ratio: 4 / 5 },
  { id: "9:16", label: "9:16", ratio: 9 / 16 },
  { id: "16:9", label: "16:9", ratio: 16 / 9 },
  { id: "4:3", label: "4:3", ratio: 4 / 3 },
];

/** Ratios this close count as the same chip. */
const SAME_RATIO = 0.01;

function mirrorFlips(crop: CropRect, picture: Size, o: Orientation): CropRect {
  let c = crop;
  if (o.flipH) c = mirrorCropH(c, picture.width);
  if (o.flipV) c = { ...c, top: picture.height - c.top - c.height };
  return c;
}

/**
 * The recipe crop for an area picked in the cropper. `area` is in pixels of the turned `media`
 * (the playing video, maybe a proxy); `clip` is the clip's display size before the turn. Each axis
 * scales on its own, then the flips mirror the area into the flipped picture. When a proxy scaled
 * the area, `aspect` (the box's width / height) restores its shape. Null = the whole picture.
 */
export function cropFromCropper(
  area: CropArea,
  media: Size,
  clip: Size,
  o: Orientation,
  aspect: number | null
): CropRect | null {
  const turnedMedia = displaySize(media, o.rotate);
  const turnedClip = displaySize(clip, o.rotate);
  const sx = turnedClip.width / turnedMedia.width;
  const sy = turnedClip.height / turnedMedia.height;
  const crop: CropRect = {
    left: Math.round(area.x * sx),
    top: Math.round(area.y * sy),
    width: Math.round(area.width * sx),
    height: Math.round(area.height * sy),
  };
  if (aspect && (sx !== 1 || sy !== 1)) crop.height = Math.round(crop.width / aspect);
  return clampCrop(mirrorFlips(crop, turnedClip, o), turnedClip);
}

/**
 * Where the cropper should start to show `crop` again: percent of the turned picture, with the
 * flips undone (the cropper doesn't show them). Percent doesn't depend on the media's pixel size,
 * so it is right for a proxy before the proxy has loaded.
 */
export function cropperStartArea(crop: CropRect | null, clip: Size, o: Orientation): CropArea | null {
  if (!crop) return null;
  const turned = displaySize(clip, o.rotate);
  const c = mirrorFlips(crop, turned, o);
  return {
    x: (c.left / turned.width) * 100,
    y: (c.top / turned.height) * 100,
    width: (c.width / turned.width) * 100,
    height: (c.height / turned.height) * 100,
  };
}

/** Whether two crops (or no crop) are the same. */
export function sameCrop(a: CropRect | null, b: CropRect | null): boolean {
  if (!a || !b) return a === b;
  return a.left === b.left && a.top === b.top && a.width === b.width && a.height === b.height;
}

/** The chip whose ratio a crop has; "free" for no crop or any other shape. */
export function chipForCrop(crop: CropRect | null): CropAspectId {
  if (!crop) return "free";
  const shape = crop.width / crop.height;
  const chip = CROP_ASPECTS.find((a) => a.ratio !== null && Math.abs(shape / a.ratio - 1) <= SAME_RATIO);
  return chip?.id ?? "free";
}

/**
 * A Free crop size typed as text, in px of the turned picture: whole numbers from 16 up to the
 * picture's own sides. Null when either side isn't.
 */
export function parseFreeSize(width: string, height: string, picture: Size): Size | null {
  const side = (text: string, max: number) => {
    const t = text.trim();
    if (!/^\d+$/.test(t)) return null;
    const n = Number(t);
    return n >= MIN_SIDE && n <= max ? n : null;
  };
  const w = side(width, picture.width);
  const h = side(height, picture.height);
  return w !== null && h !== null ? { width: w, height: h } : null;
}

/**
 * The part of the picture react-easy-crop's box covers: a box of `aspect` (width / height) fills
 * the picture's width or height at zoom 1, and zoom divides it.
 */
export function coveredSize(aspect: number, picture: Size, zoom: number): Size {
  return {
    width: Math.min(picture.width, picture.height * aspect) / zoom,
    height: Math.min(picture.height, picture.width / aspect) / zoom,
  };
}

/** The zoom at which a box shaped like `size` covers exactly `size` of the picture (at least 1 for a size that fits). */
export function exactZoom(size: Size, picture: Size): number {
  return Math.min(picture.width / size.width, picture.height / size.height);
}

/** A `size` crop in the middle of `picture` (even, clamped); null when it is the whole picture. */
export function centredBox(picture: Size, size: Size): CropRect | null {
  return clampCrop(
    {
      left: floorEven((picture.width - size.width) / 2),
      top: floorEven((picture.height - size.height) / 2),
      width: size.width,
      height: size.height,
    },
    picture
  );
}

/** The largest even box of `ratio` (width / height) in the middle of `picture`; null when it is the whole picture. */
export function centredCrop(picture: Size, ratio: number): CropRect | null {
  const width = floorEven(Math.round(Math.min(picture.width, picture.height * ratio)));
  const height = floorEven(Math.round(Math.min(picture.height, width / ratio)));
  return clampCrop(
    { left: floorEven((picture.width - width) / 2), top: floorEven((picture.height - height) / 2), width, height },
    picture
  );
}
