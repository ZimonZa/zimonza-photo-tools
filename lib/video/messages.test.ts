import { describe, expect, test } from "vitest";
import {
  ExportCanceledError,
  InvalidSizeError,
  InvalidTrimError,
  TargetNotReachedError,
  TargetTooSmallError,
} from "@/lib/video/errors";
import { describeExportError, describeStatus } from "@/lib/video/messages";
import { MB } from "@/lib/video/recipe";

describe("describeExportError", () => {
  test("target too small gives a size hint", () => {
    expect(describeExportError(new TargetTooSmallError(16_486_957), 2 * MB)).toEqual({
      message: "That size is too small for a video this long.",
      hint: "Try at least 16.5 MB, or trim it shorter.",
    });
  });
  test("trim, size and target-not-reached", () => {
    expect(describeExportError(new InvalidTrimError(), null)).toEqual({
      message: "The trimmed part is too short — keep at least 0.1 seconds.",
    });
    expect(describeExportError(new InvalidSizeError(), null)).toEqual({
      message: "That output size is too small. Use at least 16 × 16 pixels.",
    });
    expect(describeExportError(new TargetNotReachedError(), 20 * MB)).toEqual({
      message: "Couldn't get the video under 20 MB.",
      hint: "Try a lower resolution or a bigger target.",
    });
    expect(describeExportError(new TargetNotReachedError(), 2.5 * MB)?.message).toBe("Couldn't get the video under 2.5 MB.");
  });
  test("cancel is silent, others are generic", () => {
    expect(describeExportError(new ExportCanceledError(), null)).toBeNull();
    expect(describeExportError(new Error("boom"), null)).toEqual({ message: "Something went wrong: boom" });
    expect(describeExportError("x", null)).toEqual({ message: "Something went wrong." });
  });
});

describe("describeStatus", () => {
  test("keeps the lab's texts", () => {
    expect(describeStatus({ phase: "smaller", width: 1920, height: 1080, reason: "too big" })).toBe(
      "Lowered to 1920×1080: too big"
    );
    expect(describeStatus({ phase: "fallback", reason: "no codec", estimatedSec: 300 })).toBe(
      "Switching to the backup engine: no codec"
    );
    expect(describeStatus({ phase: "probing" })).toBe("Reading the video…");
  });
});
