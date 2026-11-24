import { expect, test, type Locator, type Page } from "@playwright/test";
import { recordClip } from "./fixtures";

test.skip(({ isMobile }) => !isMobile, "the phone layout");

type Box = { x: number; y: number; width: number; height: number };
const box = async (loc: Locator): Promise<Box> => (await loc.boundingBox())!;
const bottom = (b: Box) => b.y + b.height;

const toolBar = (page: Page) => page.getByRole("navigation", { name: "Video tools" });
const toolButton = (page: Page, name: string) => toolBar(page).getByRole("button", { name, exact: true });
const sheetFor = (page: Page, name: string) => page.getByRole("dialog", { name });
const estimate = (page: Page) => page.getByTestId("estimate");
const previewCanvas = (page: Page) => page.getByLabel("Preview", { exact: true }).locator("canvas");
const endHandle = (page: Page) => page.getByRole("slider", { name: "Trim end" });
const startHandle = (page: Page) => page.getByRole("slider", { name: "Trim start" });
const track = (page: Page) => page.getByTestId("timeline-track");
const num = async (loc: Locator) => Number(await loc.getAttribute("aria-valuenow"));

/** The page never scrolls sideways, and never scrolls at all while editing. */
async function expectNoPageScroll(page: Page) {
  const { sw, sx, sy } = await page.evaluate(() => ({
    sw: document.documentElement.scrollWidth,
    sx: window.scrollX,
    sy: window.scrollY,
  }));
  expect(sw).toBeLessThanOrEqual(390);
  expect(sx).toBe(0);
  expect(sy).toBe(0);
}

async function openClip(page: Page) {
  await recordClip(page, { seconds: 4, width: 1280, height: 720 });
  await expect(page.getByText("test-clip.mp4")).toBeVisible();
  await expect(estimate(page)).toContainText("MB");
  await expect(previewCanvas(page)).toBeVisible();
}

async function openSheet(page: Page, name: string): Promise<Locator> {
  const sheet = sheetFor(page, name);
  if (!(await sheet.isVisible())) await toolButton(page, name).tap();
  await expect(sheet).toBeVisible();
  return sheet;
}

/** A finger drag with real touch events (Chrome turns them into pointer events of type "touch"). */
async function touchDrag(page: Page, from: { x: number; y: number }, to: { x: number; y: number }, steps = 12) {
  const cdp = await page.context().newCDPSession(page);
  const at = (x: number, y: number) => [{ x, y, id: 1, radiusX: 6, radiusY: 6, force: 1 }];
  await cdp.send("Input.dispatchTouchEvent", { type: "touchStart", touchPoints: at(from.x, from.y) });
  for (let i = 1; i <= steps; i++) {
    const x = from.x + ((to.x - from.x) * i) / steps;
    const y = from.y + ((to.y - from.y) * i) / steps;
    await cdp.send("Input.dispatchTouchEvent", { type: "touchMove", touchPoints: at(x, y) });
  }
  await cdp.send("Input.dispatchTouchEvent", { type: "touchEnd", touchPoints: [] });
  await cdp.detach();
}

test.beforeEach(async ({ page }) => {
  await page.goto("/video/");
  await expect(page.getByText("Drop a video here")).toBeVisible();
});

test("390 px: no sideways scroll, Export on the top bar's only row, 44 px touch targets, quality preview off", async ({ page }) => {
  await openClip(page);
  await expectNoPageScroll(page);

  // Top bar: one row with the name, preset, New video and Export.
  const newVideo = page.getByRole("button", { name: "New video" });
  const exportButton = page.getByRole("button", { name: "Export", exact: true });
  const preset = page.getByRole("combobox", { name: "Preset" });
  const name = page.getByText("test-clip.mp4");
  const row = await box(newVideo);
  for (const loc of [exportButton, preset, name]) {
    const b = await box(loc);
    expect(Math.abs(b.y + b.height / 2 - (row.y + row.height / 2))).toBeLessThan(4);
  }
  const nameBox = await box(name);
  expect(nameBox.x + nameBox.width).toBeLessThanOrEqual((await box(preset)).x);
  expect(await name.getAttribute("title")).toBe("test-clip.mp4");

  // Touch targets.
  for (const label of ["Trim", "Crop", "Size", "Rotate", "Sound"]) {
    const b = await box(toolButton(page, label));
    expect(b.width, label).toBeGreaterThanOrEqual(44);
    expect(b.height, label).toBeGreaterThanOrEqual(44);
  }
  for (const loc of [newVideo, exportButton, page.getByRole("button", { name: "Play", exact: true })]) {
    const b = await box(loc);
    expect(b.width).toBeGreaterThanOrEqual(44);
    expect(b.height).toBeGreaterThanOrEqual(44);
  }
  expect((await box(preset)).height).toBeGreaterThanOrEqual(44);
  for (const handle of [startHandle(page), endHandle(page)]) expect((await box(handle)).width).toBeGreaterThanOrEqual(44);
  // The whole handle is on screen, even at the clip's ends.
  expect((await box(startHandle(page))).x).toBeGreaterThanOrEqual(0);
  const end = await box(endHandle(page));
  expect(end.x + end.width).toBeLessThanOrEqual(390);

  // The tool bar scrolls sideways and snaps to its buttons.
  expect(await toolBar(page).evaluate((el) => getComputedStyle(el).scrollSnapType)).toBe("x mandatory");
  expect(await toolButton(page, "Trim").evaluate((el) => getComputedStyle(el).scrollSnapAlign)).toBe("start");

  // Phones start with the quality preview off; its switch is 44 px tall to tap.
  const quality = page.getByLabel("Preview", { exact: true }).getByRole("switch", { name: "Preview quality" });
  await expect(quality).toHaveAttribute("aria-checked", "false");
  expect((await box(quality.locator("xpath=.."))).height).toBeGreaterThanOrEqual(44);
});

