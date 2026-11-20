import { InvalidTrimError } from "@/lib/video/errors";
import { baseName } from "@/lib/utils";
import type { CropRect, OutputFrame } from "@/lib/video/frame";
import type { Rotation } from "@/lib/video/geometry";

/** Video sizes use decimal megabytes so results also fit forms that count 1 MB = 1,048,576 bytes. */
export const MB = 1_000_000;

/** Shortest trimmed clip we accept, in seconds. */
const MIN_TRIM_SECONDS = 0.1;

export type QualityLevel = "high" | "balanced" | "small";

/** Seconds, in source time. */
export interface TrimRange {
  start: number;
  end: number;
}

export type SizeMode =
  | { kind: "quality"; level: QualityLevel }
  | { kind: "target"; bytes: number };

export type Container = "mp4" | "webm";

/** Everything the engine needs to produce one output file. Crop is in display px, after rotation. */
export interface EditRecipe {
  file: File;
  trim: TrimRange | null;
  muted: boolean;
  size: SizeMode;
  /** Clockwise turn applied on top of the file's own rotation. */
  rotate: Rotation;
  flipH: boolean;
  flipV: boolean;
  crop: CropRect | null;
  frame: OutputFrame;
  container: Container;
}

/** A recipe that changes nothing but the quality; spread it and override what a caller edits. */
export const BASE_RECIPE: Omit<EditRecipe, "file"> = {
  trim: null,
  muted: false,
  size: { kind: "quality", level: "balanced" },
  rotate: 0,
  flipH: false,
  flipV: false,
  crop: null,
  frame: { kind: "source", maxLongSide: null },
  container: "mp4",
};

/**
 * Clamp a trim range to the clip. Returns `null` when it covers the whole clip.
 * Throws `InvalidTrimError` when what's left is shorter than 0.1 s.
 */
export function normalizeTrim(trim: TrimRange | null, durationSec: number): TrimRange | null {
  if (!trim) return null;
  const start = Math.max(0, trim.start);
  const end = Math.min(durationSec, trim.end);
  if (end - start < MIN_TRIM_SECONDS) throw new InvalidTrimError();
  if (start === 0 && end === durationSec) return null;
  return { start, end };
}

/** "Trip.MOV" -> "Trip-zimonza.mp4". */
export function outputFileName(inputName: string, ext: Container): string {
  const stem = baseName(inputName) || "video";
  return `${stem}-zimonza.${ext}`;
}
