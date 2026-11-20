"use client";

import { FlipHorizontal2, FlipVertical2, RotateCcw, RotateCw } from "lucide-react";
import { Button } from "@/components/ui";
import type { Rotation } from "@/lib/video/geometry";
import { useVideoStore } from "@/store/useVideoStore";

/** Quarter turns and flips; the store keeps an existing crop on the same part of the picture. */
export function RotatePanel() {
  const rotate = useVideoStore((s) => s.recipe.rotate);
  const flipH = useVideoStore((s) => s.recipe.flipH);
  const flipV = useVideoStore((s) => s.recipe.flipV);
  const updateRecipe = useVideoStore((s) => s.updateRecipe);
  const turn = (degrees: 90 | 270) => updateRecipe({ rotate: ((rotate + degrees) % 360) as Rotation });

  return (
    <div className="grid grid-cols-2 gap-2">
      <Button onClick={() => turn(270)}>
        <RotateCcw className="h-4 w-4" />
        90° left
      </Button>
      <Button onClick={() => turn(90)}>
        <RotateCw className="h-4 w-4" />
        90° right
      </Button>
      <Button onClick={() => updateRecipe({ flipH: !flipH })} className={flipH ? "ring-1 ring-accent" : undefined}>
        <FlipHorizontal2 className="h-4 w-4" />
        Flip horizontal
      </Button>
      <Button onClick={() => updateRecipe({ flipV: !flipV })} className={flipV ? "ring-1 ring-accent" : undefined}>
        <FlipVertical2 className="h-4 w-4" />
        Flip vertical
      </Button>
      <Button
        variant="ghost"
        className="col-span-2"
        disabled={rotate === 0 && !flipH && !flipV}
        onClick={() => updateRecipe({ rotate: 0, flipH: false, flipV: false })}
      >
        Reset
      </Button>
    </div>
  );
}
