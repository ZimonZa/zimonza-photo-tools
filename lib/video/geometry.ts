/** Size math for video output. Every returned size has even dimensions (H.264 needs them). */

export interface Size {
  width: number;
  height: number;
}

export type Rotation = 0 | 90 | 180 | 270;

/** Floor to the nearest even integer, never below 2. */
export function toEven(n: number): number {
  return Math.max(2, Math.floor(n / 2) * 2);
}

/** The size a viewer sees once rotation metadata is applied. */
export function displaySize(coded: Size, rotation: Rotation): Size {
  return rotation === 90 || rotation === 270
    ? { width: coded.height, height: coded.width }
    : { width: coded.width, height: coded.height };
}

function scaleBy(size: Size, factor: number): Size {
  return { width: toEven(size.width * factor), height: toEven(size.height * factor) };
}

/** Shrink so the long side is at most `maxLong`. Never upscales. `null` = no cap. */
export function capLongSide(size: Size, maxLong: number | null): Size {
  const long = Math.max(size.width, size.height);
  const factor = maxLong !== null && long > maxLong ? maxLong / long : 1;
  return scaleBy(size, factor);
}

/** Shrink so the short side equals `short`. Never upscales. */
export function scaleToShortSide(size: Size, short: number): Size {
  const current = Math.min(size.width, size.height);
  return scaleBy(size, current > short ? short / current : 1);
}
