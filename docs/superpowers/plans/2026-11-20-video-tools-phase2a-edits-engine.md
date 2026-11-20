# Video Tools — Phase 2A: Edits in the Engine — Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Teach both video engines the Phase 2 edits — rotate/flip, crop, custom output size (source cap, percent, exact px) with crop-to-fill or blurred-background fit, WebM output, destination presets and a 3-second compressed-quality sample — plus the policy fixes from Checkpoint 1, all exercised through the lab page.

**Architecture:** One pure module (`lib/video/frame.ts`) turns the recipe's rotate/crop/frame choices into an output size, a clamped crop and a fit mode; the orchestrator plans bitrate on that size and hands both engines the same `FrameEdits`. WebCodecs maps them onto Mediabunny's rotate/flip/crop/resize (blur via its per-frame `process` hook); ffmpeg maps them onto a filter graph built by a pure function. Phase 2B builds the Video Studio screens on these APIs.

**Tech Stack:** As Phase 1 — Next.js 14.2 static export, TypeScript strict, `mediabunny@1.66.1`, `@ffmpeg/ffmpeg@0.12.15` + `@ffmpeg/core@0.12.10` (has libvpx-vp9, libopus, boxblur, overlay, transpose), Vitest 4.1.12 unit + browser (installed Chrome).

**Spec:** `docs/superpowers/specs/2026-11-19-video-tools-design.md` (§6.1 engines, §6.2 crop/resize/rotate/convert, §6.3 presets, §6.4 target size, §6.5 live preview). Checkpoint 1 findings: `docs/superpowers/checkpoints/2026-11-checkpoint-1.md`.

## Global Constraints

- Everything from the Phase 1 plan's Global Constraints still holds (static export, base path, free/OSS deps, dynamic `import()` for heavy libs, MP4 = H.264 + AAC faststart even-size upright, "MB" = 1,000,000 bytes, result never over target, English copy, branch `feature/video-tools`, no push, git via `safe.directory` + existing author identity, `Co-Authored-By: Claude Opus 5.5 <noreply@anthropic.com>`).
- WebM output = VP9 video + Opus audio.
- Edit order on both engines: **rotate → flip H → flip V → crop → resize/fit**. Crop coordinates are in the picture the user sees after rotate and flips.
- Rotation values are clockwise degrees; `rotate` is *in addition to* the file's own rotation metadata.
- Blurred-background drawing must not use `CanvasRenderingContext2D.filter` (not reliable on iOS Safari) — blur by down-scaling then up-scaling.
- Output size never upscales the picture in `source` and `percent` modes (spec §6.2 "Don't enlarge"); exact sizes and presets produce exactly the requested size (rounded down to even), because platforms like Instagram expect 1080×1920 whatever the source was.
- The WhatsApp Status preset (split into parts) arrives with the split tool in Phase 3.
- Output memory model unchanged in 2A (BufferTarget + in-memory faststart); revisit after the iPhone long-clip test.

## Review Focus

1. **Crop box partly outside the picture, tiny, or with odd numbers** → clamped to the picture, even coordinates/sizes; a crop smaller than 16 px or covering the whole picture means "no crop". Tests: Task 1 `clampCrop`.
2. **Rotate and crop together** → the crop selects the region of the *rotated* picture the user sees. Tests: Task 3 and Task 4 quadrant-colour tests.
3. **Blurred-background fit that changes orientation** (landscape → 9:16) → the whole picture visible and centred over a blurred fill — never black bars. Tests: Task 3 and Task 4 red-clip tests.
4. **Exact size with the same shape as the picture** (e.g. 720×1280 from 1080×1920) → plain resize, no crop and no bars. Test: Task 1 `resolveFrame` same-aspect case.
5. **Quality sample near the start/end of the clip or inside a trim** → the 3-second window shifts to stay inside the usable range; shorter clips use their whole range. Tests: Task 5 `sampleWindow`.

---

## File Structure

