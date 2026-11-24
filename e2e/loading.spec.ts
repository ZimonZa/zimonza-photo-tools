import { expect, test, type Page } from "@playwright/test";
import { recordClip } from "./fixtures";

/**
 * Make this page's browser refuse to play any file (the playability check gets an error), so
 * opening one goes through "Preparing preview…" and a low-res proxy. With `hold`, the proxy's
 * encoder never finishes, so the state stays up. Also records which loading messages showed.
 */
async function unplayableBrowser(page: Page, { hold }: { hold: boolean }) {
  await page.addInitScript((hold) => {
    const w = window as unknown as { seen: string[] };
    w.seen = [];
    new MutationObserver(() => {
      const text = document.querySelector('[role="status"]')?.textContent ?? "";
      for (const t of ["Reading the video…", "Preparing preview…"]) if (text.includes(t) && !w.seen.includes(t)) w.seen.push(t);
    }).observe(document, { subtree: true, childList: true, characterData: true });

    // The app's playability check sets `video.src`; React sets the preview's src as an attribute.
    const src = Object.getOwnPropertyDescriptor(HTMLMediaElement.prototype, "src")!;
    Object.defineProperty(HTMLMediaElement.prototype, "src", {
      configurable: true,
      get() {
        return src.get!.call(this);
      },
      set(this: HTMLMediaElement) {
        setTimeout(() => this.dispatchEvent(new Event("error")), 0);
      },
    });
    if (hold) VideoEncoder.prototype.flush = () => new Promise<void>(() => {});
  }, hold);
}

const seen = (page: Page) => page.evaluate(() => (window as unknown as { seen: string[] }).seen);

test("opening a file shows Reading the video…, then Preparing preview… with a Cancel that returns to the dropzone", async ({
  page,
}) => {
  await unplayableBrowser(page, { hold: true });
  await page.goto("/video/");
  await expect(page.getByText("Drop a video here")).toBeVisible();
  await recordClip(page, { seconds: 3 });
  const status = page.getByRole("status").filter({ hasText: "Preparing preview…" });
  await expect(status).toBeVisible();
  expect(await seen(page)).toEqual(["Reading the video…", "Preparing preview…"]);

  const cancel = page.getByRole("button", { name: "Cancel" });
  const b = (await cancel.boundingBox())!;
  expect(b.height).toBeGreaterThanOrEqual(44);
  await cancel.click();
  await expect(page.getByText("Drop a video here")).toBeVisible();
  await expect(status).toHaveCount(0);
});

test("a file the browser can't play opens with a low-res preview", async ({ page }) => {
  await unplayableBrowser(page, { hold: false });
  await page.goto("/video/");
  await expect(page.getByText("Drop a video here")).toBeVisible();
  await recordClip(page, { seconds: 3 });
  await expect(page.getByText("Low-res preview")).toBeVisible({ timeout: 60_000 });
  expect(await seen(page)).toEqual(["Reading the video…", "Preparing preview…"]);
  await expect(page.getByRole("img", { name: "Video preview" })).toBeVisible();
});
