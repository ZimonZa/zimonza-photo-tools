import { describe, expect, test } from "vitest";
import { ffmpegEngine, probeWithFfmpeg } from "@/lib/video/engines/ffmpeg";
import type { EncodeJob } from "@/lib/video/engines/types";
import { ExportCanceledError } from "@/lib/video/errors";
import { makeTestClip } from "@/lib/video/test-utils/make-clip";
import { inspectMp4 } from "@/lib/video/test-utils/mp4";

const TIMEOUT = 120_000;

function job(partial: Omit<EncodeJob, "signal" | "onProgress"> & Partial<EncodeJob>): EncodeJob {
  return { signal: new AbortController().signal, onProgress: () => {}, ...partial };
}

describe("probeWithFfmpeg", () => {
  test(
    "reads a rotated clip as display size and marks it unreadable by Mediabunny",
    async () => {
      const file = await makeTestClip({ seconds: 1, width: 640, height: 360, audio: true, rotation: 90 });
      const info = await probeWithFfmpeg(file);
      expect(info).toMatchObject({ width: 360, height: 640, rotation: 90, hasAudio: true, readableByMediabunny: false });
      expect(info.durationSec).toBeCloseTo(1, 1);
    },
    TIMEOUT
  );
});

describe("ffmpegEngine.encode", () => {
  test(
    "trims and resizes into H.264 + AAC with moov before mdat",
    async () => {
      const file = await makeTestClip({ seconds: 3, width: 640, height: 360, audio: true });
      const info = await probeWithFfmpeg(file);
      const out = await ffmpegEngine.encode(
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
    },
    TIMEOUT
  );

  test(
    "a clip without audio produces no audio track",
    async () => {
      const file = await makeTestClip({ seconds: 1, width: 640, height: 360, audio: false });
      const info = await probeWithFfmpeg(file);
      const out = await ffmpegEngine.encode(
        job({ file, info, trim: null, plan: { width: 320, height: 180, videoBps: 300_000, audioBps: 0, steppedDown: false } })
      );
      expect((await inspectMp4(out)).audioCodec).toBeNull();
    },
    TIMEOUT
  );

  test(
    "a rotated clip comes out upright with rotation baked in",
    async () => {
      const file = await makeTestClip({ seconds: 1, width: 640, height: 360, audio: false, rotation: 90 });
      const info = await probeWithFfmpeg(file);
      const out = await ffmpegEngine.encode(
        job({ file, info, trim: null, plan: { width: 180, height: 320, videoBps: 300_000, audioBps: 0, steppedDown: false } })
      );
      expect(await inspectMp4(out)).toMatchObject({ width: 180, height: 320, rotation: 0 });
    },
    TIMEOUT
  );

  test(
    "a failed encode explains why in ffmpeg's own words, and the engine works again afterwards",
    async () => {
      const garbage = new File([crypto.getRandomValues(new Uint8Array(4096))], "broken.mp4");
      const fakeInfo = {
        durationSec: 2,
        startSec: 0,
        width: 320,
        height: 180,
        rotation: 0 as const,
        videoCodec: "h264",
        audioCodec: null,
        hasAudio: false,
        readableByMediabunny: false,
      };
      const plan = { width: 320, height: 180, videoBps: 200_000, audioBps: 0, steppedDown: false };
      await expect(ffmpegEngine.encode(job({ file: garbage, info: fakeInfo, trim: null, plan }))).rejects.toThrow(
        /Invalid data|could not find|moov atom/i
      );

      const good = await makeTestClip({ seconds: 1, width: 320, height: 180, audio: false });
      const out = await ffmpegEngine.encode(job({ file: good, info: await probeWithFfmpeg(good), trim: null, plan }));
      expect((await inspectMp4(out)).videoCodec).toBe("avc");
    },
    TIMEOUT
  );

  test(
    "aborting rejects with ExportCanceledError and the engine works again afterwards",
    async () => {
      const file = await makeTestClip({ seconds: 3, width: 640, height: 360, audio: true, noise: true });
      const info = await probeWithFfmpeg(file);
      const plan = { width: 640, height: 360, videoBps: 800_000, audioBps: 96_000, steppedDown: false };
      const controller = new AbortController();
      const run = ffmpegEngine.encode(
        job({
          file,
          info,
          trim: null,
          plan,
          signal: controller.signal,
          onProgress: (p) => {
            if (p > 0) controller.abort();
          },
        })
      );
      await expect(run).rejects.toBeInstanceOf(ExportCanceledError);

      const small = await makeTestClip({ seconds: 1, width: 320, height: 180, audio: false });
      const again = await ffmpegEngine.encode(
        job({
          file: small,
          info: await probeWithFfmpeg(small),
          trim: null,
          plan: { width: 320, height: 180, videoBps: 200_000, audioBps: 0, steppedDown: false },
        })
      );
      expect((await inspectMp4(again)).videoCodec).toBe("avc");
    },
    TIMEOUT * 2
  );
});
