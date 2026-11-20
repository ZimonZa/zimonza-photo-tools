import { expect } from "vitest";
import { pixelAt } from "@/lib/video/test-utils/mp4";

export type Rgb = [number, number, number];

// Colours come back approximate after lossy encoding.
export const isRed = ([r, g, b]: Rgb) => r > 160 && g < 90 && b < 90;
export const isBlue = ([r, g, b]: Rgb) => b > 160 && r < 90 && g < 90;
export const isWhite = (p: Rgb) => p.every((c) => c > 170);
export const isGreen = ([r, g, b]: Rgb) => g > 160 && r < 90 && b < 90;

export async function expectPixels(out: Blob, checks: [x: number, y: number, is: (p: Rgb) => boolean][]) {
  for (const [x, y, is] of checks) {
    const px = await pixelAt(out, x, y);
    expect(is(px), `${is.name} at (${x},${y}): ${px}`).toBe(true);
  }
}
