import { describe, expect, test } from "vitest";
import type { FrameEdits } from "@/lib/video/frame";
import type { Size } from "@/lib/video/geometry";
import { drawPreviewFrame } from "@/lib/video/preview-render";
import { isBlue, isGreen, isRed, isWhite, type Rgb } from "@/lib/video/test-utils/colors";

const NO_EDITS: FrameEdits = { rotate: 0, flipH: false, flipV: false, crop: null, fit: null };

type Check = [x: number, y: number, is: (p: Rgb) => boolean];

/** Red top-left, green top-right, blue bottom-left, white bottom-right. */
function quadrants(width = 640, height = 360): OffscreenCanvas {
  const canvas = new OffscreenCanvas(width, height);
  const ctx = canvas.getContext("2d")!;
  const fill = (color: string, x: number, y: number) => {
    ctx.fillStyle = color;
    ctx.fillRect(x, y, width / 2, height / 2);
  };
  fill("#f00", 0, 0);
  fill("#0f0", width / 2, 0);
  fill("#00f", 0, height / 2);
  fill("#fff", width / 2, height / 2);
  return canvas;
}

function solidRed(width = 640, height = 360): OffscreenCanvas {
  const canvas = new OffscreenCanvas(width, height);
  const ctx = canvas.getContext("2d")!;
  ctx.fillStyle = "#f00";
  ctx.fillRect(0, 0, width, height);
  return canvas;
}

/** Draw `source` with `edits` into a fresh `out`-sized canvas; returns a pixel reader. */
function render(source: OffscreenCanvas, edits: Partial<FrameEdits>, out: Size, clip?: Size): (x: number, y: number) => Rgb {
  const canvas = document.createElement("canvas");
  canvas.width = out.width;
  canvas.height = out.height;
  const ctx = canvas.getContext("2d")!;
  drawPreviewFrame(ctx, source, { width: source.width, height: source.height }, { ...NO_EDITS, ...edits }, out, clip);
  return (x, y) => {
    const d = ctx.getImageData(x, y, 1, 1).data;
    return [d[0], d[1], d[2]];
  };
}

function expectAt(px: (x: number, y: number) => Rgb, checks: Check[]) {
  for (const [x, y, is] of checks) {
    const p = px(x, y);
    expect(is(p), `${is.name} at (${x},${y}): ${p}`).toBe(true);
  }
}

describe("drawPreviewFrame", () => {
  test("rotate 90 then crop the top-left 180×320 shows the source's bottom-left (blue)", () => {
    const px = render(quadrants(), { rotate: 90, crop: { left: 0, top: 0, width: 180, height: 320 } }, { width: 180, height: 320 });
    expectAt(px, [
      [10, 10, isBlue],
      [90, 160, isBlue],
      [170, 310, isBlue],
    ]);
  });

  test("flip vertically puts blue at the top-left", () => {
    const px = render(quadrants(), { flipV: true }, { width: 640, height: 360 });
    expectAt(px, [
      [80, 45, isBlue],
      [560, 45, isWhite],
      [80, 315, isRed],
      [560, 315, isGreen],
    ]);
  });

  test("each turn and flip lands the quadrants where the engines put them; rotate happens before flip", () => {
    const corners = (out: Size): [number, number][] => [
      [20, 20],
      [out.width - 20, 20],
      [20, out.height - 20],
      [out.width - 20, out.height - 20],
    ];
    const cases: [Partial<FrameEdits>, Size, ((p: Rgb) => boolean)[]][] = [
      [{ rotate: 90 }, { width: 360, height: 640 }, [isBlue, isRed, isWhite, isGreen]],
      [{ rotate: 180 }, { width: 640, height: 360 }, [isWhite, isBlue, isGreen, isRed]],
      [{ rotate: 270 }, { width: 360, height: 640 }, [isGreen, isWhite, isRed, isBlue]],
      [{ flipH: true }, { width: 640, height: 360 }, [isGreen, isRed, isWhite, isBlue]],
      // Turn first, then mirror: rotate 90 gives blue/red over white/green, the flip swaps left and right.
      [{ rotate: 90, flipH: true }, { width: 360, height: 640 }, [isRed, isBlue, isGreen, isWhite]],
    ];
    for (const [edits, out, expected] of cases) {
      const px = render(quadrants(), edits, out);
      const checks = corners(out).map(([x, y], i): Check => [x, y, expected[i]]);
      expectAt(px, checks);
    }
  });

  test("cover fills a 360×360 frame from 640×360 by cropping the sides", () => {
    const px = render(quadrants(), { fit: "cover" }, { width: 360, height: 360 });
    expectAt(px, [
      [90, 90, isRed],
      [270, 90, isGreen],
      [90, 270, isBlue],
      [270, 270, isWhite],
    ]);
  });

  test("blurred background: picture in the centre, darker blurred copy in the corners", () => {
    const px = render(solidRed(), { fit: "blur" }, { width: 360, height: 640 });
    const centre = px(180, 320);
    const corner = px(5, 5);
    expect(isRed(centre), `centre ${centre}`).toBe(true);
    expect(corner[0], `corner ${corner}`).toBeLessThan(centre[0]);
    expect(corner[0], `corner ${corner}`).toBeGreaterThan(100);
  });

  test("a crop in the clip's 1280×720 display space draws the same region from a 640×360 proxy", () => {
    const crop = { left: 320, top: 180, width: 640, height: 360 };
    const out = { width: 320, height: 180 };
    const checks: Check[] = [
      [40, 40, isRed],
      [280, 40, isGreen],
      [40, 140, isBlue],
      [280, 140, isWhite],
    ];
    expectAt(render(quadrants(1280, 720), { crop }, out), checks);
    expectAt(render(quadrants(640, 360), { crop }, out, { width: 1280, height: 720 }), checks);
  });
});