| File | Responsibility |
|---|---|
| `lib/video/frame.ts` (new) | Output frame types, crop clamping, output-size/fit resolution, Mediabunny rotate/flip mapping |
| `lib/video/estimate.ts` (new) | Backup-engine wait estimate, mobile detection |
| `lib/video/presets.ts` (new) | Destination presets and platform limit constants |
| `lib/video/recipe.ts` | `EditRecipe` v2, `BASE_RECIPE`, `Container`, file naming for mp4/webm |
| `lib/video/bitrate.ts` | Source ceiling now aims 5 % under the source |
| `lib/video/engines/types.ts` | `EncodeJob` gains `edits` and `container`; `SupportCheck` gains `smallerMayWork` |
| `lib/video/export.ts` | Frame resolution, smaller-size retry, fallback estimate + confirm, `previewSample` |
| `lib/video/engines/webcodecs.ts` | Edits, blur fitter, WebM |
| `lib/video/engines/blur-fit.ts` (new) | Browser-only: compose blurred background + contained foreground |
| `lib/video/engines/ffmpeg-args.ts` | Filter graph + WebM codec args |
| `lib/video/test-utils/make-clip.ts` | `pattern: "quadrants" \| "solid-red"` option |
| `lib/video/test-utils/mp4.ts` | `pixelAt(blob, x, y)` |
| `components/video/engine-lab.tsx` | Controls for every new option, sample preview |

---

### Task 1: Frame math, recipe v2, edits reach the engines

**Files:**
- Create: `lib/video/frame.ts`, `lib/video/frame.test.ts`
- Modify: `lib/video/recipe.ts`, `lib/video/recipe.test.ts`, `lib/video/engines/types.ts`, `lib/video/export.ts`, `lib/video/export.test.ts`, `components/video/engine-lab.tsx` (keep compiling: its "Max long side" control now builds `frame: { kind: "source", maxLongSide }`)

**Interfaces:**
- Consumes: `Size`, `Rotation`, `toEven`, `displaySize`, `capLongSide` (geometry.ts); `planTarget`, `planQuality` (bitrate.ts).
- Produces:
  - `frame.ts`: `type FitMode = "cover" | "blur"`; `interface CropRect { left: number; top: number; width: number; height: number }`; `type OutputFrame = { kind: "source"; maxLongSide: number | null } | { kind: "percent"; percent: number } | { kind: "exact"; width: number; height: number; fit: FitMode }`; `interface FrameEdits { rotate: Rotation; flipH: boolean; flipV: boolean; crop: CropRect | null; fit: FitMode | null }`; `clampCrop(crop: CropRect | null, within: Size): CropRect | null`; `resolveFrame(display: Size, rotate: Rotation, crop: CropRect | null, frame: OutputFrame): { crop: CropRect | null; base: Size; fit: FitMode | null }`; `mediabunnyTransform(rotate: Rotation, flipH: boolean, flipV: boolean): { rotate: Rotation; flip: boolean }`.
  - `recipe.ts`: `type Container = "mp4" | "webm"`; `EditRecipe` = `{ file; trim; muted; size; rotate: Rotation; flipH: boolean; flipV: boolean; crop: CropRect | null; frame: OutputFrame; container: Container }` (replaces `maxLongSide`); `BASE_RECIPE: Omit<EditRecipe, "file">` = `{ trim: null, muted: false, size: { kind: "quality", level: "balanced" }, rotate: 0, flipH: false, flipV: false, crop: null, frame: { kind: "source", maxLongSide: null }, container: "mp4" }`; `outputFileName(inputName: string, ext: Container): string`.
  - `types.ts`: `EncodeJob` adds `edits: FrameEdits; container: Container`.

- [ ] **Step 1: Write the failing tests**

