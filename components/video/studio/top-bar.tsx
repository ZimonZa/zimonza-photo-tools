"use client";

import { useEffect, useState, type ReactNode } from "react";
import { RotateCcw } from "lucide-react";
import { SelectField } from "@/components/ui";
import { VIDEO_PRESETS, type PresetId } from "@/lib/video/presets";
import { useVideoStore } from "@/store/useVideoStore";
import { QualitySwitch } from "./quality-switch";

/** Smallest and largest "under N MB" a person can ask for. */
const MIN_TARGET_MB = 0.1;
const MAX_TARGET_MB = 4000;

const mbText = (mb: number) => String(Number(mb.toFixed(2)));

function parseMb(text: string): number | null {
  const trimmed = text.trim().replace(",", ".");
  const n = Number(trimmed);
  return trimmed !== "" && Number.isFinite(n) && n >= MIN_TARGET_MB && n <= MAX_TARGET_MB ? n : null;
}

/**
 * The destination preset. "Form upload (under … MB)" first asks for the limit in a small field
 * (default the store's target, 10 MB) and applies on Apply or Enter. A hand edit anywhere turns
 * the store's preset to Custom, which this shows.
 */
function PresetPicker() {
  const presetId = useVideoStore((s) => s.presetId);
  const targetMb = useVideoStore((s) => s.targetMb);
  const choosePreset = useVideoStore((s) => s.choosePreset);
  const setTargetMb = useVideoStore((s) => s.setTargetMb);
  const [asking, setAsking] = useState(false);
  const [draft, setDraft] = useState(() => mbText(targetMb));

  // Applying a preset, or a hand edit that turns it Custom, ends the question.
  useEffect(() => setAsking(false), [presetId]);

  const mb = parseMb(draft);
  const options = VIDEO_PRESETS.map((p) => ({
    value: p.id,
    label: p.id === "form" && presetId === "form" ? `Form upload (under ${mbText(targetMb)} MB)` : p.label,
  }));

  const pick = (id: PresetId) => {
    if (id === "form") {
      setDraft(mbText(targetMb));
      setAsking(true);
      return;
    }
    setAsking(false);
    choosePreset(id);
  };
  const apply = () => {
    if (mb === null) return;
    setTargetMb(mb); // re-applies the preset when it is already Form upload
    if (useVideoStore.getState().presetId !== "form") choosePreset("form");
    setAsking(false);
  };

  // Two header items: on phones the MB field takes its own row under the bar's first row.
  return (
    <>
      <div className="order-2 w-40 min-w-0 shrink lg:w-52">
        <SelectField<PresetId> ariaLabel="Preset" value={asking ? "form" : presetId} onChange={pick} options={options} />
      </div>
      {(asking || presetId === "form") && (
        <form
          className="order-4 flex w-full shrink-0 items-center justify-end gap-1.5 lg:order-3 lg:w-auto"
          onSubmit={(e) => {
            e.preventDefault();
            apply();
          }}
        >
          <span className="flex items-center rounded-xl border border-border bg-card/60 transition-all duration-200 focus-within:border-accent/60 focus-within:shadow-glow">
            <input
              type="text"
              inputMode="decimal"
              aria-label="Target size in MB"
              aria-invalid={mb === null}
              value={draft}
              onChange={(e) => setDraft(e.target.value)}
              className="w-14 bg-transparent py-2 pl-3 text-sm tabular-nums outline-none"
            />
            <span className="pr-3 text-xs font-medium text-muted-foreground">MB</span>
          </span>
          <button
            type="submit"
            disabled={mb === null}
            className="rounded-xl bg-gradient-to-r from-accent to-accent2 px-3 py-2 text-sm font-medium text-accent-foreground transition-all hover:brightness-110 disabled:cursor-not-allowed disabled:opacity-50"
          >
            Apply
          </button>
        </form>
      )}
    </>
  );
}

/**
 * File name, destination preset and New video; on desktop also the estimate line in the middle
 * and the Preview quality switch on the right (phones show the estimate under the timeline and the
 * switch next to the preview). The far right is kept for the Export button.
 */
export function TopBar({
  fileName,
  onNewVideo,
  estimate,
}: {
  fileName: string;
  onNewVideo: () => void;
  /** Desktop only: the estimate line, placed between the left group and the quality switch. */
  estimate?: ReactNode;
}) {
  return (
    <header className="flex min-h-14 flex-wrap items-center gap-x-3 gap-y-2 border-b border-border bg-card/60 px-3 py-2 lg:col-span-3 lg:col-start-1 lg:row-start-1 lg:flex-nowrap">
      <span
        className="order-1 min-w-0 max-w-[30%] truncate text-sm font-medium lg:max-w-[12rem] lg:shrink-0"
        title={fileName}
      >
        {fileName}
      </span>
      <PresetPicker />
      <button
        type="button"
        onClick={onNewVideo}
        title="New video"
        className="order-3 ml-auto inline-flex shrink-0 items-center gap-1.5 rounded-lg border border-border px-2.5 py-1.5 text-sm hover:bg-muted lg:order-4 lg:ml-0 lg:px-3"
      >
        <RotateCcw className="h-4 w-4" />
        <span className="sr-only lg:not-sr-only">New video</span>
      </button>
      {estimate && <div className="order-5 hidden min-w-0 flex-1 justify-center px-2 lg:flex">{estimate}</div>}
      <div className="order-6 hidden shrink-0 lg:ml-auto lg:block">
        <QualitySwitch />
      </div>
    </header>
  );
}
