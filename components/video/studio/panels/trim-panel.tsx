"use client";

import { useEffect, useId, useState } from "react";
import { Button } from "@/components/ui";
import { dragTrim, trimOrNull } from "@/lib/video/timeline";
import { useVideoStore } from "@/store/useVideoStore";

/** A seconds field with one decimal. Edits are kept as text while typing and applied on Enter or leaving the field. */
function SecondsField({ label, value, onCommit }: { label: string; value: number; onCommit(sec: number): void }) {
  const id = useId();
  const shown = value.toFixed(1);
  const [draft, setDraft] = useState<string | null>(null);
  useEffect(() => setDraft(null), [shown]);

  const commit = () => {
    const parsed = Number(draft);
    setDraft(null);
    if (draft !== null && draft.trim() !== "" && Number.isFinite(parsed)) onCommit(parsed);
  };
  return (
    <div className="block w-full">
      <label htmlFor={id} className="mb-1.5 block text-xs font-medium text-muted-foreground">
        {label}
      </label>
      <input
        id={id}
        type="number"
        inputMode="decimal"
        step={0.1}
        min={0}
        value={draft ?? shown}
        onChange={(e) => setDraft(e.target.value)}
        onBlur={commit}
        onKeyDown={(e) => e.key === "Enter" && commit()}
        className="w-full rounded-xl border border-border bg-card/60 px-3 py-2 text-sm tabular-nums outline-none transition-all duration-200 focus:border-accent/60 focus:shadow-glow"
      />
    </div>
  );
}

/** Start and end in seconds, buttons that take them from the playhead, and a reset. */
export function TrimPanel() {
  const load = useVideoStore((s) => s.load);
  const trim = useVideoStore((s) => s.recipe.trim);
  const currentTime = useVideoStore((s) => s.currentTime);
  const updateRecipe = useVideoStore((s) => s.updateRecipe);
  if (load.kind !== "ready") return null;
  const duration = load.info.durationSec;
  const range = trim ?? { start: 0, end: duration };
  const move = (handle: "start" | "end", t: number) =>
    updateRecipe({ trim: trimOrNull(dragTrim(range, handle, t, duration), duration, handle) });

  return (
    <div className="space-y-3">
      <div className="grid grid-cols-2 gap-3">
        <SecondsField label="Start (s)" value={range.start} onCommit={(t) => move("start", t)} />
        <SecondsField label="End (s)" value={range.end} onCommit={(t) => move("end", t)} />
      </div>
      <div className="grid grid-cols-2 gap-2">
        <Button className="px-2" onClick={() => move("start", currentTime)}>
          Use playhead as start
        </Button>
        <Button className="px-2" onClick={() => move("end", currentTime)}>
          Use playhead as end
        </Button>
      </div>
      <Button variant="ghost" className="w-full" disabled={trim === null} onClick={() => updateRecipe({ trim: null })}>
        Reset trim
      </Button>
    </div>
  );
}
