"use client";

import { useCallback, useEffect, useRef, useState } from "react";
import { Download, Loader2, VolumeX, X } from "lucide-react";
import { Button, FieldGroup, Segmented } from "@/components/ui";
import { cn } from "@/lib/utils";
import { MAX_TARGET_MB, MIN_TARGET_MB, mbText, parseMb } from "@/lib/video/target-mb";
import { MB, type Container, type QualityLevel } from "@/lib/video/recipe";
import { useVideoStore } from "@/store/useVideoStore";
import { FallbackDialog } from "./fallback-dialog";
import { QualitySwitch } from "./quality-switch";
import { useDialogKeys } from "./use-dialog-keys";
import { useExportGuards } from "./use-export-guards";
import { useExportPlan } from "./use-export-plan";

const FORMATS: { value: Container; label: string }[] = [
  { value: "mp4", label: "MP4" },
  { value: "webm", label: "WebM" },
];
const SIZE_MODES: { value: "quality" | "target"; label: string }[] = [
  { value: "quality", label: "Best quality" },
  { value: "target", label: "Target" },
];
const LEVELS: { value: QualityLevel; label: string }[] = [
  { value: "high", label: "High" },
  { value: "balanced", label: "Balanced" },
  { value: "small", label: "Small" },
];

const TARGET_MESSAGE = "Enter a size from " + MIN_TARGET_MB + " to " + MAX_TARGET_MB + " MB.";

const clock = (ms: number) => {
  const s = Math.max(0, Math.floor(ms / 1000));
  return Math.floor(s / 60) + ":" + String(s % 60).padStart(2, "0");
};

function NoSoundBadge() {
  return (
    <span className="inline-flex shrink-0 items-center gap-1 rounded-full border border-amber-500/40 bg-amber-500/10 px-2 py-0.5 text-xs text-amber-500">
      <VolumeX className="h-3 w-3" />
      No sound
    </span>
  );
}

/** Format, size, the planned result and Start export. Edits go straight to the recipe, so the estimate stays live. */
function SettingsStep({ onClose }: { onClose: () => void }) {
  const recipe = useVideoStore((s) => s.recipe);
  const targetMb = useVideoStore((s) => s.targetMb);
  const updateRecipe = useVideoStore((s) => s.updateRecipe);
  const startExport = useVideoStore((s) => s.startExport);
  const plan = useExportPlan();
  const [draft, setDraft] = useState(() => mbText(recipe.size.kind === "target" ? recipe.size.bytes / MB : targetMb));
  const mb = parseMb(draft);
  const isTarget = recipe.size.kind === "target";
  const draftInvalid = isTarget && mb === null;
  const blocked = !plan?.ok || draftInvalid;

  const setTarget = (text: string) => {
    setDraft(text);
    const n = parseMb(text);
    if (n !== null) updateRecipe({ size: { kind: "target", bytes: Math.round(n * MB) } });
  };

  return (
    <div className="space-y-5">
      <FieldGroup title="Format">
        <Segmented<Container> value={recipe.container} onChange={(container) => updateRecipe({ container })} options={FORMATS} />
      </FieldGroup>

      <FieldGroup title="Size">
        <Segmented<"quality" | "target">
          value={recipe.size.kind}
          onChange={(kind) => {
            if (kind === recipe.size.kind) return;
            if (kind === "quality") updateRecipe({ size: { kind: "quality", level: "balanced" } });
            else setTarget(draft);
          }}
          options={SIZE_MODES}
        />
        {recipe.size.kind === "quality" ? (
          <Segmented<QualityLevel>
            value={recipe.size.level}
            onChange={(level) => updateRecipe({ size: { kind: "quality", level } })}
            options={LEVELS}
          />
        ) : (
          <div className="space-y-1.5">
            <span
              className={cn(
                "flex items-center rounded-xl border bg-card/60 transition-all duration-200 focus-within:border-accent/60 focus-within:shadow-glow",
                draftInvalid ? "border-amber-500/60" : "border-border"
              )}
            >
              <input
                type="text"
                inputMode="decimal"
                aria-label="Target size (MB)"
                aria-invalid={draftInvalid}
                value={draft}
                onChange={(e) => setTarget(e.target.value)}
                className="w-full min-w-0 bg-transparent px-3 py-2 text-sm tabular-nums outline-none"
              />
              <span className="pr-3 text-xs font-medium text-muted-foreground">MB</span>
            </span>
            <p className="text-xs text-muted-foreground">The file will never be bigger than this.</p>
          </div>
        )}
      </FieldGroup>

      <div className="space-y-2 rounded-xl border border-border bg-card/40 p-3 text-sm">
        {plan?.ok ? (
          <>
            <p data-testid="export-resolution" className="font-medium tabular-nums">
              {plan.width}×{plan.height}
              {plan.steppedDown && <span className="ml-2 text-xs font-normal text-muted-foreground">lowered to fit</span>}
            </p>
            <p data-testid="export-estimate" className="tabular-nums text-muted-foreground">
              ≈ {(plan.estimatedBytes / MB).toFixed(1)} MB
            </p>
          </>
        ) : (
          plan && (
            <p role="alert" className="leading-snug text-amber-500">
              {plan.message}
              {plan.hint && " " + plan.hint}
            </p>
          )
        )}
        {draftInvalid && (
          <p role="alert" className="leading-snug text-amber-500">
            {TARGET_MESSAGE}
          </p>
        )}
        {recipe.muted && <NoSoundBadge />}
      </div>

      <div className="lg:hidden">
        <QualitySwitch />
      </div>

      <div className="flex gap-2">
        <Button variant="outline" onClick={onClose} className="flex-1">
          Close
        </Button>
        <Button variant="primary" disabled={blocked} onClick={() => void startExport()} className="flex-[2]">
          Start export
        </Button>
      </div>
    </div>
  );
}

