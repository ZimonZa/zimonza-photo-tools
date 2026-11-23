import { describe, expect, test } from "vitest";
import { InvalidTrimError } from "@/lib/video/errors";
import { normalizeTrim, outputFileName } from "@/lib/video/recipe";

describe("normalizeTrim", () => {
  test("accepts a 0.1 s trim despite floating-point noise", () => {
    expect(normalizeTrim({ start: 0.2, end: 0.3 }, 30)).toEqual({ start: 0.2, end: 0.3 });
  });

  test("no trim stays no trim", () => {
    expect(normalizeTrim(null, 30)).toBeNull();
  });

  test("a range covering the whole clip means no trim", () => {
    expect(normalizeTrim({ start: 0, end: 30 }, 30)).toBeNull();
    expect(normalizeTrim({ start: 0, end: 45 }, 30)).toBeNull();
  });

  test("clamps the end to the clip duration", () => {
    expect(normalizeTrim({ start: 5, end: 99 }, 30)).toEqual({ start: 5, end: 30 });
  });

  test("clamps a negative start to zero", () => {
    expect(normalizeTrim({ start: -2, end: 10 }, 30)).toEqual({ start: 0, end: 10 });
  });

  test("rejects ranges shorter than 0.1 s", () => {
    expect(() => normalizeTrim({ start: 10, end: 10.05 }, 30)).toThrow(InvalidTrimError);
  });

  test("rejects an end before the start", () => {
    expect(() => normalizeTrim({ start: 12, end: 8 }, 30)).toThrow(InvalidTrimError);
  });

  test("rejects a start past the end of the clip", () => {
    expect(() => normalizeTrim({ start: 40, end: 50 }, 30)).toThrow(InvalidTrimError);
  });
});

describe("outputFileName", () => {
  test("replaces only the last extension and adds the suffix", () => {
    expect(outputFileName("My clip.final.MOV", "mp4")).toBe("My clip.final-zimonza.mp4");
  });

  test("handles names without an extension", () => {
    expect(outputFileName("noext", "mp4")).toBe("noext-zimonza.mp4");
  });

  test("uses the container as the extension", () => {
    expect(outputFileName("Trip.MOV", "webm")).toBe("Trip-zimonza.webm");
  });

  test("falls back to 'video' for an empty name", () => {
    expect(outputFileName("", "mp4")).toBe("video-zimonza.mp4");
  });
});