`frame.test.ts`:
```ts
// clampCrop
expect(clampCrop({ left: -10, top: 5, width: 300, height: 300 }, { width: 200, height: 400 })).toEqual({ left: 0, top: 4, width: 200, height: 300 });
expect(clampCrop({ left: 3, top: 3, width: 101, height: 101 }, { width: 1000, height: 1000 })).toEqual({ left: 2, top: 2, width: 102, height: 102 });
expect(clampCrop({ left: 0, top: 0, width: 10, height: 300 }, { width: 200, height: 400 })).toBeNull();   // < 16 px
expect(clampCrop({ left: 0, top: 0, width: 200, height: 400 }, { width: 200, height: 400 })).toBeNull();  // whole picture
expect(clampCrop(null, { width: 200, height: 400 })).toBeNull();
// resolveFrame
expect(resolveFrame({ width: 1920, height: 1080 }, 90, null, { kind: "source", maxLongSide: null })).toEqual({ crop: null, base: { width: 1080, height: 1920 }, fit: null });
expect(resolveFrame({ width: 1920, height: 1080 }, 0, null, { kind: "exact", width: 1080, height: 1920, fit: "cover" })).toEqual({ crop: null, base: { width: 1080, height: 1920 }, fit: "cover" });
expect(resolveFrame({ width: 1080, height: 1920 }, 0, null, { kind: "exact", width: 720, height: 1280, fit: "blur" }).fit).toBeNull(); // same shape
expect(resolveFrame({ width: 1920, height: 1080 }, 0, null, { kind: "percent", percent: 50 }).base).toEqual({ width: 960, height: 540 });
expect(resolveFrame({ width: 1920, height: 1080 }, 0, null, { kind: "percent", percent: 150 }).base).toEqual({ width: 1920, height: 1080 }); // never upscale
expect(resolveFrame({ width: 1920, height: 1080 }, 0, { left: 0, top: 0, width: 1080, height: 1080 }, { kind: "source", maxLongSide: null })).toEqual({ crop: { left: 0, top: 0, width: 1080, height: 1080 }, base: { width: 1080, height: 1080 }, fit: null });
expect(resolveFrame({ width: 1920, height: 1080 }, 0, null, { kind: "exact", width: 1081, height: 1921, fit: "cover" }).base).toEqual({ width: 1080, height: 1920 });
// mediabunnyTransform: vertical flip = 180° turn + horizontal flip
expect(mediabunnyTransform(0, true, false)).toEqual({ rotate: 0, flip: true });
expect(mediabunnyTransform(0, false, true)).toEqual({ rotate: 180, flip: true });
expect(mediabunnyTransform(90, true, true)).toEqual({ rotate: 270, flip: false });
expect(mediabunnyTransform(270, false, true)).toEqual({ rotate: 90, flip: true });
```
`recipe.test.ts`: `outputFileName("Trip.MOV", "webm")` → `"Trip-zimonza.webm"`.
`export.test.ts` — the `recipe()` helper builds `{ ...BASE_RECIPE, file: sizedFile("Trip.MOV", 150_000_000), ...partial }`; the old `maxLongSide: 1280` case becomes `frame: { kind: "source", maxLongSide: 1280 }`. New test:
```ts
test("edits, fit and container reach the engine", async () => {
  const wc = fakeEngine("webcodecs");
  const result = await exportVideo(
    recipe({ rotate: 90, flipV: true, crop: { left: 1, top: 0, width: 1081, height: 1920 }, frame: { kind: "exact", width: 1080, height: 1350, fit: "blur" }, container: "webm" }),
    {}, deps(wc, fakeEngine("ffmpeg"))
  );
  // probe is 1920x1080 → rotated picture 1080x1920 → crop clamps to 1080x1920 at (0,0) = whole picture → no crop
  expect(wc.jobs[0].edits).toEqual({ rotate: 90, flipH: false, flipV: true, crop: null, fit: "blur" });
  expect(wc.jobs[0].container).toBe("webm");
  expect(wc.jobs[0].plan).toMatchObject({ width: 1080, height: 1350 });
  expect(result.fileName).toBe("Trip-zimonza.webm");
});
```

- [ ] **Step 2: Run to verify failure** — `npm run test:unit` → FAIL (frame.ts missing, BASE_RECIPE missing).

