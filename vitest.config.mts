import { fileURLToPath } from "node:url";
import { playwright } from "@vitest/browser-playwright";
import { defineConfig } from "vitest/config";

const root = fileURLToPath(new URL(".", import.meta.url));

export default defineConfig({
  esbuild: { jsx: "automatic" },
  resolve: {
    alias: { "@": root },
  },
  test: {
    projects: [
      {
        extends: true,
        test: {
          name: "unit",
          environment: "node",
          include: ["lib/**/*.test.ts", "store/**/*.test.ts"],
          exclude: ["lib/**/*.browser.test.ts", "node_modules/**"],
        },
      },
      {
        extends: true,
        // Pre-bundle so Vite doesn't reload the page mid-run when it first discovers these deps.
        optimizeDeps: { include: ["mediabunny", "@ffmpeg/ffmpeg"] },
        // Next.js inlines NEXT_PUBLIC_* at build time; tests serve public/ from the root.
        define: { "process.env.NEXT_PUBLIC_BASE_PATH": JSON.stringify("") },
        test: {
          name: "browser",
          include: ["lib/**/*.browser.test.ts", "components/**/*.browser.test.tsx"],
          testTimeout: 60_000,
          browser: {
            enabled: true,
            headless: true,
            // The installed Google Chrome ships H.264/AAC WebCodecs support; Playwright's bundled Chromium does not.
            provider: playwright({ launchOptions: { channel: "chrome" } }),
            instances: [{ browser: "chromium" }],
          },
        },
      },
    ],
  },
});
