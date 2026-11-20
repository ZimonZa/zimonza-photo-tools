import { describe, expect, test } from "vitest";
import type { VideoInfo } from "@/lib/video/engines/types";
import {
  checkFastEngine,
  initWithBitrateFallback,
  type BitrateMode,
  type DeviceEncoders,
} from "@/lib/video/engines/webcodecs";

type Discard = { reason: string; track: { isVideoTrack(): boolean } };

function fakeConversion(discardedTracks: Discard[]) {
  return { discardedTracks, disposed: false };
}

const videoTrack = { isVideoTrack: () => true };
const audioTrack = { isVideoTrack: () => false };

describe("initWithBitrateFallback", () => {
  test("keeps constant bitrate when the device can encode with it", async () => {
    const modes: BitrateMode[] = [];
    const result = await initWithBitrateFallback(
      async (mode) => {
        modes.push(mode);
        return fakeConversion([]);
      },
      async (c) => {
        c.disposed = true;
      }
    );
    expect(result.mode).toBe("constant");
    expect(modes).toEqual(["constant"]);
  });

  test("retries with variable bitrate when constant can't encode the video", async () => {
    const modes: BitrateMode[] = [];
    const first = fakeConversion([{ reason: "no_encodable_target_codec", track: videoTrack }]);
    const second = fakeConversion([]);
    const result = await initWithBitrateFallback(
      async (mode) => {
        modes.push(mode);
        return mode === "constant" ? first : second;
      },
      async (c) => {
        c.disposed = true;
      }
    );
    expect(modes).toEqual(["constant", "variable"]);
    expect(result).toEqual({ conversion: second, mode: "variable" });
    expect(first.disposed).toBe(true);
  });

  test("does not retry for problems a bitrate mode can't fix", async () => {
    const modes: BitrateMode[] = [];
    await initWithBitrateFallback(
      async (mode) => {
        modes.push(mode);
        return fakeConversion([
          { reason: "undecodable_source_codec", track: videoTrack },
          { reason: "no_encodable_target_codec", track: audioTrack },
        ]);
      },
      async () => {}
    );
    expect(modes).toEqual(["constant"]);
  });
});

describe("checkFastEngine", () => {
  const INFO: VideoInfo = {
    durationSec: 10,
    startSec: 0,
    width: 640,
    height: 360,
    rotation: 0,
    videoCodec: "avc",
    audioCodec: "aac",
    hasAudio: true,
    readableByMediabunny: true,
  };
  const WITH_AUDIO = { width: 640, height: 360, videoBps: 1_000_000, audioBps: 96_000, steppedDown: false };
  const MUTED = { ...WITH_AUDIO, audioBps: 0 };
  const encoders = (o: Partial<DeviceEncoders> = {}): DeviceEncoders => ({
    hasVideoEncoder: () => true,
    canEncodeVideo: async () => true,
    canEncodeAudio: async () => true,
    ...o,
  });
  const noOpus = encoders({ canEncodeAudio: async (codec) => codec !== "opus" });

  test("WebM with audio needs an Opus encoder, and a smaller size wouldn't help", async () => {
    expect(await checkFastEngine(INFO, WITH_AUDIO, "webm", noOpus)).toEqual({
      ok: false,
      reason: "This browser can't encode Opus audio for WebM.",
    });
  });

  test("Opus doesn't matter without audio, or for MP4 (AAC has a software encoder)", async () => {
    expect(await checkFastEngine(INFO, MUTED, "webm", noOpus)).toEqual({ ok: true });
    expect(await checkFastEngine({ ...INFO, hasAudio: false, audioCodec: null }, WITH_AUDIO, "webm", noOpus)).toEqual({
      ok: true,
    });
    expect(await checkFastEngine(INFO, WITH_AUDIO, "mp4", encoders({ canEncodeAudio: async () => false }))).toEqual({
      ok: true,
    });
  });

  test("a video size the device can't encode may work smaller", async () => {
    expect(await checkFastEngine(INFO, WITH_AUDIO, "mp4", encoders({ canEncodeVideo: async () => false }))).toEqual({
      ok: false,
      reason: "This browser can't encode H.264 at 640×360.",
      smallerMayWork: true,
    });
  });

  test("tries variable bitrate when constant can't encode", async () => {
    const modes: BitrateMode[] = [];
    const check = await checkFastEngine(
      INFO,
      WITH_AUDIO,
      "mp4",
      encoders({
        canEncodeVideo: async (_c, _p, mode) => {
          modes.push(mode);
          return mode === "variable";
        },
      })
    );
    expect(check).toEqual({ ok: true });
    expect(modes).toEqual(["constant", "variable"]);
  });
});
