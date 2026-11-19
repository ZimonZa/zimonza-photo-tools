import { describe, expect, test } from "vitest";
import { maxVideoBps, nextVideoBps } from "@/lib/video/bitrate";
import type { EncodeJob, SupportCheck, VideoEngine, VideoInfo } from "@/lib/video/engines/types";
import { ExportCanceledError, TargetNotReachedError, TargetTooSmallError } from "@/lib/video/errors";
import { exportVideo, type ExportDeps, type ExportStatus } from "@/lib/video/export";
import { MB, type EditRecipe } from "@/lib/video/recipe";

const INFO: VideoInfo = {
  durationSec: 60,
  width: 1920,
  height: 1080,
  rotation: 0,
  videoCodec: "avc",
  audioCodec: "aac",
  hasAudio: true,
  readableByMediabunny: true,
};

interface FakeEngine extends VideoEngine {
  jobs: EncodeJob[];
}

function fakeEngine(
  id: "webcodecs" | "ffmpeg",
  o: { precheck?: SupportCheck; sizes?: number[]; error?: Error } = {}
): FakeEngine {
  const jobs: EncodeJob[] = [];
  return {
    id,
    jobs,
    precheck: async () => o.precheck ?? { ok: true },
    encode: async (job) => {
      jobs.push(job);
      if (o.error) throw o.error;
      const sizes = o.sizes ?? [1000];
      return new Blob([new Uint8Array(sizes[Math.min(jobs.length - 1, sizes.length - 1)])]);
    },
  };
}

function deps(webcodecs: FakeEngine, ffmpeg: FakeEngine, info: VideoInfo = INFO): ExportDeps {
  return { probe: async () => info, engines: { webcodecs, ffmpeg } };
}

/** A file that reports `size` without allocating it — e.g. a 150 MB, 60 s 1080p camera original. */
function sizedFile(name: string, size: number): File {
  const file = new File([new Uint8Array(1)], name);
  Object.defineProperty(file, "size", { value: size });
  return file;
}

function recipe(partial: Partial<EditRecipe> = {}): EditRecipe {
  return {
    file: sizedFile("Trip.MOV", 150_000_000),
    trim: null,
    maxLongSide: null,
    muted: false,
    size: { kind: "quality", level: "balanced" },
    ...partial,
  };
}

const TARGET_20 = { kind: "target", bytes: 20 * MB } as const;

describe("engine routing", () => {
  test("auto uses webcodecs when its precheck passes", async () => {
    const wc = fakeEngine("webcodecs");
    const ff = fakeEngine("ffmpeg");
    const result = await exportVideo(recipe(), {}, deps(wc, ff));
    expect(result.engine).toBe("webcodecs");
    expect(ff.jobs).toHaveLength(0);
  });

  test("auto falls back to ffmpeg when the webcodecs precheck fails", async () => {
    const wc = fakeEngine("webcodecs", { precheck: { ok: false, reason: "no encoder" } });
    const ff = fakeEngine("ffmpeg");
    const statuses: ExportStatus[] = [];
    const result = await exportVideo(recipe(), { onStatus: (s) => statuses.push(s) }, deps(wc, ff));
    expect(result.engine).toBe("ffmpeg");
    expect(wc.jobs).toHaveLength(0);
    expect(statuses).toContainEqual({ phase: "fallback", reason: "no encoder" });
  });

  test("auto falls back to ffmpeg once when webcodecs throws", async () => {
    const wc = fakeEngine("webcodecs", { error: new Error("boom") });
    const ff = fakeEngine("ffmpeg");
    const result = await exportVideo(recipe(), {}, deps(wc, ff));
    expect(result.engine).toBe("ffmpeg");
    expect(ff.jobs).toHaveLength(1);
  });

  test("a forced engine never falls back", async () => {
    const wc = fakeEngine("webcodecs", { error: new Error("boom") });
    const ff = fakeEngine("ffmpeg");
    await expect(exportVideo(recipe(), { engine: "webcodecs" }, deps(wc, ff))).rejects.toThrow("boom");
    expect(ff.jobs).toHaveLength(0);
  });

  test("forcing ffmpeg skips webcodecs entirely", async () => {
    const wc = fakeEngine("webcodecs");
    const ff = fakeEngine("ffmpeg");
    expect((await exportVideo(recipe(), { engine: "ffmpeg" }, deps(wc, ff))).engine).toBe("ffmpeg");
    expect(wc.jobs).toHaveLength(0);
  });
});

