import { expect, test, type Locator, type Page, type TestInfo } from "@playwright/test";
import { estimate, estimateMb, gotoStudio, isPhone, openClip, presetPicker, previewCanvas } from "./fixtures";

type Rgb = [number, number, number];
// Colours come back approximate after lossy encoding.
const isRed = ([r, g, b]: Rgb) => r > 160 && g < 90 && b < 90;
const isBlue = ([r, g, b]: Rgb) => b > 160 && r < 90 && g < 90;
const isBlack = ([r, g, b]: Rgb) => r + g + b < 30;

/** Read one pixel of a canvas at a fraction of its width and height. */
function pixel(canvas: Locator, fx: number, fy: number): Promise<Rgb> {
  return canvas.evaluate(
    (el: HTMLCanvasElement, [fx, fy]) => {
      const ctx = el.getContext("2d");
      if (!ctx || !el.width || !el.height) return [0, 0, 0] as Rgb;
      const x = Math.min(el.width - 1, Math.floor(el.width * fx));
      const y = Math.min(el.height - 1, Math.floor(el.height * fy));
      const d = ctx.getImageData(x, y, 1, 1).data;
      return [d[0], d[1], d[2]] as Rgb;
    },
    [fx, fy] as const
  );
}

async function closeSheet(page: Page) {
  const sheet = page.getByRole("dialog");
  if (await sheet.count()) await sheet.getByRole("button", { name: "Done" }).tap();
  await expect(page.getByRole("dialog")).toHaveCount(0);
}

/** Open a tool's settings: the desktop side panel, or the phone's bottom sheet. */
async function openTool(page: Page, info: TestInfo, name: string): Promise<Locator> {
  const button = page.getByRole("navigation", { name: "Video tools" }).getByRole("button", { name, exact: true });
  if (isPhone(info)) {
    await closeSheet(page);
    await button.tap();
    const sheet = page.getByRole("dialog", { name });
    await expect(sheet).toBeVisible();
    return sheet;
  }
  await button.click();
  const panel = page.getByLabel("Tool settings");
  await expect(panel.getByRole("heading", { name })).toBeVisible();
  return panel;
}

/** Leave the current tool: phones close the sheet, computers pick Trim. */
async function leaveTool(page: Page, info: TestInfo) {
  if (isPhone(info)) await closeSheet(page);
  else await page.getByRole("navigation", { name: "Video tools" }).getByRole("button", { name: "Trim", exact: true }).click();
}

const cropVideo = (page: Page) => page.getByLabel("Crop preview");

/** Wait until the cropper's video has loaded (its box is only placed then). */
async function cropperReady(page: Page) {
  await expect(page.getByTestId("crop-editor")).toBeVisible();
  await expect.poll(() => cropVideo(page).evaluate((v: HTMLVideoElement) => v.videoWidth)).toBeGreaterThan(0);
}

/**
 * In the open Crop tool: 1:1, zoom 2× (step 0.1), then drag the picture right and down as far as it
 * goes, so the box ends on the top-left corner of the picture as the cropper shows it.
 */
async function cropTopLeftSquare(page: Page, panel: Locator) {
  await cropperReady(page);
  await panel.getByRole("button", { name: "1:1", exact: true }).click();
  const zoom = panel.getByRole("slider", { name: "Zoom" });
  for (let i = 0; i < 10; i++) await zoom.press("ArrowRight");
  const box = (await page.getByTestId("crop-editor").boundingBox())!;
  await page.mouse.move(box.x + 10, box.y + 10);
  await page.mouse.down();
  await page.mouse.move(box.x + box.width - 10, box.y + box.height - 10, { steps: 12 });
  await page.mouse.up();
}

/** The crop box's place on the cropper's (turned) picture, as fractions of the picture's box. */
async function boxOnPicture(page: Page) {
  const media = (await cropVideo(page).boundingBox())!;
  const box = (await page.getByLabel("Crop box").boundingBox())!;
  return {
    x: (box.x - media.x) / media.width,
    y: (box.y - media.y) / media.height,
    w: box.width / media.width,
    h: box.height / media.height,
  };
}

async function expectBoxOnPicture(page: Page, want: { x: number; y: number; w: number; h: number }) {
  await expect
    .poll(async () => {
      const got = await boxOnPicture(page);
      return (["x", "y", "w", "h"] as const).every((k) => Math.abs(got[k] - want[k]) < 0.02) || JSON.stringify(got);
    })
    .toBe(true);
}

