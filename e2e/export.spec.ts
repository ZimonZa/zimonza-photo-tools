import { statSync } from "node:fs";
import { expect, test, type Page } from "@playwright/test";
import { estimate, gotoStudio, openClip, presetPicker } from "./fixtures";

const exportDialog = (page: Page) => page.getByRole("dialog", { name: "Export" });

async function openExport(page: Page) {
  await page.getByRole("button", { name: "Export", exact: true }).click();
  const dialog = exportDialog(page);
  await expect(dialog).toBeVisible();
  return dialog;
}

test.beforeEach(async ({ page }) => gotoStudio(page));

test("Target 2 MB: the downloaded file is at most 2 MB and the result has the planned size", async ({ page }) => {
  await openClip(page, { seconds: 6 });
  const dialog = await openExport(page);
  await dialog.getByRole("button", { name: "Target", exact: true }).click();
  await dialog.getByRole("textbox", { name: "Target size (MB)" }).fill("2");
  const planned = (await dialog.getByTestId("export-resolution").innerText()).match(/(\d+)×(\d+)/)!;
  await dialog.getByRole("button", { name: "Start export" }).click();

  const download = dialog.getByRole("link", { name: "Download" });
  await expect(download).toBeVisible({ timeout: 150_000 });
  await expect(dialog.getByText(/\d+\.\d\d MB · \d+×\d+/)).toBeVisible();

  const video = dialog.getByLabel("Exported video");
  await expect.poll(() => video.evaluate((v: HTMLVideoElement) => v.videoWidth)).toBeGreaterThan(0);
  const [w, h] = await video.evaluate((v: HTMLVideoElement) => [v.videoWidth, v.videoHeight]);
  expect([w, h]).toEqual([Number(planned[1]), Number(planned[2])]);

  const [saved] = await Promise.all([page.waitForEvent("download"), download.click()]);
  expect(saved.suggestedFilename()).toBe("test-clip-zimonza.mp4");
  const path = await saved.path();
  expect(statSync(path).size).toBeLessThanOrEqual(2_000_000);
});

test("WebM: the download is named .webm", async ({ page }) => {
  await openClip(page, { seconds: 3 });
  const dialog = await openExport(page);
  await dialog.getByRole("button", { name: "WebM", exact: true }).click();
  await dialog.getByRole("button", { name: "Start export" }).click();
  const download = dialog.getByRole("link", { name: "Download" });
  await expect(download).toBeVisible({ timeout: 150_000 });
  const [saved] = await Promise.all([page.waitForEvent("download"), download.click()]);
  expect(saved.suggestedFilename()).toMatch(/\.webm$/);
});

test("WebM this device can't make quickly: the question offers MP4 first, which exports at once as .mp4 and turns the format MP4", async ({
  page,
}) => {
  // Like most iPhones: no Opus encoder, so WebM would need the backup engine; MP4 (AAC) is fine.
  await page.addInitScript(() => {
    const supported = AudioEncoder.isConfigSupported.bind(AudioEncoder);
    AudioEncoder.isConfigSupported = (config: AudioEncoderConfig) =>
      config.codec === "opus" ? Promise.resolve({ supported: false, config }) : supported(config);
  });
  await gotoStudio(page);
  await openClip(page, { seconds: 3 });
  const dialog = await openExport(page);
  await dialog.getByRole("button", { name: "WebM", exact: true }).click();
  await dialog.getByRole("button", { name: "Start export" }).click();

  const question = page.getByRole("alertdialog");
  await expect(question).toContainText("Make WebM with the slower engine?");
  const mp4 = question.getByRole("button", { name: "Export as MP4" });
  await expect(mp4).toBeFocused();
  await expect(question.getByRole("button", { name: "Make WebM anyway" })).toBeVisible();
  await mp4.click();

  const download = dialog.getByRole("link", { name: "Download" });
  await expect(download).toBeVisible({ timeout: 150_000 });
  await expect(download).toHaveAttribute("download", "test-clip-zimonza.mp4");
  await dialog.getByRole("button", { name: "Edit again" }).click();
  await expect(estimate(page)).toContainText("MP4");
  const reopened = await openExport(page);
  await expect(reopened.getByRole("button", { name: "MP4", exact: true })).toHaveAttribute("aria-pressed", "true");
});

test("Cancel during an export returns to the editor, and a new export completes", async ({ page }) => {
  // Long and heavy enough that the encode cannot finish before Cancel is clicked.
  await openClip(page, { seconds: 20, width: 1920, height: 1080 });
  const dialog = await openExport(page);
  await dialog.getByRole("button", { name: "High", exact: true }).click();
  await dialog.getByRole("button", { name: "Start export" }).click();
  await expect(dialog.getByRole("progressbar")).toBeVisible();
  await dialog.getByRole("button", { name: "Cancel" }).click();
  await expect(exportDialog(page)).toHaveCount(0);
  await expect(estimate(page)).toContainText("MB");

  // Canceled for real: the view opens on the settings, with no finished result.
  const again = await openExport(page);
  await expect(again.getByRole("button", { name: "Start export" })).toBeVisible({ timeout: 30_000 });
  await expect(again.getByRole("link", { name: "Download" })).toHaveCount(0);
  await again.getByRole("button", { name: "Start export" }).click();
  await expect(again.getByRole("link", { name: "Download" })).toBeVisible({ timeout: 170_000 });
});