- [ ] **Step 3: Implement** `frame.ts`, recipe v2, `EncodeJob` fields, and in `exportVideo`: `const { crop, base, fit } = resolveFrame({ width: info.width, height: info.height }, recipe.rotate, recipe.crop, recipe.frame)`; plan with `source: base, maxLongSide: null`; every `EncodeJob` gets `edits: { rotate, flipH, flipV, crop, fit }` and `container`. `clampCrop`: intersect, then `left/top = floor to even`, `width/height = floor to even of (right/bottom − left/top)`; null when either side < 16 or the result equals the whole picture. `resolveFrame`: picture = clamped crop size, else `displaySize(display, rotate)`; `source` → `capLongSide(picture, maxLongSide)`; `percent` → clamp percent to [1, 100], each side `toEven(side × p / 100)`; `exact` → `toEven` each side, fit `null` when `|(w/h) / (pw/ph) − 1| ≤ 0.01`. Engines ignore the new fields until Tasks 3–4.

- [ ] **Step 4: Run tests** — `npm run test:unit` → PASS; `npx tsc --noEmit` → clean; `npm run test:browser` → PASS (engines unchanged).

- [ ] **Step 5: Commit** — `git commit -m "feat(video): output frame math and recipe v2 (rotate, flip, crop, size, container)"`

---

### Task 2: Orchestrator policies from Checkpoint 1

**Files:**
- Create: `lib/video/estimate.ts`, `lib/video/estimate.test.ts`
- Modify: `lib/video/bitrate.ts`, `lib/video/bitrate.test.ts`, `lib/video/engines/types.ts`, `lib/video/engines/webcodecs.ts` (precheck sets `smallerMayWork: true` on the size failure), `lib/video/export.ts`, `lib/video/export.test.ts`, `components/video/engine-lab.tsx` (status texts)

