import { describe, expect, test } from "vitest";
import { clampCrop, mediabunnyTransform, resolveFrame } from "@/lib/video/frame";

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
});

describe("mediabunnyTransform", () => {
  test("a vertical flip is a 180 degree turn plus a horizontal flip", () => {
    expect(mediabunnyTransform(0, true, false)).toEqual({ rotate: 0, flip: true });
    expect(mediabunnyTransform(0, false, true)).toEqual({ rotate: 180, flip: true });
    expect(mediabunnyTransform(90, true, true)).toEqual({ rotate: 270, flip: false });
    expect(mediabunnyTransform(270, false, true)).toEqual({ rotate: 90, flip: true });
  });
});
