import { expect, test, type Locator, type Page } from "@playwright/test";
import { recordClip } from "./fixtures";

const previewCanvas = (page: Page) => page.getByLabel("Preview", { exact: true }).locator("canvas");

/** A cheap fingerprint of the canvas pixels; changes when the picture changes. */
function fingerprint(canvas: Locator): Promise<number> {
  return canvas.evaluate((el: HTMLCanvasElement) => {
    const ctx = el.getContext("2d");
    if (!ctx || !el.width || !el.height) return 0;
    const { data } = ctx.getImageData(0, 0, el.width, el.height);
    let h = 0;
    for (let i = 0; i < data.length; i += 4 * 61) h = (h * 31 + data[i] + data[i + 1] * 7 + data[i + 2] * 13) >>> 0;
    return h;
  });
}

async function openClip(page: Page) {
  await recordClip(page, { seconds: 4, width: 1280, height: 720 });
  await expect(page.getByText("test-clip.mp4")).toBeVisible();
  await expect(previewCanvas(page)).toBeVisible();
}

test.beforeEach(async ({ page }) => {
  await page.goto("/video/");
  await expect(page.getByText("Drop a video here")).toBeVisible();
});

test("the preview canvas shows the clip and changes while playing", async ({ page }, info) => {
  await openClip(page);
  // Computers start on the compressed sample; the live preview is the Original view.
  if (info.project.name === "desktop") await page.getByRole("button", { name: "Original" }).click();
  const canvas = previewCanvas(page);
  const box = (await canvas.boundingBox())!;
  expect(box.width).toBeGreaterThan(0);
  expect(box.height).toBeGreaterThan(0);
  const backing = await canvas.evaluate((el: HTMLCanvasElement) => ({ width: el.width, height: el.height }));
  expect(backing.width).toBeGreaterThan(0);
  expect(backing.height).toBeGreaterThan(0);
  // The first frame is drawn before anything plays.
  await expect.poll(() => fingerprint(canvas)).not.toBe(0);

  const before = await fingerprint(canvas);
  await page.getByRole("button", { name: "Play" }).click();
  await expect(page.getByRole("button", { name: "Pause" })).toBeVisible();
  await expect.poll(() => fingerprint(canvas), { timeout: 10_000 }).not.toBe(before);
});

test("rotating 90° turns the preview portrait", async ({ page }, info) => {
  await openClip(page);
  const canvas = previewCanvas(page);
  const landscape = (await canvas.boundingBox())!;
  expect(landscape.width).toBeGreaterThan(landscape.height);

  const rotateTool = page.getByRole("button", { name: "Rotate", exact: true });
  if (info.project.name === "phone") await rotateTool.tap();
  else await rotateTool.click();
  await page.getByRole("button", { name: "90° right" }).click();

  await expect
    .poll(async () => {
      const b = (await canvas.boundingBox())!;
      return b.height > b.width;
    })
    .toBe(true);
  await expect(page.getByText(/≈ .* MB · 720×1280/)).toBeVisible();
});

test("desktop: Preview quality shows the estimated size and a playing compressed sample", async ({ page }, info) => {
  test.skip(info.project.name !== "desktop", "the switch lives in the desktop top bar");
  await openClip(page);
  const quality = page.getByRole("switch", { name: "Preview quality" });
  await expect(quality).toBeVisible();
  if ((await quality.getAttribute("aria-checked")) !== "true") await quality.click();
  await expect(quality).toHaveAttribute("aria-checked", "true");

  await expect(page.getByText(/Estimated size \d+\.\d\d MB/)).toBeVisible({ timeout: 20_000 });
  await page.getByRole("button", { name: "Compressed" }).click();
  const sample = page.getByLabel("Compressed sample");
  await expect(sample).toBeVisible();
  await expect
    .poll(() => sample.evaluate((v: HTMLVideoElement) => !v.paused && v.currentTime > 0 && v.videoWidth > 0))
    .toBe(true);
});

test("phone: the Preview quality switch sits in the preview controls; on shows Original | Compressed", async ({
  page,
}, info) => {
  test.skip(info.project.name !== "phone", "phones keep the switch next to the preview");
  await openClip(page);
  const quality = page.getByLabel("Preview", { exact: true }).getByRole("switch", { name: "Preview quality" });
  await expect(quality).toBeVisible();
  // The only visible one: the top bar's copy is desktop-only.
  await expect(page.getByRole("switch", { name: "Preview quality" })).toHaveCount(1);
  // This emulated phone doesn't report itself as mobile, so the store may start it on (real phones start off).
  if ((await quality.getAttribute("aria-checked")) === "true") await quality.tap();
  await expect(quality).toHaveAttribute("aria-checked", "false");
  await expect(page.getByRole("button", { name: "Compressed" })).toHaveCount(0);
  await quality.tap();
  await expect(quality).toHaveAttribute("aria-checked", "true");
  await expect(page.getByRole("button", { name: "Original" })).toBeVisible();
  await expect(page.getByRole("button", { name: "Compressed" })).toBeVisible();
});
