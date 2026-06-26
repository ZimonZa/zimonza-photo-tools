"use client";

import {
  FlipHorizontal,
  FlipVertical,
  RotateCcw,
  RotateCw,
  Eraser,
} from "lucide-react";
import { ASPECT_PRESETS } from "@/lib/formats";
import { useImageStore } from "@/store/useImageStore";
import { FieldGroup } from "@/components/ui";
import { cn } from "@/lib/utils";

export function CropPanel() {
  const settings = useImageStore((s) => s.settings);
  const update = useImageStore((s) => s.updateSettings);

  const activeAspect = settings.cropAspect;

  return (
    <div className="space-y-5">
      <FieldGroup title="Aspect ratio">
        <div className="grid grid-cols-4 gap-2">
          {ASPECT_PRESETS.map((preset) => {
            const active =
              (preset.ratio === null && activeAspect === null) ||
              (preset.ratio !== null &&
                activeAspect !== null &&
                Math.abs(preset.ratio - activeAspect) < 0.001);
            return (
              <button
                key={preset.id}
                type="button"
                onClick={() => update({ cropAspect: preset.ratio })}
                className={cn(
                  "rounded-lg border py-2 text-xs font-medium transition-colors",
                  active
                    ? "border-accent bg-accent/10 text-accent"
                    : "border-border text-muted-foreground hover:bg-muted"
                )}
              >
                {preset.label}
              </button>
            );
          })}
        </div>
      </FieldGroup>

      <FieldGroup title="Rotate & flip">
        <div className="grid grid-cols-4 gap-2">
          <OrientButton
            label="Left"
            onClick={() => update({ rotation: (settings.rotation + 270) % 360 })}
          >
            <RotateCcw className="h-4 w-4" />
          </OrientButton>
          <OrientButton
            label="Right"
            onClick={() => update({ rotation: (settings.rotation + 90) % 360 })}
          >
            <RotateCw className="h-4 w-4" />
          </OrientButton>
          <OrientButton
            label="Flip H"
            active={settings.flipH}
            onClick={() => update({ flipH: !settings.flipH })}
          >
            <FlipHorizontal className="h-4 w-4" />
          </OrientButton>
          <OrientButton
            label="Flip V"
            active={settings.flipV}
            onClick={() => update({ flipV: !settings.flipV })}
          >
            <FlipVertical className="h-4 w-4" />
          </OrientButton>
        </div>
      </FieldGroup>

      <button
        type="button"
        onClick={() =>
          update({ crop: null, cropAspect: null, rotation: 0, flipH: false, flipV: false })
        }
        className="inline-flex items-center gap-2 text-sm text-muted-foreground transition-colors hover:text-foreground"
      >
        <Eraser className="h-4 w-4" />
        Reset crop & orientation
      </button>

      <p className="text-xs text-muted-foreground">
        Drag on the image to set the crop area. Rotation and flips are applied to
        the final export.
      </p>
    </div>
  );
}

function OrientButton({
  children,
  label,
  onClick,
  active,
}: {
  children: React.ReactNode;
  label: string;
  onClick: () => void;
  active?: boolean;
}) {
  return (
    <button
      type="button"
      onClick={onClick}
      title={label}
      className={cn(
        "flex flex-col items-center gap-1 rounded-lg border py-2 text-[11px] transition-colors",
        active
          ? "border-accent bg-accent/10 text-accent"
          : "border-border text-muted-foreground hover:bg-muted"
      )}
    >
      {children}
      {label}
    </button>
  );
}
