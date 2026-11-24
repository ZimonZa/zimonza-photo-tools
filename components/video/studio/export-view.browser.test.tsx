import { act, createElement, type ReactElement } from "react";
import { createRoot, type Root } from "react-dom/client";
import { afterEach, beforeEach, describe, expect, test, vi } from "vitest";
import { useVideoStore, type ExportState } from "@/store/useVideoStore";
import { ExportView } from "./export-view";
import { useExportGuards } from "./use-export-guards";

(globalThis as { IS_REACT_ACT_ENVIRONMENT?: boolean }).IS_REACT_ACT_ENVIRONMENT = true;

let host: HTMLDivElement;
let root: Root;

async function render(el: ReactElement) {
  await act(async () => root.render(el));
}

beforeEach(() => {
  host = document.createElement("div");
  document.body.append(host);
  root = createRoot(host);
});

afterEach(async () => {
  await act(async () => root.unmount());
  host.remove();
  vi.restoreAllMocks();
});

function Guard({ running }: { running: boolean }) {
  useExportGuards(running);
  return null;
}

function stubWakeLock() {
  const sentinels: { released: boolean; release: ReturnType<typeof vi.fn> }[] = [];
  const request = vi.fn(async () => {
    const s = {
      released: false,
      release: vi.fn(async () => {
        s.released = true;
      }),
    };
    sentinels.push(s);
    return s;
  });
  Object.defineProperty(navigator, "wakeLock", { value: { request }, configurable: true });
  return { request, sentinels };
}

describe("useExportGuards", () => {
  afterEach(() => {
    Reflect.deleteProperty(navigator, "wakeLock");
  });

  test("holds a wake lock and the leave warning only while running, and re-acquires when the tab returns", async () => {
    const { request, sentinels } = stubWakeLock();
    await render(createElement(Guard, { running: false }));
    expect(request).not.toHaveBeenCalled();
    const idle = new Event("beforeunload", { cancelable: true });
    window.dispatchEvent(idle);
    expect(idle.defaultPrevented).toBe(false);

    await render(createElement(Guard, { running: true }));
    expect(request).toHaveBeenCalledTimes(1);
    const warn = new Event("beforeunload", { cancelable: true });
    window.dispatchEvent(warn);
    expect(warn.defaultPrevented).toBe(true);

    // The browser drops the lock when the tab hides; coming back gets it again.
    sentinels[0].released = true;
    await act(async () => document.dispatchEvent(new Event("visibilitychange")));
    expect(request).toHaveBeenCalledTimes(2);

    await render(createElement(Guard, { running: false }));
    expect(sentinels[1].release).toHaveBeenCalled();
    const after = new Event("beforeunload", { cancelable: true });
    window.dispatchEvent(after);
    expect(after.defaultPrevented).toBe(false);
  });

  test("releases on unmount, and works where wake lock is missing or throws", async () => {
    const { sentinels } = stubWakeLock();
    await render(createElement(Guard, { running: true }));
    await act(async () => root.unmount());
    expect(sentinels[0].release).toHaveBeenCalled();
    root = createRoot(host);

    Object.defineProperty(navigator, "wakeLock", {
      value: { request: vi.fn().mockRejectedValue(new Error("denied")) },
      configurable: true,
    });
    await render(createElement(Guard, { running: true }));
    Reflect.deleteProperty(navigator, "wakeLock");
    await render(createElement(Guard, { running: false }));
    await render(createElement(Guard, { running: true }));
  });
});

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

function showExport(exportState: ExportState, actions: Partial<ReturnType<typeof useVideoStore.getState>> = {}) {
  const file = new File([new Uint8Array(1000)], "clip.mp4", { type: "video/mp4" });
  useVideoStore.setState({
    load: { kind: "ready", file, info: INFO, previewUrl: null, proxy: false },
    exportState,
    sizeDraftError: null,
    ...actions,
  });
}

const running = (confirm: { reason: string; estimatedSec: number } | null): ExportState => ({
  kind: "running",
  statusText: "Encoding…",
  progress: 0.4,
  startedAt: Date.now() - 5000,
  confirm,
});

const button = (label: string) => Array.from(document.querySelectorAll("button")).find((b) => b.textContent === label) as HTMLButtonElement;

describe("ExportView", () => {
  test("the slow-engine question: alertdialog copy, Continue says yes, Escape and Cancel say no", async () => {
    const answerFallback = vi.fn();
    showExport(running({ reason: "no H.264 here", estimatedSec: 130 }), { answerFallback });
    await render(createElement(ExportView, { onClose: () => {} }));

    const dialog = document.querySelector('[role="alertdialog"]') as HTMLElement;
    expect(dialog).not.toBeNull();
    expect(dialog.textContent).toContain("Use the slower engine?");
    expect(dialog.textContent).toContain(
      "Your browser can't do this with the fast engine (no H.264 here). The backup engine will take at least about 3 min. Keep this tab open."
    );
    expect(document.activeElement && dialog.contains(document.activeElement)).toBe(true);

    await act(async () => button("Continue").click());
    expect(answerFallback).toHaveBeenLastCalledWith(true);
    await act(async () => dialog.dispatchEvent(new KeyboardEvent("keydown", { key: "Escape", bubbles: true })));
    expect(answerFallback).toHaveBeenLastCalledWith(false);
    const cancels = dialog.querySelectorAll("button");
    await act(async () => Array.from(cancels).find((b) => b.textContent === "Cancel")!.click());
    expect(answerFallback).toHaveBeenCalledTimes(3);
  });

  test("done: result video, size line, Download link and Edit again", async () => {
    const closeResult = vi.fn();
    const blob = new Blob([new Uint8Array(1_234_567)], { type: "video/mp4" });
    showExport(
      {
        kind: "done",
        url: "blob:fake",
        result: {
          blob,
          fileName: "clip-zimonza.mp4",
          engine: "webcodecs",
          width: 1280,
          height: 720,
          attempts: 1,
          steppedDown: false,
          elapsedMs: 10,
          info: INFO,
        },
      },
      { closeResult }
    );
    const onClose = vi.fn();
    await render(createElement(ExportView, { onClose }));
    expect(host.textContent).toContain("1.23 MB · 1280×720");
    const link = document.querySelector("a[download]") as HTMLAnchorElement;
    expect(link.getAttribute("download")).toBe("clip-zimonza.mp4");
    expect(link.getAttribute("href")).toBe("blob:fake");
    expect((document.querySelector("video") as HTMLVideoElement).controls).toBe(true);
    await act(async () => button("Edit again").click());
    expect(closeResult).toHaveBeenCalled();
    expect(onClose).toHaveBeenCalled();
  });

  test("error: message, hint and Back to editor", async () => {
    const closeResult = vi.fn();
    showExport({ kind: "error", message: "Couldn't get the video under 2 MB.", hint: "Try a bigger target." }, { closeResult });
    const onClose = vi.fn();
    await render(createElement(ExportView, { onClose }));
    expect(host.textContent).toContain("Couldn't get the video under 2 MB.");
    expect(host.textContent).toContain("Try a bigger target.");
    await act(async () => button("Back to editor").click());
    expect(closeResult).toHaveBeenCalled();
    expect(onClose).toHaveBeenCalled();
  });

  test("Start export is disabled while a size typed in the Size panel is invalid", async () => {
    showExport({ kind: "idle" }, { sizeDraftError: "That output size is too small." });
    await render(createElement(ExportView, { onClose: () => {} }));
    expect(button("Start export").disabled).toBe(true);
    expect(host.textContent).toContain("That output size is too small.");
  });
});
