"use client";

import { Toggle } from "@/components/ui";
import { useVideoStore } from "@/store/useVideoStore";

/**
 * The "Preview quality" switch: turns the compressed 3-second sample on or off. On phones the whole
 * label row is the 44 px tall tap target.
 */
export function QualitySwitch() {
  const enabled = useVideoStore((s) => s.quality.enabled);
  const setQualityEnabled = useVideoStore((s) => s.setQualityEnabled);
  return (
    <Toggle label="Preview quality" checked={enabled} onChange={setQualityEnabled} className="min-h-11 lg:min-h-0" />
  );
}