async function expectCentre(page: Page, is: (p: Rgb) => boolean, name: string) {
  const canvas = previewCanvas(page);
  await expect(canvas).toBeVisible();
  await expect.poll(async () => is(await pixel(canvas, 0.5, 0.5)), { message: `preview centre is ${name}` }).toBe(true);
}

async function expectSquareCanvas(page: Page) {
  const [w, h] = await previewCanvas(page).evaluate((el: HTMLCanvasElement) => [el.width, el.height]);
  expect(w).toBe(h);
}

test.beforeEach(async ({ page }) => gotoStudio(page));

test("Instagram Reel: 1080×1920 starts on Crop to fill; Blurred background fills the corners", async ({ page }, info) => {
  await openClip(page);
  await presetPicker(page).selectOption("ig-reel");
  await expect(estimate(page)).toContainText("1080×1920");

  const panel = await openTool(page, info, "Size");
  const cover = panel.getByRole("button", { name: "Crop to fill" });
  const blur = panel.getByRole("button", { name: "Blurred background" });
  await expect(cover).toHaveAttribute("aria-pressed", "true");
  await blur.click();
  await expect(blur).toHaveAttribute("aria-pressed", "true");
  await expect(cover).toHaveAttribute("aria-pressed", "false");
  // Only the fit changed: still the Instagram Reel preset.
  await expect(presetPicker(page)).toHaveValue("ig-reel");
  await expect(presetPicker(page).locator("option:checked")).toHaveText("Instagram Reel / Story");

  const canvas = previewCanvas(page);
  for (const [fx, fy] of [
    [0.01, 0.01],
    [0.99, 0.01],
    [0.01, 0.99],
    [0.99, 0.99],
  ] as const) {
    await expect.poll(async () => isBlack(await pixel(canvas, fx, fy)), { message: `corner ${fx},${fy}` }).toBe(false);
  }
});

test("Crop 1:1 gives a square; rotating right keeps the crop on the same part of the picture", async ({ page }, info) => {
  await openClip(page, { pattern: "quadrants" });
  const panel = await openTool(page, info, "Crop");
  const editor = page.getByTestId("crop-editor");
  await expect(editor).toBeVisible();
  await expect(previewCanvas(page)).toHaveCount(0);

  await cropperReady(page);
  await panel.getByRole("button", { name: "1:1", exact: true }).click();
  await expect(estimate(page)).toContainText("720×720");

  // 2×, then the box on the picture's top-left 360×360 corner: all red.
  await cropTopLeftSquare(page, panel);
  await expect(estimate(page)).toContainText("360×360");
  await leaveTool(page, info);
  await expectCentre(page, isRed, "red");
  await expectSquareCanvas(page);

  // Turn right: the crop follows the picture (without the remap the same box would show blue).
  const rotate = await openTool(page, info, "Rotate");
  await rotate.getByRole("button", { name: "90° right" }).click();
  await expect(estimate(page)).toContainText("360×360");
  await expectCentre(page, isRed, "still red after turning");

  // Reopening puts the box where the crop now is: the top-right of the turned 720×1280 picture.
  const again = await openTool(page, info, "Crop");
  await expect(again.getByRole("button", { name: "1:1", exact: true })).toHaveAttribute("aria-pressed", "true");
  await cropperReady(page);
  await expectBoxOnPicture(page, { x: 0.5, y: 0, w: 0.5, h: 360 / 1280 });
  await leaveTool(page, info);
  await expect(estimate(page)).toContainText("360×360");
  await expectCentre(page, isRed, "red after reopening");
});

