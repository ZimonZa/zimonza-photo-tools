import { describe, expect, test } from "vitest";
import {
  audioBpsForBudget,
  judgeAttempt,
  maxVideoBps,
  nextVideoBps,
  planQuality,
  planTarget,
  videoCeilingBps,
} from "@/lib/video/bitrate";
import { TargetTooSmallError } from "@/lib/video/errors";
import { MB } from "@/lib/video/recipe";

const HD = { width: 1920, height: 1080 };

describe("planTarget", () => {
  test("1080p, 60 s, 20 MB stays at 1080p with 128k audio", () => {
    expect(
      planTarget({ source: HD, durationSec: 60, targetBytes: 20 * MB, hasAudio: true, muted: false, maxLongSide: null })
    ).toEqual({ width: 1920, height: 1080, videoBps: 2_325_333, audioBps: 128_000, steppedDown: false });
  });

  test("1080p, 120 s, 10 MB steps down to 540p with 96k audio", () => {
    expect(
      planTarget({ source: HD, durationSec: 120, targetBytes: 10 * MB, hasAudio: true, muted: false, maxLongSide: null })
    ).toEqual({ width: 960, height: 540, videoBps: 517_333, audioBps: 96_000, steppedDown: true });
  });

  test("an impossible target throws with the smallest workable size", () => {
    let caught: unknown;
    try {
      planTarget({ source: HD, durationSec: 600, targetBytes: 2 * MB, hasAudio: true, muted: false, maxLongSide: null });
    } catch (e) {
      caught = e;
    }
    expect(caught).toBeInstanceOf(TargetTooSmallError);
    expect((caught as TargetTooSmallError).minBytes).toBe(16_486_957);
  });

  test("a generous target does not inflate the bitrate past high quality", () => {
    expect(
      planTarget({
        source: { width: 1080, height: 1920 },
        durationSec: 30,
        targetBytes: 50 * MB,
        hasAudio: true,
        muted: false,
        maxLongSide: null,
      })
    ).toEqual({ width: 1080, height: 1920, videoBps: 6_220_800, audioBps: 128_000, steppedDown: false });
  });

  test("a clip without an audio track gets no audio budget", () => {
    const plan = planTarget({ source: HD, durationSec: 60, targetBytes: 20 * MB, hasAudio: false, muted: false, maxLongSide: null });
    expect(plan.audioBps).toBe(0);
    expect(plan.videoBps).toBe(2_453_333);
  });

  test("a muted clip gets no audio budget", () => {
    expect(
      planTarget({ source: HD, durationSec: 60, targetBytes: 20 * MB, hasAudio: true, muted: true, maxLongSide: null }).audioBps
    ).toBe(0);
  });

  test("the long-side cap applies before step-down and is not a step-down", () => {
    expect(
      planTarget({ source: HD, durationSec: 60, targetBytes: 20 * MB, hasAudio: true, muted: false, maxLongSide: 1280 })
    ).toMatchObject({ width: 1280, height: 720, steppedDown: false });
  });
});

describe("source bitrate ceiling", () => {
  test("a big target on an already-compressed clip keeps the clip's own bitrate", () => {
    // 5 MB, 40 s WhatsApp clip → 1 Mbps source; 1 Mbps - 128k audio = 872k video.
    expect(
      planTarget({
        source: { width: 1280, height: 720 },
        durationSec: 40,
        targetBytes: 20 * MB,
        hasAudio: true,
        muted: false,
        maxLongSide: null,
        sourceBps: 1_000_000,
      })
    ).toEqual({ width: 1280, height: 720, videoBps: 872_000, audioBps: 128_000, steppedDown: false });
  });

  test("quality mode never exceeds the source bitrate either", () => {
    expect(
      planQuality({ source: HD, level: "high", hasAudio: true, muted: false, maxLongSide: null, sourceBps: 2_000_000 }).videoBps
    ).toBe(1_872_000);
  });

  test("the ceiling keeps at least half the source bitrate for video", () => {
    expect(videoCeilingBps({ width: 1280, height: 720 }, 200_000, 128_000)).toBe(100_000);
  });

  test("without a known source bitrate the ceiling is high quality", () => {
    expect(videoCeilingBps(HD, null, 128_000)).toBe(6_220_800);
  });
});

describe("planQuality", () => {
  test("balanced 1080p uses 0.06 bits per pixel at 30 fps", () => {
    expect(planQuality({ source: HD, level: "balanced", hasAudio: true, muted: false, maxLongSide: null })).toEqual({
      width: 1920,
      height: 1080,
      videoBps: 3_732_480,
      audioBps: 128_000,
      steppedDown: false,
    });
  });

  test("small quality uses 96k audio and muted drops audio", () => {
    expect(planQuality({ source: HD, level: "small", hasAudio: true, muted: false, maxLongSide: null }).audioBps).toBe(96_000);
    expect(planQuality({ source: HD, level: "high", hasAudio: true, muted: true, maxLongSide: null }).audioBps).toBe(0);
  });
});

describe("audioBpsForBudget", () => {
  test("picks 128k, 96k or 64k by total budget", () => {
    expect(audioBpsForBudget(1_000_000)).toBe(128_000);
    expect(audioBpsForBudget(999_999)).toBe(96_000);
    expect(audioBpsForBudget(400_000)).toBe(96_000);
    expect(audioBpsForBudget(399_999)).toBe(64_000);
  });
});

describe("maxVideoBps", () => {
  test("is the high-quality bitrate for the size", () => {
    expect(maxVideoBps({ width: 1920, height: 1080 })).toBe(6_220_800);
  });
});

describe("nextVideoBps", () => {
  test("scales the video share so the next pass lands at 95% of target", () => {
    expect(
      nextVideoBps({ prevVideoBps: 2_000_000, actualBytes: 22_000_000, targetBytes: 20 * MB, audioBps: 128_000, durationSec: 60 })
    ).toBe(1_714_828);
  });
});

describe("judgeAttempt", () => {
  test("over, ok and under-filled boundaries", () => {
    expect(judgeAttempt(20_000_001, 20 * MB)).toBe("over");
    expect(judgeAttempt(20 * MB, 20 * MB)).toBe("ok");
    expect(judgeAttempt(18 * MB, 20 * MB)).toBe("ok");
    expect(judgeAttempt(17_999_999, 20 * MB)).toBe("under-filled");
  });
});
