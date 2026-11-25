import { expect, test, type Locator } from "@playwright/test";
import { gotoStudio, isPhone, openClip } from "./fixtures";

const TOOLS = ["Trim", "Crop", "Size", "Rotate", "Sound"];

test.beforeEach(async ({ page }) => gotoStudio(page));

/**
 * One clip for the whole shell. Phone sheets (opening, Done, staying on screen, no page scroll) are
 * phone.spec's; this keeps what it doesn't check.
 */
test("the editor shell: name and estimate, the tools, the desktop rail and panel, all under the site header", async ({
  page,
}, info) => {
  await openClip(page);
  await expect(page.getByText(/≈ .* MB · 1280×720/)).toBeVisible();
  for (const name of TOOLS) await expect(page.getByRole("button", { name, exact: true })).toBeVisible();

  const box = async (loc: Locator) => (await loc.boundingBox())!;
  if (!isPhone(info)) {
    await expect(page.getByLabel("Tool settings")).toBeVisible();
    await expect(page.getByLabel("Timeline")).toBeVisible();
    await expect(page.getByRole("dialog")).toHaveCount(0);
    // The top bar starts in the rail's column, left of the preview.
    expect((await box(page.getByText("test-clip.mp4"))).x).toBeLessThan((await box(page.getByLabel("Preview", { exact: true }))).x);
  }

  // The studio fills the screen under the site header: its top bar below it, the tools on screen.
  const tools = await box(page.getByRole("navigation", { name: "Video tools" }));
  expect(tools.y).toBeGreaterThanOrEqual(0);
  expect(tools.y + tools.height).toBeLessThanOrEqual(page.viewportSize()!.height + 0.5);
  const head = await box(page.locator("body > div > header").first());
  expect((await box(page.getByRole("button", { name: "New video" }))).y).toBeGreaterThanOrEqual(head.y + head.height - 0.5);
});

test("New video returns to the dropzone", async ({ page }) => {
  await openClip(page);
  await page.getByRole("button", { name: "New video" }).click();
  await expect(page.getByText("Drop a video here")).toBeVisible();
});
