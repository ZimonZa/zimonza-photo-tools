import { expect, test } from "@playwright/test";
import { recordClip } from "./fixtures";

const TOOLS = ["Trim", "Crop", "Size", "Rotate", "Sound"];

test.beforeEach(async ({ page }) => {
  await page.goto("/video/");
  await expect(page.getByText("Drop a video here")).toBeVisible();
});

test("drop a video → editor with name and estimate", async ({ page }) => {
  await recordClip(page, { seconds: 4, width: 1280, height: 720 });
  await expect(page.getByText("test-clip.mp4")).toBeVisible();
  await expect(page.getByText(/≈ .* MB · 1280×720/)).toBeVisible();
});

test("desktop shows the rail and settings panel; phone shows the tool bar and opens a sheet", async ({ page }, info) => {
  await recordClip(page, { seconds: 4 });
  await expect(page.getByText("test-clip.mp4")).toBeVisible();
  for (const name of TOOLS) await expect(page.getByRole("button", { name, exact: true })).toBeVisible();
  if (info.project.name === "desktop") {
    await expect(page.getByLabel("Tool settings")).toBeVisible();
    await expect(page.getByLabel("Timeline")).toBeVisible();
    await expect(page.getByRole("dialog")).toHaveCount(0);
  } else {
    await page.getByRole("button", { name: "Crop", exact: true }).tap();
    const sheet = page.getByRole("dialog", { name: "Crop" });
    await expect(sheet).toBeVisible();
    await sheet.getByRole("button", { name: "Done" }).tap();
    await expect(sheet).toBeHidden();
  }
});

test("New video returns to the dropzone", async ({ page }) => {
  await recordClip(page, { seconds: 4 });
  await expect(page.getByText("test-clip.mp4")).toBeVisible();
  await page.getByRole("button", { name: "New video" }).click();
  await expect(page.getByText("Drop a video here")).toBeVisible();
});

test("layout: top bar sits in the left column on desktop; the studio fits the viewport on phone", async ({ page }, info) => {
  await recordClip(page, { seconds: 4 });
  await expect(page.getByText("test-clip.mp4")).toBeVisible();
  const box = async (loc: ReturnType<typeof page.locator>) => (await loc.boundingBox())!;
  const vh = page.viewportSize()!.height;
  const header = page.locator("body > div > header").first();
  if (info.project.name === "desktop") {
    const name = await box(page.getByText("test-clip.mp4"));
    const preview = await box(page.getByLabel("Preview"));
    expect(name.x).toBeLessThan(preview.x);
  }
  const checkFits = async () => {
    const tools = await box(page.getByRole("navigation", { name: "Video tools" }));
    expect(tools.y).toBeGreaterThanOrEqual(0);
    expect(tools.y + tools.height).toBeLessThanOrEqual(vh + 0.5);
    const top = await box(page.getByRole("button", { name: "New video" }));
    const head = await box(header);
    expect(top.y).toBeGreaterThanOrEqual(head.y + head.height - 0.5);
  };
  await checkFits();
  if (info.project.name === "phone") {
    await page.getByRole("button", { name: "Crop", exact: true }).tap();
    await expect(page.getByRole("dialog", { name: "Crop" })).toBeVisible();
    await checkFits();
    await page.getByRole("dialog").getByRole("button", { name: "Done" }).tap();
    await checkFits();
    expect(await page.evaluate(() => window.scrollY)).toBe(0);
  }
});