**Interfaces:**
- Consumes: Task 1's `resolveFrame` result; `scaleToShortSide`, `STEP_DOWN_SHORT_SIDES`.
- Produces:
  - `bitrate.ts`: `SOURCE_CEILING_FILL = 0.95`; `videoCeilingBps` = `min(maxVideoBps(size), max(sourceBps × 0.95 − audioBps, sourceBps / 2))`.
  - `estimate.ts`: `estimateBackupSeconds(durationSec: number, out: Size, mobile: boolean): number` = `Math.round(durationSec × (mobile ? 14 : 5) × (out.width × out.height) / (1280 × 720))` (Checkpoint 1: 17 s at 720×1280 on Android ≈ 243 s; desktop ≈ 5× real time); `isMobileDevice(): boolean` (`navigator.userAgentData?.mobile`, else `/Mobi|Android|iPhone|iPad/` on the UA).
  - `types.ts`: `SupportCheck = { ok: true } | { ok: false; reason: string; smallerMayWork?: boolean }`.
  - `export.ts`: `ExportStatus` adds `{ phase: "smaller"; width: number; height: number; reason: string }` and `{ phase: "probe-fallback"; reason: string }` (renamed from the probe's use of `"fallback"`); `"fallback"` becomes `{ phase: "fallback"; reason: string; estimatedSec: number }`. `ExportOptions` adds `confirmFallback?(f: { reason: string; estimatedSec: number }): Promise<boolean>`. `ExportDeps` adds optional `isMobile?: () => boolean` (default `isMobileDevice`).

- [ ] **Step 1: Write the failing tests**

`bitrate.test.ts` — update the three ceiling expectations: WhatsApp case `872_000` → `822_000`; quality case `1_872_000` → `1_772_000`; half-floor case unchanged (`100_000`). `export.test.ts` "doesn't inflate" expects `822_000`.
`estimate.test.ts`:
```ts
expect(estimateBackupSeconds(17, { width: 720, height: 1280 }, true)).toBe(238);
expect(estimateBackupSeconds(60, { width: 1080, height: 1920 }, true)).toBe(1890);
expect(estimateBackupSeconds(3, { width: 1280, height: 720 }, false)).toBe(15);
```
`export.test.ts` (fake webcodecs precheck: `{ ok: true }` when `plan.width * plan.height <= 1920 * 1080`, else `{ ok: false, reason: "too big", smallerMayWork: true }`; probe returns 3840×2160):
```ts
test("a size the fast engine can't encode is lowered instead of going to the backup engine", /* quality high → engine webcodecs, plan 1920x1080, result.steppedDown true, statuses contain { phase: "smaller", width: 1920, height: 1080, reason: "too big" } */);
test("when no smaller size helps, the job falls back with a time estimate", /* precheck always { ok:false, reason:"too big", smallerMayWork:true } on 1920x1080 probe, isMobile () => false → statuses contain { phase: "fallback", reason: "too big", estimatedSec: 675 }; engine ffmpeg */);
test("declining the backup engine cancels", /* precheck fails; confirmFallback resolves false → rejects ExportCanceledError; ffmpeg.jobs empty */);
test("confirmFallback receives the estimate", /* captures { reason: "no encoder", estimatedSec: 675 } */);
```
Update the Phase 1 tests: "auto falls back … precheck fails" expects `{ phase: "fallback", reason: "no encoder", estimatedSec: 675 }`; "a probe that falls back to ffmpeg says why" expects `{ phase: "probe-fallback", reason: "Fast engine can't read this file: Unsupported container" }`.

- [ ] **Step 2: Run to verify failure** — `npm run test:unit` → FAIL.

- [ ] **Step 3: Implement.** In auto mode: if precheck fails with `smallerMayWork`, walk `STEP_DOWN_SHORT_SIDES` below the base's short side, re-plan with `source: scaleToShortSide(base, s)` (quality or target planner as before), precheck each; the first that passes runs on webcodecs with `steppedDown: true` and emits `smaller`. Before any ffmpeg run in auto mode (precheck failure or webcodecs error): `estimatedSec = estimateBackupSeconds(durationSec, plan, isMobile())`, emit `fallback`, then `if (options.confirmFallback && !(await options.confirmFallback({ reason, estimatedSec }))) throw new ExportCanceledError()`. Lab: describe `smaller` ("Lowered to W×H: reason"), `probe-fallback`, and show `~N min` in `fallback`.

- [ ] **Step 4: Run tests** — `npm run test:unit && npm run test:browser` → PASS; `npx tsc --noEmit` → clean.

- [ ] **Step 5: Commit** — `git commit -m "feat(video): lower unencodable sizes, estimate and confirm backup runs, aim under source size"`

---

### Task 3: WebCodecs engine applies the edits; WebM output

**Files:**
- Create: `lib/video/engines/blur-fit.ts`
- Modify: `lib/video/engines/webcodecs.ts`, `lib/video/engines/webcodecs.browser.test.ts`, `lib/video/test-utils/make-clip.ts`, `lib/video/test-utils/mp4.ts`

**Interfaces:**
- Consumes: `FrameEdits`, `mediabunnyTransform` (Task 1); `EncodeJob.edits/container`.
- Produces:
  - `make-clip.ts`: option `pattern?: "moving" | "quadrants" | "solid-red"` (default `"moving"`; `quadrants` = top-left red `#f00`, top-right green `#0f0`, bottom-left blue `#00f`, bottom-right white, drawn in coded pixels).
  - `mp4.ts`: `pixelAt(blob: Blob, x: number, y: number, atSec?: number): Promise<[number, number, number]>` (Mediabunny `CanvasSink` on the primary video track at `atSec ?? 0.2`, display orientation).
  - `blur-fit.ts`: `createBlurFitter(out: Size): (frame: CanvasImageSource, width: number, height: number) => OffscreenCanvas` — background = frame scaled to cover into an `out/8` canvas then drawn up to `out` (smoothing on), darkened with `rgba(0,0,0,0.2)`; foreground = frame scaled to contain, centred.

- [ ] **Step 1: Write the failing browser tests** (colour helpers: `isRed = ([r,g,b]) => r > 160 && g < 90 && b < 90`, likewise `isBlue`, `isWhite = all > 170`)

```ts
test("rotate + crop selects the region of the rotated picture", /* quadrants 640x360, edits { rotate: 90, crop: {left:0,top:0,width:180,height:320}, fit:null }, plan 180x320 → output 180x320 rotation 0; pixelAt(90,160) isBlue (rotated top-left = original bottom-left) */);
test("vertical flip", /* quadrants 640x360, flipV, plan 640x360 → pixelAt(80,45) isBlue */);
test("crop-to-fill keeps the centre", /* quadrants 640x360 → exact 360x360 cover: pixelAt(90,90) isRed, pixelAt(270,270) isWhite */);
test("blurred background: whole picture visible, no black bars", /* solid-red 640x360 → fit blur plan 360x640: pixelAt(180,320) isRed; pixelAt(10,10) r > 100 (blurred red, not black) */);
test("WebM output is VP9 + Opus", /* container "webm" → inspectMp4(out) videoCodec "vp9", audioCodec "opus" */);
```

- [ ] **Step 2: Run to verify failure** — `npm run test:browser` → the five new tests FAIL.

- [ ] **Step 3: Implement.** In `setUp`: `const t = mediabunnyTransform(e.rotate, e.flipH, e.flipV)`; video options `rotate: t.rotate, flip: t.flip, crop: e.crop ?? undefined`; when `fit !== "blur"`: `width, height, fit: e.fit === "cover" ? "cover" : "fill"`; when `"blur"`: no width/height, `process` draws the sample (via its canvas-drawing API) through `createBlurFitter(plan)` and returns the canvas, `processedWidth/processedHeight` = plan. Container `webm`: `WebMOutputFormat`, video codec `"vp9"`, audio `"opus"`; precheck checks the container's video codec. Blob type `video/webm`.

- [ ] **Step 4: Run tests** — `npm run test:browser && npm run test:unit` → PASS; `npx tsc --noEmit` → clean.

- [ ] **Step 5: Commit** — `git commit -m "feat(video): fast engine applies rotate, flip, crop, fill and blur fit; WebM output"`

---

### Task 4: ffmpeg engine applies the edits; WebM output

**Files:**
- Modify: `lib/video/engines/ffmpeg-args.ts`, `lib/video/engines/ffmpeg-args.test.ts`, `lib/video/engines/ffmpeg.ts`, `lib/video/engines/ffmpeg.browser.test.ts`

**Interfaces:**
- Consumes: `FrameEdits`, `Container`, `EncodePlan`.
- Produces: `buildFfmpegArgs(a: { inPath; outPath; trim; plan; edits: FrameEdits; container: Container }): string[]`; `buildVideoFilter(edits: FrameEdits, out: Size): { complex: boolean; graph: string }`.

- [ ] **Step 1: Write the failing unit tests**

```ts
const E = { rotate: 0, flipH: false, flipV: false, crop: null, fit: null } as const;
expect(buildVideoFilter({ ...E, rotate: 90, flipH: true, crop: { left: 0, top: 10, width: 400, height: 600 } }, { width: 400, height: 600 }))
  .toEqual({ complex: false, graph: "transpose=1,hflip,crop=400:600:0:10,scale=400:600:flags=bicubic,setsar=1,format=yuv420p" });
expect(buildVideoFilter({ ...E, rotate: 180, flipV: true }, { width: 640, height: 360 }).graph)
  .toBe("transpose=1,transpose=1,vflip,scale=640:360:flags=bicubic,setsar=1,format=yuv420p");
expect(buildVideoFilter({ ...E, rotate: 270, fit: "cover" }, { width: 360, height: 360 }).graph)
  .toBe("transpose=2,scale=360:360:force_original_aspect_ratio=increase:flags=bicubic,crop=360:360,setsar=1,format=yuv420p");
expect(buildVideoFilter({ ...E, fit: "blur" }, { width: 1080, height: 1920 })).toEqual({
  complex: true,
  graph: "[0:v]split=2[bgsrc][fgsrc];" +
    "[bgsrc]scale=270:480:force_original_aspect_ratio=increase,crop=270:480,boxblur=10:2,scale=1080:1920,eq=brightness=-0.08[bg];" +
    "[fgsrc]scale=1080:1920:force_original_aspect_ratio=decrease:force_divisible_by=2:flags=bicubic[fg];" +
    "[bg][fg]overlay=(W-w)/2:(H-h)/2,setsar=1,format=yuv420p[v]",
});
// buildFfmpegArgs: plain edits keep the Phase 1 array except "-vf" uses buildVideoFilter's graph;
// blur uses "-filter_complex", graph, "-map", "[v]" (instead of "-map", "0:v:0" and "-vf");
// webm uses "-c:v", "libvpx-vp9", "-deadline", "realtime", "-cpu-used", "8", "-b:v", …, "-c:a", "libopus", "-b:a", …, and no "-movflags".
```
Quarter-size background is `toEven(out / 4)` per side.

- [ ] **Step 2: Run to verify failure** — `npm run test:unit` → FAIL.

- [ ] **Step 3: Implement `buildVideoFilter` and the new `buildFfmpegArgs` options.** Run `npm run test:unit` → PASS.

- [ ] **Step 4: Write the failing browser tests** (reuse Task 3's helpers): rotate + crop quadrant test; blurred-background red test; WebM codec test — all against `ffmpegEngine`. Run `npm run test:browser` → the three FAIL (the engine doesn't pass edits/container yet).

- [ ] **Step 5: Wire `ffmpeg.ts`:** pass `edits`/`container` into `buildFfmpegArgs`, write `/out.mp4` or `/out.webm`, return the matching Blob type.

- [ ] **Step 6: Run everything** — `npm run test:unit && npm run test:browser` → PASS; `npx tsc --noEmit` → clean.

- [ ] **Step 7: Commit** — `git commit -m "feat(video): backup engine applies rotate, flip, crop, fill and blur fit; WebM output"`

---

### Task 5: Compressed-quality sample preview

**Files:**
- Modify: `lib/video/export.ts`, `lib/video/export.test.ts`

**Interfaces:**
- Consumes: everything in `export.ts`.
- Produces: `SAMPLE_SECONDS = 3`; `sampleWindow(trim: TrimRange | null, durationSec: number, atSec: number): TrimRange`; `interface SamplePreview { blob: Blob; window: TrimRange; estimatedBytes: number; plan: EncodePlan }`; `previewSample(recipe: EditRecipe, atSec: number, options?: { signal?: AbortSignal }, deps?: ExportDeps): Promise<SamplePreview | null>`. Refactor the probe → trim → frame → plan steps of `exportVideo` into an internal `prepare(recipe, deps, status)` used by both.

- [ ] **Step 1: Write the failing tests**

```ts
expect(sampleWindow(null, 60, 30)).toEqual({ start: 28.5, end: 31.5 });
expect(sampleWindow(null, 60, 59)).toEqual({ start: 57, end: 60 });
expect(sampleWindow(null, 60, 0)).toEqual({ start: 0, end: 3 });
expect(sampleWindow({ start: 10, end: 20 }, 60, 19.5)).toEqual({ start: 17, end: 20 });
expect(sampleWindow({ start: 10, end: 20 }, 60, 2)).toEqual({ start: 10, end: 13 });   // playhead outside trim
expect(sampleWindow(null, 2, 1)).toEqual({ start: 0, end: 2 });
test("previewSample encodes one window with the full export's plan", /* recipe quality balanced, 1920x1080 60 s probe → wc.jobs[0].trim {28.5,31.5}; plan.videoBps 3_732_480; estimatedBytes 28_953_600 ((3_732_480 + 128_000) × 60 / 8) */);
test("target mode estimate never exceeds the target", /* target 20 MB → estimatedBytes <= 20_000_000 */);
test("no sample when the fast engine can't run", /* precheck fails → resolves null; ffmpeg.jobs empty */);
```

- [ ] **Step 2: Run to verify failure** — FAIL.

- [ ] **Step 3: Implement.** `sampleWindow`: usable range = trim or `[0, duration]`; length = `min(SAMPLE_SECONDS, range length)`; start = `clamp(atSec − length/2, range.start, range.end − length)`. `previewSample`: prepare, precheck webcodecs (no smaller-size walk, no fallback), one `encode` with `trim: window`; `estimatedBytes = round((videoBps + audioBps) × durationSec / 8)`, capped at the target in target mode.

- [ ] **Step 4: Run tests** — `npm run test:unit` → PASS; `npx tsc --noEmit` → clean.

- [ ] **Step 5: Commit** — `git commit -m "feat(video): 3-second compressed-quality sample preview"`

---

### Task 6: Presets and lab controls

**Files:**
- Create: `lib/video/presets.ts`, `lib/video/presets.test.ts`
- Modify: `components/video/engine-lab.tsx`

**Interfaces:**
- Consumes: `EditRecipe`, `BASE_RECIPE`, `OutputFrame`, `MB`; `exportVideo`, `previewSample`.
- Produces: `PLATFORM_LIMITS = { whatsappStatusSeconds: 90, instagramReelMaxSeconds: 180 }` (comment: third-party figures, re-check before launch — spec §6.3); `type PresetId = "ig-reel" | "ig-post" | "ig-square" | "whatsapp" | "form" | "custom"`; `interface VideoPreset { id: PresetId; label: string; frame?: OutputFrame; size?: SizeMode | "ask-target"; container?: Container }`; `VIDEO_PRESETS: VideoPreset[]`; `applyPreset(recipe: EditRecipe, preset: VideoPreset, targetMb?: number): EditRecipe`.

- [ ] **Step 1: Write the failing tests**

```ts
const r = { ...BASE_RECIPE, file: new File([], "a.mp4") };
expect(applyPreset(r, byId("ig-reel"))).toEqual({ ...r, frame: { kind: "exact", width: 1080, height: 1920, fit: "cover" }, container: "mp4" });
expect(applyPreset(r, byId("ig-post")).frame).toEqual({ kind: "exact", width: 1080, height: 1350, fit: "cover" });
expect(applyPreset(r, byId("ig-square")).frame).toEqual({ kind: "exact", width: 1080, height: 1080, fit: "cover" });
expect(applyPreset(r, byId("whatsapp"))).toMatchObject({ frame: { kind: "source", maxLongSide: 1280 }, size: { kind: "quality", level: "balanced" }, container: "mp4" });
expect(applyPreset(r, byId("form"), 25).size).toEqual({ kind: "target", bytes: 25 * MB });
expect(applyPreset(r, byId("form")).size).toEqual({ kind: "target", bytes: 10 * MB }); // default ask
expect(applyPreset(r, byId("custom"))).toEqual(r);
```
(`byId` = test helper finding in `VIDEO_PRESETS`.) Labels: "Instagram Reel / Story", "Instagram Post (4:5)", "Square (1:1)", "WhatsApp", "Form upload (under … MB)", "Custom".

- [ ] **Step 2: Run to verify failure** — FAIL. **Step 3: Implement** `presets.ts`. **Step 4:** `npm run test:unit` → PASS.

- [ ] **Step 5: Lab controls.** Add to the lab: Preset select (applies to the form fields); Rotate (0/90/180/270); Flip horizontal / vertical toggles; Crop left/top/width/height (optional numbers); Output size: Original (with max long side) / Percent / Exact W×H with Fill: Crop to fill / Blurred background; Format MP4 / WebM; "Preview quality" with an "at second" field → shows the sample `<video>` with a label "Sample — estimated final size X MB"; status text for `smaller`, `probe-fallback`, `fallback` (with "~N min"); `confirmFallback` → `window.confirm("The fast engine can't do this on your device. The backup engine will take about N min. Continue?")`; report lists all edits.

- [ ] **Step 6: Verify** — `npm run lint && npx tsc --noEmit && npm run build` → all succeed. Desktop smoke (serve `out/` on :3123, Playwright with Chrome-recorded clip, as in Phase 1): (a) Instagram Reel preset on a landscape clip with Blurred background → 1080×1920 output; (b) WebM → output plays; (c) Preview quality → sample appears with an estimate; (d) Force backup + rotate 90 + crop → correct size; no console errors.

- [ ] **Step 7: Commit** — `git commit -m "feat(video): destination presets and lab controls for every edit"`

---

## After 2A

**Phase 2B — Video Studio UI** gets its own plan: layout B on desktop, phone layout with bottom sheets, video dropzone, preview player with live edit overlays (trim range, crop box, blur preview, rotation, text later), timeline with trim handles, tool panels built on these APIs, quality-preview toggle (`previewSample`), export screen (progress, Cancel, wake lock, leave-page warning, `confirmFallback` dialog), and Checkpoint 2 on both phones. The iPhone results from Checkpoint 1 (HDR, 4K, long clips, memory) feed into it.
