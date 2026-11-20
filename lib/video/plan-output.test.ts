import { describe, expect, test } from "vitest";
import type { VideoInfo } from "@/lib/video/engines/types";
import { TargetTooSmallError } from "@/lib/video/errors";
import { planOutput } from "@/lib/video/plan-output";
import { BASE_RECIPE, MB, type EditRecipe } from "@/lib/video/recipe";

const INFO: VideoInfo = {
  durationSec: 60,
  startSec: 0,
  width: 1920,
  height: 1080,
  rotation: 0,
  videoCodec: "avc",
  audioCodec: "aac",
  hasAudio: true,
  readableByMediabunny: true,
};

function r(partial: Partial<EditRecipe> = {}): EditRecipe {
  const file = new File([new Uint8Array(1)], "Trip.MOV");
  Object.defineProperty(file, "size", { value: 150_000_000 });
  return { ...BASE_RECIPE, file, ...partial };
}

describe("planOutput", () => {
  test("quality mode plans and estimates", () => {
    expect(planOutput(INFO, r({ size: { kind: "quality", level: "balanced" } }))).toMatchObject({
      plan: { width: 1920, height: 1080, videoBps: 3_732_480, audioBps: 128_000 },
      estimatedBytes: 28_953_600,
      durationSec: 60,
    });
  });
  test("trim is normalized and sets the duration", () => {
    expect(planOutput(INFO, r({ trim: { start: 10, end: 999 }, size: { kind: "target", bytes: 20 * MB } }))).toMatchObject({
      trim: { start: 10, end: 60 },
      durationSec: 50,
    });
  });
  test("target mode never estimates above the target", () => {
    expect(planOutput(INFO, r({ size: { kind: "target", bytes: 20 * MB } })).estimatedBytes).toBeLessThanOrEqual(20 * MB);
  });
  test("throws TargetTooSmallError for an impossible target", () => {
    expect(() => planOutput({ ...INFO, durationSec: 600 }, r({ size: { kind: "target", bytes: 2 * MB } }))).toThrow(
      TargetTooSmallError
    );
  });
});
