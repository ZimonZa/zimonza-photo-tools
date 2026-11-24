import { expect, test, type Locator, type Page, type TestInfo } from "@playwright/test";
import { recordClip, type ClipOptions } from "./fixtures";

type Rgb = [number, number, number];
// Colours come back approximate after lossy encoding.
const isRed = ([r, g, b]: Rgb) => r > 160 && g < 90 && b < 90;
const isBlack = ([r, g, b]: Rgb) => r + g + b < 30;

const isPhone = (info: TestInfo) => info.project.name === "phone";
const previewCanvas = (page: Page) => page.getByLabel("Preview", { exact: true }).locator("canvas");
const estimate = (page: Page) => page.getByTestId("estimate");
const presetPicker = (page: Page) => page.getByRole("combobox", { name: "Preset" });

async function estimateMb(page: Page): Promise<number> {
  const text = await estimate(page).innerText();
  return Number(/≈ ([\d.]+) MB/.exec(text)![1]);
}

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

async function openClip(page: Page, opts: ClipOptions = {}) {
  await recordClip(page, { seconds: 4, width: 1280, height: 720, ...opts });
  await expect(page.getByText("test-clip.mp4")).toBeVisible();
  await expect(estimate(page)).toContainText("MB");
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

test.beforeEach(async ({ page }) => {
  await page.goto("/video/");
  await expect(page.getByText("Drop a video here")).toBeVisible();
});

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

  await panel.getByRole("button", { name: "1:1", exact: true }).click();
  await expect(estimate(page)).toContainText("720×720");

  // Zoom to 2× (step 0.1), then drag the picture right and down as far as it goes: the box ends on
  // the picture's top-left 360×360 corner, all red.
  const zoom = panel.getByRole("slider", { name: "Zoom" });
  for (let i = 0; i < 10; i++) await zoom.press("ArrowRight");
  await expect(estimate(page)).toContainText("360×360");
  const box = (await editor.boundingBox())!;
  await page.mouse.move(box.x + 10, box.y + 10);
  await page.mouse.down();
  await page.mouse.move(box.x + box.width - 10, box.y + box.height - 10, { steps: 12 });
  await page.mouse.up();

  await leaveTool(page, info);
  const canvas = previewCanvas(page);
  await expect(canvas).toBeVisible();
  await expect.poll(async () => isRed(await pixel(canvas, 0.5, 0.5)), { message: "crop centre is red" }).toBe(true);
  const size = await canvas.evaluate((el: HTMLCanvasElement) => [el.width, el.height]);
  expect(size[0]).toBe(size[1]);

  // Turn right: the crop follows the picture (without the remap the same box would show blue).
  const rotate = await openTool(page, info, "Rotate");
  await rotate.getByRole("button", { name: "90° right" }).click();
  await expect(estimate(page)).toContainText("360×360");
  await expect.poll(async () => isRed(await pixel(canvas, 0.5, 0.5)), { message: "still red after turning" }).toBe(true);

  // Reopening the Crop tool starts from the current crop and changes nothing by itself.
  const again = await openTool(page, info, "Crop");
  await expect(again.getByRole("button", { name: "1:1", exact: true })).toHaveAttribute("aria-pressed", "true");
  await expect(editor).toBeVisible();
  await page.waitForTimeout(500);
  await leaveTool(page, info);
  await expect(estimate(page)).toContainText("360×360");
  await expect.poll(async () => isRed(await pixel(previewCanvas(page), 0.5, 0.5))).toBe(true);
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
  // Shown next to Export (Task 7 disables the button on the same state).
  await expect(estimate(page)).toContainText(message);

  // A size that works clears both, reaches the estimate, and its new shape offers the fit choice.
  await width.fill("200");
  await expect(panel.getByText(message)).toHaveCount(0);
  await expect(estimate(page)).toContainText("200×100");
  await expect(panel.getByRole("button", { name: "Crop to fill" })).toHaveAttribute("aria-pressed", "true");
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

test("Form upload under 25 MB: the estimate stays within 25 MB, as MP4", async ({ page }) => {
  await openClip(page);
  const picker = presetPicker(page);
  await picker.selectOption("form");
  const mb = page.getByRole("textbox", { name: "Target size in MB" });
  await expect(mb).toHaveValue("10");
  await mb.fill("25");
  await page.getByRole("button", { name: "Apply", exact: true }).click();
  await expect(picker).toHaveValue("form");
  await expect(picker.locator("option:checked")).toHaveText("Form upload (under 25 MB)");
  await expect(estimate(page)).toContainText("MP4");
  expect(await estimateMb(page)).toBeLessThanOrEqual(25);
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

test("a 0.2 MB target on a 30 s clip shows the amber planning message with a hint", async ({ page }) => {
  await openClip(page, { seconds: 30 });
  await presetPicker(page).selectOption("form");
  await page.getByRole("textbox", { name: "Target size in MB" }).fill("0.2");
  await page.getByRole("button", { name: "Apply", exact: true }).click();
  const line = estimate(page);
  await expect(line).toContainText("That size is too small for a video this long.");
  await expect(line).toContainText("Try at least");
  await expect(line.getByText(/Try at least/)).toHaveClass(/text-amber/);
});