test("Edit again keeps every setting", async ({ page }) => {
  await openClip(page, { seconds: 3 });
  const before = await estimate(page).innerText();
  const dialog = await openExport(page);
  await dialog.getByRole("button", { name: "WebM", exact: true }).click();
  await dialog.getByRole("button", { name: "Target", exact: true }).click();
  await dialog.getByRole("textbox", { name: "Target size (MB)" }).fill("1");
  const changed = await estimate(page).innerText();
  expect(changed).not.toBe(before);
  await dialog.getByRole("button", { name: "Start export" }).click();
  await expect(dialog.getByRole("link", { name: "Download" })).toBeVisible({ timeout: 150_000 });
  await dialog.getByRole("button", { name: "Edit again" }).click();
  await expect(exportDialog(page)).toHaveCount(0);
  await expect(estimate(page)).toHaveText(changed);

  const reopened = await openExport(page);
  await expect(reopened.getByRole("button", { name: "WebM", exact: true })).toHaveAttribute("aria-pressed", "true");
  await expect(reopened.getByRole("textbox", { name: "Target size (MB)" })).toHaveValue("1");
});

test("Escape leaves the export view from settings and from the result; Tab stays inside", async ({ page }) => {
  await openClip(page, { seconds: 3 });
  let dialog = await openExport(page);
  await page.keyboard.press("Escape");
  await expect(exportDialog(page)).toHaveCount(0);

  dialog = await openExport(page);
  await dialog.getByRole("button", { name: "Start export" }).click();
  const download = dialog.getByRole("link", { name: "Download" });
  await expect(download).toBeVisible({ timeout: 150_000 });
  for (let i = 0; i < 12; i++) {
    await page.keyboard.press("Tab");
    expect(await dialog.evaluate((d) => d.contains(document.activeElement))).toBe(true);
  }
  await page.keyboard.press("Escape");
  await expect(exportDialog(page)).toHaveCount(0);
  await expect(estimate(page)).toContainText("MB");
});

test("the preview pauses under the export view, stops moving, and stays paused after it closes", async ({ page }) => {
  await openClip(page, { seconds: 4 });
  const video = page.getByLabel("Preview", { exact: true }).locator("video").first();
  const playhead = page.getByRole("slider", { name: "Playhead" });
  await page.getByRole("button", { name: "Play", exact: true }).click();
  await expect.poll(() => video.evaluate((v: HTMLVideoElement) => !v.paused && v.currentTime > 0.2)).toBe(true);

  await openExport(page);
  await expect.poll(() => video.evaluate((v: HTMLVideoElement) => v.paused)).toBe(true);
  const time = await video.evaluate((v: HTMLVideoElement) => v.currentTime);
  const shown = await playhead.getAttribute("aria-valuenow");
  await page.waitForTimeout(1200);
  expect(await video.evaluate((v: HTMLVideoElement) => v.currentTime)).toBe(time);
  expect(await playhead.getAttribute("aria-valuenow")).toBe(shown);

  // Closing the view doesn't start it again.
  await page.keyboard.press("Escape");
  await expect(exportDialog(page)).toHaveCount(0);
  await page.waitForTimeout(800);
  expect(await video.evaluate((v: HTMLVideoElement) => v.paused)).toBe(true);
  await expect(page.getByRole("button", { name: "Play", exact: true })).toBeVisible();
});

test("Export is disabled while the settings can't produce a file", async ({ page }) => {
  await openClip(page, { seconds: 3 });
  const dialog = await openExport(page);
  await dialog.getByRole("button", { name: "Target", exact: true }).click();
  await dialog.getByRole("textbox", { name: "Target size (MB)" }).fill("0.001");
  await expect(dialog.getByRole("button", { name: "Start export" })).toBeDisabled();
  await expect(dialog.getByRole("alert")).toBeVisible();
});

test("Form upload: Escape drops the question and the dropdown returns to the previous preset", async ({ page }) => {
  await openClip(page, { seconds: 3 });
  await presetPicker(page).selectOption("ig-reel");
  await presetPicker(page).selectOption("form");
  await expect(page.getByRole("textbox", { name: "Target size in MB" })).toBeVisible();
  await page.keyboard.press("Escape");
  await expect(page.getByRole("textbox", { name: "Target size in MB" })).toHaveCount(0);
  await expect(presetPicker(page)).toHaveValue("ig-reel");

  await presetPicker(page).selectOption("form");
  await page.getByRole("button", { name: "Cancel", exact: true }).click();
  await expect(presetPicker(page)).toHaveValue("ig-reel");
});
