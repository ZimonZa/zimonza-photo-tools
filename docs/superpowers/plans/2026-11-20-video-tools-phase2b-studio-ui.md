# Video Tools — Phase 2B: Video Studio UI — Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** The real video editor at `/video` — layout B on computers, the mobile-editor layout on phones — with a live edits preview, compressed-quality preview, timeline trim, crop, size, rotate/flip, sound, presets and a guarded export flow, built on the Phase 2A engine APIs; ends with Checkpoint 2 on the owner's phones.

**Architecture:** A Zustand store (`store/useVideoStore.ts`, built by a factory so tests inject fake engines) owns the loaded file, the recipe, the selected tool, the quality-sample state and the export state machine. Pure helpers (`lib/video/plan-output.ts`, `timeline.ts`, `messages.ts`, `frame.ts` crop remap) carry all decisions and are unit-tested. A canvas renderer (`lib/video/preview-render.ts`) draws each playing frame with the same rotate → flip → crop → fit rules as the engines, so the preview is what you get. Components in `components/video/studio/` are thin; Playwright end-to-end tests drive the built site on desktop and phone viewports.

**Tech Stack:** Next.js 14.2 static export, React 18, TypeScript strict, Tailwind (existing tokens: `glass`, `accent`, `accent2`, `muted`, `border`), lucide-react icons, Zustand 4, react-dropzone, react-easy-crop (supports a `video` source), Mediabunny 1.66.1 (thumbnails), Vitest 4.1.12 unit + browser, **@playwright/test** (new, free) for end-to-end.

**Spec:** `docs/superpowers/specs/2026-11-19-video-tools-design.md` (§6.2 features, §6.3 presets, §6.4 target size, §6.5 layout B + phone + live previews). Inputs: `docs/superpowers/checkpoints/2026-11-checkpoint-1.md`, `docs/superpowers/reviews/2026-11-20-phase2a-decisions.md`. Mockups: `.superpowers/brainstorm/1289-1795089246/content/video-studio-layout.html` (option B) and `video-studio-mobile.html`.

## Global Constraints

- Everything in the Phase 1 and 2A plans' Global Constraints still holds (static export, base path, free/OSS only, dynamic `import()` for heavy libs, output contract, "MB" = 1,000,000 bytes, results never over target, English copy, branch `feature/video-tools`, no push, git via `safe.directory` + existing author identity, `Co-Authored-By: Claude Opus 5.5 <noreply@anthropic.com>`).
- Route: `/video` (`app/video/page.tsx`), metadata `robots: { index: false, follow: false }` until Phase 4 adds nav, SEO pages and the rename. Not linked from the header, home page or sitemap yet. `/video/lab` stays.
- Breakpoint: `lg` (≥ 1024 px) = desktop layout B; below = phone layout.
- Desktop layout B: top bar (preset dropdown left, live estimate, **Export** button right); left vertical tool rail; centre preview; right settings panel for the selected tool; bottom timeline across the width.
- Phone layout: top bar (preset dropdown, **Export**); preview; clip strip with trim handles; estimate line; horizontally scrollable tool bar at the bottom; tapping a tool opens a **bottom sheet** with only that tool's settings while the preview stays visible; Export opens a full-screen export view.
- Tools in 2B (rail/tool bar order): **Trim, Crop, Size, Rotate, Sound**. Speed, Effects, Text arrive in Phase 3.
- Preview = what you get: rotate → flip H → flip V → crop → fit, drawn by `preview-render.ts`; blurred background uses `createBlurFitter` from `lib/video/engines/blur-fit.ts`.
- Compressed-quality preview: switch "Preview quality"; when on, ~1 s after settings or playhead stop changing, encode a 3-second sample via `previewSample`; show **Original | Compressed** toggle on the player and "Estimated size X MB". **Off by default on phones** (`isMobileDevice()`), on by default on computers. Never runs during an export (the library also enforces this).
- Never run two ffmpeg jobs at once (2A ruling) — the store runs at most one export at a time.
- Sound control must be unmistakable (Checkpoint 1 finding 5): a two-option **Sound: On | Off** control, and a visible "No sound" badge on the estimate line and export view whenever muted.
- The backup-engine wait dialog says "at least about N min" (2A ruling 13) and Cancel answers it with "no".
- Exact copy (use verbatim):
  - Dropzone: title "Drop a video here", subtitle "or tap to choose · MP4, MOV, WebM, MKV, AVI and more", privacy line "🔒 Your video stays on your device — nothing is uploaded."
  - Fit choices: "Crop to fill", "Blurred background".
  - Quality switch: "Preview quality"; toggle labels "Original", "Compressed"; unavailable: "Quality preview isn't available on this device."
  - Fallback dialog: title "Use the slower engine?", body "Your browser can't do this with the fast engine ({reason}). The backup engine will take at least about {N} min. Keep this tab open.", buttons "Continue" / "Cancel".
  - Leave-page warning while exporting (browser-native prompt; text set by the browser).

