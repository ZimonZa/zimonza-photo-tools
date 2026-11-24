"use client";

import { useMemo } from "react";
import { VolumeX } from "lucide-react";
import { describeExportError } from "@/lib/video/messages";
import { planOutput } from "@/lib/video/plan-output";
import { MB, type Container } from "@/lib/video/recipe";
import { cn } from "@/lib/utils";
import { useVideoStore } from "@/store/useVideoStore";

const FORMAT: Record<Container, string> = { mp4: "MP4", webm: "WebM" };

/**
 * "≈ X MB · W×H · MP4", or in amber why the settings can't produce a file (a size typed in the
 * Size panel that can't be used, or a planning error with its hint), plus a No sound badge.
 */
export function EstimateLine({ className }: { className?: string }) {
  const load = useVideoStore((s) => s.load);
  const recipe = useVideoStore((s) => s.recipe);
  const sizeDraftError = useVideoStore((s) => s.sizeDraftError);
  const text = useMemo(() => {
    if (load.kind !== "ready") return null;
    if (sizeDraftError) return { ok: false as const, line: sizeDraftError };
    try {
      const { plan, estimatedBytes } = planOutput(load.info, { ...recipe, file: load.file });
      return {
        ok: true as const,
        line: `≈ ${(estimatedBytes / MB).toFixed(1)} MB · ${plan.width}×${plan.height} · ${FORMAT[recipe.container]}`,
      };
    } catch (e) {
      const d = describeExportError(e, recipe.size.kind === "target" ? recipe.size.bytes : null);
      return { ok: false as const, line: d ? (d.hint ? `${d.message} ${d.hint}` : d.message) : "Can't plan this export." };
    }
  }, [load, recipe, sizeDraftError]);
  if (!text) return null;
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
