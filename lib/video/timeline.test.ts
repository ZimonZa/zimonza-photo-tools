import { describe, expect, test } from "vitest";
import { dragTrim, formatTime, timeToX, xToTime } from "@/lib/video/timeline";

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

  test("formatTime shows minutes:seconds with one decimal", () => {
    expect(formatTime(8.64)).toBe("0:08.6");
    expect(formatTime(62)).toBe("1:02.0");
    expect(formatTime(725.3)).toBe("12:05.3");
  });
});
