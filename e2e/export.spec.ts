import { statSync } from "node:fs";
import { expect, test, type Page } from "@playwright/test";
import { recordClip, type ClipOptions } from "./fixtures";

const estimate = (page: Page) => page.getByTestId("estimate");
const presetPicker = (page: Page) => page.getByRole("combobox", { name: "Preset" });
const exportDialog = (page: Page) => page.getByRole("dialog", { name: "Export" });

async function openClip(page: Page, opts: ClipOptions = {}) {
  await recordClip(page, { seconds: 6, width: 1280, height: 720, ...opts });
  await expect(page.getByText("test-clip.mp4")).toBeVisible();
  await expect(estimate(page)).toContainText("MB");
}

async function openExport(page: Page) {
  await page.getByRole("button", { name: "Export", exact: true }).click();
  const dialog = exportDialog(page);
  await expect(dialog).toBeVisible();
  return dialog;
}

test.beforeEach(async ({ page }) => {
  await page.goto("/video/");
  await expect(page.getByText("Drop a video here")).toBeVisible();
});

test("Target 2 MB: the downloaded file is at most 2 MB and the result has the planned size", async ({ page }) => {
  await openClip(page);
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

test("Cancel during an export returns to the editor, and a new export completes", async ({ page }) => {
  await openClip(page);
  const dialog = await openExport(page);
  await dialog.getByRole("button", { name: "Start export" }).click();
  await expect(dialog.getByRole("progressbar")).toBeVisible();
  await dialog.getByRole("button", { name: "Cancel" }).click();
  await expect(exportDialog(page)).toHaveCount(0);
  await expect(estimate(page)).toContainText("MB");

  const again = await openExport(page);
  await expect(again.getByRole("button", { name: "Start export" })).toBeVisible({ timeout: 30_000 });
  await again.getByRole("button", { name: "Start export" }).click();
  await expect(again.getByRole("link", { name: "Download" })).toBeVisible({ timeout: 150_000 });
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
