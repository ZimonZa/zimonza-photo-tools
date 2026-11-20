import type { OutputFrame } from "@/lib/video/frame";
import { MB, type Container, type EditRecipe, type SizeMode } from "@/lib/video/recipe";

/** Third-party figures; re-check before launch (spec section 6.3). */
export const PLATFORM_LIMITS = { whatsappStatusSeconds: 90, instagramReelMaxSeconds: 180 };

export type PresetId = "ig-reel" | "ig-post" | "ig-square" | "whatsapp" | "form" | "custom";

export interface VideoPreset {
  id: PresetId;
  label: string;
  frame?: OutputFrame;
  /** "ask-target" takes the size from the caller's target MB. */
  size?: SizeMode | "ask-target";
  container?: Container;
}

const exact = (width: number, height: number): OutputFrame => ({ kind: "exact", width, height, fit: "cover" });

export const VIDEO_PRESETS: VideoPreset[] = [
  { id: "ig-reel", label: "Instagram Reel / Story", frame: exact(1080, 1920), container: "mp4" },
  { id: "ig-post", label: "Instagram Post (4:5)", frame: exact(1080, 1350), container: "mp4" },
  { id: "ig-square", label: "Square (1:1)", frame: exact(1080, 1080), container: "mp4" },
  {
    id: "whatsapp",
    label: "WhatsApp",
    frame: { kind: "source", maxLongSide: 1280 },
    size: { kind: "quality", level: "balanced" },
    container: "mp4",
  },
  { id: "form", label: "Form upload (under … MB)", size: "ask-target" },
  { id: "custom", label: "Custom" },
];

const DEFAULT_FORM_MB = 10;

/** Overlay a preset's frame, size and container on a recipe; fields the preset leaves out are kept. */
export function applyPreset(recipe: EditRecipe, preset: VideoPreset, targetMb?: number): EditRecipe {
  const next: EditRecipe = { ...recipe };
  if (preset.frame) next.frame = preset.frame;
  if (preset.container) next.container = preset.container;
  if (preset.size === "ask-target") next.size = { kind: "target", bytes: (targetMb ?? DEFAULT_FORM_MB) * MB };
  else if (preset.size) next.size = preset.size;
  return next;
}