test("a crop made in the turned picture keeps its content through a flip and reopens where it was", async ({ page }, info) => {
  await openClip(page, { pattern: "quadrants" });
  const rotate = await openTool(page, info, "Rotate");
  await rotate.getByRole("button", { name: "90° right" }).click();
  await expect(estimate(page)).toContainText("720×1280");

  // Turned right, the picture's top-left is the clip's bottom-left: blue.
  const panel = await openTool(page, info, "Crop");
  await cropTopLeftSquare(page, panel);
  await expect(estimate(page)).toContainText("360×360");
  await leaveTool(page, info);
  await expectCentre(page, isBlue, "blue");
  await expectSquareCanvas(page);

  // Flip horizontally: the crop moves with the picture and still shows blue (unmoved it would be red).
  const again = await openTool(page, info, "Rotate");
  await again.getByRole("button", { name: "Flip horizontal" }).click();
  await expect(estimate(page)).toContainText("360×360");
  await expectCentre(page, isBlue, "still blue after flipping");

  // Reopen: the cropper shows the turned picture unflipped, so the box is back on its top-left.
  await openTool(page, info, "Crop");
  await cropperReady(page);
  await expectBoxOnPicture(page, { x: 0, y: 0, w: 0.5, h: 360 / 1280 });
  // Nudge the box one step: it commits from the restored place and stays a blue square.
  await page.getByLabel("Crop box").focus();
  await page.keyboard.press("ArrowLeft");
  await expect(estimate(page)).toContainText("360×360");
  await leaveTool(page, info);
  await expectCentre(page, isBlue, "blue after a nudge from the reopened box");
  await expectSquareCanvas(page);
});

test("with a horizontal flip, the square picked on the cropper's top-left keeps that content", async ({ page }, info) => {
  await openClip(page, { pattern: "quadrants" });
  const rotate = await openTool(page, info, "Rotate");
  await rotate.getByRole("button", { name: "Flip horizontal" }).click();
  // The cropper shows the picture unflipped: its top-left is red (in the flipped preview it is green).
  const panel = await openTool(page, info, "Crop");
  await cropTopLeftSquare(page, panel);
  await expect(estimate(page)).toContainText("360×360");
  await leaveTool(page, info);
  await expectCentre(page, isRed, "red");
  await expectSquareCanvas(page);
});

test("desktop: Free takes a typed width × height; a size that doesn't fit is refused", async ({ page }, info) => {
  test.skip(isPhone(info), "typed sizes on the desktop panel");
  await openClip(page);
  const panel = await openTool(page, info, "Crop");
  await cropperReady(page);
  await panel.getByRole("button", { name: "Free", exact: true }).click();
  const width = panel.getByLabel("Width", { exact: true });
  const height = panel.getByLabel("Height", { exact: true });
  const setSize = panel.getByRole("button", { name: "Set size" });
  // Free starts from the whole picture.
  await expect(width).toHaveValue("1280");
  await expect(height).toHaveValue("720");

  await width.fill("640");
  await height.fill("270");
  await setSize.click();
  await expect(estimate(page)).toContainText("640×270");
  await expect(width).toHaveValue("640");
  await expect(height).toHaveValue("270");

  // A portrait strip.
  await width.fill("300");
  await height.fill("600");
  await setSize.click();
  await expect(estimate(page)).toContainText("300×600");

  // Too small: an inline message, Set size off, Enter does nothing, the crop stays.
  await width.fill("10");
  await height.fill("10");
  await expect(panel.getByRole("alert")).toContainText("whole numbers");
  await expect(setSize).toBeDisabled();
  await height.press("Enter");
  await expect(estimate(page)).toContainText("300×600");

  await leaveTool(page, info);
  const [w, h] = await previewCanvas(page).evaluate((el: HTMLCanvasElement) => [el.width, el.height]);
  expect(w / h).toBeCloseTo(0.5, 2);
});

test("Custom 0×100 shows the size message inline and in the estimate line", async ({ page }, info) => {
  await openClip(page);
  const panel = await openTool(page, info, "Size");
  await panel.getByRole("button", { name: "Custom", exact: true }).click();
  const lock = panel.getByRole("button", { name: "Keep the picture's shape" });
  await expect(lock).toHaveAttribute("aria-pressed", "true");
  await lock.click();
  await expect(lock).toHaveAttribute("aria-pressed", "false");

  const width = panel.getByLabel("Width", { exact: true });
  const height = panel.getByLabel("Height", { exact: true });
  await width.fill("0");
  await height.fill("100");
  const message = "That output size is too small. Use at least 16 × 16 pixels.";
  await expect(panel.getByText(message)).toBeVisible();
  // Shown next to Export, which stays off: the size is fixed here, not in the export view.
  await expect(estimate(page)).toContainText(message);
  await expect(page.getByRole("button", { name: "Export", exact: true })).toBeDisabled();

  // A size that works clears both, reaches the estimate, and its new shape offers the fit choice.
  await width.fill("200");
  await expect(panel.getByText(message)).toHaveCount(0);
  await expect(estimate(page)).toContainText("200×100");
  await expect(panel.getByRole("button", { name: "Crop to fill" })).toHaveAttribute("aria-pressed", "true");
  await expect(page.getByRole("button", { name: "Export", exact: true })).toBeEnabled();

  // Over 4096 px a side: its own message, in both places, and Export off again.
  const tooBig = "That output size is too big. Use at most 4096 × 4096 pixels.";
  await width.fill("5000");
  await expect(panel.getByText(tooBig)).toBeVisible();
  await expect(estimate(page)).toContainText(tooBig);
  await expect(page.getByRole("button", { name: "Export", exact: true })).toBeDisabled();
  await width.fill("4096");
  await expect(estimate(page)).toContainText("4096×100");
});

