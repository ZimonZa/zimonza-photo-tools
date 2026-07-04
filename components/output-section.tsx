"use client";

import { OUTPUT_FORMAT_LIST, OUTPUT_FORMATS, type OutputFormat } from "@/lib/formats";
import { useImageStore } from "@/store/useImageStore";
import { NumberField, Segmented, Slider, Toggle } from "@/components/ui";

export function OutputSection() {
  const settings = useImageStore((s) => s.settings);
  const update = useImageStore((s) => s.updateSettings);
  const format = OUTPUT_FORMATS[settings.format];

  return (
    <div className="glass space-y-4 rounded-2xl p-4">
      <div>
        <p className="mb-2 flex items-center gap-2 text-xs font-semibold uppercase tracking-widest text-muted-foreground">
          <span className="h-px w-3 bg-gradient-to-r from-accent to-accent2" />
          Output format
        </p>
        <Segmented<OutputFormat>
          value={settings.format}
          onChange={(v) => update({ format: v })}
          options={OUTPUT_FORMAT_LIST.map((f) => ({ value: f.id, label: f.label }))}
        />
      </div>

      {format.lossy ? (
        <div className="space-y-3">
          <Toggle
            label="Target a file size"
            checked={settings.targetSizeEnabled}
            onChange={(v) => update({ targetSizeEnabled: v })}
          />
          {settings.targetSizeEnabled ? (
            <NumberField
              label="Target size"
              value={settings.targetSizeKB}
              suffix="KB"
              min={1}
              onChange={(v) => update({ targetSizeKB: v ?? 1 })}
            />
          ) : (
            <Slider
              label="Quality"
              min={1}
              max={100}
              value={Math.round(settings.quality * 100)}
              display={`${Math.round(settings.quality * 100)}%`}
              onChange={(v) => update({ quality: v / 100 })}
            />
          )}
        </div>
      ) : (
        <p className="rounded-xl bg-muted/50 p-3 text-xs leading-relaxed text-muted-foreground">
          PNG is lossless — no quality or target-size setting needed. Use JPG or
          WebP to shrink the file further.
        </p>
      )}

      {!format.supportsAlpha && (
        <label className="flex items-center justify-between gap-3 text-sm">
          <span>Background (for transparency)</span>
          <input
            type="color"
            value={settings.bgColor}
            onChange={(e) => update({ bgColor: e.target.value })}
            className="h-8 w-12 cursor-pointer rounded-lg border border-border"
          />
        </label>
      )}
    </div>
  );
}
