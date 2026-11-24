import { describe, expect, test } from "vitest";
import { MAX_TARGET_MB, MIN_TARGET_MB, mbText, parseMb } from "@/lib/video/target-mb";

describe("parseMb", () => {
  test("accepts the range edges and decimals, with a comma or spaces", () => {
    expect(parseMb(String(MIN_TARGET_MB))).toBe(0.1);
    expect(parseMb(String(MAX_TARGET_MB))).toBe(4000);
    expect(parseMb("2.5")).toBe(2.5);
    expect(parseMb(" 2,5 ")).toBe(2.5);
    expect(parseMb("10")).toBe(10);
  });

  test("rejects empty, NaN, text and values outside the range", () => {
    for (const bad of ["", "   ", "abc", "NaN", "Infinity", "0", "0.09", "4000.01", "-1", "1e9"]) {
      expect(parseMb(bad), bad).toBeNull();
    }
  });
});

describe("mbText", () => {
  test("rounds to two decimals and drops trailing zeros", () => {
    expect(mbText(10)).toBe("10");
    expect(mbText(1.005 * 2)).toBe("2.01");
    expect(mbText(2.5)).toBe("2.5");
  });
});
