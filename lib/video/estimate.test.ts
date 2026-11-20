import { describe, expect, test } from "vitest";
import { estimateBackupSeconds, isMobileDevice } from "@/lib/video/estimate";

describe("estimateBackupSeconds", () => {
  test("phones run the backup engine ~14x slower than real time at 720p", () => {
    expect(estimateBackupSeconds(17, { width: 720, height: 1280 }, true)).toBe(238);
    expect(estimateBackupSeconds(60, { width: 1080, height: 1920 }, true)).toBe(1890);
  });

  test("desktops run it ~5x slower", () => {
    expect(estimateBackupSeconds(3, { width: 1280, height: 720 }, false)).toBe(15);
  });
});

describe("isMobileDevice", () => {
  test("is false without a navigator", () => {
    expect(isMobileDevice()).toBe(false);
  });
});