describe("target size loop", () => {
  test("an over-target pass is retried with a lower bitrate", async () => {
    const wc = fakeEngine("webcodecs", { sizes: [22_000_000, 19_500_000] });
    const result = await exportVideo(recipe({ size: TARGET_20 }), {}, deps(wc, fakeEngine("ffmpeg")));
    expect(result.attempts).toBe(2);
    expect(result.blob.size).toBe(19_500_000);
    expect(wc.jobs[1].plan.videoBps).toBe(
      nextVideoBps({
        prevVideoBps: wc.jobs[0].plan.videoBps,
        actualBytes: 22_000_000,
        targetBytes: 20 * MB,
        audioBps: 128_000,
        durationSec: 60,
      })
    );
  });

  test("an under-filled pass is retried with a higher bitrate, capped at high quality", async () => {
    const wc = fakeEngine("webcodecs", { sizes: [15_000_000, 19_000_000] });
    const result = await exportVideo(recipe({ size: TARGET_20 }), {}, deps(wc, fakeEngine("ffmpeg")));
    expect(result.attempts).toBe(2);
    expect(result.blob.size).toBe(19_000_000);
    expect(wc.jobs[1].plan.videoBps).toBeGreaterThan(wc.jobs[0].plan.videoBps);
    expect(wc.jobs[1].plan.videoBps).toBeLessThanOrEqual(maxVideoBps(wc.jobs[1].plan));
  });

  test("keeps the best result under target when later passes stay under-filled", async () => {
    const wc = fakeEngine("webcodecs", { sizes: [15_000_000, 16_000_000, 17_000_000, 16_500_000] });
    const result = await exportVideo(recipe({ size: TARGET_20 }), {}, deps(wc, fakeEngine("ffmpeg")));
    expect(result.attempts).toBe(4);
    expect(result.blob.size).toBe(17_000_000);
  });

  test("never fitting on a forced engine fails after four passes", async () => {
    const wc = fakeEngine("webcodecs", { sizes: [21_000_000] });
    await expect(
      exportVideo(recipe({ size: TARGET_20 }), { engine: "webcodecs" }, deps(wc, fakeEngine("ffmpeg")))
    ).rejects.toBeInstanceOf(TargetNotReachedError);
    expect(wc.jobs).toHaveLength(4);
  });

  test("auto mode hands a never-fitting job to ffmpeg", async () => {
    const wc = fakeEngine("webcodecs", { sizes: [21_000_000] });
    const ff = fakeEngine("ffmpeg", { sizes: [19_000_000] });
    const result = await exportVideo(recipe({ size: TARGET_20 }), {}, deps(wc, ff));
    expect(result.engine).toBe("ffmpeg");
    expect(result.attempts).toBe(1);
  });

  test("a big target on a small clip doesn't inflate it", async () => {
    // 5 MB, 40 s 720p clip, "under 20 MB": stay at the clip's own ~1 Mbps instead of filling 20 MB.
    const wc = fakeEngine("webcodecs", { sizes: [4_900_000] });
    const small = new File([new Uint8Array(5_000_000)], "wa.mp4");
    const result = await exportVideo(
      recipe({ file: small, size: TARGET_20 }),
      {},
      deps(wc, fakeEngine("ffmpeg"), { ...INFO, width: 1280, height: 720, durationSec: 40 })
    );
    expect(wc.jobs[0].plan.videoBps).toBe(872_000);
    expect(result.attempts).toBe(1);
  });

  test("a target too small for the length fails before any encoding", async () => {
    const wc = fakeEngine("webcodecs");
    await expect(
      exportVideo(recipe({ size: { kind: "target", bytes: 2 * MB } }), {}, deps(wc, fakeEngine("ffmpeg"), { ...INFO, durationSec: 600 }))
    ).rejects.toBeInstanceOf(TargetTooSmallError);
    expect(wc.jobs).toHaveLength(0);
  });
});

describe("trim", () => {
  test("is clamped to the clip and the trimmed length drives the plan", async () => {
    const wc = fakeEngine("webcodecs", { sizes: [19_000_000] });
    await exportVideo(recipe({ trim: { start: 10, end: 999 }, size: TARGET_20 }), {}, deps(wc, fakeEngine("ffmpeg")));
    expect(wc.jobs[0].trim).toEqual({ start: 10, end: 60 });
    // 50 s at 20 MB: (20e6 * 8 * 0.92 / 50) - 128k audio
    expect(wc.jobs[0].plan.videoBps).toBe(2_816_000);
  });
});

describe("cancel", () => {
  test("an already-aborted signal stops before encoding", async () => {
    const wc = fakeEngine("webcodecs");
    const controller = new AbortController();
    controller.abort();
    await expect(
      exportVideo(recipe(), { signal: controller.signal }, deps(wc, fakeEngine("ffmpeg")))
    ).rejects.toBeInstanceOf(ExportCanceledError);
    expect(wc.jobs).toHaveLength(0);
  });

  test("a cancel during encoding is not treated as a failure to fall back from", async () => {
    const wc = fakeEngine("webcodecs", { error: new ExportCanceledError() });
    const ff = fakeEngine("ffmpeg");
    await expect(exportVideo(recipe(), {}, deps(wc, ff))).rejects.toBeInstanceOf(ExportCanceledError);
    expect(ff.jobs).toHaveLength(0);
  });
});

describe("result", () => {
  test("names the file and reports the final size", async () => {
    const wc = fakeEngine("webcodecs");
    const result = await exportVideo(recipe({ maxLongSide: 1280 }), {}, deps(wc, fakeEngine("ffmpeg")));
    expect(result).toMatchObject({ fileName: "Trip-zimonza.mp4", width: 1280, height: 720, attempts: 1, steppedDown: false });
  });
});
