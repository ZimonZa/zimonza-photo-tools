"use client";

import { useEffect, useState, type FormEvent } from "react";
import { Eraser } from "lucide-react";
import { Button, FieldGroup, Slider, UnitField } from "@/components/ui";
import {
  CROP_ASPECTS,
  centredBox,
  centredCrop,
  exactZoom,
  parseFreeSize,
  sameCrop,
  type CropAspectId,
} from "@/lib/video/crop-view";
import { MIN_SIDE } from "@/lib/video/frame";
import type { Size } from "@/lib/video/geometry";
import { cn } from "@/lib/utils";
import { useVideoStore } from "@/store/useVideoStore";
import { MIN_CROP_ZOOM, chipAspect, turnedPicture, useCropView } from "../use-crop-view";

/**
 * Free: the crop's width × height in px of the turned picture. The fields show the current crop's
 * size; Set size shapes the box W/H and zooms so it covers exactly that size (drag places it, zoom
 * still resizes it in that shape). Sizes that aren't whole numbers from 16 up to the picture's
 * sides show a message and are never applied.
 */
function FreeSize({ picture, current, onSet }: { picture: Size; current: Size; onSet(size: Size): void }) {
  const [draft, setDraft] = useState<{ w: string; h: string } | null>(null);
  // The crop changed (a drag, a zoom, Set size): show its size again.
  useEffect(() => setDraft(null), [current.width, current.height]);
  const w = draft?.w ?? String(current.width);
  const h = draft?.h ?? String(current.height);
  const size = parseFreeSize(w, h, picture);
  const min = String(MIN_SIDE);

  const submit = (e: FormEvent) => {
    e.preventDefault();
    if (!draft || !size) return;
    setDraft(null);
    onSet(size);
  };

  return (
    <form onSubmit={submit} className="space-y-2">
      <div className="flex items-end gap-2">
        <UnitField
          label="Width"
          unit="px"
          inputMode="numeric"
          value={w}
          invalid={draft !== null && parseFreeSize(w, min, picture) === null}
          onChange={(t) => setDraft({ w: t, h })}
        />
        <span aria-hidden className="pb-2 text-sm text-muted-foreground">
          ×
        </span>
        <UnitField
          label="Height"
          unit="px"
          inputMode="numeric"
          value={h}
          invalid={draft !== null && parseFreeSize(min, h, picture) === null}
          onChange={(t) => setDraft({ w, h: t })}
        />
      </div>
      {draft !== null && size === null && (
        <p role="alert" className="text-xs text-amber-700 dark:text-amber-500">
          Use whole numbers: width {MIN_SIDE}–{picture.width} px, height {MIN_SIDE}–{picture.height} px.
        </p>
      )}
      <Button type="submit" className="w-full" disabled={draft === null || size === null}>
        Set size
      </Button>
    </form>
  );
}

/**
 * Ratio chips (Free, 1:1, 4:5, 9:16, 16:9, 4:3), zoom, Free's width × height and Reset crop. The
 * crop box itself is in the centre (`CropEditor`). Without a playable preview there is no box, so
 * a ratio or a Free size crops the middle.
 */
export function CropPanel() {
  const load = useVideoStore((s) => s.load);
  const crop = useVideoStore((s) => s.recipe.crop);
  const rotate = useVideoStore((s) => s.recipe.rotate);
  const updateRecipe = useVideoStore((s) => s.updateRecipe);
  const chip = useCropView((s) => s.chip);
  const zoom = useCropView((s) => s.zoom);
  const maxZoom = useCropView((s) => s.maxZoom);
  if (load.kind !== "ready") return null;
  const picture = turnedPicture(load.info, rotate);
  const hasBox = load.previewUrl !== null;
  const current: Size = crop ? { width: crop.width, height: crop.height } : picture;

  const applyCentred = (next: ReturnType<typeof centredCrop>) => {
    if (!sameCrop(next, crop)) updateRecipe({ crop: next });
  };
  const pick = (id: CropAspectId) => {
    // Free starts from the current crop's shape (or the whole picture); a ratio from its own.
    const aspect = id === "free" ? current.width / current.height : chipAspect(id, picture);
    useCropView.getState().pickChip(id, aspect);
    if (!hasBox && id !== "free") applyCentred(centredCrop(picture, aspect));
  };
  const setFree = (size: Size) => {
    if (!hasBox) applyCentred(centredBox(picture, size));
    else useCropView.getState().setShape(size.width / size.height, exactZoom(size, picture));
  };
  const reset = () => {
    useCropView.getState().reset(picture.width / picture.height);
    if (crop) updateRecipe({ crop: null });
  };

  return (
    <div className="space-y-5">
      <FieldGroup title="Ratio">
        <div className="grid grid-cols-3 gap-2">
          {CROP_ASPECTS.map((a) => (
            <button
              key={a.id}
              type="button"
              aria-pressed={chip === a.id}
              onClick={() => pick(a.id)}
              className={cn(
                "rounded-lg border py-2.5 text-sm font-medium transition-all duration-200",
                chip === a.id
                  ? "border-accent/60 bg-accent/10 text-accent shadow-glow"
                  : "border-border text-muted-foreground hover:border-border-strong hover:bg-muted"
              )}
            >
              {a.label}
            </button>
          ))}
        </div>
      </FieldGroup>

      {/* Zoom works with every ratio, so it comes before Free's typed size (and stays near the top of a phone's sheet). */}
      {hasBox && (
        <Slider
          label="Zoom"
          min={MIN_CROP_ZOOM}
          max={maxZoom}
          step={0.1}
          value={zoom}
          display={`${zoom.toFixed(1)}×`}
          onChange={(z) => useCropView.getState().setZoom(z, true)}
        />
      )}

      {chip === "free" && <FreeSize picture={picture} current={current} onSet={setFree} />}

      <p className="text-xs text-muted-foreground">
        {crop ? `Keeps ${crop.width} × ${crop.height} px of the picture.` : "No crop — the whole picture is kept."}
      </p>

      <Button variant="ghost" className="w-full" disabled={!crop} onClick={reset}>
        <Eraser className="h-4 w-4" />
        Reset crop
      </Button>
    </div>
  );
}
