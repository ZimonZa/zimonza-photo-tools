import { expect, test, type Locator } from "@playwright/test";
import { gotoStudio, openClip, previewCanvas, tapOrClick } from "./fixtures";

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

test.beforeEach(async ({ page }) => gotoStudio(page));

test("the preview canvas shows the clip and changes while playing", async ({ page }) => {
  await openClip(page);
  // The preview starts on the live Original view.
  const canvas = previewCanvas(page);
  await expect(page.getByRole("img", { name: "Video preview" })).toBeVisible();
  const box = (await canvas.boundingBox())!;
  expect(box.width).toBeGreaterThan(0);
  expect(box.height).toBeGreaterThan(0);
  const backing = await canvas.evaluate((el: HTMLCanvasElement) => ({ width: el.width, height: el.height }));
  expect(backing.width).toBeGreaterThan(0);
  expect(backing.height).toBeGreaterThan(0);
  // The first frame is drawn before anything plays.
  await expect.poll(() => fingerprint(canvas)).not.toBe(0);

  const before = await fingerprint(canvas);
  await page.getByRole("button", { name: "Play", exact: true }).click();
  await expect(page.getByRole("button", { name: "Pause", exact: true })).toBeVisible();
  await expect.poll(() => fingerprint(canvas), { timeout: 10_000 }).not.toBe(before);
});

test("rotating 90° turns the preview portrait", async ({ page }, info) => {
  await openClip(page);
  const canvas = previewCanvas(page);
  const landscape = (await canvas.boundingBox())!;
  expect(landscape.width).toBeGreaterThan(landscape.height);

  await tapOrClick(page.getByRole("button", { name: "Rotate", exact: true }), info);
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

test("desktop: a loop shorter than the sample's wait still gets its sample while it plays", async ({ page }, info) => {
  test.skip(info.project.name !== "desktop", "Preview quality starts on for computers");
  await openClip(page);
  const estimated = async () => {
    const line = page.getByText(/Estimated size \d+\.\d\d MB/);
    if (!(await line.count())) return null;
    return Number(/([\d.]+) MB/.exec(await line.innerText())![1]);
  };
  await expect.poll(estimated, { timeout: 20_000 }).not.toBeNull();
  const whole = (await estimated())!;

  // The last ~0.5 s: it ends with the clip, so each pass ends the video (pause, then ended) and wraps.
  const start = page.getByRole("slider", { name: "Trim start" });
  await start.focus();
  for (let i = 0; i < 3; i++) await page.keyboard.press("Shift+ArrowRight");
  for (let i = 0; i < 4; i++) await page.keyboard.press("ArrowRight");
  const end = Number(await page.getByRole("slider", { name: "Trim end" }).getAttribute("aria-valuenow"));
  expect(end - Number(await start.getAttribute("aria-valuenow"))).toBeLessThan(0.8);
  await page.getByRole("button", { name: "Play", exact: true }).click();
  await expect(page.getByRole("button", { name: "Pause", exact: true })).toBeVisible();

  // The short part's own sample arrives: its estimate is a fraction of the whole clip's.
  await expect.poll(estimated, { timeout: 25_000 }).toBeLessThan(whole / 2);
  await expect(page.getByRole("button", { name: "Pause", exact: true })).toBeVisible();
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
  // Phones start with it off.
  await expect(quality).toHaveAttribute("aria-checked", "false");
  await expect(page.getByRole("button", { name: "Compressed" })).toHaveCount(0);
  await quality.tap();
  await expect(quality).toHaveAttribute("aria-checked", "true");
  await expect(page.getByRole("button", { name: "Original" })).toBeVisible();
  await expect(page.getByRole("button", { name: "Compressed" })).toBeVisible();
});