function RunningStep({ onClose }: { onClose: () => void }) {
  const state = useVideoStore((s) => s.exportState);
  const muted = useVideoStore((s) => s.recipe.muted);
  const cancelExport = useVideoStore((s) => s.cancelExport);
  const answerFallback = useVideoStore((s) => s.answerFallback);
  const [tick, setTick] = useState(() => Date.now());
  useEffect(() => {
    const id = setInterval(() => setTick(Date.now()), 500);
    return () => clearInterval(id);
  }, []);
  if (state.kind !== "running") return null;
  const percent = Math.round(Math.min(1, Math.max(0, state.progress)) * 100);
  return (
    <div className="space-y-4">
      <div className="flex items-center gap-2 text-sm">
        <Loader2 className="h-4 w-4 animate-spin text-accent" />
        <span role="status">{state.statusText}</span>
      </div>
      <div
        role="progressbar"
        aria-label="Export progress"
        aria-valuemin={0}
        aria-valuemax={100}
        aria-valuenow={percent}
        className="h-2.5 overflow-hidden rounded-full bg-muted"
      >
        <div className="h-full rounded-full bg-gradient-to-r from-accent to-accent2 transition-all" style={{ width: percent + "%" }} />
      </div>
      <div className="flex items-center justify-between text-xs tabular-nums text-muted-foreground">
        <span>{percent}%</span>
        <span>Elapsed {clock(tick - state.startedAt)}</span>
      </div>
      {muted && <NoSoundBadge />}
      <Button
        onClick={() => {
          cancelExport();
          onClose();
        }}
        className="w-full"
      >
        Cancel
      </Button>
      {state.confirm && (
        <FallbackDialog reason={state.confirm.reason} estimatedSec={state.confirm.estimatedSec} onAnswer={answerFallback} />
      )}
    </div>
  );
}

