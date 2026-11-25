import { act, createElement, type ReactElement } from "react";
import { createRoot, type Root } from "react-dom/client";
import { afterEach, beforeEach, describe, expect, test } from "vitest";
import { useVideoStore, type QualityState } from "@/store/useVideoStore";
import { PreviewPlayer } from "./preview-player";
import { Timeline } from "./timeline";

(globalThis as { IS_REACT_ACT_ENVIRONMENT?: boolean }).IS_REACT_ACT_ENVIRONMENT = true;

const INFO = {
  durationSec: 6,
  startSec: 0,
  width: 1280,
  height: 720,
  rotation: 0 as const,
  videoCodec: "avc1",
  audioCodec: "mp4a",
  hasAudio: true,
  readableByMediabunny: true,
};

let host: HTMLDivElement;
let root: Root;

async function render(el: ReactElement) {
  await act(async () => root.render(el));
}

beforeEach(() => {
  host = document.createElement("div");
  host.style.width = "800px";
  host.style.height = "500px";
  document.body.append(host);
  root = createRoot(host);
});

afterEach(async () => {
  await act(async () => root.unmount());
  host.remove();
});

function showPlayer(quality: Partial<QualityState>) {
  const file = new File([new Uint8Array(1000)], "clip.mp4", { type: "video/mp4" });
  useVideoStore.setState((s) => ({
    load: { kind: "ready", file, info: INFO, previewUrl: null, proxy: false },
    quality: { ...s.quality, enabled: true, mode: "original", url: null, ...quality },
  }));
  return render(createElement(PreviewPlayer, { file, info: INFO, previewUrl: null, proxy: false }));
}

describe("PreviewPlayer", () => {
  test("the sample's estimated size shows only while that sample is ready, never an older one's", async () => {
    await showPlayer({ status: "ready", estimatedBytes: 5_000_000 });
    expect(host.textContent).toContain("Estimated size 5.00 MB");
    // New settings: a new sample is on its way; the old number is no longer this clip's.
    await act(async () => useVideoStore.setState((s) => ({ quality: { ...s.quality, status: "idle" } })));
    expect(host.textContent).not.toContain("Estimated size");
    await act(async () => useVideoStore.setState((s) => ({ quality: { ...s.quality, status: "working" } })));
    expect(host.textContent).not.toContain("Estimated size");
    await act(async () =>
      useVideoStore.setState((s) => ({ quality: { ...s.quality, status: "ready", estimatedBytes: 2_500_000 } }))
    );
    expect(host.textContent).toContain("Estimated size 2.50 MB");
  });
});

describe("without playback (the browser can't play the file and no proxy could be made)", () => {
  test("the preview shows an icon and a short explanation, not placeholder boxes that never fill", async () => {
    await showPlayer({ enabled: false });
    const box = host.querySelector('[data-testid="no-playback"]') as HTMLElement;
    expect(box).not.toBeNull();
    expect(box.querySelector("svg")).not.toBeNull();
    expect(box.textContent).toContain("No preview in this browser");
    expect(box.textContent).toContain("This browser can't play this file, but it can still be converted.");
    expect(box.querySelectorAll("div:empty")).toHaveLength(0);
  });

  test("the timeline says it has no thumbnails instead of a bare strip", async () => {
    const file = new File([new Uint8Array(1000)], "clip.avi", { type: "video/x-msvideo" });
    const info = { ...INFO, readableByMediabunny: false };
    useVideoStore.setState((s) => ({
      load: { kind: "ready", file, info, previewUrl: null, proxy: false },
      recipe: { ...s.recipe, trim: null },
    }));
    await render(createElement(Timeline, { file, info }));
    const track = host.querySelector('[data-testid="timeline-track"]') as HTMLElement;
    expect(track.textContent).toContain("No thumbnails for this video");
    expect(track.querySelector("svg")).not.toBeNull();
    // The trim handles and the playhead still work on it.
    expect(host.querySelectorAll('[role="slider"]')).toHaveLength(3);
  });
});
