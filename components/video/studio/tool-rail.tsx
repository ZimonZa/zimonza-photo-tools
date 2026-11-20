"use client";

import { Crop, Maximize2, RotateCw, Scissors, Volume2, VolumeX } from "lucide-react";
import type { ReactNode } from "react";
import type { ToolId } from "@/store/useVideoStore";
import { cn } from "@/lib/utils";

export const TOOLS: { id: ToolId; label: string }[] = [
  { id: "trim", label: "Trim" },
  { id: "crop", label: "Crop" },
  { id: "size", label: "Size" },
  { id: "rotate", label: "Rotate" },
  { id: "sound", label: "Sound" },
];

function ToolIcon({ id, muted }: { id: ToolId; muted: boolean }): ReactNode {
  const cls = "h-5 w-5";
  switch (id) {
    case "trim":
      return <Scissors className={cls} />;
    case "crop":
      return <Crop className={cls} />;
    case "size":
      return <Maximize2 className={cls} />;
    case "rotate":
      return <RotateCw className={cls} />;
    case "sound":
      return muted ? <VolumeX className={cls} /> : <Volume2 className={cls} />;
  }
}

/** Tool buttons: a vertical rail on desktop, a horizontally scrollable bar on phones. */
export function ToolRail({
  active,
  muted,
  onSelect,
}: {
  active: ToolId;
  muted: boolean;
  onSelect: (t: ToolId) => void;
}) {
  return (
    <nav
      aria-label="Tools"
      className="flex h-full gap-1 overflow-x-auto border-t border-border bg-card/60 px-2 py-1.5 lg:flex-col lg:overflow-visible lg:border-r lg:border-t-0 lg:px-1.5 lg:py-3"
    >
      {TOOLS.map((t) => (
        <button
          key={t.id}
          type="button"
          aria-pressed={active === t.id}
          onClick={() => onSelect(t.id)}
          className={cn(
            "flex min-w-[64px] flex-1 flex-col items-center gap-1 rounded-xl px-2 py-2 text-[11px] font-medium transition-colors lg:flex-none",
            active === t.id ? "bg-accent/15 text-foreground" : "text-muted-foreground hover:bg-muted hover:text-foreground"
          )}
        >
          <ToolIcon id={t.id} muted={muted} />
          {t.label}
        </button>
      ))}
    </nav>
  );
}