test("Sound Off shows the No sound badge; On removes it", async ({ page }, info) => {
  await openClip(page);
  const panel = await openTool(page, info, "Sound");
  const sound = panel.getByRole("radiogroup", { name: "Sound" });
  const on = sound.getByRole("radio", { name: "On" });
  const off = sound.getByRole("radio", { name: "Off" });
  await expect(on).toHaveAttribute("aria-checked", "true");
  await expect(estimate(page).getByText("No sound")).toHaveCount(0);
  await off.click();
  await expect(off).toHaveAttribute("aria-checked", "true");
  await expect(estimate(page).getByText("No sound")).toBeVisible();
  await on.click();
  await expect(estimate(page).getByText("No sound")).toHaveCount(0);
});

test("Form upload under a size the clip is over: the estimate comes down within it, as MP4", async ({ page }) => {
  await openClip(page);
  // As it is, the clip is bigger than the target picked here, so staying within it means something.
  const original = await estimateMb(page);
  const target = Math.floor(original * 5) / 10; // about half, rounded down to 0.1 MB
  expect(target).toBeGreaterThanOrEqual(0.3);
  expect(target).toBeLessThan(original);

  const picker = presetPicker(page);
  await picker.selectOption("form");
  const mb = page.getByRole("textbox", { name: "Target size in MB" });
  await expect(mb).toHaveValue("10");
  await mb.fill(String(target));
  await page.getByRole("button", { name: "Apply", exact: true }).click();
  await expect(picker).toHaveValue("form");
  await expect(picker.locator("option:checked")).toHaveText(`Form upload (under ${target} MB)`);
  await expect(estimate(page)).toContainText("MP4");
  await expect.poll(() => estimateMb(page)).toBeLessThanOrEqual(target);
});

test("a manual change after a preset flips the dropdown to Custom", async ({ page }, info) => {
  await openClip(page);
  const picker = presetPicker(page);
  await expect(picker).toHaveValue("custom");
  await picker.selectOption("ig-reel");
  await expect(picker).toHaveValue("ig-reel");
  const panel = await openTool(page, info, "Sound");
  await panel.getByRole("radio", { name: "Off" }).click();
  await expect(picker).toHaveValue("custom");
});

test("a target too small for the clip: the amber hint, and Export opens the view where the MB is fixed", async ({ page }) => {
  await openClip(page, { seconds: 6 });
  await presetPicker(page).selectOption("form");
  await page.getByRole("textbox", { name: "Target size in MB" }).fill("0.1");
  await page.getByRole("button", { name: "Apply", exact: true }).click();
  const line = estimate(page);
  await expect(line).toContainText("That size is too small for a video this long.");
  await expect(line).toContainText("Try at least");
  await expect(line.getByText(/Try at least/)).toHaveClass(/text-amber/);

  // The fix the hint names lives in the export view, so Export stays on for this one problem.
  const exportButton = page.getByRole("button", { name: "Export", exact: true });
  await expect(exportButton).toBeEnabled();
  await exportButton.click();
  const dialog = page.getByRole("dialog", { name: "Export" });
  const start = dialog.getByRole("button", { name: "Start export" });
  await expect(dialog.getByRole("alert")).toContainText("Try at least");
  await expect(start).toBeDisabled();
  const mb = dialog.getByRole("textbox", { name: "Target size (MB)" });
  await expect(mb).toHaveValue("0.1");
  await mb.fill("1");
  await expect(start).toBeEnabled();
  await start.click();
  await expect(dialog.getByRole("link", { name: "Download" })).toBeVisible({ timeout: 150_000 });
});
