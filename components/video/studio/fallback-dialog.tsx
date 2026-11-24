"use client";

import { useEffect, useRef, type KeyboardEvent } from "react";
import { Button } from "@/components/ui";

/**
 * The slow-engine question. An alert dialog that holds focus until answered; Escape means Cancel.
 * N is the estimated time rounded up to whole minutes ("at least about N min").
 */
export function FallbackDialog({
  reason,
  estimatedSec,
  onAnswer,
}: {
  reason: string;
  estimatedSec: number;
  onAnswer: (ok: boolean) => void;
}) {
  const ref = useRef<HTMLDivElement>(null);
  const minutes = Math.max(1, Math.ceil(estimatedSec / 60));

  useEffect(() => {
    const before = document.activeElement as HTMLElement | null;
    ref.current?.querySelector<HTMLElement>("button")?.focus();
    return () => before?.focus?.();
  }, []);

  const onKeyDown = (e: KeyboardEvent<HTMLDivElement>) => {
    if (e.key === "Escape") {
      e.preventDefault();
      e.stopPropagation();
      onAnswer(false);
    } else if (e.key === "Tab") {
      const items = Array.from(ref.current?.querySelectorAll<HTMLElement>("button") ?? []);
      if (items.length === 0) return;
      const first = items[0];
      const last = items[items.length - 1];
      if (e.shiftKey && document.activeElement === first) {
        e.preventDefault();
        last.focus();
      } else if (!e.shiftKey && document.activeElement === last) {
        e.preventDefault();
        first.focus();
      } else if (!ref.current?.contains(document.activeElement)) {
        e.preventDefault();
        first.focus();
      }
    }
  };

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
          Use the slower engine?
        </h3>
        <p id="fallback-body" className="mt-2 text-sm text-muted-foreground">
          Your browser can&apos;t do this with the fast engine ({reason}). The backup engine will take at least about {minutes} min.
          Keep this tab open.
        </p>
        <div className="mt-4 flex justify-end gap-2">
          <Button onClick={() => onAnswer(false)}>Cancel</Button>
          <Button variant="primary" onClick={() => onAnswer(true)}>
            Continue
          </Button>
        </div>
      </div>
    </div>
  );
}
