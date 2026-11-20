import { defineConfig } from "@playwright/test";

/** End-to-end tests run against the static export (`out/`), served on port 3200. */
export default defineConfig({
  testDir: "e2e",
  timeout: 180_000,
  expect: { timeout: 15_000 },
  workers: 1,
  reporter: [["list"]],
  webServer: {
    command: "npx serve@14 out -l 3200 --no-clipboard",
    port: 3200,
    reuseExistingServer: true,
  },
  use: { baseURL: "http://localhost:3200", channel: "chrome" },
  projects: [
    { name: "desktop", use: { viewport: { width: 1280, height: 800 } } },
    { name: "phone", use: { viewport: { width: 390, height: 844 }, isMobile: true, hasTouch: true } },
  ],
});
