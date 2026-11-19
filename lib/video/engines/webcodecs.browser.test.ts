import { describe, expect, test } from "vitest";
import { probeWithMediabunny, webcodecsEngine } from "@/lib/video/engines/webcodecs";
import type { EncodeJob } from "@/lib/video/engines/types";
import { ExportCanceledError } from "@/lib/video/errors";
import { makeTestClip } from "@/lib/video/test-utils/make-clip";
import { inspectMp4 } from "@/lib/video/test-utils/mp4";

function job(partial: Omit<EncodeJob, "signal" | "onProgress"> & Partial<EncodeJob>): EncodeJob {
  return { signal: new AbortController().signal, onProgress: () => {}, ...partial };
}

describe("probeWithMediabunny", () => {
  test("reads display size, codecs, audio and duration", async () => {
    const file = await makeTestClip({ seconds: 3, width: 640, height: 360, audio: true });
    const info = await probeWithMediabunny(file);
    expect(info).toMatchObject({
      width: 640,
      height: 360,
      rotation: 0,
      hasAudio: true,
      videoCodec: "avc",
      audioCodec: "aac",
      readableByMediabunny: true,
    });
    expect(info.durationSec).toBeCloseTo(3, 1);
  });

  test("reports display size for a rotated phone clip", async () => {
    const file = await makeTestClip({ seconds: 1, width: 640, height: 360, audio: false, rotation: 90 });
    expect(await probeWithMediabunny(file)).toMatchObject({ width: 360, height: 640, rotation: 90, hasAudio: false });
  });
});

describe("webcodecsEngine.encode", () => {
  test("trims and resizes into H.264 + AAC with moov before mdat", async () => {
    const file = await makeTestClip({ seconds: 3, width: 640, height: 360, audio: true });
    const info = await probeWithMediabunny(file);
    const out = await webcodecsEngine.encode(
      job({
        file,
        info,
        trim: { start: 0.5, end: 2.5 },
        plan: { width: 320, height: 180, videoBps: 400_000, audioBps: 96_000, steppedDown: false },
      })
    );
    const m = await inspectMp4(out);
    expect(m).toMatchObject({ videoCodec: "avc", audioCodec: "aac", width: 320, height: 180, rotation: 0 });
    expect(m.durationSec).toBeGreaterThan(1.85);
    expect(m.durationSec).toBeLessThan(2.15);
    expect(m.boxes.indexOf("moov")).toBeGreaterThanOrEqual(0);
    expect(m.boxes.indexOf("moov")).toBeLessThan(m.boxes.indexOf("mdat"));
  });

  test("a clip without audio produces no audio track", async () => {
    const file = await makeTestClip({ seconds: 2, width: 640, height: 360, audio: false });
    const info = await probeWithMediabunny(file);
    const out = await webcodecsEngine.encode(
      job({ file, info, trim: null, plan: { width: 320, height: 180, videoBps: 300_000, audioBps: 0, steppedDown: false } })
    );
    expect((await inspectMp4(out)).audioCodec).toBeNull();
  });

  test("audioBps 0 drops existing audio (mute)", async () => {
    const file = await makeTestClip({ seconds: 2, width: 640, height: 360, audio: true });
    const info = await probeWithMediabunny(file);
    const out = await webcodecsEngine.encode(
      job({ file, info, trim: null, plan: { width: 320, height: 180, videoBps: 300_000, audioBps: 0, steppedDown: false } })
    );
    expect((await inspectMp4(out)).audioCodec).toBeNull();
  });

  test("a rotated clip comes out upright with rotation baked in", async () => {
    const file = await makeTestClip({ seconds: 1, width: 640, height: 360, audio: false, rotation: 90 });
    const info = await probeWithMediabunny(file);
    const out = await webcodecsEngine.encode(
      job({ file, info, trim: null, plan: { width: 180, height: 320, videoBps: 300_000, audioBps: 0, steppedDown: false } })
    );
    expect(await inspectMp4(out)).toMatchObject({ width: 180, height: 320, rotation: 0 });
  });

  // Noise is incompressible below ~2 Mbps at 640x360 (every encoder hits its max-QP floor), so test
  // rate control above that floor. Within 20% keeps target-size retries rare.
  test("output size stays within 20% of the planned bitrate", async () => {
    const file = await makeTestClip({ seconds: 3, width: 640, height: 360, audio: false, noise: true });
    const info = await probeWithMediabunny(file);
    const out = await webcodecsEngine.encode(
      job({ file, info, trim: null, plan: { width: 640, height: 360, videoBps: 3_000_000, audioBps: 0, steppedDown: false } })
    );
    expect(out.size).toBeLessThanOrEqual(1.2 * ((3_000_000 * 3) / 8));
  });

  test("aborting rejects with ExportCanceledError", async () => {
    const file = await makeTestClip({ seconds: 3, width: 640, height: 360, audio: true, noise: true });
    const info = await probeWithMediabunny(file);
    const controller = new AbortController();
    const run = webcodecsEngine.encode(
      job({
        file,
        info,
        trim: null,
        plan: { width: 640, height: 360, videoBps: 800_000, audioBps: 96_000, steppedDown: false },
        signal: controller.signal,
        onProgress: (p) => {
          if (p > 0) controller.abort();
        },
      })
    );
    await expect(run).rejects.toBeInstanceOf(ExportCanceledError);
  });
});

describe("webcodecsEngine.precheck", () => {
  test("accepts a readable clip and rejects one Mediabunny cannot read", async () => {
    const file = await makeTestClip({ seconds: 1, width: 640, height: 360, audio: false });
    const info = await probeWithMediabunny(file);
    const plan = { width: 320, height: 180, videoBps: 300_000, audioBps: 0, steppedDown: false };
    expect(await webcodecsEngine.precheck(info, plan)).toEqual({ ok: true });
    expect((await webcodecsEngine.precheck({ ...info, readableByMediabunny: false }, plan)).ok).toBe(false);
  });
});
