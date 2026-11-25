"use client";

import { useRef, type KeyboardEvent } from "react";
import { Volume2, VolumeX, type LucideIcon } from "lucide-react";
import { cn } from "@/lib/utils";
import { useVideoStore } from "@/store/useVideoStore";

const OPTIONS: { label: "On" | "Off"; muted: boolean; icon: LucideIcon }[] = [
  { label: "On", muted: false, icon: Volume2 },
  { label: "Off", muted: true, icon: VolumeX },
];

/** Sound: On | Off as two large options (a radio group), so a muted export is never a surprise. */
export function SoundPanel() {
  const load = useVideoStore((s) => s.load);
  const muted = useVideoStore((s) => s.recipe.muted);
  const updateRecipe = useVideoStore((s) => s.updateRecipe);
  const refs = useRef<(HTMLButtonElement | null)[]>([]);
  const hasAudio = load.kind === "ready" ? load.info.hasAudio : true;

  const choose = (next: boolean) => {
    if (next !== muted) updateRecipe({ muted: next });
  };
  // Arrow keys move between the two options, like any radio group.
  const onKeyDown = (e: KeyboardEvent) => {
    if (!["ArrowLeft", "ArrowRight", "ArrowUp", "ArrowDown"].includes(e.key)) return;
    e.preventDefault();
    const next = !muted;
    choose(next);
    refs.current[next ? 1 : 0]?.focus();
  };

  return (
    <div className="space-y-3">
      <div className="flex items-center gap-3">
        <span aria-hidden className="text-sm font-medium">
          Sound:
        </span>
        <div role="radiogroup" aria-label="Sound" onKeyDown={onKeyDown} className="grid flex-1 grid-cols-2 gap-2">
          {OPTIONS.map((o, i) => {
            const checked = o.muted === muted;
            const Icon = o.icon;
            return (
              <button
                key={o.label}
                ref={(el) => {
                  refs.current[i] = el;
                }}
                type="button"
                role="radio"
                aria-checked={checked}
                tabIndex={checked ? 0 : -1}
                onClick={() => choose(o.muted)}
                className={cn(
                  "flex min-h-14 items-center justify-center gap-2 rounded-xl border text-base font-semibold transition-all duration-200",
                  checked
                    ? o.muted
                      ? "border-amber-500/60 bg-amber-500/10 text-amber-700 dark:text-amber-500"
                      : "border-accent/60 bg-accent/10 text-accent shadow-glow"
                    : "border-border text-muted-foreground hover:border-border-strong hover:bg-muted"
                )}
              >
                <Icon className="h-5 w-5" />
                {o.label}
              </button>
            );
          })}
        </div>
      </div>
      <p className="text-xs text-muted-foreground">
        {muted
          ? "The exported video will have no sound."
          : hasAudio
            ? "The exported video keeps its sound."
            : "This video has no sound to keep."}
      </p>
    </div>
  );
}
