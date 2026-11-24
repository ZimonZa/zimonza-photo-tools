import { describe, expect, test } from "vitest";
import {
  centredBox,
  centredCrop,
  chipForCrop,
  coveredSize,
  cropFromCropper,
  cropperStartArea,
  exactZoom,
  parseFreeSize,
  sameCrop,
} from "@/lib/video/crop-view";

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

describe("Free width × height", () => {
  test("parseFreeSize takes whole pixels from 16 up to the picture's sides", () => {
    expect(parseFreeSize("640", "270", CLIP)).toEqual({ width: 640, height: 270 });
    expect(parseFreeSize(" 1280 ", "720", CLIP)).toEqual({ width: 1280, height: 720 });
    expect(parseFreeSize("16", "16", CLIP)).toEqual({ width: 16, height: 16 });
    for (const [w, h] of [
      ["10", "10"],
      ["15", "100"],
      ["1281", "100"],
      ["100", "721"],
      ["640.5", "270"],
      ["", "270"],
      ["abc", "270"],
      ["-640", "270"],
      ["1e3", "270"],
    ]) {
      expect(parseFreeSize(w, h, CLIP), `${w}×${h}`).toBeNull();
    }
    // The limits follow the turned picture.
    expect(parseFreeSize("300", "1000", { width: 720, height: 1280 })).toEqual({ width: 300, height: 1000 });
  });

  test("the box (shaped W/H) covers exactly W×H of the picture at exactZoom", () => {
    for (const size of [
      { width: 640, height: 270 },
      { width: 300, height: 600 },
      { width: 1280, height: 720 },
      { width: 100, height: 100 },
    ]) {
      const zoom = exactZoom(size, CLIP);
      expect(zoom).toBeGreaterThanOrEqual(1);
      const covered = coveredSize(size.width / size.height, CLIP, zoom);
      expect(covered.width).toBeCloseTo(size.width, 6);
      expect(covered.height).toBeCloseTo(size.height, 6);
    }
    expect(exactZoom({ width: 640, height: 270 }, CLIP)).toBe(2);
    expect(exactZoom({ width: 300, height: 600 }, CLIP)).toBe(1.2);
  });

  test("at zoom 1 the box fills the picture's width or height", () => {
    const wide = coveredSize(64 / 27, CLIP, 1);
    expect(wide.width).toBeCloseTo(1280, 6);
    expect(wide.height).toBeCloseTo(540, 6);
    const tall = coveredSize(1 / 2, CLIP, 1);
    expect(tall.width).toBeCloseTo(360, 6);
    expect(tall.height).toBeCloseTo(720, 6);
  });

  test("the cropper's area at exactZoom commits as exactly W×H, also through a proxy", () => {
    const size = { width: 640, height: 270 };
    // A full-size preview reports the covered area in clip pixels.
    expect(cropFromCropper({ x: 320, y: 224, ...size }, CLIP, CLIP, O0, 640 / 270)).toEqual({ left: 320, top: 224, ...size });
    // A half-size proxy reports half; the commit scales back and keeps the W/H shape.
    expect(cropFromCropper({ x: 160, y: 112, width: 320, height: 135 }, PROXY, CLIP, O0, 640 / 270)).toEqual({
      left: 320,
      top: 224,
      ...size,
    });
    // A portrait strip.
    expect(cropFromCropper({ x: 490, y: 60, width: 300, height: 600 }, CLIP, CLIP, O0, 0.5)).toEqual({
      left: 490,
      top: 60,
      width: 300,
      height: 600,
    });
  });

  test("centredBox: a W×H crop in the middle (no preview to drag)", () => {
    expect(centredBox(CLIP, { width: 640, height: 270 })).toEqual({ left: 320, top: 224, width: 640, height: 270 });
    expect(centredBox(CLIP, { width: 1280, height: 720 })).toBeNull();
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
