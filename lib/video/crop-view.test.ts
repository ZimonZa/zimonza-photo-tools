import { describe, expect, test } from "vitest";
import { centredCrop, chipForCrop, cropFromCropper, cropperStartArea, sameCrop } from "@/lib/video/crop-view";

const CLIP = { width: 1280, height: 720 };
const PROXY = { width: 640, height: 360 };
const O0 = { rotate: 0, flipH: false, flipV: false } as const;

describe("cropFromCropper", () => {
  test("a full-size preview's pixels are the clip's pixels", () => {
    expect(cropFromCropper({ x: 280, y: 0, width: 720, height: 720 }, CLIP, CLIP, O0, 1)).toEqual({
      left: 280,
      top: 0,
      width: 720,
      height: 720,
    });
  });

  test("a low-res proxy scales up to the clip", () => {
    expect(cropFromCropper({ x: 140, y: 0, width: 360, height: 360 }, PROXY, CLIP, O0, 1)).toEqual({
      left: 280,
      top: 0,
      width: 720,
      height: 720,
    });
  });

  test("a proxy whose sides scale differently keeps the box's shape", () => {
    // sx = 2, sy = 720 / 362: the height would come out 360 without the shape fix.
    expect(cropFromCropper({ x: 0, y: 0, width: 181, height: 181 }, { width: 640, height: 362 }, CLIP, O0, 1)).toEqual({
      left: 0,
      top: 0,
      width: 362,
      height: 362,
    });
  });

  test("turned 90°: the area is in the turned media, scaled per axis to the turned clip", () => {
    // Turned proxy 360×640 → turned clip 720×1280.
    expect(cropFromCropper({ x: 180, y: 0, width: 180, height: 180 }, PROXY, CLIP, { ...O0, rotate: 90 }, 1)).toEqual({
      left: 360,
      top: 0,
      width: 360,
      height: 360,
    });
  });

  test("flips mirror the picked area into the flipped picture", () => {
    const area = { x: 0, y: 0, width: 360, height: 360 };
    expect(cropFromCropper(area, CLIP, CLIP, { ...O0, flipH: true }, 1)).toEqual({ left: 920, top: 0, width: 360, height: 360 });
    expect(cropFromCropper(area, CLIP, CLIP, { ...O0, flipV: true }, 1)).toEqual({ left: 0, top: 360, width: 360, height: 360 });
    expect(cropFromCropper(area, CLIP, CLIP, { rotate: 90, flipH: true, flipV: true }, 1)).toEqual({
      left: 360,
      top: 920,
      width: 360,
      height: 360,
    });
  });

  test("the whole picture is no crop", () => {
    expect(cropFromCropper({ x: 0, y: 0, width: 640, height: 360 }, PROXY, CLIP, O0, 16 / 9)).toBeNull();
  });
});

describe("cropperStartArea", () => {
  test("no crop starts nowhere in particular", () => {
    expect(cropperStartArea(null, CLIP, O0)).toBeNull();
  });

  test("percent of the turned picture, flips undone", () => {
    expect(cropperStartArea({ left: 920, top: 0, width: 360, height: 360 }, CLIP, { ...O0, flipH: true })).toEqual({
      x: 0,
      y: 0,
      width: 28.125,
      height: 50,
    });
    expect(cropperStartArea({ left: 360, top: 0, width: 360, height: 360 }, CLIP, { ...O0, rotate: 90 })).toEqual({
      x: 50,
      y: 0,
      width: 50,
      height: 28.125,
    });
  });

  test("round trip: start area → cropper pixels at any media size → the same crop", () => {
    const o = { rotate: 270, flipH: true, flipV: false } as const;
    const crop = { left: 100, top: 400, width: 500, height: 400 };
    const start = cropperStartArea(crop, CLIP, o)!;
    // Turned proxy is 360×640.
    const area = {
      x: (start.x / 100) * 360,
      y: (start.y / 100) * 640,
      width: (start.width / 100) * 360,
      height: (start.height / 100) * 640,
    };
    expect(cropFromCropper(area, PROXY, CLIP, o, 500 / 400)).toEqual(crop);
  });
});

describe("sameCrop", () => {
  test("compares every side; no crop equals only no crop", () => {
    const a = { left: 0, top: 0, width: 360, height: 360 };
    expect(sameCrop(null, null)).toBe(true);
    expect(sameCrop(a, { ...a })).toBe(true);
    expect(sameCrop(a, null)).toBe(false);
    expect(sameCrop(null, a)).toBe(false);
    expect(sameCrop(a, { ...a, top: 2 })).toBe(false);
  });
});

describe("chipForCrop", () => {
  test("names the ratio a crop has, within 1%", () => {
    expect(chipForCrop(null)).toBe("free");
    expect(chipForCrop({ left: 0, top: 0, width: 720, height: 720 })).toBe("1:1");
    expect(chipForCrop({ left: 0, top: 0, width: 576, height: 720 })).toBe("4:5");
    expect(chipForCrop({ left: 0, top: 0, width: 404, height: 718 })).toBe("9:16");
    expect(chipForCrop({ left: 0, top: 0, width: 1280, height: 720 })).toBe("16:9");
    expect(chipForCrop({ left: 0, top: 0, width: 960, height: 720 })).toBe("4:3");
    expect(chipForCrop({ left: 0, top: 0, width: 1000, height: 720 })).toBe("free");
  });
});

describe("centredCrop", () => {
  test("the largest even box of a ratio in the middle of the picture", () => {
    expect(centredCrop(CLIP, 1)).toEqual({ left: 280, top: 0, width: 720, height: 720 });
    expect(centredCrop(CLIP, 9 / 16)).toEqual({ left: 438, top: 0, width: 404, height: 718 });
    expect(centredCrop({ width: 720, height: 1280 }, 16 / 9)).toEqual({ left: 0, top: 438, width: 720, height: 404 });
  });

  test("a ratio that fills the picture is no crop", () => {
    expect(centredCrop(CLIP, 16 / 9)).toBeNull();
  });
});