test("every tool's sheet sits above the tool bar; the preview, estimate and No sound badge stay in view", async ({ page }) => {
  await openClip(page);
  await (await openSheet(page, "Sound")).getByRole("radio", { name: "Off" }).tap();

  for (const name of ["Trim", "Crop", "Size", "Rotate", "Sound"]) {
    const sheet = await openSheet(page, name);
    const s = await box(sheet);
    const tools = await box(toolBar(page));
    expect(bottom(s), `${name}: sheet ends above the tool bar`).toBeLessThanOrEqual(tools.y + 0.5);
    expect(bottom(tools), `${name}: tool bar on screen`).toBeLessThanOrEqual(844.5);
    expect(s.height, `${name}: at most 60 vh`).toBeLessThanOrEqual(0.6 * 844 + 0.5);

    // The estimate line and the badge between the sheet and the tool bar.
    const line = await box(estimate(page));
    expect(line.y, `${name}: estimate under the sheet`).toBeGreaterThanOrEqual(bottom(s) - 0.5);
    expect(bottom(line), `${name}: estimate above the tool bar`).toBeLessThanOrEqual(tools.y + 0.5);
    await expect(estimate(page).getByText("No sound")).toBeVisible();

    // What the person is working on sits whole above the sheet.
    const picture = name === "Crop" ? page.getByTestId("crop-editor") : previewCanvas(page);
    await expect(picture).toBeVisible();
    const p = await box(picture);
    expect(p.y, `${name}: picture top on screen`).toBeGreaterThanOrEqual(0);
    expect(bottom(p), `${name}: picture above the sheet`).toBeLessThanOrEqual(s.y + 0.5);
    expect(p.height, `${name}: picture still a useful size`).toBeGreaterThanOrEqual(120);
    await expectNoPageScroll(page);
  }
});

test("with Preview quality on, the Original | Compressed toggle stays above an open sheet", async ({ page }) => {
  await openClip(page);
  const quality = page.getByLabel("Preview", { exact: true }).getByRole("switch", { name: "Preview quality" });
  await quality.tap();
  await expect(quality).toHaveAttribute("aria-checked", "true");
  for (const name of ["Size", "Rotate"]) {
    const sheet = await openSheet(page, name);
    const s = await box(sheet);
    for (const label of ["Original", "Compressed"]) {
      const toggle = page.getByLabel("Preview", { exact: true }).getByRole("button", { name: label, exact: true });
      await expect(toggle).toBeVisible();
      expect(bottom(await box(toggle)), `${name}: ${label}`).toBeLessThanOrEqual(s.y + 0.5);
    }
  }
});

test("tall sheets scroll inside themselves: Zoom and the fit choice are reachable without moving the page", async ({ page }) => {
  await openClip(page);
  // Crop with Free shows the most controls; Zoom must be reachable.
  const crop = await openSheet(page, "Crop");
  await crop.getByRole("button", { name: "Free", exact: true }).tap();
  const zoom = crop.getByRole("slider", { name: "Zoom" });
  await zoom.scrollIntoViewIfNeeded();
  const c = await box(crop);
  const z = await box(zoom);
  expect(z.y).toBeGreaterThanOrEqual(c.y);
  expect(bottom(z)).toBeLessThanOrEqual(bottom(c) + 0.5);
  await expectNoPageScroll(page);
  await crop.getByRole("button", { name: "Done" }).tap();

  // Instagram Reel: the fit choice under the size presets.
  await page.getByRole("combobox", { name: "Preset" }).selectOption("ig-reel");
  const size = await openSheet(page, "Size");
  const blur = size.getByRole("button", { name: "Blurred background" });
  await blur.scrollIntoViewIfNeeded();
  const s = await box(size);
  const b = await box(blur);
  expect(b.y).toBeGreaterThanOrEqual(s.y);
  expect(bottom(b)).toBeLessThanOrEqual(bottom(s) + 0.5);
  await blur.tap();
  await expect(blur).toHaveAttribute("aria-pressed", "true");
  await expectNoPageScroll(page);
  // The sheet's own title row (with Done) never scrolls away.
  await expect(size.getByRole("button", { name: "Done" })).toBeInViewport();
});

