import { expect, test, type Locator } from "@playwright/test";
import { estimate, gotoStudio, isPhone, openClip, presetPicker, tapOrClick } from "./fixtures";

test.beforeEach(async ({ page }) => gotoStudio(page));

/** The visible controls in `root`, in DOM (= Tab) order, with where they sit on screen. */
function controlsInTabOrder(root: Locator) {
  return root.evaluate((el) =>
    Array.from(el.querySelectorAll<HTMLElement>("button, select, input, a[href]"))
      .map((c) => ({ c, r: c.getBoundingClientRect() }))
      .filter(({ r }) => r.width > 0 && r.height > 0)
      .map(({ c, r }) => ({
        name: c.getAttribute("aria-label") || c.textContent?.trim() || c.tagName,
        x: r.left,
        cy: r.top + r.height / 2,
        h: r.height,
      }))
  );
}

test("the top bar's Tab order is its visual order, row by row, with the Form upload size showing", async ({ page }) => {
  await openClip(page);
  await presetPicker(page).selectOption("form");
  await expect(page.getByRole("textbox", { name: "Target size in MB" })).toBeVisible();
  const bar = presetPicker(page).locator("xpath=ancestor::header[1]");
  const controls = await controlsInTabOrder(bar);
  expect(controls.map((c) => c.name)).toEqual(expect.arrayContaining(["Preset", "Target size in MB", "Apply", "Export"]));
  for (let i = 1; i < controls.length; i++) {
    const [a, b] = [controls[i - 1], controls[i]];
    const sameRow = Math.abs(a.cy - b.cy) < Math.min(a.h, b.h) / 2;
    expect(sameRow ? b.x > a.x : b.cy > a.cy, `Tab from "${a.name}" to "${b.name}" goes back on screen`).toBe(true);
  }
});

type Rgba = [number, number, number, number];

/** WCAG contrast of an element's text against the colours painted under it (its own and its ancestors' backgrounds). */
function textContrast(loc: Locator): Promise<number> {
  return loc.evaluate((el) => {
    const parse = (c: string): Rgba => {
      const p = (c.match(/\(([^)]+)\)/)?.[1] ?? "0,0,0,0").split(/[\s,/]+/).filter(Boolean).map(Number);
      return [p[0], p[1], p[2], p.length > 3 ? p[3] : 1];
    };
    const layers: Rgba[] = [];
    for (let n: Element | null = el; n; n = n.parentElement) layers.unshift(parse(getComputedStyle(n).backgroundColor));
    let bg: [number, number, number] = [255, 255, 255];
    for (const [r, g, b, a] of layers) bg = [r * a + bg[0] * (1 - a), g * a + bg[1] * (1 - a), b * a + bg[2] * (1 - a)];
    const [fr, fg, fb, fa] = parse(getComputedStyle(el).color);
    const fore = [fr * fa + bg[0] * (1 - fa), fg * fa + bg[1] * (1 - fa), fb * fa + bg[2] * (1 - fa)];
    const lum = (rgb: number[]) => {
      const [r, g, b] = rgb.map((v) => {
        const s = v / 255;
        return s <= 0.03928 ? s / 12.92 : ((s + 0.055) / 1.055) ** 2.4;
      });
      return 0.2126 * r + 0.7152 * g + 0.0722 * b;
    };
    const [hi, lo] = [lum(fore), lum(bg)].sort((x, y) => y - x);
    return (hi + 0.05) / (lo + 0.05);
  });
}

test("light theme: the amber warnings and the No sound badge are readable (4.5:1); the estimate line is a live region", async ({
  page,
}, info) => {
  await page.addInitScript(() => localStorage.setItem("theme", "light"));
  await gotoStudio(page);
  await openClip(page, { seconds: 6 });
  expect(await page.evaluate(() => document.documentElement.classList.contains("dark"))).toBe(false);

  // Sound off, then a target too small for the clip: both amber texts on the estimate line.
  await tapOrClick(page.getByRole("navigation", { name: "Video tools" }).getByRole("button", { name: "Sound", exact: true }), info);
  await page.getByRole("radio", { name: "Off" }).click();
  if (isPhone(info)) await page.getByRole("dialog", { name: "Sound" }).getByRole("button", { name: "Done" }).tap();
  await presetPicker(page).selectOption("form");
  await page.getByRole("textbox", { name: "Target size in MB" }).fill("0.1");
  await page.getByRole("button", { name: "Apply", exact: true }).click();

  const warning = estimate(page).getByText(/That size is too small/);
  const badge = estimate(page).getByText("No sound");
  await expect(warning).toBeVisible();
  await expect(badge).toBeVisible();
  expect(await textContrast(warning)).toBeGreaterThanOrEqual(4.5);
  expect(await textContrast(badge)).toBeGreaterThanOrEqual(4.5);
  // A screen reader hears the line change when settings stop working (and start again).
  await expect(estimate(page)).toHaveAttribute("aria-live", "polite");
});
