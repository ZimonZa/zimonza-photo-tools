"use client";

import { useMemo } from "react";
import { describeExportError } from "@/lib/video/messages";
import { planOutput } from "@/lib/video/plan-output";
import { useVideoStore } from "@/store/useVideoStore";

/** What the current settings would export, or why they can't produce a file. */
export type ExportPlanState =
  | { ok: true; width: number; height: number; steppedDown: boolean; estimatedBytes: number }
  | { ok: false; message: string; hint?: string };

/**
 * Plan the export for the open clip and current settings; null before a clip is ready. A size typed
 * in the Size panel that can't be used counts as a failure, like a planning error.
 */
export function useExportPlan(): ExportPlanState | null {
  const load = useVideoStore((s) => s.load);
  const recipe = useVideoStore((s) => s.recipe);
  const sizeDraftError = useVideoStore((s) => s.sizeDraftError);
  return useMemo(() => {
    if (load.kind !== "ready") return null;
    if (sizeDraftError) return { ok: false, message: sizeDraftError };
    try {
      const { plan, estimatedBytes } = planOutput(load.info, { ...recipe, file: load.file });
      return { ok: true, width: plan.width, height: plan.height, steppedDown: plan.steppedDown, estimatedBytes };
    } catch (e) {
      const d = describeExportError(e, recipe.size.kind === "target" ? recipe.size.bytes : null);
      return { ok: false, message: d?.message ?? "Can't plan this export.", ...(d?.hint ? { hint: d.hint } : {}) };
    }
  }, [load, recipe, sizeDraftError]);
}
