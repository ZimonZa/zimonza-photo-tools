import { describe, expect, test } from "vitest";
import {
  ExportCanceledError,
  InvalidSizeError,
  InvalidTrimError,
  TargetNotReachedError,
  TargetTooSmallError,
} from "@/lib/video/errors";
import { MAX_TARGET_ATTEMPTS } from "@/lib/video/bitrate";
import { describeExportError, describeStatus, exportProgress, timeLeft } from "@/lib/video/messages";
import { MB } from "@/lib/video/recipe";

describe("exportProgress", () => {
  test("never reaches 100% while the export runs", () => {
    expect(exportProgress(1, 1, false).percent).toBe(99);
    expect(exportProgress(0.999, 1, false).percent).toBe(99);
    expect(exportProgress(0.4, 1, false).percent).toBe(40);
    expect(exportProgress(-1, 1, false).percent).toBe(0);
    expect(exportProgress(Number.NaN, 1, false).percent).toBe(0);
  });
  test("a target size names the pass; later passes say why", () => {
    expect(MAX_TARGET_ATTEMPTS).toBe(4);
    expect(exportProgress(0.5, 1, true).pass).toBe("Pass 1 of up to 4");
    expect(exportProgress(0.5, 2, true).pass).toBe("Pass 2 of up to 4 — adjusting size");
    expect(exportProgress(0.5, 4, true).pass).toBe("Pass 4 of up to 4 — adjusting size");
  });
  test("no pass line for one-pass exports or before encoding starts", () => {
    expect(exportProgress(0.5, 1, false).pass).toBeNull();
    expect(exportProgress(0, 0, true).pass).toBeNull();
  });
});

describe("timeLeft", () => {
  test("from this pass's elapsed time and progress, rounded up", () => {
    expect(timeLeft(0.5, 10_000, false)).toBe("About 10 s left");
    expect(timeLeft(0.25, 4_000, false)).toBe("About 12 s left");
    expect(timeLeft(0.2, 3_100, false)).toBe("About 13 s left");
  });
  test("a minute or more is said in whole minutes, rounded up", () => {
    expect(timeLeft(0.1, 6_000, false)).toBe("About 54 s left");
    expect(timeLeft(0.1, 7_000, false)).toBe("About 2 min left");
    expect(timeLeft(0.05, 60_000, false)).toBe("About 19 min left");
  });
  test("a target size says it is for this pass, since more passes may follow", () => {
    expect(timeLeft(0.5, 10_000, true)).toBe("About 10 s left in this pass");
  });
  test("no wild first guess: nothing before 5% or before 2 s into the pass", () => {
    expect(timeLeft(0.049, 60_000, false)).toBeNull();
    expect(timeLeft(0.5, 1_999, false)).toBeNull();
    expect(timeLeft(0, 10_000, false)).toBeNull();
  });
  test("never zero or negative while running; nothing for nonsense", () => {
    expect(timeLeft(0.9999, 10_000, false)).toBe("About 1 s left");
    expect(timeLeft(1, 10_000, false)).toBeNull();
    expect(timeLeft(1.2, 10_000, false)).toBeNull();
    expect(timeLeft(Number.NaN, 10_000, false)).toBeNull();
    expect(timeLeft(0.5, Number.NaN, false)).toBeNull();
  });
});

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
