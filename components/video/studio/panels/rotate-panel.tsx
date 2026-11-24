"use client";

import type { ReactNode } from "react";
import { FlipHorizontal2, FlipVertical2, RotateCcw, RotateCw } from "lucide-react";
import { Button } from "@/components/ui";
import type { Rotation } from "@/lib/video/geometry";
import { cn } from "@/lib/utils";
import { useVideoStore } from "@/store/useVideoStore";

function OrientButton({
  children,
  onClick,
  pressed,
}: {
  children: ReactNode;
  onClick: () => void;
  /** Flips show whether they are on; turns leave it out. */
  pressed?: boolean;
}) {
  return (
    <button
      type="button"
      aria-pressed={pressed}
      onClick={onClick}
      className={cn(
        "flex min-h-14 flex-col items-center justify-center gap-1 rounded-xl border px-2 py-2 text-sm font-medium transition-all duration-200",
        pressed
          ? "border-accent/60 bg-accent/10 text-accent shadow-glow"
          : "border-border text-foreground hover:border-border-strong hover:bg-muted"
      )}
    >
      {children}
    </button>
  );
}

const summary = (rotate: Rotation, flipH: boolean, flipV: boolean) => {
  const parts = [rotate === 0 ? "Upright" : `Turned ${rotate}° right`];
  if (flipH) parts.push("flipped horizontally");
  if (flipV) parts.push("flipped vertically");
  return parts.join(", ") + ".";
};

/** ⟲ 90° left, ⟳ 90° right, flips and Reset; the store keeps an existing crop on the same part of the picture. */
export function RotatePanel() {
  const rotate = useVideoStore((s) => s.recipe.rotate);
  const flipH = useVideoStore((s) => s.recipe.flipH);
  const flipV = useVideoStore((s) => s.recipe.flipV);
  const updateRecipe = useVideoStore((s) => s.updateRecipe);
  const turn = (degrees: 90 | 270) => updateRecipe({ rotate: ((rotate + degrees) % 360) as Rotation });

  return (
    <div className="space-y-3">
      <div className="grid grid-cols-2 gap-2">
        <OrientButton onClick={() => turn(270)}>
          <RotateCcw className="h-5 w-5" />
          90° left
        </OrientButton>
        <OrientButton onClick={() => turn(90)}>
          <RotateCw className="h-5 w-5" />
          90° right
        </OrientButton>
        <OrientButton pressed={flipH} onClick={() => updateRecipe({ flipH: !flipH })}>
          <FlipHorizontal2 className="h-5 w-5" />
          Flip horizontal
        </OrientButton>
        <OrientButton pressed={flipV} onClick={() => updateRecipe({ flipV: !flipV })}>
          <FlipVertical2 className="h-5 w-5" />
          Flip vertical
        </OrientButton>
      </div>
      <p className="text-xs text-muted-foreground">{summary(rotate, flipH, flipV)}</p>
      <Button
        variant="ghost"
        className="w-full"
        disabled={rotate === 0 && !flipH && !flipV}
        onClick={() => updateRecipe({ rotate: 0, flipH: false, flipV: false })}
      >
        Reset
      </Button>
    </div>
  );
}
