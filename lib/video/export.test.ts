import { describe, expect, test, vi } from "vitest";
import { maxVideoBps, nextVideoBps } from "@/lib/video/bitrate";
import type { EncodeJob, SupportCheck, VideoEngine, VideoInfo } from "@/lib/video/engines/types";
import {
  EngineUnsupportedError,
  ExportCanceledError,
  InvalidSizeError,
  TargetNotReachedError,
  TargetTooSmallError,
} from "@/lib/video/errors";
import {
  createProbe,
  exportVideo,
  previewSample,
  sampleWindow,
  type ExportDeps,
  type ExportOptions,
  type ExportStatus,
} from "@/lib/video/export";
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

function deps(webcodecs: FakeEngine, ffmpeg: FakeEngine, info: VideoInfo = INFO, isMobile = () => false): ExportDeps {
  return { probe: async () => info, engines: { webcodecs, ffmpeg }, isMobile };
}

/** A file that reports `size` without allocating it — e.g. a 150 MB, 60 s 1080p camera original. */
function sizedFile(name: string, size: number): File {
  const file = new File([new Uint8Array(1)], name);
  Object.defineProperty(file, "size", { value: size });
  return file;
}

function recipe(partial: Partial<EditRecipe> = {}): EditRecipe {
  return { ...BASE_RECIPE, file: sizedFile("Trip.MOV", 150_000_000), ...partial };
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
    expect(statuses).toContainEqual({ phase: "fallback", reason: "no encoder", estimatedSec: 675 });
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

const BIG: VideoInfo = { ...INFO, width: 3840, height: 2160 };
/** A fast engine that can encode up to 1080p. */
const sizeAware = (): FakeEngine => {
  const e = fakeEngine("webcodecs");
  e.precheck = async (_i, plan) =>
    plan.width * plan.height <= 1920 * 1080 ? { ok: true } : { ok: false, reason: "too big", smallerMayWork: true };
  return e;
};

describe("backup engine policies", () => {
  test("a size the fast engine can't encode is lowered instead of going to the backup engine", async () => {
    const wc = sizeAware();
    const ff = fakeEngine("ffmpeg");
    const statuses: ExportStatus[] = [];
    const result = await exportVideo(
      recipe({ size: { kind: "quality", level: "high" } }),
      { onStatus: (s) => statuses.push(s) },
      deps(wc, ff, BIG)
    );
    expect(result.engine).toBe("webcodecs");
    expect(wc.jobs[0].plan).toMatchObject({ width: 1920, height: 1080 });
    expect(result.steppedDown).toBe(true);
    expect(ff.jobs).toHaveLength(0);
    expect(statuses).toContainEqual({ phase: "smaller", width: 1920, height: 1080, reason: "too big" });
  });

  test("when no smaller size helps, the job falls back with a time estimate", async () => {
    const wc = fakeEngine("webcodecs", { precheck: { ok: false, reason: "too big", smallerMayWork: true } });
    const ff = fakeEngine("ffmpeg");
    const statuses: ExportStatus[] = [];
    const result = await exportVideo(recipe(), { onStatus: (s) => statuses.push(s) }, deps(wc, ff, INFO, () => false));
    expect(result.engine).toBe("ffmpeg");
    expect(statuses).toContainEqual({ phase: "fallback", reason: "too big", estimatedSec: 675 });
  });

  test("declining the backup engine cancels", async () => {
    const wc = fakeEngine("webcodecs", { precheck: { ok: false, reason: "no encoder" } });
    const ff = fakeEngine("ffmpeg");
    await expect(exportVideo(recipe(), { confirmFallback: async () => "cancel" }, deps(wc, ff))).rejects.toBeInstanceOf(
      ExportCanceledError
    );
    expect(ff.jobs).toHaveLength(0);
  });

  test("confirmFallback receives the estimate", async () => {
    const wc = fakeEngine("webcodecs", { precheck: { ok: false, reason: "no encoder" } });
    const asked: { reason: string; estimatedSec: number }[] = [];
    await exportVideo(
      recipe(),
      {
        confirmFallback: async (f) => {
          asked.push(f);
          return "continue";
        },
      },
      deps(wc, fakeEngine("ffmpeg"))
    );
    expect(asked).toEqual([{ reason: "no encoder", estimatedSec: 675 }]);
  });

  test("a forced engine never asks", async () => {
    let asked = false;
    await exportVideo(
      recipe(),
      {
        engine: "ffmpeg",
        confirmFallback: async () => {
          asked = true;
          return "continue";
        },
      },
      deps(fakeEngine("webcodecs"), fakeEngine("ffmpeg"))
    );
    expect(asked).toBe(false);
  });
});

describe("WebM the fast engine can't make, when MP4 it can (W1)", () => {
  const OPUS = "This browser can't encode Opus audio for WebM.";
  /** A fast engine that encodes MP4 but not WebM, like most iPhones. */
  const noWebm = (): FakeEngine => {
    const e = fakeEngine("webcodecs");
    e.precheck = async (_i, _p, container) => (container === "webm" ? { ok: false, reason: OPUS } : { ok: true });
    return e;
  };
  type Question = Parameters<NonNullable<ExportOptions["confirmFallback"]>>[0];

  test("the question offers MP4; answering mp4 exports MP4 on the fast engine with the same plan", async () => {
    const wc = noWebm();
    const ff = fakeEngine("ffmpeg");
    const asked: Question[] = [];
    const statuses: ExportStatus[] = [];
    const result = await exportVideo(
      recipe({ container: "webm" }),
      {
        onStatus: (s) => statuses.push(s),
        confirmFallback: async (q) => {
          asked.push(q);
          return "mp4";
        },
      },
      deps(wc, ff)
    );
    expect(asked).toEqual([{ reason: OPUS, estimatedSec: 675, mp4Instead: true }]);
    expect(result).toMatchObject({ engine: "webcodecs", fileName: "Trip-zimonza.mp4", width: 1920, height: 1080 });
    expect(wc.jobs).toHaveLength(1);
    expect(wc.jobs[0].container).toBe("mp4");
    expect(ff.jobs).toHaveLength(0);
    expect(statuses).toContainEqual({ phase: "encoding", engine: "webcodecs", attempt: 1 });
  });

  test("answering continue makes WebM on the backup engine, as before", async () => {
    const wc = noWebm();
    const ff = fakeEngine("ffmpeg");
    const result = await exportVideo(recipe({ container: "webm" }), { confirmFallback: async () => "continue" }, deps(wc, ff));
    expect(result).toMatchObject({ engine: "ffmpeg", fileName: "Trip-zimonza.webm" });
    expect(ff.jobs[0].container).toBe("webm");
    expect(wc.jobs).toHaveLength(0);
  });

  test("answering cancel cancels, with nothing encoded", async () => {
    const wc = noWebm();
    const ff = fakeEngine("ffmpeg");
    await expect(
      exportVideo(recipe({ container: "webm" }), { confirmFallback: async () => "cancel" }, deps(wc, ff))
    ).rejects.toBeInstanceOf(ExportCanceledError);
    expect(wc.jobs).toHaveLength(0);
    expect(ff.jobs).toHaveLength(0);
  });

  test("a target size in MP4 runs its passes on the fast engine", async () => {
    const wc = noWebm();
    wc.encode = async (job) => {
      wc.jobs.push(job);
      return new Blob([new Uint8Array(19_000_000)]);
    };
    const result = await exportVideo(
      recipe({ container: "webm", size: TARGET_20 }),
      { confirmFallback: async () => "mp4" },
      deps(wc, fakeEngine("ffmpeg"))
    );
    expect(result).toMatchObject({ engine: "webcodecs", fileName: "Trip-zimonza.mp4", attempts: 1 });
    expect(wc.jobs.map((j) => j.container)).toEqual(["mp4"]);
  });

  test("no MP4 offer when MP4 would need the backup engine too (the fast engine can't read the file)", async () => {
    const wc = fakeEngine("webcodecs", { precheck: { ok: false, reason: "The fast engine can't read this file type." } });
    const ff = fakeEngine("ffmpeg");
    const asked: Question[] = [];
    const result = await exportVideo(
      recipe({ container: "webm" }),
      {
        confirmFallback: async (q) => {
          asked.push(q);
          return "continue";
        },
      },
      deps(wc, ff)
    );
    expect(asked).toEqual([{ reason: "The fast engine can't read this file type.", estimatedSec: 675 }]);
    expect(result).toMatchObject({ engine: "ffmpeg", fileName: "Trip-zimonza.webm" });
  });

  test("no MP4 offer for an MP4 export, nor when the fast engine fails partway through WebM", async () => {
    const asked: Question[] = [];
    const confirmFallback = async (q: Question) => {
      asked.push(q);
      return "continue" as const;
    };
    const mp4Refused = fakeEngine("webcodecs", { precheck: { ok: false, reason: "no encoder" } });
    await exportVideo(recipe(), { confirmFallback }, deps(mp4Refused, fakeEngine("ffmpeg")));
    const failsPartway = fakeEngine("webcodecs", { error: new Error("boom") });
    await exportVideo(recipe({ container: "webm" }), { confirmFallback }, deps(failsPartway, fakeEngine("ffmpeg")));
    expect(asked.map((q) => q.mp4Instead)).toEqual([undefined, undefined]);
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
    expect(wc.jobs[0].plan.videoBps).toBe(822_000);
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

describe("output size", () => {
  test("a degenerate size fails before any encoding", async () => {
    const wc = fakeEngine("webcodecs");
    const ff = fakeEngine("ffmpeg");
    await expect(
      exportVideo(recipe({ frame: { kind: "exact", width: 10, height: 10, fit: "cover" } }), {}, deps(wc, ff))
    ).rejects.toBeInstanceOf(InvalidSizeError);
    expect(wc.jobs).toHaveLength(0);
    expect(ff.jobs).toHaveLength(0);
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

describe("diagnostics", () => {
  test("reports what was found in the file before encoding", async () => {
    const statuses: ExportStatus[] = [];
    await exportVideo(recipe(), { onStatus: (s) => statuses.push(s) }, deps(fakeEngine("webcodecs"), fakeEngine("ffmpeg")));
    expect(statuses).toContainEqual({ phase: "probed", info: INFO });
  });

  test("a probe that falls back to ffmpeg says why", async () => {
    const statuses: ExportStatus[] = [];
    const probe = createProbe(
      async () => {
        throw new Error("Unsupported container");
      },
      async () => INFO
    );
    await exportVideo(
      recipe(),
      { onStatus: (s) => statuses.push(s) },
      { probe, engines: { webcodecs: fakeEngine("webcodecs"), ffmpeg: fakeEngine("ffmpeg") } }
    );
    expect(statuses).toContainEqual({ phase: "probe-fallback", reason: "Fast engine can't read this file: Unsupported container" });
  });
});

describe("result", () => {
  test("names the file and reports the final size", async () => {
    const wc = fakeEngine("webcodecs");
    const result = await exportVideo(recipe({ frame: { kind: "source", maxLongSide: 1280 } }), {}, deps(wc, fakeEngine("ffmpeg")));
    expect(result).toMatchObject({ fileName: "Trip-zimonza.mp4", width: 1280, height: 720, attempts: 1, steppedDown: false });
  });

  test("edits, fit and container reach the engine", async () => {
    const wc = fakeEngine("webcodecs");
    const result = await exportVideo(
      recipe({
        rotate: 90,
        flipV: true,
        crop: { left: 1, top: 0, width: 1081, height: 1920 },
        frame: { kind: "exact", width: 1080, height: 1350, fit: "blur" },
        container: "webm",
      }),
      {},
      deps(wc, fakeEngine("ffmpeg"))
    );
    // probe is 1920x1080 -> rotated picture 1080x1920 -> crop clamps to 1080x1920 at (0,0) = whole picture -> no crop
    expect(wc.jobs[0].edits).toEqual({ rotate: 90, flipH: false, flipV: true, crop: null, fit: "blur" });
    expect(wc.jobs[0].container).toBe("webm");
    expect(wc.jobs[0].plan).toMatchObject({ width: 1080, height: 1350 });
    expect(result.fileName).toBe("Trip-zimonza.webm");
  });
});

describe("sampleWindow", () => {
  test("centres a 3 s window on the playhead, clamped to the usable range", () => {
    expect(sampleWindow(null, 60, 30)).toEqual({ start: 28.5, end: 31.5 });
    expect(sampleWindow(null, 60, 59)).toEqual({ start: 57, end: 60 });
    expect(sampleWindow(null, 60, 0)).toEqual({ start: 0, end: 3 });
    expect(sampleWindow({ start: 10, end: 20 }, 60, 19.5)).toEqual({ start: 17, end: 20 });
    expect(sampleWindow({ start: 10, end: 20 }, 60, 2)).toEqual({ start: 10, end: 13 });
    expect(sampleWindow(null, 2, 1)).toEqual({ start: 0, end: 2 });
  });

  test("a playhead that isn't a finite number starts at the usable range's start", () => {
    expect(sampleWindow(null, 60, NaN)).toEqual({ start: 0, end: 3 });
    expect(sampleWindow({ start: 10, end: 20 }, 60, NaN)).toEqual({ start: 10, end: 13 });
    expect(sampleWindow({ start: 10, end: 20 }, 60, Infinity)).toEqual({ start: 10, end: 13 });
  });
});

describe("previewSample", () => {
  test("encodes one window with the full export's plan", async () => {
    const wc = fakeEngine("webcodecs");
    const ff = fakeEngine("ffmpeg");
    const r = await previewSample(recipe({ size: { kind: "quality", level: "balanced" } }), 30, {}, deps(wc, ff));
    expect(r).not.toBeNull();
    expect(wc.jobs).toHaveLength(1);
    expect(wc.jobs[0].trim).toEqual({ start: 28.5, end: 31.5 });
    expect(r!.window).toEqual({ start: 28.5, end: 31.5 });
    expect(r!.plan.videoBps).toBe(3_732_480);
    expect(r!.estimatedBytes).toBe(28_953_600);
    expect(ff.jobs).toHaveLength(0);
  });

  test("target mode estimate never exceeds the target", async () => {
    const wc = fakeEngine("webcodecs");
    const r = await previewSample(recipe({ size: TARGET_20 }), 30, {}, deps(wc, fakeEngine("ffmpeg")));
    expect(r!.estimatedBytes).toBeLessThanOrEqual(20_000_000);
  });

  test("no sample when the fast engine can't run", async () => {
    const wc = fakeEngine("webcodecs", { precheck: { ok: false, reason: "no encoder" } });
    const ff = fakeEngine("ffmpeg");
    expect(await previewSample(recipe(), 30, {}, deps(wc, ff))).toBeNull();
    expect(wc.jobs).toHaveLength(0);
    expect(ff.jobs).toHaveLength(0);
  });

  test("an already-aborted signal cancels before encoding", async () => {
    const wc = fakeEngine("webcodecs");
    const ac = new AbortController();
    ac.abort();
    await expect(previewSample(recipe(), 30, { signal: ac.signal }, deps(wc, fakeEngine("ffmpeg")))).rejects.toBeInstanceOf(
      ExportCanceledError
    );
    expect(wc.jobs).toHaveLength(0);
  });

  test("a cancel during the encode still rejects with ExportCanceledError", async () => {
    const ac = new AbortController();
    const wc = fakeEngine("webcodecs");
    wc.encode = async (job) => {
      wc.jobs.push(job);
      ac.abort();
      if (job.signal.aborted) throw new ExportCanceledError();
      return new Blob([new Uint8Array(1000)]);
    };
    await expect(previewSample(recipe(), 30, { signal: ac.signal }, deps(wc, fakeEngine("ffmpeg")))).rejects.toBeInstanceOf(
      ExportCanceledError
    );
  });

  test("a file the fast reader can't open gives no sample and never reaches ffmpeg's probe", async () => {
    let fullProbes = 0;
    const probe = createProbe(
      async () => {
        throw new Error("Unsupported container");
      },
      async () => {
        fullProbes++;
        return { ...INFO, readableByMediabunny: false };
      }
    );
    const wc = fakeEngine("webcodecs");
    const ff = fakeEngine("ffmpeg");
    expect(await previewSample(recipe(), 30, {}, { probe, engines: { webcodecs: wc, ffmpeg: ff } })).toBeNull();
    expect(fullProbes).toBe(0);
    expect(wc.jobs).toHaveLength(0);
    expect(ff.jobs).toHaveLength(0);
  });

  test("a size the fast engine can't encode is lowered for the sample, as for the export", async () => {
    const wc = sizeAware();
    const r = await previewSample(
      recipe({ size: { kind: "quality", level: "high" } }),
      30,
      {},
      deps(wc, fakeEngine("ffmpeg"), BIG)
    );
    expect(r).not.toBeNull();
    expect(r!.plan).toMatchObject({ width: 1920, height: 1080, steppedDown: true });
    expect(wc.jobs).toHaveLength(1);
    expect(wc.jobs[0].plan).toEqual(r!.plan);
  });

  test("no sample when the fast engine finds it can't process the file", async () => {
    const wc = fakeEngine("webcodecs", {
      error: new EngineUnsupportedError("The fast engine can't process this file (audio: no_encodable_target_codec)."),
    });
    const ff = fakeEngine("ffmpeg");
    expect(await previewSample(recipe(), 30, {}, deps(wc, ff))).toBeNull();
    expect(ff.jobs).toHaveLength(0);
  });

  test("other failures still reject", async () => {
    const wc = fakeEngine("webcodecs", { error: new Error("boom") });
    await expect(previewSample(recipe(), 30, {}, deps(wc, fakeEngine("ffmpeg")))).rejects.toThrow("boom");
  });
});

describe("a sample never competes with an export", () => {
  const sampleBlob = () => new Blob([new Uint8Array(1000)]);

  test("an export stops a sample in flight and starts encoding only once the sample has settled", async () => {
    const events: string[] = [];
    const wc = fakeEngine("webcodecs");
    wc.encode = async (job) => {
      wc.jobs.push(job);
      if (wc.jobs.length > 1) {
        events.push("export encode");
        return sampleBlob();
      }
      // The sample runs until it's stopped (or 200 ms pass), then takes a moment to wind down.
      await new Promise<void>((resolve) => {
        job.signal.addEventListener("abort", () => resolve(), { once: true });
        setTimeout(resolve, 200);
      });
      await new Promise((r) => setTimeout(r, 20));
      events.push(job.signal.aborted ? "sample stopped" : "sample finished");
      if (job.signal.aborted) throw new ExportCanceledError();
      return sampleBlob();
    };
    const d = deps(wc, fakeEngine("ffmpeg"));
    const sample = previewSample(recipe(), 30, {}, d);
    await vi.waitFor(() => expect(wc.jobs).toHaveLength(1));

    await exportVideo(recipe(), {}, d);
    expect(wc.jobs[0].signal.aborted).toBe(true);
    expect(events).toEqual(["sample stopped", "export encode"]);
    // Stopped by the export rather than by the caller: no sample, not a cancel.
    expect(await sample).toBeNull();
  });

  test("no sample while an export is running", async () => {
    let release!: () => void;
    const wc = fakeEngine("webcodecs");
    wc.encode = async (job) => {
      wc.jobs.push(job);
      if (wc.jobs.length === 1) await new Promise<void>((r) => (release = r));
      return sampleBlob();
    };
    const d = deps(wc, fakeEngine("ffmpeg"));
    const exporting = exportVideo(recipe(), {}, d);
    await vi.waitFor(() => expect(wc.jobs).toHaveLength(1));

    expect(await previewSample(recipe(), 30, {}, d)).toBeNull();
    expect(wc.jobs).toHaveLength(1);

    release();
    await exporting;
    expect(await previewSample(recipe(), 30, {}, deps(fakeEngine("webcodecs"), fakeEngine("ffmpeg")))).not.toBeNull();
  });

  test("samples run again after an export fails", async () => {
    const failing = fakeEngine("webcodecs", { error: new Error("boom") });
    await expect(exportVideo(recipe(), { engine: "webcodecs" }, deps(failing, fakeEngine("ffmpeg")))).rejects.toThrow("boom");
    expect(await previewSample(recipe(), 30, {}, deps(fakeEngine("webcodecs"), fakeEngine("ffmpeg")))).not.toBeNull();
  });
});
