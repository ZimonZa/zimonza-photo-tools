"use client";

import { useEffect, useRef } from "react";
import { Button } from "@/components/ui";
import type { FallbackAnswer } from "@/lib/video/export";
import { fallbackReasonText } from "@/lib/video/messages";
import { useDialogKeys } from "./use-dialog-keys";

/**
 * The slow-engine question. An alert dialog that holds focus until answered; Escape means Cancel.
 * N is the estimated time rounded up to whole minutes ("at least about N min"). `reason` is the
 * engine's own; it shows as a plain phrase (`fallbackReasonText`).
 *
 * `mp4Instead` (WebM this device can't make quickly, MP4 it can): MP4 comes first and has the
 * focus, then "Make WebM anyway" (the backup engine), then Cancel, one under the other.
 */
export function FallbackDialog({
  reason,
  estimatedSec,
  mp4Instead = false,
  onAnswer,
}: {
  reason: string;
  estimatedSec: number;
  mp4Instead?: boolean;
  onAnswer: (answer: FallbackAnswer) => void;
}) {
  const ref = useRef<HTMLDivElement>(null);
  const minutes = Math.max(1, Math.ceil(estimatedSec / 60));

  useEffect(() => {
    const before = document.activeElement as HTMLElement | null;
    ref.current?.querySelector<HTMLElement>("button")?.focus();
    return () => before?.focus?.();
  }, []);

  const onKeyDown = useDialogKeys(ref, () => onAnswer("cancel"));
  return (
    <div className="absolute inset-0 z-10 flex items-center justify-center bg-black/60 p-4">
      <div
        ref={ref}
        role="alertdialog"
        aria-modal="true"
        aria-labelledby="fallback-title"
        aria-describedby="fallback-body"
        onKeyDown={onKeyDown}
        className="glass w-full max-w-sm rounded-2xl border border-border-strong p-5 shadow-glow-lg"
      >
        <h3 id="fallback-title" className="font-display text-base font-semibold">
          {mp4Instead ? "Make WebM with the slower engine?" : "Use the slower engine?"}
        </h3>
        {mp4Instead ? (
          <>
            <p id="fallback-body" className="mt-2 text-sm text-muted-foreground">
              This browser can&apos;t make WebM quickly. MP4 plays almost everywhere WebM does and will be ready at normal
              speed. WebM on the backup engine will take at least about {minutes} min.
            </p>
            <div className="mt-4 flex flex-col gap-2">
              <Button variant="primary" onClick={() => onAnswer("mp4")}>
                Export as MP4
              </Button>
              <Button onClick={() => onAnswer("continue")}>Make WebM anyway</Button>
              <Button variant="ghost" onClick={() => onAnswer("cancel")}>
                Cancel
              </Button>
            </div>
          </>
        ) : (
          <>
            <p id="fallback-body" className="mt-2 text-sm text-muted-foreground">
              Your browser can&apos;t do this with the fast engine ({fallbackReasonText(reason)}). The backup engine will take at
              least about {minutes} min. Keep this tab open.
            </p>
            <div className="mt-4 flex justify-end gap-2">
              <Button onClick={() => onAnswer("cancel")}>Cancel</Button>
              <Button variant="primary" onClick={() => onAnswer("continue")}>
                Continue
              </Button>
            </div>
          </>
        )}
      </div>
    </div>
  );
}
