"use client";

import { VolumeX } from "lucide-react";
import { MB, type Container } from "@/lib/video/recipe";
import { cn } from "@/lib/utils";
import { useVideoStore } from "@/store/useVideoStore";
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
    <div
      data-testid="estimate"
      className={cn("flex min-w-0 flex-wrap items-center justify-center gap-x-2 gap-y-1 text-center text-sm", className)}
    >
      <span className={cn("leading-snug", text.ok ? "font-medium tabular-nums" : "text-amber-500")}>{text.line}</span>
      {recipe.muted && (
        <span className="inline-flex shrink-0 items-center gap-1 rounded-full border border-amber-500/40 bg-amber-500/10 px-2 py-0.5 text-xs text-amber-500">
          <VolumeX className="h-3 w-3" />
          No sound
        </span>
      )}
    </div>
  );
}
