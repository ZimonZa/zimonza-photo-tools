"use client";

import { useEffect, useId, useRef, useState } from "react";
import { Lock, LockOpen } from "lucide-react";
import { FieldGroup, Segmented, Slider } from "@/components/ui";
import type { VideoInfo } from "@/lib/video/engines/types";
import { checkCustomSide, resolveFrame, type FitMode, type OutputFrame } from "@/lib/video/frame";
import { displaySize, type Size } from "@/lib/video/geometry";
import { customSizeError } from "@/lib/video/messages";
import { cn } from "@/lib/utils";
import { useVideoStore, type RecipeEdits } from "@/store/useVideoStore";

type SizeMode = "original" | "presets" | "custom" | "percent";
type ExactFrame = Extract<OutputFrame, { kind: "exact" }>;

const MODES: { value: SizeMode; label: string }[] = [
  { value: "original", label: "Original" },
  { value: "presets", label: "Presets" },
  { value: "custom", label: "Custom" },
  { value: "percent", label: "Percent" },
];

/** Spec §6.2 preset sizes. */
const PRESET_SIZES: { width: number; height: number; ratio: string }[] = [
  { width: 1080, height: 1920, ratio: "9:16" },
  { width: 1080, height: 1350, ratio: "4:5" },
  { width: 1080, height: 1080, ratio: "1:1" },
  { width: 1920, height: 1080, ratio: "16:9" },
  { width: 1280, height: 720, ratio: "16:9" },
  { width: 854, height: 480, ratio: "16:9" },
];

const LONG_SIDES = [
  { value: "full", label: "Full" },
  { value: "1920", label: "1920" },
  { value: "1280", label: "1280" },
  { value: "854", label: "854" },
];

const FITS: { value: FitMode; label: string }[] = [
  { value: "cover", label: "Crop to fill" },
  { value: "blur", label: "Blurred background" },
];

const DEFAULT_PERCENT = 50;

/** A typed side in px, or null when it isn't a number from 16 to 4096. */
function parseSide(text: string): number | null {
  const c = checkCustomSide(text);
  return "px" in c ? c.px : null;
}

const isPresetSize = (f: OutputFrame) =>
  f.kind === "exact" && PRESET_SIZES.some((p) => p.width === f.width && p.height === f.height);

/** Which mode a frame shows in, unless the person picked Custom for a preset size. */
const modeOf = (f: OutputFrame): SizeMode =>
  f.kind === "source" ? "original" : f.kind === "percent" ? "percent" : isPresetSize(f) ? "presets" : "custom";

/** The output for `frame` before any fit: the frame's own size, or the picture scaled. */
function sizeFor(info: VideoInfo, recipe: RecipeEdits, frame: OutputFrame): Size | null {
  try {
    return resolveFrame({ width: info.width, height: info.height }, recipe.rotate, recipe.crop, frame).base;
  } catch {
    return null;
  }
}

function SideField({ label, value, invalid, onChange }: { label: string; value: string; invalid: boolean; onChange(text: string): void }) {
  const id = useId();
  return (
    <div className="w-full min-w-0">
      <label htmlFor={id} className="mb-1.5 block text-xs font-medium text-muted-foreground">
        {label}
      </label>
      <span
        className={cn(
          "flex items-center rounded-xl border bg-card/60 transition-all duration-200 focus-within:border-accent/60 focus-within:shadow-glow",
          invalid ? "border-amber-500/60" : "border-border"
        )}
      >
        <input
          id={id}
          type="text"
          inputMode="numeric"
          aria-invalid={invalid}
          value={value}
          onChange={(e) => onChange(e.target.value)}
          className="w-full min-w-0 bg-transparent px-3 py-2 text-sm tabular-nums outline-none"
        />
        <span className="pr-3 text-xs font-medium text-muted-foreground">px</span>
      </span>
    </div>
  );
}

