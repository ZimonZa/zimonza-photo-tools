import { expect, test, type Locator, type Page } from "@playwright/test";
import { recordClip } from "./fixtures";

const startHandle = (page: Page) => page.getByRole("slider", { name: "Trim start" });
const endHandle = (page: Page) => page.getByRole("slider", { name: "Trim end" });
const track = (page: Page) => page.getByTestId("timeline-track");
const num = async (loc: Locator, attr = "aria-valuenow") => Number(await loc.getAttribute(attr));

async function estimateMb(page: Page): Promise<number> {
  const text = await page.getByText(/≈ [\d.]+ MB/).first().innerText();
  return Number(/≈ ([\d.]+) MB/.exec(text)![1]);
}

/**
 * Press on a handle's bar and drag it to `fraction` of the track width (0 = left end, 1 = right end).
 * The bar is the hit area's inner edge (start: right edge, end: left edge).
 */
async function dragHandle(page: Page, handle: Locator, fraction: number) {
  const t = (await track(page).boundingBox())!;
  const h = (await handle.boundingBox())!;
  const isStart = (await handle.getAttribute("aria-label")) === "Trim start";
  await page.mouse.move(isStart ? h.x + h.width - 4 : h.x + 4, h.y + h.height / 2);
  await page.mouse.down();
  await page.mouse.move(t.x + t.width * fraction, h.y + h.height / 2, { steps: 12 });
  await page.mouse.up();
}

test.beforeEach(async ({ page }) => {
  await page.goto("/video/");
  await expect(page.getByText("Drop a video here")).toBeVisible();
  await recordClip(page, { seconds: 4, width: 1280, height: 720 });
  await expect(page.getByText("test-clip.mp4")).toBeVisible();
  await expect(endHandle(page)).toBeVisible();
});

test("dragging the end handle to the middle halves the trim and shrinks the estimate", async ({ page }, info) => {
  const duration = await num(endHandle(page));
  expect(duration).toBeGreaterThan(3);
  const before = await estimateMb(page);
  await dragHandle(page, endHandle(page), 0.5);
  const end = await num(endHandle(page));
  expect(Math.abs(end - duration / 2)).toBeLessThan(0.3);
  if (info.project.name === "desktop") {
    await expect(page.getByLabel("End (s)")).toHaveValue(end.toFixed(1));
  }
  await expect.poll(() => estimateMb(page)).toBeLessThan(before);
});

test("dragging the start handle past the end stops 0.1 s before it", async ({ page }) => {
  await dragHandle(page, endHandle(page), 0.5);
  const end = await num(endHandle(page));
  await dragHandle(page, startHandle(page), 1);
  const start = await num(startHandle(page));
  expect(end - start).toBeCloseTo(0.1, 1);
});

test("the left arrow on the end handle lowers it by 0.1 s, Shift by 1 s", async ({ page }) => {
  const before = await num(endHandle(page));
  await endHandle(page).focus();
  await page.keyboard.press("ArrowLeft");
  expect(await num(endHandle(page))).toBeCloseTo(before - 0.1, 1);
  await page.keyboard.press("Shift+ArrowLeft");
  expect(await num(endHandle(page))).toBeCloseTo(before - 1.1, 1);
  await page.keyboard.press("ArrowRight");
  expect(await num(endHandle(page))).toBeCloseTo(before - 1, 1);
});

test("trim panel: use playhead buttons and reset", async ({ page }, info) => {
  test.skip(info.project.name !== "desktop", "the panel is always visible on desktop");
  const duration = await num(endHandle(page), "aria-valuemax");
  const playhead = page.getByRole("slider", { name: "Playhead" });
  const seekTo = async (fraction: number) => {
    const t = (await track(page).boundingBox())!;
    await page.mouse.click(t.x + t.width * fraction, t.y + t.height / 2);
    await expect.poll(() => num(playhead)).toBeCloseTo(duration * fraction, 0);
    return num(playhead);
  };

  const at = await seekTo(0.25);
  await page.getByRole("button", { name: "Use playhead as start" }).click();
  await expect.poll(() => num(startHandle(page))).toBeCloseTo(at, 1);
  await expect(page.getByLabel("Start (s)")).toHaveValue(at.toFixed(1));

  const to = await seekTo(0.75);
  await page.getByRole("button", { name: "Use playhead as end" }).click();
  await expect.poll(() => num(endHandle(page))).toBeCloseTo(to, 1);
  await expect(page.getByLabel("End (s)")).toHaveValue(to.toFixed(1));
  expect(await num(startHandle(page))).toBeCloseTo(at, 1);

  await page.getByRole("button", { name: "Reset trim" }).click();
  expect(await num(endHandle(page))).toBeCloseTo(duration, 1);
  expect(await num(startHandle(page))).toBe(0);
});

test("playback never shows a time outside the trim", async ({ page }) => {
  await dragHandle(page, endHandle(page), 0.5);
  await dragHandle(page, startHandle(page), 0.1);
  const start = await num(startHandle(page));
  const end = await num(endHandle(page));
  const video = page.getByLabel("Preview", { exact: true }).locator("video").first();
  await page.getByRole("button", { name: "Play", exact: true }).click();
  await expect(page.getByRole("button", { name: "Pause", exact: true })).toBeVisible();
  const seen: number[] = [];
  for (let i = 0; i < 10; i++) {
    seen.push(await video.evaluate((v: HTMLVideoElement) => v.currentTime));
    await page.waitForTimeout(350);
  }
  for (const t of seen) {
    expect(t).toBeGreaterThanOrEqual(start - 0.15);
    expect(t).toBeLessThanOrEqual(end + 0.15);
  }
  // It really was playing, and wrapped at least once (1.8 s of trim, 3.5 s of sampling).
  expect(Math.max(...seen) - Math.min(...seen)).toBeGreaterThan(0.3);
});

test("clicking the timeline seeks the video, also to the time it already shows", async ({ page }) => {
  const video = page.getByLabel("Preview", { exact: true }).locator("video").first();
  const videoTime = () => video.evaluate((v: HTMLVideoElement) => v.currentTime);
  const t = (await track(page).boundingBox())!;
  const clickMiddle = () => page.mouse.click(t.x + t.width * 0.5, t.y + t.height / 2);
  await clickMiddle();
  const mid = await num(page.getByRole("slider", { name: "Playhead" }));
  expect(mid).toBeGreaterThan(1);
  await expect.poll(videoTime).toBeCloseTo(mid, 1);

  // Play on from there, pause, and click the very same spot: the video goes back to it.
  await page.getByRole("button", { name: "Play", exact: true }).click();
  await expect.poll(videoTime).toBeGreaterThan(mid + 0.4);
  await page.getByRole("button", { name: "Pause", exact: true }).click();
  await clickMiddle();
  await expect.poll(videoTime).toBeCloseTo(mid, 1);
});

test("desktop: at the minimum trim both handles stay grabbable; the start handle can widen it", async ({ page }, info) => {
  test.skip(info.project.name !== "desktop", "mouse drag at desktop width");
  await dragHandle(page, endHandle(page), 0.5);
  await dragHandle(page, startHandle(page), 1);
  const start = await num(startHandle(page));
  const end = await num(endHandle(page));
  expect(end - start).toBeCloseTo(0.1, 2);
  await dragHandle(page, startHandle(page), 0.1);
  expect(await num(startHandle(page))).toBeLessThan(start - 0.5);
  expect(await num(endHandle(page))).toBeCloseTo(end, 2);
});
