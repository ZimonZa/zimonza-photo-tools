/** Smallest and largest "under N MB" a person can ask for. */
export const MIN_TARGET_MB = 0.1;
export const MAX_TARGET_MB = 4000;

/** "2.50" -> "2.5": two decimals at most, no trailing zeros. */
export const mbText = (mb: number): string => String(Number(mb.toFixed(2)));

/** A typed size in MB (comma or dot), or null when it is empty, not a number, or outside the range. */
export function parseMb(text: string): number | null {
  const t = text.trim().replace(",", ".");
  const n = Number(t);
  return t !== "" && Number.isFinite(n) && n >= MIN_TARGET_MB && n <= MAX_TARGET_MB ? n : null;
}