/**
 * Width × height as typed, 16 to 4096 px a side. Locked, the other side follows the cropped
 * picture's shape. A size outside that stays in the fields with its message and never reaches the
 * recipe; the store holds the message so the estimate line (and Export) show it too.
 */
function CustomSize({ frame, picture, onFrame }: { frame: ExactFrame; picture: Size; onFrame(f: ExactFrame): void }) {
  const setSizeDraftError = useVideoStore((s) => s.setSizeDraftError);
  const [locked, setLocked] = useState(true);
  const [draft, setDraft] = useState<{ w: string; h: string } | null>(null);
  const w = draft?.w ?? String(frame.width);
  const h = draft?.h ?? String(frame.height);

  // Leaving Custom (or the panel) drops a draft the recipe never had.
  useEffect(() => () => setSizeDraftError(null), [setSizeDraftError]);

  const edit = (side: "w" | "h", text: string) => {
    let nextW = side === "w" ? text : w;
    let nextH = side === "h" ? text : h;
    const typed = Number(text.trim());
    if (locked && text.trim() !== "" && Number.isFinite(typed)) {
      const ratio = picture.width / picture.height;
      if (side === "w") nextH = String(Math.round(typed / ratio));
      else nextW = String(Math.round(typed * ratio));
    }
    const width = parseSide(nextW);
    const height = parseSide(nextH);
    if (width !== null && height !== null) {
      setDraft(null);
      setSizeDraftError(null);
      onFrame({ ...frame, width, height });
    } else {
      setDraft({ w: nextW, h: nextH });
      setSizeDraftError(customSizeError(nextW, nextH));
    }
  };

  return (
    <div className="space-y-2">
      <div className="flex items-end gap-2">
        <SideField label="Width" value={w} invalid={draft !== null && parseSide(w) === null} onChange={(t) => edit("w", t)} />
        <button
          type="button"
          aria-label="Keep the picture's shape"
          aria-pressed={locked}
          title={locked ? "Shape locked to the picture" : "Any shape"}
          onClick={() => setLocked(!locked)}
          className={cn(
            "mb-0.5 flex h-11 w-11 shrink-0 items-center justify-center rounded-lg border transition-colors lg:h-9 lg:w-9",
            locked ? "border-accent bg-accent/10 text-accent" : "border-border text-muted-foreground hover:bg-muted"
          )}
        >
          {locked ? <Lock className="h-4 w-4" /> : <LockOpen className="h-4 w-4" />}
        </button>
        <SideField label="Height" value={h} invalid={draft !== null && parseSide(h) === null} onChange={(t) => edit("h", t)} />
      </div>
      {draft !== null && (
        <p role="alert" className="text-xs text-amber-700 dark:text-amber-500">
          {customSizeError(w, h)}
        </p>
      )}
    </div>
  );
}

/**
 * Output size: Original (optionally capped on the long side), the spec's preset sizes, Custom
 * width × height, or Percent. Original and Percent never enlarge; exact sizes are as typed. When
 * the output's shape differs from the picture, Crop to fill or Blurred background fills it.
 */
