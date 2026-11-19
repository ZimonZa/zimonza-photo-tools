import { InvalidTrimError } from "@/lib/video/errors";
import { baseName } from "@/lib/utils";

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

/** Everything the engine needs to produce one output file. */
export interface EditRecipe {
  file: File;
  trim: TrimRange | null;
  /** Cap on the output's long side in px; `null` keeps the source size. */
  maxLongSide: number | null;
  muted: boolean;
  size: SizeMode;
}

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
export function outputFileName(inputName: string, ext: "mp4"): string {
  const stem = baseName(inputName) || "video";
  return `${stem}-zimonza.${ext}`;
}
