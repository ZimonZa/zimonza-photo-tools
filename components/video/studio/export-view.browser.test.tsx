import { act, createElement, useState, type ReactElement } from "react";
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
  attempt: 1,
  startedAt: Date.now() - 5000,
  passStartedAt: Date.now() - 5000,
  confirm,
});

const button = (label: string) => Array.from(document.querySelectorAll("button")).find((b) => b.textContent === label) as HTMLButtonElement;

describe("ExportView", () => {
  test("the slow-engine question: alertdialog copy, Continue says yes, Escape and Cancel say no", async () => {
    const answerFallback = vi.fn();
    showExport(running({ reason: "This browser can't encode H.264 at 3840×2160.", estimatedSec: 130 }), { answerFallback });
    await render(createElement(ExportView, { onClose: () => {} }));

    const dialog = document.querySelector('[role="alertdialog"]') as HTMLElement;
    expect(dialog).not.toBeNull();
    expect(dialog.textContent).toContain("Use the slower engine?");
    expect(dialog.textContent).toContain(
      "Your browser can't do this with the fast engine (it can't encode H.264 at 3840×2160). The backup engine will take at least about 3 min. Keep this tab open."
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

  test("the slow-engine question never shows an engine's own error text", async () => {
    showExport(running({ reason: "EncodingError: Encoder failure (0x80004005)", estimatedSec: 30 }));
    await render(createElement(ExportView, { onClose: () => {} }));
    const dialog = document.querySelector('[role="alertdialog"]') as HTMLElement;
    expect(dialog.textContent).toContain("(it ran into a problem with this video)");
    expect(dialog.textContent).not.toContain("EncodingError");
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

  test("done, muted: the No sound badge shows with the result too", async () => {
    const result = {
      blob: new Blob([new Uint8Array(10)]),
      fileName: "clip-zimonza.mp4",
      engine: "webcodecs" as const,
      width: 1280,
      height: 720,
      attempts: 1,
      steppedDown: false,
      elapsedMs: 10,
      info: INFO,
    };
    showExport({ kind: "done", url: "blob:fake", result });
    useVideoStore.setState((s) => ({ recipe: { ...s.recipe, muted: true } }));
    await render(createElement(ExportView, { onClose: () => {} }));
    expect(host.textContent).toContain("No sound");
    await act(async () => useVideoStore.setState((s) => ({ recipe: { ...s.recipe, muted: false } })));
    expect(host.textContent).not.toContain("No sound");
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

  describe("progress", () => {
    const bar = () => document.querySelector('[role="progressbar"]') as HTMLElement;
    const withSize = (size: ReturnType<typeof useVideoStore.getState>["recipe"]["size"]) =>
      useVideoStore.setState((s) => ({ recipe: { ...s.recipe, size } }));
    afterEach(() => withSize({ kind: "quality", level: "balanced" }));

    test("a finished pass of a target-size export never shows 100%; the next pass says why it runs", async () => {
      showExport({ ...running(null), progress: 1, attempt: 1 } as ExportState);
      withSize({ kind: "target", bytes: 2_000_000 });
      await render(createElement(ExportView, { onClose: () => {} }));
      expect(bar().getAttribute("aria-valuenow")).toBe("99");
      expect(host.textContent).toContain("99%");
      expect(host.textContent).not.toContain("100%");
      expect(host.textContent).toContain("Pass 1 of up to 4");

      await act(async () =>
        useVideoStore.setState({ exportState: { ...running(null), progress: 0.3, attempt: 2 } as ExportState })
      );
      expect(bar().getAttribute("aria-valuenow")).toBe("30");
      expect(host.textContent).toContain("Pass 2 of up to 4 — adjusting size");
      expect(bar().getAttribute("aria-valuetext")).toBe("Pass 2 of up to 4 — adjusting size, 30%");
    });

    test("time left: elapsed stays, the pass's own guess joins it once it means something", async () => {
      const t0 = Date.now();
      showExport({ ...running(null), progress: 0.5, attempt: 1, startedAt: t0 - 30_000, passStartedAt: t0 - 10_000 } as ExportState);
      await render(createElement(ExportView, { onClose: () => {} }));
      expect(host.textContent).toContain("Elapsed 0:30");
      expect(host.textContent).toMatch(/About 1\d s left(?! in this pass)/);

      // Too early in a pass (under 5% or 2 s): no guess at all.
      await act(async () =>
        useVideoStore.setState({ exportState: { ...running(null), progress: 0.04, passStartedAt: Date.now() - 10_000 } as ExportState })
      );
      expect(host.textContent).not.toContain("left");
      await act(async () =>
        useVideoStore.setState({ exportState: { ...running(null), progress: 0.5, passStartedAt: Date.now() - 1000 } as ExportState })
      );
      expect(host.textContent).not.toContain("left");

      // A target size may run more passes, so the guess is for this one.
      withSize({ kind: "target", bytes: 2_000_000 });
      await act(async () =>
        useVideoStore.setState({
          exportState: { ...running(null), progress: 0.1, attempt: 2, passStartedAt: Date.now() - 10_000 } as ExportState,
        })
      );
      expect(host.textContent).toContain("About 2 min left in this pass");
    });

    test("a one-pass export shows only the percent", async () => {
      showExport({ ...running(null), progress: 1, attempt: 1 } as ExportState);
      await render(createElement(ExportView, { onClose: () => {} }));
      expect(bar().getAttribute("aria-valuenow")).toBe("99");
      expect(host.textContent).not.toContain("Pass ");
    });
  });

  test("Start export is disabled while a size typed in the Size panel is invalid", async () => {
    showExport({ kind: "idle" }, { sizeDraftError: "That output size is too small." });
    await render(createElement(ExportView, { onClose: () => {} }));
    expect(button("Start export").disabled).toBe(true);
    expect(host.textContent).toContain("That output size is too small.");
  });

  describe("focus and keyboard", () => {
    const panel = () => document.querySelector('[role="dialog"]') as HTMLElement;
    const inside = () => panel().contains(document.activeElement) && document.activeElement !== document.body;
    const press = (key: string, init: KeyboardEventInit = {}) => {
      const e = new KeyboardEvent("keydown", { key, bubbles: true, cancelable: true, ...init });
      (document.activeElement ?? document.body).dispatchEvent(e);
      return e;
    };

    test("focus stays inside the dialog after each step change", async () => {
      showExport({ kind: "idle" });
      await render(createElement(ExportView, { onClose: () => {} }));
      expect(inside()).toBe(true);
      const start = button("Start export");
      start.focus();
      await act(async () => useVideoStore.setState({ exportState: running(null) }));
      expect(inside()).toBe(true);
      await act(async () =>
        useVideoStore.setState({ exportState: { kind: "error", message: "Nope." } })
      );
      expect(inside()).toBe(true);
      button("Back to editor").focus();
      await act(async () => useVideoStore.setState({ exportState: { kind: "idle" } }));
      expect(inside()).toBe(true);
    });

    test("Tab and Shift+Tab cycle within the dialog", async () => {
      showExport({ kind: "idle" });
      await render(createElement(ExportView, { onClose: () => {} }));
      const items = Array.from(
        panel().querySelectorAll<HTMLElement>("button:not([disabled]), a[href], input, select, textarea")
      );
      const first = items[0];
      const last = items[items.length - 1];
      last.focus();
      let e!: KeyboardEvent;
      await act(async () => {
        e = press("Tab");
      });
      expect(e.defaultPrevented).toBe(true);
      expect(document.activeElement).toBe(first);
      await act(async () => {
        e = press("Tab", { shiftKey: true });
      });
      expect(e.defaultPrevented).toBe(true);
      expect(document.activeElement).toBe(last);
    });

    test("Escape closes on idle, done and error (the last two via closeResult) and does nothing while running", async () => {
      const closeResult = vi.fn();
      const onClose = vi.fn();
      const result = {
        blob: new Blob([new Uint8Array(10)]),
        fileName: "a.mp4",
        engine: "webcodecs" as const,
        width: 2,
        height: 2,
        attempts: 1,
        steppedDown: false,
        elapsedMs: 1,
        info: INFO,
      };
      showExport({ kind: "idle" }, { closeResult });
      await render(createElement(ExportView, { onClose }));

      await act(async () => void press("Escape"));
      expect(onClose).toHaveBeenCalledTimes(1);
      expect(closeResult).not.toHaveBeenCalled();

      await act(async () => useVideoStore.setState({ exportState: running(null) }));
      await act(async () => void press("Escape"));
      expect(onClose).toHaveBeenCalledTimes(1);

      await act(async () => useVideoStore.setState({ exportState: { kind: "done", url: "blob:x", result } }));
      await act(async () => void press("Escape"));
      expect(closeResult).toHaveBeenCalledTimes(1);
      expect(onClose).toHaveBeenCalledTimes(2);

      await act(async () => useVideoStore.setState({ exportState: { kind: "error", message: "No." } }));
      await act(async () => void press("Escape"));
      expect(closeResult).toHaveBeenCalledTimes(2);
      expect(onClose).toHaveBeenCalledTimes(3);
    });

    test("Escape in the slow-engine question only answers it; Tab stays inside it", async () => {
      const answerFallback = vi.fn();
      const onClose = vi.fn();
      showExport(running({ reason: "x", estimatedSec: 10 }), { answerFallback });
      await render(createElement(ExportView, { onClose }));
      const dialog = document.querySelector('[role="alertdialog"]') as HTMLElement;
      const buttons = Array.from(dialog.querySelectorAll("button"));
      buttons[buttons.length - 1].focus();
      let e!: KeyboardEvent;
      await act(async () => {
        e = press("Tab");
      });
      expect(document.activeElement).toBe(buttons[0]);
      await act(async () => void press("Escape"));
      expect(answerFallback).toHaveBeenCalledWith(false);
      expect(onClose).not.toHaveBeenCalled();
      expect(e.defaultPrevented).toBe(true);
    });
  });

  describe("focus returns to the Export button on close", () => {
    function Harness() {
      const [open, setOpen] = useState(false);
      return createElement(
        "div",
        null,
        createElement("button", { id: "export-trigger", onClick: () => setOpen(true) }, "Export"),
        open ? createElement(ExportView, { onClose: () => setOpen(false) }) : null
      );
    }
    const doneState = (): ExportState => ({
      kind: "done",
      url: "blob:x",
      result: {
        blob: new Blob([new Uint8Array(10)]),
        fileName: "a.mp4",
        engine: "webcodecs",
        width: 2,
        height: 2,
        attempts: 1,
        steppedDown: false,
        elapsedMs: 1,
        info: INFO,
      },
    });
    const trigger = () => document.getElementById("export-trigger") as HTMLButtonElement;
    const escape = () => document.activeElement!.dispatchEvent(new KeyboardEvent("keydown", { key: "Escape", bubbles: true, cancelable: true }));

    async function open(state: ExportState) {
      showExport(state, { closeResult: vi.fn() });
      await render(createElement(Harness));
      trigger().focus();
      await act(async () => trigger().click());
      expect(document.querySelector('[role="dialog"]')).not.toBeNull();
    }
    const closed = () => {
      expect(document.querySelector('[role="dialog"]')).toBeNull();
      expect(document.activeElement).toBe(trigger());
    };

    test("from settings: Close button and Escape", async () => {
      await open({ kind: "idle" });
      await act(async () => button("Close").click());
      closed();
      await act(async () => trigger().click());
      await act(async () => void escape());
      closed();
    });

    test("from the result: Edit again and Escape", async () => {
      await open(doneState());
      await act(async () => button("Edit again").click());
      closed();
      await act(async () => trigger().click());
      await act(async () => void escape());
      closed();
    });

    test("from the error: Back to editor", async () => {
      await open({ kind: "error", message: "No." });
      await act(async () => button("Back to editor").click());
      closed();
    });
  });
});
