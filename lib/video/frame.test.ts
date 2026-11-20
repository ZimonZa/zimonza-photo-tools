import { describe, expect, test } from "vitest";
import { InvalidSizeError } from "@/lib/video/errors";
import { clampCrop, mediabunnyTransform, mirrorCropH, remapCrop, resolveFrame } from "@/lib/video/frame";

describe("clampCrop", () => {
  test("clips to the picture and snaps to even numbers", () => {
    expect(clampCrop({ left: -10, top: 5, width: 300, height: 300 }, { width: 200, height: 400 })).toEqual({
      left: 0,
      top: 4,
      width: 200,
      height: 300,
    });
    expect(clampCrop({ left: 3, top: 3, width: 101, height: 101 }, { width: 1000, height: 1000 })).toEqual({
      left: 2,
      top: 2,
      width: 102,
      height: 102,
    });
  });

  test("drops crops smaller than 16 px, whole-picture crops and null", () => {
    expect(clampCrop({ left: 0, top: 0, width: 10, height: 300 }, { width: 200, height: 400 })).toBeNull();
    expect(clampCrop({ left: 0, top: 0, width: 200, height: 400 }, { width: 200, height: 400 })).toBeNull();
    expect(clampCrop(null, { width: 200, height: 400 })).toBeNull();
  });

  test("a crop with a value that isn't a number counts as no crop", () => {
    const within = { width: 640, height: 360 };
    expect(clampCrop({ left: NaN, top: 0, width: 100, height: 100 }, within)).toBeNull();
    expect(clampCrop({ left: 0, top: 0, width: NaN, height: 100 }, within)).toBeNull();
    expect(clampCrop({ left: 0, top: 0, width: 100, height: Infinity }, within)).toBeNull();
  });
});

describe("resolveFrame", () => {
  test("source keeps the rotated display size", () => {
    expect(resolveFrame({ width: 1920, height: 1080 }, 90, null, { kind: "source", maxLongSide: null })).toEqual({
      crop: null,
      base: { width: 1080, height: 1920 },
      fit: null,
    });
  });

  test("an exact frame of another shape needs a fit", () => {
    expect(
      resolveFrame({ width: 1920, height: 1080 }, 0, null, { kind: "exact", width: 1080, height: 1920, fit: "cover" })
    ).toEqual({ crop: null, base: { width: 1080, height: 1920 }, fit: "cover" });
  });

  test("an exact frame of the same shape needs no fit", () => {
    expect(
      resolveFrame({ width: 1080, height: 1920 }, 0, null, { kind: "exact", width: 720, height: 1280, fit: "blur" }).fit
    ).toBeNull();
  });

  test("percent scales each side and never upscales", () => {
    expect(resolveFrame({ width: 1920, height: 1080 }, 0, null, { kind: "percent", percent: 50 }).base).toEqual({
      width: 960,
      height: 540,
    });
    expect(resolveFrame({ width: 1920, height: 1080 }, 0, null, { kind: "percent", percent: 150 }).base).toEqual({
      width: 1920,
      height: 1080,
    });
  });

  test("a crop becomes the picture the frame is measured from", () => {
    expect(
      resolveFrame({ width: 1920, height: 1080 }, 0, { left: 0, top: 0, width: 1080, height: 1080 }, { kind: "source", maxLongSide: null })
    ).toEqual({ crop: { left: 0, top: 0, width: 1080, height: 1080 }, base: { width: 1080, height: 1080 }, fit: null });
  });

  test("exact sizes are made even", () => {
    expect(
      resolveFrame({ width: 1920, height: 1080 }, 0, null, { kind: "exact", width: 1081, height: 1921, fit: "cover" }).base
    ).toEqual({ width: 1080, height: 1920 });
  });

  describe("degenerate output sizes never reach an engine", () => {
    const display = { width: 640, height: 360 };
    const resolve = (frame: Parameters<typeof resolveFrame>[3]) => () => resolveFrame(display, 0, null, frame);

    test("an exact side that isn't a number", () => {
      expect(resolve({ kind: "exact", width: NaN, height: 360, fit: "cover" })).toThrow(InvalidSizeError);
      expect(resolve({ kind: "exact", width: 640, height: Infinity, fit: "cover" })).toThrow(InvalidSizeError);
    });

    test("an exact size under 16 px a side", () => {
      expect(resolve({ kind: "exact", width: 10, height: 10, fit: "cover" })).toThrow(InvalidSizeError);
      expect(resolve({ kind: "exact", width: 640, height: 14, fit: "cover" })).toThrow(
        "The output size is too small or not a number."
      );
    });

    test("a percent that leaves under 16 px a side, or isn't a number", () => {
      // 1% of 640x360 is 6x2.
      expect(resolve({ kind: "percent", percent: 1 })).toThrow(InvalidSizeError);
      expect(resolve({ kind: "percent", percent: NaN })).toThrow(InvalidSizeError);
    });

    test("16 px a side is still allowed", () => {
      expect(resolveFrame(display, 0, null, { kind: "exact", width: 16, height: 16, fit: "cover" }).base).toEqual({
        width: 16,
        height: 16,
      });
    });
  });
});

describe("mediabunnyTransform", () => {
  test("a vertical flip is a 180 degree turn plus a horizontal flip", () => {
    expect(mediabunnyTransform(0, true, false)).toEqual({ rotate: 0, flip: true });
    expect(mediabunnyTransform(0, false, true)).toEqual({ rotate: 180, flip: true });
    expect(mediabunnyTransform(90, true, true)).toEqual({ rotate: 270, flip: false });
    expect(mediabunnyTransform(270, false, true)).toEqual({ rotate: 90, flip: true });
  });
});

describe("mirrorCropH", () => {
  test("mirrors across the picture width", () => {
    expect(mirrorCropH({ left: 0, top: 0, width: 100, height: 50 }, 640)).toEqual({ left: 540, top: 0, width: 100, height: 50 });
  });
});

describe("remapCrop", () => {
  const D = { width: 640, height: 360 };
  const O0 = { rotate: 0, flipH: false, flipV: false } as const;
  const C = { left: 0, top: 0, width: 100, height: 50 };
  test("rotating moves the crop with the picture", () => {
    expect(remapCrop(C, D, O0, { ...O0, rotate: 90 })).toEqual({ left: 310, top: 0, width: 50, height: 100 });
    expect(remapCrop({ left: 310, top: 0, width: 50, height: 100 }, D, { ...O0, rotate: 90 }, O0)).toEqual(C);
  });
  test("flips move the crop with the picture", () => {
    expect(remapCrop(C, D, O0, { ...O0, flipH: true })).toEqual({ left: 540, top: 0, width: 100, height: 50 });
    expect(remapCrop(C, D, O0, { ...O0, flipV: true })).toEqual({ left: 0, top: 310, width: 100, height: 50 });
  });
  test("same orientation changes nothing", () => {
    expect(remapCrop(C, D, O0, O0)).toEqual(C);
  });
});
