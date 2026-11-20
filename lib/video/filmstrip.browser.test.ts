import { describe, expect, test } from "vitest";
import { makeFilmstrip } from "@/lib/video/filmstrip";
import { makeTestClip } from "@/lib/video/test-utils/make-clip";

describe("makeFilmstrip", () => {
  test("a 4 s clip gives 5 non-empty JPEG thumbnails", async () => {
    const file = await makeTestClip({ seconds: 4, width: 640, height: 360, audio: false });
    const blobs = await makeFilmstrip(file, 5, 60);
    expect(blobs).toHaveLength(5);
    for (const b of blobs) {
      expect(b.size).toBeGreaterThan(0);
      expect(b.type).toBe("image/jpeg");
    }
  });

  test("a clip that starts at 1 s still gives every thumbnail", async () => {
    const file = await makeTestClip({ seconds: 2, width: 320, height: 180, audio: false, startAt: 1 });
    expect(await makeFilmstrip(file, 4, 40)).toHaveLength(4);
  });

  test("an unreadable file gives an empty array", async () => {
    const junk = new File([new Uint8Array(2048).fill(3)], "junk.mp4", { type: "video/mp4" });
    expect(await makeFilmstrip(junk, 5, 60)).toEqual([]);
  });
});
