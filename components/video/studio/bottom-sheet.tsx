"use client";

import { useEffect, useId, useRef, type ReactNode } from "react";
import { useDialogKeys } from "./use-dialog-keys";

/**
 * Phone-only tool sheet. It sits in the editor's column between the picture and the estimate line
 * / tool bar, so nothing the person is working on is covered: the preview shrinks to make room, the
 * sheet is at most 60 vh and scrolls inside itself, and its title row with Done never scrolls away.
 * Non-modal: Tab may leave it; it takes focus when it opens or changes tool (`focusKey`), and
 * Escape closes it. The caller puts focus back on the tool button.
 */
export function BottomSheet({
  title,
  focusKey,
  onClose,
  children,
}: {
  title: string;
  /** Changes when the sheet should take focus again (another tool opened in it). */
  focusKey: string;
  onClose: () => void;
  children: ReactNode;
}) {
  const ref = useRef<HTMLDivElement>(null);
  const body = useRef<HTMLDivElement>(null);
  const titleId = useId();
  const onKeyDown = useDialogKeys(ref, onClose, { modal: false });

  useEffect(() => {
    body.current?.scrollTo({ top: 0 });
    ref.current?.focus({ preventScroll: true });
  }, [focusKey]);

  return (
    <div
      ref={ref}
      id="tool-sheet"
      role="dialog"
      aria-labelledby={titleId}
      tabIndex={-1}
      onKeyDown={onKeyDown}
      className="glass flex max-h-[60vh] min-h-14 flex-col rounded-t-3xl border-t border-border-strong shadow-glow-lg outline-none lg:hidden"
    >
      <div className="shrink-0 px-4 pt-1.5">
        <div className="mx-auto h-1 w-10 rounded-full bg-border-strong" aria-hidden />
        <div className="flex items-center justify-between">
          <h2 id={titleId} className="font-display text-base font-semibold">
            {title}
          </h2>
          <button
            type="button"
            onClick={onClose}
            className="-mr-2 min-h-11 min-w-11 rounded-lg px-3 text-sm font-medium text-accent hover:bg-muted"
          >
            Done
          </button>
        </div>
      </div>
      <div ref={body} className="min-h-0 flex-1 overflow-y-auto overscroll-contain px-4 pb-4 pt-1">
        {children}
      </div>
    </div>
  );
}
