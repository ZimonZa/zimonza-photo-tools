import { describe, expect, test } from "vitest";
import { applyPreset, VIDEO_PRESETS, type PresetId } from "@/lib/video/presets";
import { BASE_RECIPE, MB } from "@/lib/video/recipe";

const byId = (id: PresetId) => {
  const p = VIDEO_PRESETS.find((x) => x.id === id);
  if (!p) throw new Error(`missing preset ${id}`);
  return p;
};
const r = { ...BASE_RECIPE, file: new File([], "a.mp4") };

describe("applyPreset", () => {
  test("Instagram Reel is 1080x1920 cover in mp4", () => {
    expect(applyPreset(r, byId("ig-reel"))).toEqual({
      ...r,
      frame: { kind: "exact", width: 1080, height: 1920, fit: "cover" },
      container: "mp4",
    });
  });
  test("Instagram Post and Square frames", () => {
    expect(applyPreset(r, byId("ig-post")).frame).toEqual({ kind: "exact", width: 1080, height: 1350, fit: "cover" });
    expect(applyPreset(r, byId("ig-square")).frame).toEqual({ kind: "exact", width: 1080, height: 1080, fit: "cover" });
  });
  test("WhatsApp is 1280 long side, balanced quality", () => {
    expect(applyPreset(r, byId("whatsapp"))).toMatchObject({
      frame: { kind: "source", maxLongSide: 1280 },
      size: { kind: "quality", level: "balanced" },
      container: "mp4",
    });
  });
  test("Form upload targets the given MB, default 10", () => {
    expect(applyPreset(r, byId("form"), 25).size).toEqual({ kind: "target", bytes: 25 * MB });
    expect(applyPreset(r, byId("form")).size).toEqual({ kind: "target", bytes: 10 * MB });
  });
  test("Form upload is always MP4, even after WebM was picked", () => {
    expect(applyPreset({ ...r, container: "webm" }, byId("form")).container).toBe("mp4");
  });
  test("Custom changes nothing", () => {
    expect(applyPreset(r, byId("custom"))).toEqual(r);
  });
  test("labels", () => {
    expect(VIDEO_PRESETS.map((p) => p.label)).toEqual([
      "Instagram Reel / Story",
      "Instagram Post (4:5)",
      "Square (1:1)",
      "WhatsApp",
      "Form upload (under … MB)",
      "Custom",
    ]);
  });
});