export function SizePanel() {
  const load = useVideoStore((s) => s.load);
  const recipe = useVideoStore((s) => s.recipe);
  const updateRecipe = useVideoStore((s) => s.updateRecipe);
  const setSizeDraftError = useVideoStore((s) => s.setSizeDraftError);
  const frame = recipe.frame;
  const [customPicked, setCustomPicked] = useState(false);
  /** The last frame this panel set; any other frame (a preset) shows in its own mode. */
  const own = useRef<OutputFrame | null>(null);

  useEffect(() => {
    if (frame !== own.current) setCustomPicked(false);
  }, [frame]);

  if (load.kind !== "ready") return null;
  const { info } = load;
  const picture =
    sizeFor(info, recipe, { kind: "source", maxLongSide: null }) ?? displaySize({ width: info.width, height: info.height }, recipe.rotate);
  const mode: SizeMode = frame.kind === "exact" && customPicked ? "custom" : modeOf(frame);
  const fit = (() => {
    try {
      return resolveFrame({ width: info.width, height: info.height }, recipe.rotate, recipe.crop, frame).fit;
    } catch {
      return null;
    }
  })();
  const fitMode: FitMode = frame.kind === "exact" ? frame.fit : "cover";

  const setFrame = (next: OutputFrame) => {
    own.current = next;
    updateRecipe({ frame: next });
  };

  const chooseMode = (m: SizeMode) => {
    if (m === mode) return;
    setSizeDraftError(null);
    setCustomPicked(m === "custom");
    if (m === "original") setFrame({ kind: "source", maxLongSide: null });
    else if (m === "percent") setFrame({ kind: "percent", percent: DEFAULT_PERCENT });
    else if (m === "presets") {
      const p = PRESET_SIZES[picture.height > picture.width ? 0 : picture.width > picture.height ? 3 : 2];
      setFrame({ kind: "exact", width: p.width, height: p.height, fit: fitMode });
    } else {
      const out = sizeFor(info, recipe, frame) ?? picture;
      setFrame({ kind: "exact", width: out.width, height: out.height, fit: fitMode });
    }
  };

  return (
    <div className="space-y-5">
      <Segmented<SizeMode> value={mode} onChange={chooseMode} options={MODES} />

      {frame.kind === "source" && (
        <FieldGroup title="Longest side">
          <Segmented
            value={frame.maxLongSide === null ? "full" : String(frame.maxLongSide)}
            onChange={(v) => {
              const maxLongSide = v === "full" ? null : Number(v);
              if (maxLongSide !== frame.maxLongSide) setFrame({ kind: "source", maxLongSide });
            }}
            options={LONG_SIDES}
          />
          <p className="text-xs text-muted-foreground">Never makes the video larger than it is.</p>
        </FieldGroup>
      )}

      {mode === "presets" && frame.kind === "exact" && (
        // Phones: three across, so the fit choice below sits higher in the sheet.
        <div className="grid grid-cols-3 gap-2 lg:grid-cols-2">
          {PRESET_SIZES.map((p) => {
            const active = frame.width === p.width && frame.height === p.height;
            return (
              <button
                key={`${p.width}x${p.height}`}
                type="button"
                aria-pressed={active}
                onClick={() => !active && setFrame({ ...frame, width: p.width, height: p.height })}
                className={cn(
                  "flex flex-col items-center rounded-lg border py-2 text-sm font-medium tabular-nums transition-all duration-200",
                  active
                    ? "border-accent/60 bg-accent/10 text-accent shadow-glow"
                    : "border-border text-muted-foreground hover:border-border-strong hover:bg-muted"
                )}
              >
                {p.width}×{p.height}
                <span className="text-[11px] font-normal opacity-80">{p.ratio}</span>
              </button>
            );
          })}
        </div>
      )}

      {mode === "custom" && frame.kind === "exact" && <CustomSize frame={frame} picture={picture} onFrame={setFrame} />}

      {frame.kind === "percent" && (
        <div className="space-y-2">
          <Slider
            label="Percent of the picture"
            min={1}
            max={100}
            value={frame.percent}
            display={`${frame.percent}%`}
            onChange={(percent) => setFrame({ kind: "percent", percent })}
          />
          <p className="text-xs text-muted-foreground">Never makes the video larger than it is.</p>
        </div>
      )}

      {frame.kind === "exact" && fit !== null && (
        <FieldGroup title="Fill the frame">
          <Segmented<FitMode> value={frame.fit} onChange={(f) => f !== frame.fit && setFrame({ ...frame, fit: f })} options={FITS} />
          <p className="text-xs text-muted-foreground">
            {frame.fit === "cover"
              ? "The picture fills the frame; its edges are cut off."
              : "The whole picture shows, on a blurred copy of itself."}
          </p>
        </FieldGroup>
      )}
    </div>
  );
}