test("a sheet takes focus when it opens; Escape or Done closes it and focus returns to its tool button", async ({ page }) => {
  await openClip(page);
  const crop = toolButton(page, "Crop");
  await expect(crop).toHaveAttribute("aria-expanded", "false");
  await crop.tap();
  const sheet = sheetFor(page, "Crop");
  await expect(sheet).toBeVisible();
  await expect(crop).toHaveAttribute("aria-expanded", "true");
  expect(await sheet.evaluate((el) => el.contains(document.activeElement))).toBe(true);
  await page.keyboard.press("Escape");
  await expect(sheet).toBeHidden();
  await expect(crop).toBeFocused();
  await expect(crop).toHaveAttribute("aria-expanded", "false");

  const rotate = toolButton(page, "Rotate");
  await rotate.tap();
  const rotateSheet = sheetFor(page, "Rotate");
  await expect(rotateSheet).toBeVisible();
  expect(await rotateSheet.evaluate((el) => el.contains(document.activeElement))).toBe(true);
  await rotateSheet.getByRole("button", { name: "Done" }).tap();
  await expect(rotateSheet).toBeHidden();
  await expect(rotate).toBeFocused();
  // Tapping the open tool again closes its sheet too.
  await rotate.tap();
  await expect(rotateSheet).toBeVisible();
  await rotate.tap();
  await expect(rotateSheet).toBeHidden();
});

test("a finger drag on the trim handles moves the trim", async ({ page }) => {
  await openClip(page);
  await page.evaluate(() => {
    const w = window as unknown as { pointerTypes: string[] };
    w.pointerTypes = [];
    document.addEventListener("pointerdown", (e) => w.pointerTypes.push(e.pointerType), true);
  });
  const duration = await num(endHandle(page));
  expect(duration).toBeGreaterThan(3);
  const t = await box(track(page));
  const y = t.y + t.height / 2;

  // Press on the handle's bar (its inner edge) and drag to the middle of the strip.
  const e = await box(endHandle(page));
  await touchDrag(page, { x: e.x + 6, y }, { x: t.x + t.width * 0.5, y });
  await expect.poll(() => num(endHandle(page))).toBeLessThan(duration - 1);
  expect(Math.abs((await num(endHandle(page))) - duration / 2)).toBeLessThan(0.3);

  const s = await box(startHandle(page));
  await touchDrag(page, { x: s.x + s.width - 6, y }, { x: t.x + t.width * 0.25, y });
  await expect.poll(() => num(startHandle(page))).toBeGreaterThan(0.5);
  expect(Math.abs((await num(startHandle(page))) - duration / 4)).toBeLessThan(0.3);

  expect(await page.evaluate(() => (window as unknown as { pointerTypes: string[] }).pointerTypes)).toContain("touch");
  await expectNoPageScroll(page);
});

test("export view: the whole screen, the quality switch (off), and a bar that never shows 100% before the file is ready", async ({ page }) => {
  await openClip(page);
  await page.getByRole("button", { name: "Export", exact: true }).tap();
  const dialog = page.getByRole("dialog", { name: "Export" });
  await expect(dialog).toBeVisible();
  const d = await box(dialog);
  expect(d).toEqual({ x: 0, y: 0, width: 390, height: 844 });
  await expect(dialog.getByRole("switch", { name: "Preview quality" })).toHaveAttribute("aria-checked", "false");
  for (const label of ["MP4", "WebM", "Best quality", "Target", "Start export", "Close"]) {
    for (const button of await dialog.getByRole("button", { name: label, exact: true }).all()) {
      const b = await box(button);
      expect(b.height, label).toBeGreaterThanOrEqual(44);
      expect(b.width, label).toBeGreaterThanOrEqual(44);
    }
  }
  await expectNoPageScroll(page);

  await dialog.getByRole("button", { name: "Target", exact: true }).tap();
  await dialog.getByRole("textbox", { name: "Target size (MB)" }).fill("1");
  await dialog.getByRole("button", { name: "Start export" }).tap();
  const bar = dialog.getByRole("progressbar");
  await expect(bar).toBeVisible();
  const download = dialog.getByRole("link", { name: "Download" });
  const seen: number[] = [];
  while (!(await download.isVisible())) {
    const now = await bar.getAttribute("aria-valuenow", { timeout: 250 }).catch(() => null);
    if (now !== null) seen.push(Number(now));
    await page.waitForTimeout(50);
  }
  expect(seen.length).toBeGreaterThan(0);
  expect(Math.max(...seen)).toBeLessThan(100);
  expect((await box(download)).height).toBeGreaterThanOrEqual(44);
  await expectNoPageScroll(page);
});
