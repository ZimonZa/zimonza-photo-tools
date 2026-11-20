import type { Size } from "@/lib/video/geometry";

/** Checkpoint 1: the backup engine took ~14x real time on a phone, ~5x on a desktop, at 720p. */
const MOBILE_FACTOR = 14;
const DESKTOP_FACTOR = 5;

export function estimateBackupSeconds(durationSec: number, out: Size, mobile: boolean): number {
  return Math.round(durationSec * (mobile ? MOBILE_FACTOR : DESKTOP_FACTOR) * ((out.width * out.height) / (1280 * 720)));
}

export function isMobileDevice(): boolean {
  if (typeof navigator === "undefined") return false;
  const uaData = (navigator as Navigator & { userAgentData?: { mobile?: boolean } }).userAgentData;
  if (typeof uaData?.mobile === "boolean") return uaData.mobile;
  return /Mobi|Android|iPhone|iPad/.test(navigator.userAgent);
}
