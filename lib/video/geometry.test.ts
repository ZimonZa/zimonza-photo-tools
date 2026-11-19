import { describe, expect, test } from "vitest";
import { capLongSide, displaySize, scaleToShortSide, toEven } from "@/lib/video/geometry";

describe("toEven", () => {
  test("floors to the nearest even integer, minimum 2", () => {
    expect(toEven(1081)).toBe(1080);
    expect(toEven(1080)).toBe(1080);
    expect(toEven(719.6)).toBe(718);
    expect(toEven(1)).toBe(2);
  });
});

describe("displaySize", () => {
  test("swaps width and height for 90 and 270 degree rotation", () => {
    expect(displaySize({ width: 1920, height: 1080 }, 90)).toEqual({ width: 1080, height: 1920 });
    expect(displaySize({ width: 1920, height: 1080 }, 270)).toEqual({ width: 1080, height: 1920 });
  });

  test("keeps orientation for 0 and 180 degrees", () => {
    expect(displaySize({ width: 1920, height: 1080 }, 0)).toEqual({ width: 1920, height: 1080 });
    expect(displaySize({ width: 1920, height: 1080 }, 180)).toEqual({ width: 1920, height: 1080 });
  });
});

describe("capLongSide", () => {
  test("scales landscape and portrait down to the long-side cap", () => {
    expect(capLongSide({ width: 1920, height: 1080 }, 1280)).toEqual({ width: 1280, height: 720 });
    expect(capLongSide({ width: 1080, height: 1920 }, 1280)).toEqual({ width: 720, height: 1280 });
  });

  test("never upscales", () => {
    expect(capLongSide({ width: 640, height: 360 }, 1280)).toEqual({ width: 640, height: 360 });
  });

  test("evens out odd source dimensions even without a cap", () => {
    expect(capLongSide({ width: 1919, height: 1081 }, null)).toEqual({ width: 1918, height: 1080 });
  });
});

describe("scaleToShortSide", () => {
  test("scales so the short side matches", () => {
    expect(scaleToShortSide({ width: 1920, height: 1080 }, 360)).toEqual({ width: 640, height: 360 });
    expect(scaleToShortSide({ width: 1080, height: 1920 }, 720)).toEqual({ width: 720, height: 1280 });
  });

  test("never upscales", () => {
    expect(scaleToShortSide({ width: 640, height: 360 }, 720)).toEqual({ width: 640, height: 360 });
  });
});
