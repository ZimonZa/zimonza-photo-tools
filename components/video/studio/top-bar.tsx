"use client";

import { useEffect, useState, type ReactNode } from "react";
import { Download, RotateCcw } from "lucide-react";
import { SelectField } from "@/components/ui";
import { mbText, parseMb } from "@/lib/video/target-mb";
import { VIDEO_PRESETS, type PresetId } from "@/lib/video/presets";
import { useVideoStore } from "@/store/useVideoStore";
import { QualitySwitch } from "./quality-switch";
import { useExportPlan } from "./use-export-plan";

/**
 * The destination preset. "Form upload (under … MB)" first asks for the limit in a small field
 * (default the store's target, 10 MB) and applies on Apply or Enter. A hand edit anywhere turns
 * the store's preset to Custom, which this shows.
 */
function PresetPicker() {
  const presetId = useVideoStore((s) => s.presetId);
  const recipe = useVideoStore((s) => s.recipe);
  const targetMb = useVideoStore((s) => s.targetMb);
  const choosePreset = useVideoStore((s) => s.choosePreset);
  const setTargetMb = useVideoStore((s) => s.setTargetMb);
  const [asking, setAsking] = useState(false);
  const [draft, setDraft] = useState(() => mbText(targetMb));

  // Applying a preset, or any edit to the recipe (which turns the preset Custom), ends the question.
  useEffect(() => setAsking(false), [presetId, recipe]);

  const dismiss = () => {
    setAsking(false);
    setDraft(mbText(targetMb));
  };
  // Escape drops the question wherever the focus is.
  useEffect(() => {
    if (!asking) return;
    const onKey = (e: KeyboardEvent) => e.key === "Escape" && dismiss();
    window.addEventListener("keydown", onKey);
    return () => window.removeEventListener("keydown", onKey);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [asking]);

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
      <div className="order-2 w-28 min-w-0 shrink-0 lg:w-52 lg:shrink">
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
          {asking && (
            <button
              type="button"
              onClick={dismiss}
              className="rounded-xl border border-border px-3 py-2 text-sm hover:bg-muted"
            >
              Cancel
            </button>
          )}
        </form>
      )}
    </>
  );
}

/**
 * The file name. Phones give it the room left on the bar's one row, in two small lines (camera and
 * messenger names like "VID_20261124_153012.mp4" fit whole); computers keep one line cut at the end.
 */
function FileName({ name }: { name: string }) {
  return (
    <span
      title={name}
      className="order-1 line-clamp-2 min-w-0 flex-1 basis-0 break-all text-xs font-medium lg:block lg:max-w-[12rem] lg:flex-none lg:basis-auto lg:truncate lg:break-normal lg:text-sm lg:line-clamp-none"
    >
      {name}
    </span>
  );
}

/**
 * File name, destination preset and New video; on desktop also the estimate line in the middle
 * and the Preview quality switch on the right (phones show the estimate under the timeline and the
 * switch next to the preview). The far right is the Export button. Phones keep all of it on one row
 * (the Form upload size field takes a second row while it shows).
 */
export function TopBar({
  fileName,
  onNewVideo,
  estimate,
  onExport,
}: {
  fileName: string;
  onNewVideo: () => void;
  /** Desktop only: the estimate line, placed between the left group and the quality switch. */
  estimate?: ReactNode;
  /** Opens the export view. */
  onExport: () => void;
}) {
  const plan = useExportPlan();
  // A target that's too small stays exportable: the export view explains it and holds the MB field
  // (the hint's fix), and keeps Start off until it works. Every other problem is fixed in the editor.
  const canOpen = plan !== null && (plan.ok || plan.targetTooSmall === true);
  const problem = plan && !plan.ok ? [plan.message, plan.hint].filter(Boolean).join(" ") : null;
  return (
    <header className="flex min-h-14 shrink-0 flex-wrap items-center gap-x-2 gap-y-2 border-b border-border bg-card/60 px-3 py-1.5 lg:col-span-3 lg:col-start-1 lg:row-start-1 lg:flex-nowrap lg:gap-x-3 lg:py-2">
      <FileName name={fileName} />
      <PresetPicker />
      <button
        type="button"
        onClick={onNewVideo}
        title="New video"
        className="order-3 inline-flex w-11 shrink-0 items-center justify-center gap-1.5 rounded-lg border border-border text-sm hover:bg-muted lg:order-4 lg:w-auto lg:justify-start lg:px-3 lg:py-1.5"
      >
        <RotateCcw className="h-4 w-4" />
        <span className="sr-only lg:not-sr-only">New video</span>
      </button>
      <button
        type="button"
        onClick={onExport}
        disabled={!canOpen}
        title={problem ?? "Export"}
        className="order-3 inline-flex shrink-0 items-center gap-1.5 rounded-lg bg-gradient-to-r from-accent to-accent2 px-3 text-sm font-medium text-accent-foreground transition-all hover:brightness-110 disabled:cursor-not-allowed disabled:opacity-50 lg:order-7 lg:py-1.5"
      >
        <Download className="h-4 w-4" />
        Export
      </button>
      {estimate && <div className="order-5 hidden min-w-0 flex-1 justify-center px-2 lg:flex">{estimate}</div>}
      <div className="order-6 hidden shrink-0 lg:ml-auto lg:block">
        <QualitySwitch />
      </div>
    </header>
  );
}
