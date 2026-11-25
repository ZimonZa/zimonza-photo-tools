import { VolumeX } from "lucide-react";

/** The amber "No sound" badge: on the estimate line and the export view whenever the sound is off. */
export function NoSoundBadge() {
  return (
    <span className="inline-flex shrink-0 items-center gap-1 rounded-full border border-amber-500/40 bg-amber-500/10 px-2 py-0.5 text-xs text-amber-500">
      <VolumeX className="h-3 w-3" aria-hidden />
      No sound
    </span>
  );
}
