"use client";

import { useEffect } from "react";

interface WakeLockSentinelLike {
  released: boolean;
  release(): Promise<void>;
}
type WakeLockNavigator = Navigator & { wakeLock?: { request(type: "screen"): Promise<WakeLockSentinelLike> } };

/**
 * While an export runs: keep the screen awake (where the browser can) and warn before the page is
 * closed or reloaded. Both are released when it stops, is canceled, or the component goes away.
 */
export function useExportGuards(running: boolean): void {
  useEffect(() => {
    if (!running) return;
    let stopped = false;
    let sentinel: WakeLockSentinelLike | null = null;

    const acquire = async () => {
      try {
        const wakeLock = (navigator as WakeLockNavigator).wakeLock;
        if (!wakeLock || (sentinel && !sentinel.released)) return;
        const next = await wakeLock.request("screen");
        if (stopped) void next.release().catch(() => {});
        else sentinel = next;
      } catch {
        // Not allowed or not supported: exporting still works.
      }
    };
    const onVisible = () => {
      if (document.visibilityState === "visible") void acquire();
    };
    const onBeforeUnload = (e: BeforeUnloadEvent) => {
      e.preventDefault();
      e.returnValue = "";
    };

    void acquire();
    document.addEventListener("visibilitychange", onVisible);
    window.addEventListener("beforeunload", onBeforeUnload);
    return () => {
      stopped = true;
      document.removeEventListener("visibilitychange", onVisible);
      window.removeEventListener("beforeunload", onBeforeUnload);
      void sentinel?.release().catch(() => {});
      sentinel = null;
    };
  }, [running]);
}
