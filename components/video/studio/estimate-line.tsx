"use client";

import { MB, type Container } from "@/lib/video/recipe";
import { cn } from "@/lib/utils";
import { useVideoStore } from "@/store/useVideoStore";
import { NoSoundBadge } from "./no-sound-badge";
import { useExportPlan } from "./use-export-plan";

const FORMAT: Record<Container, string> = { mp4: "MP4", webm: "WebM" };

/**
 * "≈ X MB · W×H · MP4", or in amber why the settings can't produce a file (a size typed in the
 * Size panel that can't be used, or a planning error with its hint), plus a No sound badge.
 */
export function EstimateLine({ className }: { className?: string }) {
  const recipe = useVideoStore((s) => s.recipe);
  const plan = useExportPlan();
  if (!plan) return null;
  const text = plan.ok
    ? { ok: true as const, line: `≈ ${(plan.estimatedBytes / MB).toFixed(1)} MB · ${plan.width}×${plan.height} · ${FORMAT[recipe.container]}` }
    : { ok: false as const, line: plan.hint ? `${plan.message} ${plan.hint}` : plan.message };
  return (
    // Polite live region: a screen reader hears it when the settings stop (or start) producing a file.
    <div
      data-testid="estimate"
      aria-live="polite"
      aria-atomic="true"
      className={cn("flex min-w-0 flex-wrap items-center justify-center gap-x-2 gap-y-1 text-center text-sm", className)}
    >
      <span className={cn("leading-snug", text.ok ? "font-medium tabular-nums" : "text-amber-700 dark:text-amber-500")}>{text.line}</span>
      {recipe.muted && <NoSoundBadge />}
    </div>
  );
}