## Review Focus

1. **Changing rotation or flip after drawing a crop** → the crop keeps covering the same part of the picture (not a jumped region). Tests: Task 1 `remapCrop`; Task 6 end-to-end crop-then-rotate.
2. **A file the browser can't play natively (HEVC on some browsers)** → the editor still shows a working preview via a low-res proxy, or a clear message with thumbnails if even that fails — never a blank box. Tests: Task 2 store `openFile` proxy branches.
3. **Pressing Cancel while the slow-engine question is open, or during an export** → the dialog closes, nothing keeps running, the editor is usable again, and a new export can start. Tests: Task 2 store export machine; Task 7 end-to-end cancel.
4. **Settings that can't produce a file** (target too small, trim too short, size too small) → shown next to the Export button before exporting, with the fix in plain words; Export disabled. Tests: Task 1 `planOutput` + `describeExportError`; Task 6 end-to-end tiny target.
5. **Trim handles dragged past each other or past the ends** → handles stop at the clip ends and keep at least 0.1 s apart. Tests: Task 1 `dragTrim`; Task 5 end-to-end drag.

---

## File Structure

| File | Responsibility |
|---|---|
| `lib/video/plan-output.ts` (new) | Pure: info + recipe → plan, crop, fit, duration, estimated bytes (used by UI, `previewSample`, `exportVideo`'s prepare) |
| `lib/video/timeline.ts` (new) | Pure: time ↔ x, trim drag rules, time formatting |
| `lib/video/messages.ts` (new) | Pure: user-facing text for statuses and errors |
| `lib/video/frame.ts` | + `remapCrop`, `mirrorCropH` |
| `lib/video/export.ts` | + `probeVideo` public export; prepare uses `planOutput` |
| `lib/video/preview-render.ts` (new) | Browser: draw one frame with edits into a canvas |
| `lib/video/filmstrip.ts` (new) | Browser: N thumbnails for the timeline |
| `lib/video/playback.ts` (new) | Browser: `canPlayNatively`, `makePreviewProxy` |
| `store/useVideoStore.ts` (new) | `createVideoStore(deps)` + `useVideoStore`; load, recipe, presets, tools, quality sample, export machine |
| `app/video/page.tsx` (new) | Route shell (noindex) |
| `components/video/studio/*.tsx` (new) | `video-studio`, `video-dropzone`, `top-bar`, `tool-rail`, `bottom-sheet`, `preview-player`, `crop-editor`, `timeline`, `panels/{trim,crop,size,rotate,sound}-panel`, `export-view`, `fallback-dialog`, `use-export-guards` |
| `playwright.config.ts`, `e2e/*.spec.ts`, `e2e/fixtures.ts` (new) | End-to-end on desktop + phone viewports against `out/` |

---

### Task 1: Pure helpers for the editor

**Files:** Create `lib/video/plan-output.ts`, `lib/video/timeline.ts`, `lib/video/messages.ts` (+ `*.test.ts` each); modify `lib/video/frame.ts` (+ `frame.test.ts`), `lib/video/export.ts` (+ `export.test.ts`), `components/video/engine-lab.tsx` (use `describeStatus` from messages.ts).

**Interfaces — Produces:**
- `planOutput(info: VideoInfo, recipe: EditRecipe): { plan: EncodePlan; crop: CropRect | null; fit: FitMode | null; durationSec: number; trim: TrimRange | null; estimatedBytes: number }` — exactly the planning `exportVideo`/`previewSample` already do after probing (normalizeTrim, resolveFrame, source ceiling from `recipe.file.size`, quality/target planner); `estimatedBytes = round((videoBps + audioBps) × durationSec / 8)`, capped at the target in target mode. Throws `InvalidTrimError` / `InvalidSizeError` / `TargetTooSmallError` as planning does. `export.ts`'s `prepare` calls it (no duplicated planning).
- `export.ts`: `probeVideo(file: File, options?: ProbeOptions): Promise<VideoInfo>` (default deps' probe, dynamically imported engines).
- `frame.ts`: `mirrorCropH(crop: CropRect, pictureWidth: number): CropRect`; `remapCrop(crop: CropRect, display: Size, from: Orientation, to: Orientation): CropRect` where `Orientation = { rotate: Rotation; flipH: boolean; flipV: boolean }` — maps the crop from the picture oriented by `from` back to the display picture and forward into `to`, then `clampCrop`-style evening (may return the crop unchanged when `from` equals `to`).
- `timeline.ts`: `timeToX(t: number, durationSec: number, widthPx: number): number`; `xToTime(x: number, durationSec: number, widthPx: number): number` (clamped to [0, duration]); `dragTrim(trim: TrimRange, handle: "start" | "end", t: number, durationSec: number): TrimRange` (MIN_TRIM 0.1 s, clamped to ends); `formatTime(sec: number): string` ("0:08.6", "1:02.0", "12:05.3").
- `messages.ts`: `describeStatus(s: ExportStatus): string` (moved from the lab, same texts, `fallback` → "Switching to the backup engine: {reason}"); `describeExportError(e: unknown, targetBytes: number | null): { message: string; hint?: string } | null` (null for `ExportCanceledError`):
  - `TargetTooSmallError` → message "That size is too small for a video this long.", hint "Try at least {X} MB, or trim it shorter." (X = ceil(minBytes / 100 000) / 10)
  - `InvalidTrimError` → "The trimmed part is too short — keep at least 0.1 seconds."
  - `InvalidSizeError` → "That output size is too small. Use at least 16 × 16 pixels."
  - `TargetNotReachedError` → "Couldn't get the video under {target} MB.", hint "Try a lower resolution or a bigger target." (target = targetBytes / MB, 1 decimal, drop ".0")
  - other `Error` → "Something went wrong: {message}"; non-Error → "Something went wrong."

- [ ] **Step 1: Write the failing tests**
```ts
// timeline
expect(timeToX(15, 60, 600)).toBe(150); expect(xToTime(150, 60, 600)).toBe(15); expect(xToTime(-5, 60, 600)).toBe(0); expect(xToTime(900, 60, 600)).toBe(60);
expect(dragTrim({ start: 10, end: 20 }, "start", 25, 60)).toEqual({ start: 19.9, end: 20 });
expect(dragTrim({ start: 10, end: 20 }, "end", 5, 60)).toEqual({ start: 10, end: 10.1 });
expect(dragTrim({ start: 10, end: 20 }, "end", 99, 60)).toEqual({ start: 10, end: 60 });
expect(dragTrim({ start: 10, end: 20 }, "start", -3, 60)).toEqual({ start: 0, end: 20 });
expect(formatTime(8.64)).toBe("0:08.6"); expect(formatTime(62)).toBe("1:02.0"); expect(formatTime(725.3)).toBe("12:05.3");
// frame
expect(mirrorCropH({ left: 0, top: 0, width: 100, height: 50 }, 640)).toEqual({ left: 540, top: 0, width: 100, height: 50 });
const D = { width: 640, height: 360 }, O0 = { rotate: 0, flipH: false, flipV: false } as const;
expect(remapCrop({ left: 0, top: 0, width: 100, height: 50 }, D, O0, { ...O0, rotate: 90 })).toEqual({ left: 310, top: 0, width: 50, height: 100 });
expect(remapCrop({ left: 310, top: 0, width: 50, height: 100 }, D, { ...O0, rotate: 90 }, O0)).toEqual({ left: 0, top: 0, width: 100, height: 50 });
expect(remapCrop({ left: 0, top: 0, width: 100, height: 50 }, D, O0, { ...O0, flipH: true })).toEqual({ left: 540, top: 0, width: 100, height: 50 });
expect(remapCrop({ left: 0, top: 0, width: 100, height: 50 }, D, O0, { ...O0, flipV: true })).toEqual({ left: 0, top: 310, width: 100, height: 50 });
// planOutput (INFO = 1920x1080, 60 s, audio; recipe = BASE_RECIPE + 150 MB file)
expect(planOutput(INFO, r({ size: { kind: "quality", level: "balanced" } }))).toMatchObject({ plan: { width: 1920, height: 1080, videoBps: 3_732_480, audioBps: 128_000 }, estimatedBytes: 28_953_600, durationSec: 60 });
expect(planOutput(INFO, r({ trim: { start: 10, end: 999 }, size: { kind: "target", bytes: 20 * MB } }))).toMatchObject({ trim: { start: 10, end: 60 }, durationSec: 50 });
expect(planOutput(INFO, r({ size: { kind: "target", bytes: 20 * MB } })).estimatedBytes).toBeLessThanOrEqual(20 * MB);
expect(() => planOutput({ ...INFO, durationSec: 600 }, r({ size: { kind: "target", bytes: 2 * MB } }))).toThrow(TargetTooSmallError);
// messages
expect(describeExportError(new TargetTooSmallError(16_486_957), 2 * MB)).toEqual({ message: "That size is too small for a video this long.", hint: "Try at least 16.5 MB, or trim it shorter." });
expect(describeExportError(new TargetNotReachedError(), 20 * MB)).toEqual({ message: "Couldn't get the video under 20 MB.", hint: "Try a lower resolution or a bigger target." });
expect(describeExportError(new ExportCanceledError(), null)).toBeNull();
expect(describeExportError(new Error("boom"), null)).toEqual({ message: "Something went wrong: boom" });
expect(describeStatus({ phase: "smaller", width: 1920, height: 1080, reason: "too big" })).toBe("Lowered to 1920×1080: too big");
```
Existing `export.test.ts` and `previewSample` tests stay green unchanged.

- [ ] **Step 2: Run to verify failure** — `npm run test:unit` → FAIL (modules missing).
- [ ] **Step 3: Implement** the four modules/functions; switch `prepare` to `planOutput`; the lab imports `describeStatus`.
- [ ] **Step 4: Verify** — `npm run test:unit && npm run test:browser && npx tsc --noEmit && npm run lint` → all pass.
- [ ] **Step 5: Commit** — `feat(video): pure planning, timeline, crop-remap and message helpers for the editor`

---

### Task 2: Video store (load, recipe, presets, quality sample, export machine)

**Files:** Create `store/useVideoStore.ts`, `store/useVideoStore.test.ts` (unit, fake deps, `vi.useFakeTimers()`).

**Interfaces — Consumes:** Task 1 (`planOutput`, `describeExportError`), `applyPreset`/`VIDEO_PRESETS`, `exportVideo`/`previewSample` types, `BASE_RECIPE`.
**Produces:**
```ts
export type ToolId = "trim" | "crop" | "size" | "rotate" | "sound";
export type LoadState =
  | { kind: "empty" }
  | { kind: "probing"; file: File }
  | { kind: "preparing-preview"; file: File; info: VideoInfo }      // making a proxy
  | { kind: "ready"; file: File; info: VideoInfo; previewUrl: string | null; proxy: boolean } // previewUrl null = can't preview, thumbnails only
  | { kind: "error"; file: File; message: string };
export type ExportState =
  | { kind: "idle" }
  | { kind: "running"; statusText: string; progress: number; startedAt: number; confirm: { reason: string; estimatedSec: number } | null }
  | { kind: "done"; result: ExportResult; url: string }
  | { kind: "error"; message: string; hint?: string };
export interface QualityState { enabled: boolean; mode: "original" | "compressed"; status: "idle" | "working" | "ready" | "unavailable"; url: string | null; estimatedBytes: number | null }
export interface VideoStoreDeps {
  probe(file: File): Promise<VideoInfo>;
  canPlay(file: File): Promise<boolean>;
  makeProxy(file: File, info: VideoInfo, signal: AbortSignal): Promise<Blob | null>;
  exportVideo(recipe: EditRecipe, options: ExportOptions): Promise<ExportResult>;
  previewSample(recipe: EditRecipe, atSec: number, options: { signal?: AbortSignal }): Promise<SamplePreview | null>;
  objectUrl(b: Blob | File): string; revoke(url: string): void; isMobile(): boolean; now(): number;
}
export interface VideoState {
  load: LoadState; recipe: Omit<EditRecipe, "file">; presetId: PresetId; targetMb: number; tool: ToolId; playhead: number;
  quality: QualityState; exportState: ExportState;
  openFile(file: File): Promise<void>; reset(): void;
  updateRecipe(patch: Partial<Omit<EditRecipe, "file">>): void;   // marks presetId "custom"; rotate/flip changes remap an existing crop via remapCrop
  choosePreset(id: PresetId): void; setTargetMb(mb: number): void;
  setTool(t: ToolId): void; setPlayhead(t: number): void;
  setQualityEnabled(on: boolean): void; setPreviewMode(m: "original" | "compressed"): void;
  startExport(): Promise<void>; cancelExport(): void; answerFallback(ok: boolean): void; closeResult(): void;
}
export function createVideoStore(deps: VideoStoreDeps): UseBoundStore<StoreApi<VideoState>>;
export const useVideoStore: UseBoundStore<StoreApi<VideoState>>; // default deps via dynamic imports
export const QUALITY_DEBOUNCE_MS = 1000;
```

- [ ] **Step 1: Write the failing tests** (fake deps record calls; `INFO` 1920×1080 60 s)
```ts
test("openFile probes, then uses the file directly when the browser can play it", /* load → ready, proxy false, previewUrl = objectUrl(file) */);
test("unplayable file gets a proxy preview", /* canPlay false, makeProxy resolves blob → ready, proxy true, previewUrl = objectUrl(blob) */);
test("unplayable and no proxy → thumbnails-only (previewUrl null), not an error", );
test("probe failure → error state with message", );
test("opening a new file revokes old URLs and resets recipe, preset, trim and quality", );
test("updateRecipe marks the preset Custom", /* choosePreset("ig-reel") then updateRecipe({ muted: true }) → presetId "custom", frame kept */);
test("rotating after a crop remaps the crop", /* crop {0,0,100,50} on 640x360, updateRecipe({ rotate: 90 }) → crop {310,0,50,100} */);
test("choosePreset form uses targetMb", /* setTargetMb(25); choosePreset("form") → size { kind:"target", bytes: 25e6 }, container "mp4" */);
test("quality default: on for computers, off for phones", );
test("quality sample runs 1 s after the last change and only the latest result is kept", /* two recipe changes 300 ms apart → previewSample called once, after 1000 ms from the last; earlier call's signal aborted if one was in flight; status working → ready, url set, estimatedBytes set */);
test("quality sample unavailable when previewSample resolves null", );
test("no quality sample while exporting", /* startExport running → recipe change → previewSample not called */);
test("export: running → done with url; quality sample stopped first", );
test("export: confirmFallback opens the question; answerFallback(true) continues, (false) cancels back to idle", );
test("export: cancelExport while the question is open answers no and returns to idle", );
test("export: errors map to describeExportError text; canceled → idle", );
test("a second startExport while running is ignored", );
test("closeResult revokes the result url and returns to idle", );
```
- [ ] **Step 2: Run to verify failure** — FAIL. **Step 3: Implement.** Default deps: `probe` = `probeVideo`; `exportVideo`/`previewSample` via `import("@/lib/video/export")`; `canPlay` = `async () => true` and `makeProxy` = `async () => null` as placeholders that Task 4 replaces with the real `lib/video/playback.ts` functions (so this task compiles without Task 4's module). `startExport` builds the recipe, passes `confirmFallback` = a promise the store resolves through `answerFallback`/`cancelExport`, updates `statusText` with `describeStatus` and `progress` from `onProgress`.
- [ ] **Step 4: Verify** — `npm run test:unit && npx tsc --noEmit` → pass. **Step 5: Commit** — `feat(video): editor store with presets, quality sample scheduling and export state machine`

---

### Task 3: Route, dropzone, editor shell, end-to-end harness

**Files:** Create `app/video/page.tsx`, `components/video/studio/{video-studio,video-dropzone,top-bar,tool-rail,bottom-sheet}.tsx`, `playwright.config.ts`, `e2e/fixtures.ts`, `e2e/shell.spec.ts`; modify `package.json` (devDependency `@playwright/test`; script `"test:e2e": "npm run build && playwright test"`), `.gitignore` (`/test-results/`, `/playwright-report/`).

**Interfaces — Consumes:** `useVideoStore`. **Produces:** `VideoStudio` (client root), `e2e/fixtures.ts` `recordClip(page, { seconds, width, height, mime }): Promise<void>` (records a canvas + oscillator clip with MediaRecorder in the page and drops it on the dropzone's file input; `mime` default `"video/mp4;codecs=avc1,mp4a.40.2"`).

- **Playwright config:** `webServer: { command: "npx serve@14 out -l 3200 --no-clipboard", port: 3200, reuseExistingServer: true }`, `use: { baseURL: "http://localhost:3200", channel: "chrome" }`, projects `desktop` (1280×800) and `phone` (390×844, `isMobile: true`, `hasTouch: true`), timeout 180 s.
- **Shell:** empty state = full-width `VideoDropzone` (copy from Global Constraints; accepts `video/*` plus `.mov .mkv .avi .wmv .flv .3gp .m4v`; one file); after a file: desktop grid `[rail 72px | preview 1fr | panel 340px]` with top bar and bottom timeline row; phone: top bar, preview, timeline strip, estimate line, bottom tool bar; tapping a tool opens `BottomSheet` (title = tool name, drag handle, "Done" closes). Placeholder content in preview/panels until later tasks. Top bar shows the file name, a **New video** action (`reset`) and the estimate line text "≈ {X} MB · {W}×{H}" from `planOutput` (or the `describeExportError` message in amber when planning throws), plus "No sound" badge when muted. Loading states: "Reading the video…", "Preparing preview…".

- [ ] **Step 1: Write the failing e2e tests** (`e2e/shell.spec.ts`, both projects)
```ts
test("drop a video → editor with name and estimate", /* goto /video/ → dropzone title visible → recordClip(4 s 1280x720) → top bar shows ".mp4" file name and /≈ .* MB · 1280×720/ */);
test("desktop shows the rail and settings panel; phone shows the tool bar and opens a sheet", /* desktop: rail buttons Trim Crop Size Rotate Sound visible; phone: tap "Crop" → sheet titled "Crop" visible → tap "Done" → hidden */);
test("New video returns to the dropzone", );
```
- [ ] **Step 2: Install + run to verify failure** — `npm i -D @playwright/test` (version matching installed `playwright`), `npm run test:e2e` → FAIL (route missing).
- [ ] **Step 3: Implement** the route (noindex), shell and components (lucide icons: Scissors, Crop, Maximize2, RotateCw, Volume2/VolumeX; follow `components/ui.tsx` and existing glass styling).
- [ ] **Step 4: Verify** — `npm run test:e2e` → PASS (both projects); `npm run test:unit && npx tsc --noEmit && npm run lint` → pass.
- [ ] **Step 5: Commit** — `feat(video): /video editor shell with dropzone, tool rail, bottom sheets and e2e harness`

---

### Task 4: Live preview (canvas renderer, proxy for unplayable files, quality toggle)

**Files:** Create `lib/video/preview-render.ts` (+ `preview-render.browser.test.ts`), `lib/video/playback.ts`, `components/video/studio/preview-player.tsx`, `e2e/preview.spec.ts`.

**Interfaces — Produces:**
- `drawPreviewFrame(ctx: CanvasRenderingContext2D, source: CanvasImageSource, sourceSize: Size, edits: FrameEdits, out: Size): void` — orient (rotate/flips) into a reusable offscreen canvas, crop (coordinates scaled from the clip's display size to `sourceSize` when a proxy is smaller), then fit: plain scale / cover / `createBlurFitter(out)`.
- `previewCanvasSize(out: Size, maxLong = 960): Size` (scale down, never up, even sides).
- `canPlayNatively(file: File, timeoutMs = 5000): Promise<boolean>` (hidden `<video>`, `loadeddata` vs `error`/timeout); `makePreviewProxy(file: File, info: VideoInfo, signal: AbortSignal): Promise<Blob | null>` = `exportVideo` with `{ ...BASE_RECIPE, file, frame: { kind: "source", maxLongSide: 640 }, size: { kind: "quality", level: "small" } }`, `engine: "webcodecs"`, resolves null on any non-cancel error.
- `PreviewPlayer`: hidden `<video>` (from `load.previewUrl`, muted per recipe, `playsInline`) + visible `<canvas>` redrawn per frame (`requestVideoFrameCallback`, `requestAnimationFrame` fallback) with the current edits and output frame (`planOutput` plan size); playback loops inside the trim; play/pause, current time / duration (`formatTime`); when `quality.enabled`: an **Original | Compressed** toggle — Compressed shows the sample `<video>` (looping) with "Estimated size X MB" (2 decimals), "Preparing sample…" while working, the unavailable copy when unavailable; when `previewUrl` is null: thumbnails strip + "This browser can't play this file, but it can still be converted." The quality switch lives in the top bar on desktop and in the export view on phones.

- [ ] **Step 1: Write the failing tests** — browser test with a quadrant `OffscreenCanvas` as `source` (reuse `test-utils/colors.ts` predicates on `ctx.getImageData`): rotate 90 + crop top-left 180×320 → blue; flipV → top-left blue; cover 360×360 from 640×360 → (90,90) red, (270,270) white; blur 360×640 from solid red → centre red, corner darker but red > 100; proxy scaling: crop given in 1280×720 display space with a 640×360 source draws the same region. E2E `preview.spec.ts`: after drop, the canvas has non-zero size and changes pixels while playing; Rotate tool → 90 → canvas aspect becomes portrait (bounding box height > width); desktop: "Preview quality" on → within 20 s "Estimated size" text appears and "Compressed" shows a playing sample video.
- [ ] **Step 2: Run to verify failure.** **Step 3: Implement.** **Step 4: Verify** — `npm run test:browser && npm run test:e2e && npm run test:unit && npx tsc --noEmit && npm run lint` → pass.
- [ ] **Step 5: Commit** — `feat(video): live edits preview, proxy for unplayable files, compressed-quality toggle`

---

### Task 5: Timeline and Trim

**Files:** Create `lib/video/filmstrip.ts` (+ `filmstrip.browser.test.ts`), `components/video/studio/timeline.tsx`, `components/video/studio/panels/trim-panel.tsx`, `e2e/trim.spec.ts`.

**Interfaces — Produces:** `makeFilmstrip(file: File, count: number, height: number): Promise<Blob[]>` (Mediabunny `CanvasSink` on the primary video track at evenly spaced times, JPEG blobs; empty array when unreadable). `Timeline`: filmstrip (10 thumbnails desktop, 6 phone), shaded outside the trim, two handles (`role="slider"`, `aria-label` "Trim start" / "Trim end", keyboard ←/→ = 0.1 s, Shift = 1 s), playhead (click/drag to seek), time labels via `formatTime`; uses `dragTrim` and `xToTime`. `TrimPanel`: start / end number fields (seconds, 1 decimal), "Use playhead as start" / "as end" buttons, "Reset trim". Trim covering the whole clip is stored as `null`.

- [ ] **Step 1: Write the failing tests** — browser: `makeFilmstrip(4 s clip, 5, 60)` → 5 non-empty blobs. E2E: drag the end handle to the middle → Trim panel end ≈ half the duration (±0.3 s) and the estimate's size drops; drag start past end → start stops 0.1 s before end; keyboard ← on end handle lowers it by 0.1 s; playback never shows a time outside the trim (sample `currentTime` 10× while playing).
- [ ] **Step 2: Run to verify failure.** **Step 3: Implement.** **Step 4: Verify** — browser + e2e + unit + tsc + lint pass.
- [ ] **Step 5: Commit** — `feat(video): filmstrip timeline with trim handles and trim panel`

---

### Task 6: Crop, Size, Rotate, Sound panels and presets

**Files:** Create `components/video/studio/crop-editor.tsx`, `components/video/studio/panels/{crop,size,rotate,sound}-panel.tsx`, `e2e/tools.spec.ts`; modify `top-bar.tsx` (preset dropdown).

**Behaviour:**
- **Crop tool:** the centre swaps to `CropEditor` = `react-easy-crop` with `video={previewUrl}`, `rotation={recipe.rotate}`, aspect from the Crop panel chips **Free, 1:1, 4:5, 9:16, 16:9, 4:3**; `onCropComplete` area pixels → scale to the clip's display size (`info.width / video.videoWidth`) → if `flipH`, `mirrorCropH`; if `flipV`, mirror vertically → `updateRecipe({ crop })`; "Reset crop" → `crop: null`. Leaving the Crop tool returns to `PreviewPlayer`.
- **Size panel:** **Original** (with optional max long side 1920 / 1280 / 854), **Preset sizes** (1080×1920, 1080×1350, 1080×1080, 1920×1080, 1280×720, 854×480 — spec §6.2), **Custom** (width × height with 🔒 aspect lock locked to the cropped picture's shape; unlocked allows any shape), **Percent** (1–100). When the output shape differs from the picture (fit would be non-null), show the **Crop to fill | Blurred background** choice (default Crop to fill). Invalid custom sizes show the `InvalidSizeError` message inline and never reach the store's recipe.
- **Rotate panel:** ⟲ 90° left, ⟳ 90° right, Flip horizontal, Flip vertical, Reset (store remaps an existing crop).
- **Sound panel:** **Sound: On | Off** (large two-option control); "No sound" badge appears in the estimate line when Off.
- **Top bar preset dropdown:** `VIDEO_PRESETS` labels; "Form upload (under … MB)" asks for MB in a small inline field (default 10) before applying; manual edits flip it to "Custom".

- [ ] **Step 1: Write the failing e2e tests** — Instagram Reel preset on a 1280×720 clip → estimate shows "1080×1920" and Size panel shows the fit choice with "Crop to fill" selected; switch to Blurred background → preview corner pixels not black; Crop 1:1 → estimate shows a square size; then Rotate right → crop still square and preview shows the same region (sample a pixel colour before/after on a quadrant-recorded clip); Custom 0×100 → inline size message, Export disabled; Sound Off → "No sound" badge; Form upload with 25 → estimate ≤ 25 MB and format MP4; a manual change after a preset → dropdown shows "Custom". Target 0.2 MB on a 30 s clip → amber planning message with "Try at least" and Export disabled.
- [ ] **Step 2: Run to verify failure.** **Step 3: Implement** (reuse `Segmented`, `NumberField`, `Toggle`, `SelectField` from `components/ui.tsx`). **Step 4: Verify** — e2e + unit + tsc + lint pass.
- [ ] **Step 5: Commit** — `feat(video): crop, size, rotate and sound tools with destination presets`

---

### Task 7: Export view and guards

**Files:** Create `components/video/studio/{export-view,fallback-dialog,use-export-guards}.tsx`, `e2e/export.spec.ts`; modify `top-bar.tsx` (Export button opens the view).

**Behaviour:** Export view (desktop: modal over the editor; phone: full screen) — **Format** MP4 | WebM; **Size**: Best quality (High / Balanced / Small) or **Target** MB; resolution summary "{W}×{H}" (+ "lowered to fit" when `steppedDown`); estimate; "No sound" badge; **Start export**. While running: progress bar, `statusText`, elapsed time, **Cancel**; `FallbackDialog` when `exportState.confirm` is set (copy in Global Constraints; N = ceil(estimatedSec / 60)). Done: result `<video controls>` preview, "{size} MB · {W}×{H}", **Download** (`<a download={result.fileName}>`), **Edit again** (closeResult). Error: message + hint, **Back to editor**. `useExportGuards(running)`: Screen Wake Lock while running (where supported; re-acquire on `visibilitychange`), `beforeunload` prompt while running; both released on finish/cancel.

- [ ] **Step 1: Write the failing e2e tests** — target 2 MB on a 6 s 1280×720 clip → Download → downloaded file size ≤ 2 000 000 bytes, result `<video>` videoWidth×videoHeight = estimate's size; WebM → downloaded name ends ".webm"; Cancel during export → back to editor, a new export completes; after Edit again, settings are unchanged. Unit (in `useVideoStore.test.ts`, if not already covered): `exportState.confirm` set by `confirmFallback`, cleared by `answerFallback`/`cancelExport`.
- [ ] **Step 2: Run to verify failure.** **Step 3: Implement.** **Step 4: Verify** — e2e + unit + tsc + lint + build pass.
- [ ] **Step 5: Commit** — `feat(video): export view with progress, cancel, slow-engine question, wake lock and leave warning`

---

### Task 8: Phone polish and full-suite pass

**Files:** Modify studio components; `e2e/phone.spec.ts`.

**Behaviour:** tool bar scrolls horizontally with snap; bottom sheet max height 60 vh with its own scroll, preview stays visible above; export view full screen with the quality switch; touch targets ≥ 44 px; quality preview off by default on phones (store default) with the switch in the export view; no horizontal page scroll at 390 px; timeline handles draggable by touch.

- [ ] **Step 1: Write the failing e2e tests** (phone project): no horizontal scroll (`document.documentElement.scrollWidth <= 390`); every tool button ≥ 44×44; sheet open leaves the preview canvas visible (its bounding box top ≥ 0 and bottom ≤ sheet top); touch-drag the end trim handle changes the end value; quality switch starts off.
- [ ] **Step 2: Run to verify failure.** **Step 3: Implement.** **Step 4: Verify** — `npm run test:unit && npm run test:browser && npm run test:e2e && npx tsc --noEmit && npm run lint && npm run build` → all pass.
- [ ] **Step 5: Commit** — `feat(video): phone layout polish for the editor`

---

### Task 9: Checkpoint 2 — owner tests the editor on iPhone and Android

Manual gate; nothing in Phase 3 starts until the owner says go.

- [ ] **Step 1:** `npm run build`; the running static server on :3123 + Cloudflare quick tunnel serve it (restart both if the session restarted: `npx serve@14 out -l 3123 --no-clipboard`, `npx cloudflared@0.7.3 tunnel --url http://localhost:3123`). Send the owner `<tunnel>/video/`.
- [ ] **Step 2: Test list (both phones):**
  1. Drop a phone clip → preview plays correctly (upright).
  2. Instagram Reel preset on a landscape clip, Blurred background → export → plays upright, posts to Instagram.
  3. Trim to 10 s with the handles, Sound Off, Form upload 5 MB → under 5 MB, silent.
  4. Crop 1:1 then rotate → crop follows the picture.
  5. Quality preview on → sample + estimate appear.
  6. Cancel an export, then export again.
  7. From the deferred lists: iPhone HDR camera clip (colours), 4K clip on Quality High at Original size, 3–5 min clip on Quality High (memory), a WhatsApp-received clip with Target 20 MB (no growth), a screen recording, WebM output on iPhone (backup engine speed + size), and starting an export while a quality sample runs.
- [ ] **Step 3:** Record results in `docs/superpowers/checkpoints/2026-11-checkpoint-2.md` (timings per phone, pass/fail, findings for Phase 3) and commit.
