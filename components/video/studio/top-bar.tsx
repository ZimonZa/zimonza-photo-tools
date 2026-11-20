"use client";

import { RotateCcw } from "lucide-react";
import { QualitySwitch } from "./quality-switch";

/**
 * File name, the New video action and, on desktop, the Preview quality switch (phones show it
 * next to the preview). On desktop the estimate line is laid over the middle of this bar.
 */
export function TopBar({ fileName, onNewVideo }: { fileName: string; onNewVideo: () => void }) {
  return (
    <header className="flex h-14 items-center gap-3 border-b border-border bg-card/60 px-3 lg:col-span-3 lg:col-start-1 lg:row-start-1">
      <span className="max-w-[40%] truncate text-sm font-medium lg:max-w-[18rem]" title={fileName}>
        {fileName}
      </span>
      <button
        type="button"
        onClick={onNewVideo}
        className="ml-auto inline-flex items-center gap-1.5 rounded-lg border border-border px-3 py-1.5 text-sm hover:bg-muted lg:ml-0"
      >
        <RotateCcw className="h-4 w-4" />
        New video
      </button>
      <div className="hidden lg:ml-auto lg:block">
        <QualitySwitch />
      </div>
    </header>
  );
}
