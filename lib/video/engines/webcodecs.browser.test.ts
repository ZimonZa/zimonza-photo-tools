import { describe, expect, test } from "vitest";
import { probeWithMediabunny, webcodecsEngine } from "@/lib/video/engines/webcodecs";
import type { EncodeJob } from "@/lib/video/engines/types";
import { ExportCanceledError } from "@/lib/video/errors";
import { makeTestClip } from "@/lib/video/test-utils/make-clip";
import { expectPixels, isBlue, isGreen, isRed, isWhite } from "@/lib/video/test-utils/colors";
import { inspectMp4, pixelAt } from "@/lib/video/test-utils/mp4";

const NO_EDITS: EncodeJob["edits"] = { rotate: 0, flipH: false, flipV: false, crop: null, fit: null };

function job(partial: Omit<EncodeJob, "signal" | "onProgress" | "edits" | "container"> & Partial<EncodeJob>): EncodeJob {
  return {
    signal: new AbortController().signal,
    onProgress: () => {},
    edits: NO_EDITS,
    container: "mp4",
    ...partial,
  };
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

describe("webcodecsEngine applies the edits", () => {
  const quadrants = () => makeTestClip({ seconds: 1, width: 640, height: 360, audio: false, pattern: "quadrants" });
  const plan = (width: number, height: number) => ({ width, height, videoBps: 1_000_000, audioBps: 0, steppedDown: false });

  test("rotate + crop selects the region of the rotated picture", async () => {
    const file = await quadrants();
    const info = await probeWithMediabunny(file);
    const out = await webcodecsEngine.encode(
      job({
        file,
        info,
        trim: null,
        plan: plan(180, 320),
        edits: { ...NO_EDITS, rotate: 90, crop: { left: 0, top: 0, width: 180, height: 320 } },
      })
    );
    expect(await inspectMp4(out)).toMatchObject({ width: 180, height: 320, rotation: 0 });
    // Turned clockwise, the original bottom-left (blue) becomes the top-left.
    const px = await pixelAt(out, 90, 160);
    expect(isBlue(px), `pixel ${px}`).toBe(true);
  });

  test("vertical flip", async () => {
    const file = await quadrants();
    const info = await probeWithMediabunny(file);
    const out = await webcodecsEngine.encode(
      job({ file, info, trim: null, plan: plan(640, 360), edits: { ...NO_EDITS, flipV: true } })
    );
    const px = await pixelAt(out, 80, 45);
    expect(isBlue(px), `pixel ${px}`).toBe(true);
  });

  test("crop-to-fill keeps the centre", async () => {
    const file = await quadrants();
    const info = await probeWithMediabunny(file);
    const out = await webcodecsEngine.encode(
      job({ file, info, trim: null, plan: plan(360, 360), edits: { ...NO_EDITS, fit: "cover" } })
    );
    expect(await inspectMp4(out)).toMatchObject({ width: 360, height: 360 });
    const tl = await pixelAt(out, 90, 90);
    const br = await pixelAt(out, 270, 270);
    expect(isRed(tl), `pixel ${tl}`).toBe(true);
    expect(isWhite(br), `pixel ${br}`).toBe(true);

    // The quadrants are point-symmetric, so stretching would pass the checks above. An off-centre
    // crop tells the two apart: 480x360 into 120x360 keeps only the red middle; stretching shows green.
    const narrow = await webcodecsEngine.encode(
      job({
        file,
        info,
        trim: null,
        plan: plan(120, 360),
        edits: { ...NO_EDITS, crop: { left: 0, top: 0, width: 480, height: 360 }, fit: "cover" },
      })
    );
    const px = await pixelAt(narrow, 100, 90);
    expect(isRed(px), `pixel ${px}`).toBe(true);
  });

  test("blurred background: whole picture visible, no black bars", async () => {
    const file = await makeTestClip({ seconds: 1, width: 640, height: 360, audio: false, pattern: "solid-red" });
    const info = await probeWithMediabunny(file);
    const out = await webcodecsEngine.encode(
      job({ file, info, trim: null, plan: plan(360, 640), edits: { ...NO_EDITS, fit: "blur" } })
    );
    expect(await inspectMp4(out)).toMatchObject({ width: 360, height: 640, rotation: 0 });
    const centre = await pixelAt(out, 180, 320);
    expect(isRed(centre), `pixel ${centre}`).toBe(true);
    const corner = await pixelAt(out, 10, 10);
    expect(corner[0], `pixel ${corner}`).toBeGreaterThan(100); // blurred red, not black
    // The background is darkened, so it isn't simply the picture stretched to fill.
    expect(corner[0], `pixel ${corner} vs centre ${centre}`).toBeLessThan(centre[0] - 20);
  });

  describe("blurred background combined with other edits", () => {
    const blur = async (file: File, edits: Partial<EncodeJob["edits"]>, width: number, height: number) =>
      webcodecsEngine.encode(
        job({
          file,
          info: await probeWithMediabunny(file),
          trim: null,
          plan: plan(width, height),
          edits: { ...NO_EDITS, ...edits, fit: "blur" },
        })
      );

    test("after rotate + crop, the cropped turned picture sits whole in the frame", async () => {
      // Turned clockwise the quadrants read blue | red over white | green. The crop keeps the top
      // half (blue | red, 360x320), contained in rows 160-480 of the 360x640 frame.
      const out = await blur(await quadrants(), { rotate: 90, crop: { left: 0, top: 0, width: 360, height: 320 } }, 360, 640);
      expect(await inspectMp4(out)).toMatchObject({ width: 360, height: 640, rotation: 0 });
      await expectPixels(out, [
        [90, 240, isBlue],
        [270, 240, isRed],
        [90, 420, isBlue],
        [270, 420, isRed],
      ]);
      // Above the picture is the darkened background, not more of the picture.
      const picture = await pixelAt(out, 90, 240);
      const above = await pixelAt(out, 90, 20);
      expect(above[2], `background ${above} vs picture ${picture}`).toBeLessThan(picture[2] - 20);
    });

    test("a clip with its own rotation stays upright", async () => {
      // Shown upright the 640x360 file is 360x640: blue | red over white | green, contained in
      // columns 79-281 of the 360x360 frame.
      const file = await makeTestClip({ seconds: 1, width: 640, height: 360, audio: false, rotation: 90, pattern: "quadrants" });
      const out = await blur(file, {}, 360, 360);
      await expectPixels(out, [
        [130, 90, isBlue],
        [230, 90, isRed],
        [130, 270, isWhite],
        [230, 270, isGreen],
      ]);
      const picture = await pixelAt(out, 130, 90);
      const beside = await pixelAt(out, 20, 90);
      expect(beside[2], `background ${beside} vs picture ${picture}`).toBeLessThan(picture[2] - 20);
    });

    test("a turn that cancels the clip's own rotation shows the coded picture", async () => {
      // 90 in the file + 270 from the user = upright as coded. Mediabunny skips re-rendering here, so the
      // frame reaches `process` with the file's rotation still as metadata; drawing must not apply it.
      const file = await makeTestClip({ seconds: 1, width: 640, height: 360, audio: false, rotation: 90, pattern: "quadrants" });
      const out = await blur(file, { rotate: 270 }, 360, 360);
      await expectPixels(out, [
        [90, 135, isRed],
        [270, 135, isGreen],
        [90, 225, isBlue],
        [270, 225, isWhite],
      ]);
    });

    test("after a vertical flip", async () => {
      // Flipped top to bottom: blue | white over red | green, contained in rows 79-281.
      const out = await blur(await quadrants(), { flipV: true }, 360, 360);
      await expectPixels(out, [
        [90, 135, isBlue],
        [270, 135, isWhite],
        [90, 225, isRed],
        [270, 225, isGreen],
      ]);
    });
  });

  test("WebM output is VP9 + Opus", async () => {
    const file = await makeTestClip({ seconds: 1, width: 640, height: 360, audio: true });
    const info = await probeWithMediabunny(file);
    const out = await webcodecsEngine.encode(
      job({
        file,
        info,
        trim: null,
        plan: { width: 320, height: 180, videoBps: 400_000, audioBps: 96_000, steppedDown: false },
        container: "webm",
      })
    );
    expect(out.type).toBe("video/webm");
    expect(await inspectMp4(out)).toMatchObject({ videoCodec: "vp9", audioCodec: "opus", width: 320, height: 180 });
  });
});

describe("clips whose timeline doesn't start at 0", () => {
  test("report their real length and trim relative to their own start", async () => {
    const file = await makeTestClip({ seconds: 3, width: 320, height: 180, audio: false, startAt: 1 });
    const info = await probeWithMediabunny(file);
    expect(info.startSec).toBeCloseTo(1, 1);
    expect(info.durationSec).toBeCloseTo(3, 1);
    const out = await webcodecsEngine.encode(
      job({ file, info, trim: { start: 0.5, end: 1.5 }, plan: { width: 320, height: 180, videoBps: 300_000, audioBps: 0, steppedDown: false } })
    );
    const m = await inspectMp4(out);
    expect(m.durationSec).toBeGreaterThan(0.9);
    expect(m.durationSec).toBeLessThan(1.1);
  });
});

describe("webcodecsEngine cancel before encoding starts", () => {
  test("an abort while the conversion is being set up still cancels", async () => {
    const file = await makeTestClip({ seconds: 2, width: 640, height: 360, audio: true });
    const info = await probeWithMediabunny(file);
    const controller = new AbortController();
    const run = webcodecsEngine.encode(
      job({
        file,
        info,
        trim: null,
        plan: { width: 320, height: 180, videoBps: 300_000, audioBps: 96_000, steppedDown: false },
        signal: controller.signal,
      })
    );
    controller.abort(); // lands during AAC check / Conversion.init, before execute()
    await expect(run).rejects.toBeInstanceOf(ExportCanceledError);
  });
});

describe("webcodecsEngine.precheck", () => {
  test("accepts a readable clip and rejects one Mediabunny cannot read", async () => {
    const file = await makeTestClip({ seconds: 1, width: 640, height: 360, audio: false });
    const info = await probeWithMediabunny(file);
    const plan = { width: 320, height: 180, videoBps: 300_000, audioBps: 0, steppedDown: false };
    expect(await webcodecsEngine.precheck(info, plan, "mp4")).toEqual({ ok: true });
    expect(await webcodecsEngine.precheck(info, plan, "webm")).toEqual({ ok: true });
    expect((await webcodecsEngine.precheck({ ...info, readableByMediabunny: false }, plan, "mp4")).ok).toBe(false);
  });
});
