import { describe, expect, test } from "vitest";
import { normalizeTrim } from "@/lib/video/recipe";
import { dragTrim, formatTime, trimOrNull, timeToX, xToTime } from "@/lib/video/timeline";

describe("timeline", () => {
  test("time and x map both ways, clamped", () => {
    expect(timeToX(15, 60, 600)).toBe(150);
    expect(xToTime(150, 60, 600)).toBe(15);
    expect(xToTime(-5, 60, 600)).toBe(0);
    expect(xToTime(900, 60, 600)).toBe(60);
  });

  test("dragTrim keeps 0.1 s and stays inside the clip", () => {
    expect(dragTrim({ start: 10, end: 20 }, "start", 25, 60)).toEqual({ start: 19.9, end: 20 });
    expect(dragTrim({ start: 10, end: 20 }, "end", 5, 60)).toEqual({ start: 10, end: 10.1 });
    expect(dragTrim({ start: 10, end: 20 }, "end", 99, 60)).toEqual({ start: 10, end: 60 });
    expect(dragTrim({ start: 10, end: 20 }, "start", -3, 60)).toEqual({ start: 0, end: 20 });
  });

  test("trimOrNull rounds to 0.01 s and drops a trim that covers the whole clip", () => {
    expect(trimOrNull({ start: 0, end: 4.036 }, 4.036)).toBeNull();
    expect(trimOrNull({ start: 0.004, end: 4.04 }, 4.036)).toBeNull();
    expect(trimOrNull({ start: 1.2349, end: 2.5 }, 4.036)).toEqual({ start: 1.23, end: 2.5 });
    expect(trimOrNull({ start: 0, end: 3.9 }, 4.036)).toEqual({ start: 0, end: 3.9 });
  });

  test("a trim at the minimum gap is never rejected, from either handle and both key directions", () => {
    const duration = 60;
    const centis = (t: number) => Math.round(t * 100);
    for (let i = 0; i < 500; i++) {
      const x = (i / 499) * duration + (i % 7) * 0.0013;
      // Drag the end handle down onto the start, and the start handle up onto the end.
      const a = dragTrim({ start: centis(x) / 100, end: duration }, "end", 0, duration);
      const b = dragTrim({ start: 0, end: centis(x) / 100 || 0.1 }, "start", duration, duration);
      const keysEnd = dragTrim({ start: centis(x) / 100, end: duration }, "end", 0, duration);
      for (const [trim, moved] of [[a, "end"], [b, "start"], [keysEnd, "end"]] as const) {
        const stored = trimOrNull(trim, duration, moved);
        if (stored) {
          expect(centis(stored.end) - centis(stored.start)).toBeGreaterThanOrEqual(10);
          expect(() => normalizeTrim(stored, duration)).not.toThrow();
        }
      }
      // Arrow keys against the other handle: one 0.1 s step past the gap.
      const start = centis(x) / 100;
      const stepped = trimOrNull(dragTrim({ start, end: start + 0.1 }, "end", start + 0.1 - 0.1, duration), duration, "end");
      if (stepped) expect(() => normalizeTrim(stepped, duration)).not.toThrow();
      const steppedStart = trimOrNull(dragTrim({ start, end: start + 0.1 }, "start", start + 0.1, duration), duration, "start");
      if (steppedStart) expect(() => normalizeTrim(steppedStart, duration)).not.toThrow();
    }
  });

  test("trimOrNull keeps the gap valid on the centisecond grid and near the clip end", () => {
    expect(trimOrNull({ start: 0.2, end: 0.3 }, 60, "end")).toEqual({ start: 0.2, end: 0.3 });
    expect(trimOrNull({ start: 0.2, end: 0.25 }, 60, "end")).toEqual({ start: 0.2, end: 0.3 });
    expect(trimOrNull({ start: 0.2, end: 0.25 }, 60, "start")).toEqual({ start: 0.15, end: 0.25 });
    const nearEnd = trimOrNull({ start: 3.99, end: 4.036 }, 4.036, "start")!;
    expect(nearEnd.end).toBe(4.036);
    expect(nearEnd.end - nearEnd.start).toBeGreaterThanOrEqual(0.1 - 1e-9);
  });

  test("formatTime shows minutes:seconds with one decimal", () => {
    expect(formatTime(8.64)).toBe("0:08.6");
    expect(formatTime(62)).toBe("1:02.0");
    expect(formatTime(725.3)).toBe("12:05.3");
  });
});
