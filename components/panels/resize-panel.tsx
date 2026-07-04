"use client";

import { Link2, Link2Off } from "lucide-react";
import { RESIZE_PRESETS } from "@/lib/formats";
import { computeDimensions, effectiveSourceSize } from "@/lib/process";
import type { DimensionMode } from "@/lib/types";
import { useImageStore } from "@/store/useImageStore";
import {
  NumberField,
  Segmented,
  SelectField,
  Slider,
  Toggle,
} from "@/components/ui";
import { cn } from "@/lib/utils";

const MODES: { value: DimensionMode; label: string }[] = [
  { value: "original", label: "Original" },
  { value: "px", label: "Pixels" },
  { value: "percent", label: "Percent" },
  { value: "preset", label: "Preset" },
];

export function ResizePanel() {
  const settings = useImageStore((s) => s.settings);
  const update = useImageStore((s) => s.updateSettings);
  const item = useImageStore((s) => s.items.find((i) => i.id === s.selectedId));

  const eff =
    item?.width && item?.height
      ? effectiveSourceSize(item.width, item.height, {
          ...settings,
          crop: item.crop ?? null,
        })
      : { width: 0, height: 0 };
  const srcW = eff.width;
  const srcH = eff.height;
  const out =
    srcW && srcH ? computeDimensions(srcW, srcH, settings) : { width: 0, height: 0 };

  return (
    <div className="space-y-5">
      <Segmented
        value={settings.dimensionMode}
        onChange={(v) => update({ dimensionMode: v })}
        options={MODES}
      />

      {settings.dimensionMode === "px" && (
        <div className="space-y-3">
          <div className="flex items-end gap-2">
            <NumberField
              label="Width"
              value={settings.width}
              suffix="px"
              onChange={(w) => {
                if (settings.lockAspect && w && srcW && srcH) {
                  update({ width: w, height: Math.round((w * srcH) / srcW) });
                } else {
                  update({ width: w });
                }
              }}
            />
            <button
              type="button"
              title={settings.lockAspect ? "Aspect ratio locked" : "Aspect ratio unlocked"}
              onClick={() => update({ lockAspect: !settings.lockAspect })}
              className={cn(
                "mb-1 flex h-9 w-9 shrink-0 items-center justify-center rounded-lg border transition-colors",
                settings.lockAspect
                  ? "border-accent bg-accent/10 text-accent"
                  : "border-border text-muted-foreground hover:bg-muted"
              )}
            >
              {settings.lockAspect ? (
                <Link2 className="h-4 w-4" />
              ) : (
                <Link2Off className="h-4 w-4" />
              )}
            </button>
            <NumberField
              label="Height"
              value={settings.height}
              suffix="px"
              onChange={(h) => {
                if (settings.lockAspect && h && srcW && srcH) {
                  update({ height: h, width: Math.round((h * srcW) / srcH) });
                } else {
                  update({ height: h });
                }
              }}
            />
          </div>
        </div>
      )}

      {settings.dimensionMode === "percent" && (
        <Slider
          label="Scale"
          min={1}
          max={200}
          value={settings.percent}
          display={`${settings.percent}%`}
          onChange={(v) => update({ percent: v })}
        />
      )}

      {settings.dimensionMode === "preset" && (
        <SelectField
          label="Common size"
          value={settings.preset ?? RESIZE_PRESETS[0].id}
          onChange={(v) => update({ preset: v })}
          options={RESIZE_PRESETS.map((p) => ({ value: p.id, label: p.label }))}
        />
      )}

      {settings.dimensionMode !== "original" && (
        <Toggle
          label="Don't enlarge if smaller"
          checked={settings.noEnlarge}
          onChange={(v) => update({ noEnlarge: v })}
        />
      )}

      {item && (
        <div className="flex items-center justify-between rounded-xl border border-accent/20 bg-accent/5 p-3 text-xs text-muted-foreground">
          New size
          <span className="rounded-md bg-accent/15 px-2 py-0.5 font-semibold tabular-nums text-accent">
            {out.width} × {out.height} px
          </span>
        </div>
      )}
    </div>
  );
}
