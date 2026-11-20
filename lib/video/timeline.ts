/** Timeline math for the trim editor. Times are seconds, x is pixels along the track. */
import type { TrimRange } from "@/lib/video/recipe";

/** Shortest trim the handles can be dragged to, in seconds. */
const MIN_TRIM = 0.1;

const clamp = (n: number, lo: number, hi: number) => Math.min(Math.max(n, lo), hi);

export function timeToX(t: number, durationSec: number, widthPx: number): number {
  return durationSec > 0 ? (t / durationSec) * widthPx : 0;
}

/** The time under pixel `x`, clamped to the clip. */
export function xToTime(x: number, durationSec: number, widthPx: number): number {
  return widthPx > 0 ? clamp((x / widthPx) * durationSec, 0, durationSec) : 0;
}

/** Move one trim handle to `t`, keeping at least 0.1 s between the handles and both inside the clip. */
export function dragTrim(trim: TrimRange, handle: "start" | "end", t: number, durationSec: number): TrimRange {
  if (handle === "start") return { start: clamp(t, 0, Math.max(0, trim.end - MIN_TRIM)), end: trim.end };
  return { start: trim.start, end: clamp(t, Math.min(durationSec, trim.start + MIN_TRIM), durationSec) };
}

/** "0:08.6", "1:02.0", "12:05.3". */
export function formatTime(sec: number): string {
  const tenths = Math.round(Math.max(0, sec) * 10);
  const minutes = Math.floor(tenths / 600);
  const seconds = ((tenths % 600) / 10).toFixed(1).padStart(4, "0");
  return `${minutes}:${seconds}`;
}
