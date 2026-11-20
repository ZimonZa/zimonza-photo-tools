"use client";

import type { ReactNode } from "react";

/** Phone-only sheet over the lower part of the screen; the preview above it stays visible. */
export function BottomSheet({ title, onClose, children }: { title: string; onClose: () => void; children: ReactNode }) {
  return (
    <div
      role="dialog"
      aria-label={title}
      className="glass fixed inset-x-0 bottom-0 z-40 max-h-[45vh] overflow-y-auto rounded-t-3xl border-t border-border-strong px-4 pb-6 pt-2 shadow-glow-lg lg:hidden"
    >
      <div className="mx-auto mb-2 h-1.5 w-10 rounded-full bg-border-strong" aria-hidden />
      <div className="mb-3 flex items-center justify-between">
        <h2 className="font-display text-base font-semibold">{title}</h2>
        <button
          type="button"
          onClick={onClose}
          className="rounded-lg px-3 py-1.5 text-sm font-medium text-accent hover:bg-muted"
        >
          Done
        </button>
      </div>
      {children}
    </div>
  );
}
