"use client";

import { Eraser } from "lucide-react";
import { Button, FieldGroup, Slider } from "@/components/ui";
import { CROP_ASPECTS, centredCrop, sameCrop, type CropAspectId } from "@/lib/video/crop-view";
import { cn } from "@/lib/utils";
import { useVideoStore } from "@/store/useVideoStore";
import { MAX_CROP_ZOOM, MIN_CROP_ZOOM, chipAspect, turnedPicture, useCropView } from "../crop-editor";

/**
 * Ratio chips (Free, 1:1, 4:5, 9:16, 16:9, 4:3), zoom and Reset crop. The crop box itself is in the
 * centre (`CropEditor`). Without a playable preview there is no box, so a ratio crops the middle.
 */
export function CropPanel() {
  const load = useVideoStore((s) => s.load);
  const crop = useVideoStore((s) => s.recipe.crop);
  const rotate = useVideoStore((s) => s.recipe.rotate);
  const updateRecipe = useVideoStore((s) => s.updateRecipe);
  const chip = useCropView((s) => s.chip);
  const zoom = useCropView((s) => s.zoom);
  if (load.kind !== "ready") return null;
  const picture = turnedPicture(load.info, rotate);
  const hasBox = load.previewUrl !== null;

  const pick = (id: CropAspectId) => {
    const aspect = chipAspect(id, picture);
    useCropView.getState().pickChip(id, aspect);
    if (!hasBox) {
      const next = id === "free" ? null : centredCrop(picture, aspect);
      if (!sameCrop(next, crop)) updateRecipe({ crop: next });
    }
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

      {hasBox && (
        <Slider
          label="Zoom"
          min={MIN_CROP_ZOOM}
          max={MAX_CROP_ZOOM}
          step={0.1}
          value={zoom}
          display={`${zoom.toFixed(1)}×`}
          onChange={(z) => useCropView.getState().setZoom(z, true)}
        />
      )}

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
