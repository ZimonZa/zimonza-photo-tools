import { describe, expect, test } from "vitest";
import { initWithBitrateFallback, type BitrateMode } from "@/lib/video/engines/webcodecs";

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