function DoneStep({ onClose }: { onClose: () => void }) {
  const state = useVideoStore((s) => s.exportState);
  const closeResult = useVideoStore((s) => s.closeResult);
  if (state.kind !== "done") return null;
  const { result, url } = state;
  return (
    <div className="space-y-4">
      <video aria-label="Exported video" src={url} controls playsInline className="max-h-[50vh] w-full rounded-xl bg-black" />
      <p className="text-center text-sm font-medium tabular-nums">
        {(result.blob.size / MB).toFixed(2)} MB · {result.width}×{result.height}
      </p>
      <div className="flex gap-2">
        <Button
          onClick={() => {
            closeResult();
            onClose();
          }}
          className="flex-1"
        >
          Edit again
        </Button>
        <a
          href={url}
          download={result.fileName}
          className="inline-flex flex-[2] items-center justify-center gap-2 rounded-xl bg-gradient-to-r from-accent to-accent2 px-4 py-2 text-sm font-medium text-accent-foreground shadow-glow transition-all hover:brightness-110 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring"
        >
          <Download className="h-4 w-4" />
          Download
        </a>
      </div>
    </div>
  );
}

function ErrorStep({ onClose }: { onClose: () => void }) {
  const state = useVideoStore((s) => s.exportState);
  const closeResult = useVideoStore((s) => s.closeResult);
  if (state.kind !== "error") return null;
  return (
    <div className="space-y-4">
      <div role="alert" className="space-y-1 text-sm">
        <p className="text-amber-500">{state.message}</p>
        {state.hint && <p className="text-muted-foreground">{state.hint}</p>}
      </div>
      <Button
        onClick={() => {
          closeResult();
          onClose();
        }}
        className="w-full"
      >
        Back to editor
      </Button>
    </div>
  );
}

/**
 * The export screen: a modal over the editor on computers, the whole screen on phones. Settings,
 * then progress with Cancel, then the result or the error. While it runs the screen stays awake and
 * leaving the page asks first.
 */
export function ExportView({ onClose }: { onClose: () => void }) {
  const load = useVideoStore((s) => s.load);
  const kind = useVideoStore((s) => s.exportState.kind);
  const closeResult = useVideoStore((s) => s.closeResult);
  const panel = useRef<HTMLDivElement>(null);
  useExportGuards(kind === "running");

  // Escape leaves the view: from settings straight away, from a result or error back to the editor.
  // While exporting it does nothing; stopping takes the Cancel button.
  const leave = useCallback(() => {
    if (kind === "running") return;
    if (kind !== "idle") closeResult();
    onClose();
  }, [kind, closeResult, onClose]);
  const onKeyDown = useDialogKeys(panel, leave);

  // Declared first: it must note where focus was (the Export button) before any effect moves it in.
  useEffect(() => {
    const before = document.activeElement as HTMLElement | null;
    return () => before?.focus?.();
  }, []);
  // Each step swaps the buttons under the cursor; keep focus in the dialog.
  useEffect(() => {
    const el = panel.current;
    if (el && (!el.contains(document.activeElement) || document.activeElement === document.body)) el.focus();
  }, [kind]);

  if (load.kind !== "ready") return null;
  const title =
    kind === "running" ? "Exporting…" : kind === "done" ? "Your video is ready" : kind === "error" ? "Export failed" : "Export";

  return (
    <div className="fixed inset-0 z-50 bg-background/80 backdrop-blur-sm lg:flex lg:items-center lg:justify-center lg:p-6">
      <div
        ref={panel}
        role="dialog"
        aria-modal="true"
        aria-label="Export"
        tabIndex={-1}
        onKeyDown={onKeyDown}
        className="relative flex h-full w-full flex-col overflow-y-auto bg-card p-5 outline-none lg:h-auto lg:max-h-full lg:max-w-md lg:rounded-2xl lg:border lg:border-border-strong lg:shadow-glow-lg"
      >
        <div className="mb-4 flex items-center justify-between">
          <h2 className="font-display text-lg font-semibold">{title}</h2>
          {kind === "idle" && (
            <button type="button" aria-label="Close" onClick={onClose} className="rounded-lg p-1.5 text-muted-foreground hover:bg-muted">
              <X className="h-5 w-5" />
            </button>
          )}
        </div>
        {kind === "idle" && <SettingsStep onClose={onClose} />}
        {kind === "running" && <RunningStep onClose={onClose} />}
        {kind === "done" && <DoneStep onClose={onClose} />}
        {kind === "error" && <ErrorStep onClose={onClose} />}
      </div>
    </div>
  );
}
