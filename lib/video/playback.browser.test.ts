import { describe, expect, test } from "vitest";
import { ExportCanceledError } from "@/lib/video/errors";
import { probeVideo } from "@/lib/video/export";
import { canPlayNatively, makePreviewProxy } from "@/lib/video/playback";
import { makeTestClip } from "@/lib/video/test-utils/make-clip";
import { inspectMp4 } from "@/lib/video/test-utils/mp4";

describe("canPlayNatively", () => {
  test("true for an H.264 clip the browser can decode", async () => {
    const file = await makeTestClip({ seconds: 1, width: 320, height: 180, audio: false });
    expect(await canPlayNatively(file)).toBe(true);
  });

  test("false for bytes that are not a video", async () => {
    const junk = new File([new Uint8Array(4096).fill(7)], "junk.mp4", { type: "video/mp4" });
    expect(await canPlayNatively(junk, 3000)).toBe(false);
  });
});

describe("makePreviewProxy", () => {
  test("a small upright H.264 copy with the long side at 640", async () => {
    const file = await makeTestClip({ seconds: 1, width: 1280, height: 720, audio: true });
    const info = await probeVideo(file);
    const proxy = await makePreviewProxy(file, info, new AbortController().signal);
    expect(proxy).not.toBeNull();
    expect(await inspectMp4(proxy!)).toMatchObject({ videoCodec: "avc", width: 640, height: 360, rotation: 0 });
  });

  test("null when the fast engine can't read the file", async () => {
    const file = await makeTestClip({ seconds: 1, width: 320, height: 180, audio: false });
    const info = { ...(await probeVideo(file)), readableByMediabunny: false };
    expect(await makePreviewProxy(file, info, new AbortController().signal)).toBeNull();
  });

  test("a cancel rejects instead of resolving null", async () => {
    const file = await makeTestClip({ seconds: 1, width: 320, height: 180, audio: false });
    const info = await probeVideo(file);
    const controller = new AbortController();
    controller.abort();
    await expect(makePreviewProxy(file, info, controller.signal)).rejects.toBeInstanceOf(ExportCanceledError);
  });
});
