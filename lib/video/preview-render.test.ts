import { describe, expect, test } from "vitest";
import type { VideoInfo } from "@/lib/video/engines/types";
import { previewCanvasSize, previewFrame } from "@/lib/video/preview-render";
import { BASE_RECIPE, type EditRecipe } from "@/lib/video/recipe";

const INFO: VideoInfo = {
  durationSec: 10,
  startSec: 0,
  width: 1280,
  height: 720,
  rotation: 0,
  videoCodec: "avc",
  audioCodec: "aac",
  hasAudio: true,
  readableByMediabunny: true,
};

function r(partial: Partial<EditRecipe> = {}): EditRecipe {
  const file = new File([new Uint8Array(1)], "clip.mp4");
  Object.defineProperty(file, "size", { value: 5_000_000 });
  return { ...BASE_RECIPE, file, ...partial };
}

describe("previewCanvasSize", () => {
  test("scales the long side down to 960", () => {
    expect(previewCanvasSize({ width: 1920, height: 1080 })).toEqual({ width: 960, height: 540 });
    expect(previewCanvasSize({ width: 1080, height: 1920 })).toEqual({ width: 540, height: 960 });
  });
  test("never scales up", () => {
    expect(previewCanvasSize({ width: 640, height: 360 })).toEqual({ width: 640, height: 360 });
  });
  test("keeps both sides even", () => {
    expect(previewCanvasSize({ width: 1366, height: 768 })).toEqual({ width: 960, height: 538 });
  });
  test("takes another long-side limit", () => {
    expect(previewCanvasSize({ width: 1280, height: 720 }, 480)).toEqual({ width: 480, height: 270 });
  });
});

describe("previewFrame", () => {
  test("uses the export's plan size, crop and fit", () => {
    expect(previewFrame(INFO, r())).toEqual({
      out: { width: 1280, height: 720 },
      edits: { rotate: 0, flipH: false, flipV: false, crop: null, fit: null },
      trim: null,
    });
    expect(previewFrame(INFO, r({ rotate: 90 })).out).toEqual({ width: 720, height: 1280 });
    expect(previewFrame(INFO, r({ frame: { kind: "exact", width: 1080, height: 1920, fit: "blur" } }))).toMatchObject({
      out: { width: 1080, height: 1920 },
      edits: { fit: "blur" },
    });
  });

  test("passes the clamped crop and the normalized trim", () => {
    const f = previewFrame(INFO, r({ crop: { left: 1, top: 0, width: 5000, height: 361 }, trim: { start: 2, end: 99 } }));
    expect(f.edits.crop).toEqual({ left: 0, top: 0, width: 1280, height: 360 });
    expect(f.trim).toEqual({ start: 2, end: 10 });
  });

  test("still previews the picture when the target is too small to export", () => {
    const f = previewFrame(INFO, r({ size: { kind: "target", bytes: 1000 }, rotate: 90 }));
    expect(f.out).toEqual({ width: 720, height: 1280 });
  });

  test("an invalid output size falls back to the picture's own size", () => {
    const f = previewFrame(INFO, r({ frame: { kind: "exact", width: 0, height: 100, fit: "cover" } }));
    expect(f).toMatchObject({ out: { width: 1280, height: 720 }, edits: { fit: null } });
  });

  test("a trim that is too short plays the whole clip", () => {
    const f = previewFrame(INFO, r({ trim: { start: 5, end: 5.01 } }));
    expect(f.trim).toBeNull();
    expect(f.out).toEqual({ width: 1280, height: 720 });
  });
});
