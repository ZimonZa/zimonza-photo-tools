# Video Tools — Phase 1: Engine + Checkpoint 1 — Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** A browser video engine that takes one clip plus a small edit recipe (trim, max size, mute, quality or target MB) and returns an MP4 via WebCodecs (Mediabunny) with automatic ffmpeg.wasm fallback — exercised through a hidden lab page the owner tests on an iPhone and an Android phone.

**Architecture:** Pure planning modules (geometry, bitrate/target planning, recipe normalisation) feed an orchestrator (`exportVideo`) that probes the file, builds an `EncodePlan`, picks an engine through a common `VideoEngine` interface, runs the target-size retry loop, and falls back from WebCodecs to ffmpeg once on failure. Engines are lazy-loaded; ffmpeg's single-thread core is self-hosted under `/ffmpeg/`.

**Tech Stack:** Next.js 14.2 (static export), TypeScript 5.9 strict, `mediabunny@1.66.1`, `@mediabunny/aac-encoder@1.66.1`, `@ffmpeg/ffmpeg@0.12.15`, `@ffmpeg/core@0.12.10` (single-thread), Vitest (node project + browser project via Playwright using the installed Chrome channel).

**Spec:** `docs/superpowers/specs/2026-11-19-video-tools-design.md`

## Global Constraints

- Static export only (`output: "export"`); no server code, no API routes, no custom headers.
- Every runtime asset URL is prefixed with `process.env.NEXT_PUBLIC_BASE_PATH ?? ""` (live site uses `/zimonza-photo-tools`).
- All dependencies free and open source. Mediabunny = MPL-2.0; `@ffmpeg/core` = GPL-2.0-or-later; `@mediabunny/aac-encoder` = LGPL FFmpeg build.
- Heavy libraries (`mediabunny`, `@mediabunny/aac-encoder`, `@ffmpeg/ffmpeg`) are only reached through dynamic `import()` from client code — never imported at module top level of a page or shared component.
- ffmpeg: single-threaded core, self-hosted, no `coi-serviceworker`, no COOP/COEP.
- MP4 output contract (both engines): H.264 video + AAC audio, moov before mdat (faststart), even width/height, yuv420p, rotation 0 with upright display dimensions.
- "MB" = 1,000,000 bytes. A target-size result is never larger than the target.
- All user-facing copy in English.
- Work stays on branch `feature/video-tools`; never push or merge to `main` (pushing `main` deploys the live site).
- Git in this repo needs `-c "safe.directory=E:/Work/Zimonza/ZimonZa App/Photo Resizer"`, and commits use the author identity of the existing history (`git log -1 --format='%an <%ae>'`) passed via `-c user.name=… -c user.email=…`. Every commit message ends with `Co-Authored-By: Claude Opus 5.5 <noreply@anthropic.com>`.

## Review Focus

1. **Portrait phone video stored landscape with rotation metadata (90°)** → output is upright, portrait dimensions, rotation 0. Tests: Task 1 `displaySize`, Task 2 and Task 3 rotated-fixture tests.
2. **Clip with no audio track** (screen recordings) → no audio budget, valid MP4 with no audio track. Tests: Task 1 `planTarget` no-audio case, Task 2/3 no-audio encode tests.
3. **Target bigger than the clip needs** (5 MB clip, "under 20 MB") → don't inflate; bitrate capped at "high" quality. Test: Task 1 portrait 50 MB case.
4. **Trim outside the clip** (end past duration, start ≥ end, whole-clip range) → clamp, reject too-short ranges with a clear error, treat whole-clip as no trim. Tests: Task 1 `normalizeTrim`.
5. **Cancel mid-export, then export again** → canceled error, no fallback, next export works (ffmpeg instance rebuilt). Tests: Task 3 cancel-then-encode, Task 4 cancel cases.

---

## File Structure

| File | Responsibility |
|---|---|
| `lib/video/errors.ts` | Error classes shared by all video modules |
| `lib/video/recipe.ts` | `EditRecipe` types, `normalizeTrim`, `outputFileName`, `MB` |
| `lib/video/geometry.ts` | Even-size math, rotation-aware display size, long/short-side scaling |
| `lib/video/bitrate.ts` | Quality and target-size planning, retry bitrate, attempt judging |
| `lib/video/engines/types.ts` | `VideoInfo`, `EncodeJob`, `VideoEngine`, `SupportCheck`, `EngineId` |
| `lib/video/engines/webcodecs.ts` | Mediabunny probe + WebCodecs engine |
| `lib/video/engines/ffmpeg-args.ts` | Pure: ffmpeg argument builder, log parsers, asset URLs |
| `lib/video/engines/ffmpeg.ts` | ffmpeg.wasm loader, probe, engine |
| `lib/video/export.ts` | `exportVideo` orchestrator: probe → plan → route → retry → fallback |
| `lib/video/test-utils/mp4.ts` | Test helpers: `topLevelBoxes`, `inspectMp4` |
| `lib/video/test-utils/make-clip.ts` | Test helper: synthesize MP4 fixtures in the browser |
| `scripts/copy-ffmpeg-assets.mjs` | Copies ffmpeg core + worker files into `public/ffmpeg/` |
| `app/video/lab/page.tsx` | Hidden, noindex lab route |
| `components/video/engine-lab.tsx` | Lab UI: pick file, settings, run, progress, result, copy report |
| `vitest.config.ts` | Two projects: `unit` (node) and `browser` (Chrome) |

Unit tests: `*.test.ts` next to the module (node env). Browser tests: `*.browser.test.ts` (real Chrome, WebCodecs).

---

### Task 1: Planning core (errors, recipe, geometry, bitrate) + unit test tooling

**Files:**
- Create: `vitest.config.ts`, `lib/video/errors.ts`, `lib/video/recipe.ts`, `lib/video/geometry.ts`, `lib/video/bitrate.ts`
- Test: `lib/video/recipe.test.ts`, `lib/video/geometry.test.ts`, `lib/video/bitrate.test.ts`
- Modify: `package.json` (devDependency `vitest`; scripts `"test:unit": "vitest run --project unit"`)

**Interfaces:**
- Produces:
  - `errors.ts`: `InvalidTrimError`, `TargetTooSmallError` (field `minBytes: number`), `TargetNotReachedError`, `ExportCanceledError`, `EngineUnsupportedError` — all `extends Error` with `name` set to the class name.
  - `recipe.ts`: `MB = 1_000_000`; `type QualityLevel = "high" | "balanced" | "small"`; `interface TrimRange { start: number; end: number }` (seconds); `type SizeMode = { kind: "quality"; level: QualityLevel } | { kind: "target"; bytes: number }`; `interface EditRecipe { file: File; trim: TrimRange | null; maxLongSide: number | null; muted: boolean; size: SizeMode }`; `normalizeTrim(trim: TrimRange | null, durationSec: number): TrimRange | null`; `outputFileName(inputName: string, ext: "mp4"): string`.
  - `geometry.ts`: `interface Size { width: number; height: number }`; `toEven(n: number): number`; `displaySize(coded: Size, rotation: 0 | 90 | 180 | 270): Size`; `capLongSide(size: Size, maxLong: number | null): Size`; `scaleToShortSide(size: Size, short: number): Size`.
  - `bitrate.ts`: constants `BUDGET_FPS = 30`, `MIN_BPP = 0.02`, `QUALITY_BPP = { high: 0.1, balanced: 0.06, small: 0.035 }`, `QUALITY_AUDIO_BPS = { high: 128_000, balanced: 128_000, small: 96_000 }`, `FIRST_ATTEMPT_FILL = 0.92`, `RETRY_FILL = 0.95`, `MIN_FILL = 0.9`, `MAX_TARGET_ATTEMPTS = 4`, `STEP_DOWN_SHORT_SIDES = [1080, 720, 540, 480, 360]`; `interface EncodePlan { width: number; height: number; videoBps: number; audioBps: number; steppedDown: boolean }`; `maxVideoBps(size: Size): number`; `audioBpsForBudget(totalBps: number): number`; `planQuality(a: { source: Size; level: QualityLevel; hasAudio: boolean; muted: boolean; maxLongSide: number | null }): EncodePlan`; `planTarget(a: { source: Size; durationSec: number; targetBytes: number; hasAudio: boolean; muted: boolean; maxLongSide: number | null }): EncodePlan`; `nextVideoBps(a: { prevVideoBps: number; actualBytes: number; targetBytes: number; audioBps: number; durationSec: number }): number`; `judgeAttempt(actualBytes: number, targetBytes: number): "over" | "under-filled" | "ok"`.

- [ ] **Step 1: Install Vitest and add the config**

`npm i -D vitest` (latest). `vitest.config.ts` defines project `unit` (environment `node`, include `lib/**/*.test.ts`, **exclude `lib/**/*.browser.test.ts`**, alias `@` → project root). The `browser` project is added in Task 2. Tests import `test`/`expect` from `"vitest"` explicitly (no globals), so `tsc` and `next build` type-check them cleanly.

- [ ] **Step 2: Write the failing tests**

`geometry.test.ts`:
```ts
expect(toEven(1081)).toBe(1080); expect(toEven(1)).toBe(2); expect(toEven(719.6)).toBe(718);
expect(displaySize({ width: 1920, height: 1080 }, 90)).toEqual({ width: 1080, height: 1920 });
expect(displaySize({ width: 1920, height: 1080 }, 180)).toEqual({ width: 1920, height: 1080 });
expect(capLongSide({ width: 1920, height: 1080 }, 1280)).toEqual({ width: 1280, height: 720 });
expect(capLongSide({ width: 1080, height: 1920 }, 1280)).toEqual({ width: 720, height: 1280 });
expect(capLongSide({ width: 640, height: 360 }, 1280)).toEqual({ width: 640, height: 360 }); // never upscale
expect(capLongSide({ width: 1919, height: 1081 }, null)).toEqual({ width: 1918, height: 1080 }); // even
expect(scaleToShortSide({ width: 1920, height: 1080 }, 360)).toEqual({ width: 640, height: 360 });
expect(scaleToShortSide({ width: 1080, height: 1920 }, 720)).toEqual({ width: 720, height: 1280 });
expect(scaleToShortSide({ width: 640, height: 360 }, 720)).toEqual({ width: 640, height: 360 });
```

`recipe.test.ts`:
```ts
expect(normalizeTrim(null, 30)).toBeNull();
expect(normalizeTrim({ start: 0, end: 30 }, 30)).toBeNull();          // whole clip = no trim
expect(normalizeTrim({ start: 5, end: 99 }, 30)).toEqual({ start: 5, end: 30 });
expect(normalizeTrim({ start: -2, end: 10 }, 30)).toEqual({ start: 0, end: 10 });
expect(() => normalizeTrim({ start: 10, end: 10.05 }, 30)).toThrow(InvalidTrimError); // < 0.1 s
expect(() => normalizeTrim({ start: 12, end: 8 }, 30)).toThrow(InvalidTrimError);
expect(outputFileName("My clip.final.MOV", "mp4")).toBe("My clip.final-zimonza.mp4");
expect(outputFileName("noext", "mp4")).toBe("noext-zimonza.mp4");
expect(outputFileName("", "mp4")).toBe("video-zimonza.mp4");
```

`bitrate.test.ts`:
```ts
// 1080p, 60 s, 20 MB → stays 1080p
expect(planTarget({ source: { width: 1920, height: 1080 }, durationSec: 60, targetBytes: 20 * MB, hasAudio: true, muted: false, maxLongSide: null }))
  .toEqual({ width: 1920, height: 1080, videoBps: 2_325_333, audioBps: 128_000, steppedDown: false });
// 1080p, 120 s, 10 MB → steps down to 540p, audio 96k
expect(planTarget({ source: { width: 1920, height: 1080 }, durationSec: 120, targetBytes: 10 * MB, hasAudio: true, muted: false, maxLongSide: null }))
  .toEqual({ width: 960, height: 540, videoBps: 517_333, audioBps: 96_000, steppedDown: true });
// impossible → TargetTooSmallError with minBytes for 360p
try { planTarget({ source: { width: 1920, height: 1080 }, durationSec: 600, targetBytes: 2 * MB, hasAudio: true, muted: false, maxLongSide: null }); throw new Error("no throw"); }
catch (e) { expect(e).toBeInstanceOf(TargetTooSmallError); expect((e as TargetTooSmallError).minBytes).toBe(16_486_957); }
// no bloat: portrait 30 s, 50 MB → capped at high quality
expect(planTarget({ source: { width: 1080, height: 1920 }, durationSec: 30, targetBytes: 50 * MB, hasAudio: true, muted: false, maxLongSide: null }))
  .toEqual({ width: 1080, height: 1920, videoBps: 6_220_800, audioBps: 128_000, steppedDown: false });
// no audio track and muted → audioBps 0
expect(planTarget({ source: { width: 1920, height: 1080 }, durationSec: 60, targetBytes: 20 * MB, hasAudio: false, muted: false, maxLongSide: null }).audioBps).toBe(0);
expect(planTarget({ source: { width: 1920, height: 1080 }, durationSec: 60, targetBytes: 20 * MB, hasAudio: true, muted: true, maxLongSide: null }).audioBps).toBe(0);
// maxLongSide applied before step-down
expect(planTarget({ source: { width: 1920, height: 1080 }, durationSec: 60, targetBytes: 20 * MB, hasAudio: true, muted: false, maxLongSide: 1280 }))
  .toMatchObject({ width: 1280, height: 720, steppedDown: false });
expect(planQuality({ source: { width: 1920, height: 1080 }, level: "balanced", hasAudio: true, muted: false, maxLongSide: null }))
  .toEqual({ width: 1920, height: 1080, videoBps: 3_732_480, audioBps: 128_000, steppedDown: false });
expect(audioBpsForBudget(1_000_000)).toBe(128_000); expect(audioBpsForBudget(400_000)).toBe(96_000); expect(audioBpsForBudget(399_999)).toBe(64_000);
expect(nextVideoBps({ prevVideoBps: 2_000_000, actualBytes: 22_000_000, targetBytes: 20 * MB, audioBps: 128_000, durationSec: 60 })).toBe(1_714_828);
expect(judgeAttempt(20_000_001, 20 * MB)).toBe("over");
expect(judgeAttempt(20 * MB, 20 * MB)).toBe("ok");
expect(judgeAttempt(18 * MB, 20 * MB)).toBe("ok");
expect(judgeAttempt(17_999_999, 20 * MB)).toBe("under-filled");
```

- [ ] **Step 3: Run tests to verify they fail**

Run: `npm run test:unit`
Expected: FAIL — modules not found.

- [ ] **Step 4: Implement `errors.ts`, `recipe.ts`, `geometry.ts`, `bitrate.ts`**

`toEven` floors to the nearest even integer, minimum 2. `capLongSide`/`scaleToShortSide` keep aspect, never upscale, and return even dims. `normalizeTrim` clamps to `[0, duration]`, throws `InvalidTrimError` when the result is shorter than 0.1 s, returns `null` when it covers `[0, duration]`. `maxVideoBps(s) = round(s.width * s.height * BUDGET_FPS * QUALITY_BPP.high)`. `planQuality`: size = `capLongSide(source, maxLongSide)`, `videoBps = round(w*h*BUDGET_FPS*QUALITY_BPP[level])`, audio `0` if muted or no audio else `QUALITY_AUDIO_BPS[level]`. `planTarget` algorithm (all bps floored to integers):

```ts
const budgetBps = (targetBytes * 8 * FIRST_ATTEMPT_FILL) / durationSec;
const audioBps = muted || !hasAudio ? 0 : audioBpsForBudget(budgetBps);
const videoBudget = budgetBps - audioBps;
const base = capLongSide(source, maxLongSide);
const baseShort = Math.min(base.width, base.height);
const candidates = [base, ...STEP_DOWN_SHORT_SIDES.filter(s => s < baseShort).map(s => scaleToShortSide(base, s))];
for (const c of candidates) {
  if (videoBudget >= c.width * c.height * BUDGET_FPS * MIN_BPP)
    return { ...c, videoBps: Math.floor(Math.min(videoBudget, maxVideoBps(c))), audioBps, steppedDown: c !== base };
}
const smallest = candidates[candidates.length - 1];
throw new TargetTooSmallError(Math.ceil(((smallest.width * smallest.height * BUDGET_FPS * MIN_BPP + audioBps) * durationSec) / 8 / FIRST_ATTEMPT_FILL));
```

`nextVideoBps`: `audioBytes = audioBps*durationSec/8`; `floor(prevVideoBps * (targetBytes*RETRY_FILL - audioBytes) / max(1, actualBytes - audioBytes))`. `judgeAttempt`: `> target` → over; `< MIN_FILL*target` → under-filled; else ok.

- [ ] **Step 5: Run tests to verify they pass**

Run: `npm run test:unit` → PASS. Also `npx tsc --noEmit` → no errors.

- [ ] **Step 6: Commit**

```bash
git add vitest.config.ts package.json package-lock.json lib/video
git commit -m "feat(video): planning core for trim, sizing and target bitrate"
```

---

### Task 2: WebCodecs engine (Mediabunny) + browser test tooling

**Files:**
- Create: `lib/video/engines/types.ts`, `lib/video/engines/webcodecs.ts`, `lib/video/test-utils/mp4.ts`, `lib/video/test-utils/make-clip.ts`
- Test: `lib/video/test-utils/mp4.test.ts` (unit), `lib/video/engines/webcodecs.browser.test.ts` (browser)
- Modify: `vitest.config.ts` (add `browser` project), `package.json` (deps `mediabunny@1.66.1`, `@mediabunny/aac-encoder@1.66.1`; devDeps for Vitest browser mode + Playwright; script `"test:browser": "node scripts/copy-ffmpeg-assets.mjs && vitest run --project browser"` — until Task 3 creates the script, use `"vitest run --project browser"` and switch then)

**Interfaces:**
- Consumes: `EncodePlan` (bitrate.ts), `TrimRange` (recipe.ts), `ExportCanceledError`, `EngineUnsupportedError` (errors.ts), `displaySize` (geometry.ts).
- Produces:
  - `types.ts`: `type EngineId = "webcodecs" | "ffmpeg"`; `interface VideoInfo { durationSec: number; width: number; height: number; rotation: 0 | 90 | 180 | 270; videoCodec: string | null; audioCodec: string | null; hasAudio: boolean; readableByMediabunny: boolean }` (width/height are **display** size, rotation applied); `type SupportCheck = { ok: true } | { ok: false; reason: string }`; `interface EncodeJob { file: File; info: VideoInfo; trim: TrimRange | null; plan: EncodePlan; signal: AbortSignal; onProgress(p: number): void; onEngineDownload?(loaded: number, total: number | null): void }`; `interface VideoEngine { id: EngineId; precheck(info: VideoInfo, plan: EncodePlan): Promise<SupportCheck>; encode(job: EncodeJob): Promise<Blob> }`.
  - `webcodecs.ts`: `probeWithMediabunny(file: File): Promise<VideoInfo>` (throws if the container is unreadable); `webcodecsEngine: VideoEngine`.
  - `test-utils/mp4.ts`: `topLevelBoxes(buf: ArrayBuffer): string[]`; `inspectMp4(blob: Blob): Promise<{ boxes: string[]; videoCodec: string | null; audioCodec: string | null; width: number; height: number; rotation: number; durationSec: number }>`.
  - `test-utils/make-clip.ts`: `makeTestClip(o: { seconds: number; width: number; height: number; audio: boolean; rotation?: 0 | 90 | 180 | 270; noise?: boolean }): Promise<File>` — Mediabunny `Output` + `CanvasSource` (avc) drawing a moving pattern (random noise when `noise`), `AudioBufferSource` (aac, 440 Hz sine) when `audio`, rotation via `addVideoTrack(…, { rotation })`.

- [ ] **Step 1: Install deps and add the browser project**

Install `mediabunny@1.66.1 @mediabunny/aac-encoder@1.66.1`, and the Vitest browser-mode packages for the installed Vitest major (Playwright provider). Browser project: include `lib/**/*.browser.test.ts`, Playwright Chromium with `channel: "chrome"` (uses installed Google Chrome — has H.264/AAC), headless, test timeout 60 s.

- [ ] **Step 2: Write the failing tests**

`mp4.test.ts` (unit): build a buffer of three boxes `ftyp`(16 B) `moov`(8 B) `mdat`(8 B) with big-endian sizes → `topLevelBoxes` returns `["ftyp", "moov", "mdat"]`; a box with size `1` uses the 64-bit largesize that follows.

`webcodecs.browser.test.ts`:
```ts
test("probe reads display size, codecs, audio", async () => {
  const f = await makeTestClip({ seconds: 3, width: 640, height: 360, audio: true });
  const i = await probeWithMediabunny(f);
  expect(i).toMatchObject({ width: 640, height: 360, rotation: 0, hasAudio: true, videoCodec: "avc", audioCodec: "aac", readableByMediabunny: true });
  expect(i.durationSec).toBeCloseTo(3, 1);
});
test("encode trims, resizes, H.264+AAC, faststart", async () => {
  const f = await makeTestClip({ seconds: 3, width: 640, height: 360, audio: true });
  const info = await probeWithMediabunny(f);
  const out = await webcodecsEngine.encode({ file: f, info, trim: { start: 0.5, end: 2.5 }, plan: { width: 320, height: 180, videoBps: 400_000, audioBps: 96_000, steppedDown: false }, signal: new AbortController().signal, onProgress: () => {} });
  const m = await inspectMp4(out);
  expect(m).toMatchObject({ videoCodec: "avc", audioCodec: "aac", width: 320, height: 180, rotation: 0 });
  expect(m.durationSec).toBeGreaterThan(1.85); expect(m.durationSec).toBeLessThan(2.15);
  expect(m.boxes.indexOf("moov")).toBeLessThan(m.boxes.indexOf("mdat"));
});
test("no-audio input → output has no audio track", /* makeTestClip audio:false, plan audioBps 0 → m.audioCodec === null */);
test("rotated input → upright portrait output", /* coded 640x360 rotation 90 → probe {width:360,height:640,rotation:90}; encode plan 180x320 → m {width:180,height:320,rotation:0} */);
test("bitrate stays near plan", /* noise clip 3 s 640x360 no audio, videoBps 300_000 → out.size <= 1.5 * 300_000 * 3 / 8 */);
test("abort rejects with ExportCanceledError", /* abort once onProgress reports > 0 → rejects ExportCanceledError */);
test("precheck", /* readable info + 320x180 → { ok: true }; { ...info, readableByMediabunny: false } → ok false */);
```

- [ ] **Step 3: Run tests to verify they fail**

Run: `npm run test:unit` → `mp4.test.ts` FAIL; `npm run test:browser` → FAIL (modules missing).

- [ ] **Step 4: Implement `test-utils/mp4.ts`, `test-utils/make-clip.ts`, `engines/types.ts`, `engines/webcodecs.ts`**

`probeWithMediabunny`: `Input` + `BlobSource` + `ALL_FORMATS`; primary video track required (else throw); report display size/rotation/codec, primary audio track codec, `computeDuration()`.
`precheck`: `{ok:false}` if `typeof VideoEncoder === "undefined"`, if `!info.readableByMediabunny`, or if `!(await canEncodeVideo("avc", { width, height }))`.
`encode`: if `!(await canEncodeAudio("aac"))` and audio is wanted, dynamically import `@mediabunny/aac-encoder` and call `registerAacEncoder()` once. `Conversion.init` with `trim` (when set), `video: { width, height, fit: "fill", codec: "avc", quality: new Quality({ bitrate: plan.videoBps }), forceTranscode: true, allowTransformationMetadata: false }`, `audio: plan.audioBps === 0 ? { discard: true } : { codec: "aac", quality: new Quality({ bitrate: plan.audioBps }), numberOfChannels: 2, sampleRate: 48000, forceTranscode: true }`, output `Mp4OutputFormat({ fastStart: "in-memory" })` + `BufferTarget`. If `!conversion.isValid` → throw `EngineUnsupportedError` listing `discardedTracks` reasons. Wire `onProgress`; on `signal` abort call `conversion.cancel()` and reject with `ExportCanceledError`. Return `new Blob([buffer], { type: "video/mp4" })`. Verify the exact option names against the installed 1.66.1 typings (the tests decide).

- [ ] **Step 5: Run tests to verify they pass**

Run: `npm run test:unit` and `npm run test:browser` → PASS. `npx tsc --noEmit` → clean.

- [ ] **Step 6: Commit**

```bash
git add package.json package-lock.json vitest.config.ts lib/video
git commit -m "feat(video): WebCodecs engine via Mediabunny with browser tests"
```

---

### Task 3: ffmpeg.wasm fallback engine (self-hosted, single-thread)

**Files:**
- Create: `scripts/copy-ffmpeg-assets.mjs`, `lib/video/engines/ffmpeg-args.ts`, `lib/video/engines/ffmpeg.ts`
- Test: `lib/video/engines/ffmpeg-args.test.ts` (unit), `lib/video/engines/ffmpeg.browser.test.ts` (browser)
- Modify: `package.json` (deps `@ffmpeg/ffmpeg@0.12.15`, `@ffmpeg/core@0.12.10`; scripts `"predev"` and `"prebuild"`: `node scripts/copy-ffmpeg-assets.mjs`; `test:browser` now runs the copy script first), `.gitignore` (add `/public/ffmpeg/`)

**Interfaces:**
- Consumes: `VideoEngine`, `VideoInfo`, `EncodeJob` (types.ts); `EncodePlan`; `TrimRange`; `ExportCanceledError`.
- Produces:
  - `ffmpeg-args.ts`: `buildFfmpegArgs(a: { inPath: string; outPath: string; trim: TrimRange | null; plan: EncodePlan }): string[]`; `parseFfmpegTime(line: string): number | null`; `parseFfmpegProbe(log: string): Omit<VideoInfo, "readableByMediabunny"> | null`; `ffmpegAssetUrls(basePath: string): { coreURL: string; wasmURL: string; classWorkerURL: string }`.
  - `ffmpeg.ts`: `ffmpegEngine: VideoEngine`; `probeWithFfmpeg(file: File, onEngineDownload?: (loaded: number, total: number | null) => void): Promise<VideoInfo>` (returns `readableByMediabunny: false`).

- [ ] **Step 1: Write the copy script and run it**

Copies `node_modules/@ffmpeg/core/dist/esm/ffmpeg-core.js` and `ffmpeg-core.wasm` → `public/ffmpeg/core/`, and every `.js` in `node_modules/@ffmpeg/ffmpeg/dist/esm/` → `public/ffmpeg/esm/`. Creates dirs; exits non-zero if a source is missing.
Run: `node scripts/copy-ffmpeg-assets.mjs` → files exist under `public/ffmpeg/core/` and `public/ffmpeg/esm/worker.js`.

- [ ] **Step 2: Write the failing unit tests**

```ts
expect(buildFfmpegArgs({ inPath: "/in/input.mov", outPath: "/out.mp4", trim: { start: 2, end: 12 }, plan: { width: 1280, height: 720, videoBps: 1_500_000, audioBps: 128_000, steppedDown: false } })).toEqual([
  "-hide_banner", "-ss", "2", "-i", "/in/input.mov", "-t", "10",
  "-map", "0:v:0", "-map", "0:a:0?",
  "-vf", "scale=1280:720:flags=bicubic,setsar=1,format=yuv420p",
  "-c:v", "libx264", "-preset", "veryfast", "-b:v", "1500000", "-maxrate", "1800000", "-bufsize", "3000000",
  "-c:a", "aac", "-b:a", "128000", "-ac", "2",
  "-movflags", "+faststart", "-y", "/out.mp4",
]);
// audioBps 0 → contains "-an", no "-map","0:a:0?", no "-c:a"; trim null → no "-ss"/"-t"
expect(parseFfmpegTime("frame=  50 fps=12 q=28.0 size=256kB time=00:01:02.50 bitrate=33.5kbits/s")).toBe(62.5);
expect(parseFfmpegTime("time=N/A")).toBeNull();
const log = [
  "Input #0, mov,mp4,m4a,3gp,3g2,mj2, from '/in/input.mov':",
  "  Duration: 00:00:12.34, start: 0.000000, bitrate: 15000 kb/s",
  "  Stream #0:0[0x1](und): Video: hevc (Main) (hvc1 / 0x31637668), yuv420p(tv, bt709), 1920x1080, 14800 kb/s, 29.97 fps, 29.97 tbr, 600 tbn (default)",
  "      Side data:",
  "        displaymatrix: rotation of -90.00 degrees",
  "  Stream #0:1[0x2](und): Audio: aac (LC) (mp4a / 0x6134706D), 44100 Hz, stereo, fltp, 128 kb/s (default)",
].join("\n");
expect(parseFfmpegProbe(log)).toEqual({ durationSec: 12.34, width: 1080, height: 1920, rotation: 90, videoCodec: "hevc", audioCodec: "aac", hasAudio: true });
// legacy "rotate          : 90" metadata line is also recognised; log without an Audio stream → hasAudio false, audioCodec null; log without a Video stream → null
expect(ffmpegAssetUrls("")).toEqual({ coreURL: "/ffmpeg/core/ffmpeg-core.js", wasmURL: "/ffmpeg/core/ffmpeg-core.wasm", classWorkerURL: "/ffmpeg/esm/worker.js" });
expect(ffmpegAssetUrls("/zimonza-photo-tools").coreURL).toBe("/zimonza-photo-tools/ffmpeg/core/ffmpeg-core.js");
```

- [ ] **Step 3: Run to verify failure** — `npm run test:unit` → FAIL (module missing).

- [ ] **Step 4: Implement `ffmpeg-args.ts`**

Rotation from `displaymatrix: rotation of D degrees` → `((-D % 360) + 360) % 360`; from `rotate : R` → `R`. Width/height reported are display size (swap on 90/270). `-t` is `end - start`. `-maxrate` = `round(videoBps*1.2)`, `-bufsize` = `videoBps*2`.

- [ ] **Step 5: Run unit tests** — `npm run test:unit` → PASS.

- [ ] **Step 6: Write the failing browser tests (`ffmpeg.browser.test.ts`, timeout 120 s each)**

Using `makeTestClip` and `inspectMp4` from Task 2: probe of a rotated (coded 640x360, rotation 90) clip → `{ width: 360, height: 640, rotation: 90, hasAudio: true, readableByMediabunny: false }`; 2-s encode to 320x180 → avc/aac, faststart order, 320x180; no-audio input → `audioCodec: null`; rotated input with plan 180x320 → output 180x320 rotation 0; **abort mid-encode → `ExportCanceledError`, then a second encode on the same engine succeeds**.

- [ ] **Step 7: Implement `ffmpeg.ts`**

Lazy singleton: dynamic `import("@ffmpeg/ffmpeg")`; download `wasmURL` with `fetch` + stream reader to report `onEngineDownload(loaded, total)` (total from `Content-Length`, else `null`), wrap in a Blob URL; `ffmpeg.load({ coreURL, wasmURL, classWorkerURL })` with absolute URLs from `ffmpegAssetUrls(process.env.NEXT_PUBLIC_BASE_PATH ?? "")`. Input: wrap the file as `new File([file], "input" + ext)` and mount with `WORKERFS` at `/in` (no copy); unmount afterwards. Progress via the `log` event + `parseFfmpegTime` ÷ trimmed duration. Probe: `exec(["-hide_banner", "-i", inPath])` (non-zero exit is expected), collect logs, `parseFfmpegProbe`. Abort: `terminate()`, drop the singleton (next call reloads), reject `ExportCanceledError`. `precheck` always `{ ok: true }`.

- [ ] **Step 8: Run all tests** — `npm run test:unit && npm run test:browser` → PASS. `npx tsc --noEmit` → clean.

- [ ] **Step 9: Commit**

```bash
git add scripts package.json package-lock.json .gitignore lib/video
git commit -m "feat(video): self-hosted single-thread ffmpeg.wasm fallback engine"
```

---

### Task 4: Export orchestrator (routing, target loop, fallback, cancel)

**Files:**
- Create: `lib/video/export.ts`
- Test: `lib/video/export.test.ts` (unit, fake engines and probe)

**Interfaces:**
- Consumes: everything from Tasks 1–3.
- Produces:
  - `type ExportStatus = { phase: "probing" } | { phase: "loading-engine"; engine: "ffmpeg"; loadedBytes: number; totalBytes: number | null } | { phase: "encoding"; engine: EngineId; attempt: number } | { phase: "fallback"; reason: string }`
  - `interface ExportOptions { engine?: "auto" | EngineId; signal?: AbortSignal; onProgress?(p: number): void; onStatus?(s: ExportStatus): void }`
  - `interface ExportResult { blob: Blob; fileName: string; engine: EngineId; width: number; height: number; attempts: number; steppedDown: boolean; elapsedMs: number; info: VideoInfo }`
  - `interface ExportDeps { probe(file: File, onEngineDownload?: (l: number, t: number | null) => void): Promise<VideoInfo>; engines: Record<EngineId, VideoEngine> }`
  - `exportVideo(recipe: EditRecipe, options?: ExportOptions, deps?: ExportDeps): Promise<ExportResult>` — default deps: probe = `probeWithMediabunny`, falling back to `probeWithFfmpeg` on throw; engines from Tasks 2–3, each reached via dynamic `import()`.

- [ ] **Step 1: Write the failing tests** (fake engines return `new Blob([new Uint8Array(n)])` with scripted sizes and record each `EncodeJob`; fake probe returns 1920x1080, 60 s, audio)

```ts
test("auto uses webcodecs when precheck ok", /* result.engine === "webcodecs"; ffmpeg.encode not called */);
test("auto falls back when precheck fails", /* precheck {ok:false,reason:"x"} → engine "ffmpeg"; statuses include { phase: "fallback", reason: "x" } */);
test("auto falls back once when webcodecs throws", /* webcodecs.encode rejects Error("boom") → engine "ffmpeg" */);
test("forced engine never falls back", /* engine:"webcodecs", encode rejects → exportVideo rejects "boom"; ffmpeg not called */);
test("target: over then ok", /* target 20 MB, sizes [22e6, 19.5e6] → attempts 2, blob.size 19.5e6, jobs[1].plan.videoBps === nextVideoBps({ prevVideoBps: jobs[0].plan.videoBps, actualBytes: 22e6, targetBytes: 20e6, audioBps: 128_000, durationSec: 60 }) */);
test("target: under-filled then ok", /* sizes [15e6, 19e6] → attempts 2, blob.size 19e6; second videoBps ≤ maxVideoBps(plan) */);
test("target: never fits", /* sizes [21e6, 21e6, 21e6, 21e6] → rejects TargetNotReachedError after 4 encodes */);
test("target too small fails before encoding", /* 600 s probe, 2 MB → TargetTooSmallError, encode never called */);
test("trim is normalized and drives the plan", /* trim {start:10,end:999} → job.trim {start:10,end:60}; planning uses 50 s */);
test("abort before start", /* signal already aborted → ExportCanceledError; no encode */);
test("abort during encode is not a fallback trigger", /* webcodecs rejects ExportCanceledError → rethrown; ffmpeg not called */);
test("file name", /* file "Trip.MOV" → fileName "Trip-zimonza.mp4" */);
```

- [ ] **Step 2: Run to verify failure** — `npm run test:unit` → FAIL.

- [ ] **Step 3: Implement `exportVideo`**

Order: check abort → status `probing` → probe → `normalizeTrim` → duration = trimmed length → plan (`planQuality` or `planTarget`) → choose engine (forced, or `auto` via `webcodecs.precheck`, emitting `fallback` when it fails) → run. Target loop per engine:

```ts
let plan = initialPlan, best: Blob | null = null, attempts = 0;
for (let a = 1; a <= MAX_TARGET_ATTEMPTS; a++) {
  attempts = a; status({ phase: "encoding", engine, attempt: a });
  const blob = await engine.encode({ ...job, plan });
  const verdict = judgeAttempt(blob.size, target);
  if (verdict !== "over" && (!best || blob.size > best.size)) best = blob;
  if (verdict === "ok") break;
  if (verdict === "under-filled" && plan.videoBps >= maxVideoBps(plan)) break;
  let next = nextVideoBps({ prevVideoBps: plan.videoBps, actualBytes: blob.size, targetBytes: target, audioBps: plan.audioBps, durationSec });
  if (verdict === "under-filled") next = Math.min(next, maxVideoBps(plan));
  plan = { ...plan, videoBps: next };
}
if (!best) throw new TargetNotReachedError(…);
```

In `auto`, any non-`ExportCanceledError` from webcodecs → status `fallback` → rerun the whole engine run (fresh attempt count) on ffmpeg once. Forward `onEngineDownload` into `loading-engine` statuses.

- [ ] **Step 4: Run tests** — `npm run test:unit` → PASS; `npx tsc --noEmit` → clean.

- [ ] **Step 5: Commit**

```bash
git add lib/video/export.ts lib/video/export.test.ts
git commit -m "feat(video): export orchestrator with target-size loop and engine fallback"
```

---

### Task 5: Hidden engine lab page

**Files:**
- Create: `app/video/lab/page.tsx`, `components/video/engine-lab.tsx`

**Interfaces:**
- Consumes: `exportVideo`, `ExportStatus`, `ExportResult` (Task 4), `MB`, `EditRecipe` (Task 1), `formatBytes` (`lib/utils.ts`) — `exportVideo` loaded with dynamic `import()` on click.

- [ ] **Step 1: Build the page**

`page.tsx`: metadata `{ title: "Video engine lab", robots: { index: false, follow: false } }`; renders `<EngineLab />`. Not added to `TOOLS`, header, home or sitemap.
`engine-lab.tsx` (`"use client"`), plain controls styled with existing Tailwind tokens:
- File input `accept="video/*,.mov,.mkv,.avi,.wmv,.flv,.3gp,.m4v"`.
- Trim start / end (seconds, optional) · Max long side: Original / 1920 / 1280 / 854 · Mute checkbox.
- Size: Quality (High / Balanced / Small) or Target MB (number, default 20).
- Engine: Auto / Force WebCodecs / Force ffmpeg.
- Run and Cancel buttons; status line from `ExportStatus` (incl. "Downloading video engine… x MB of ~30 MB"); progress bar; elapsed time.
- Result: output size (bytes and `formatBytes`), target, ✓/✗ "within target", engine, passes, width × height, stepped down yes/no; `<video controls>` preview; Download link with `result.fileName`.
- Error text for `TargetTooSmallError` (shows `minBytes` in MB), `InvalidTrimError`, others.
- **Copy report** button → clipboard text: user agent, `typeof VideoEncoder`, native AAC encode (`AudioEncoder.isConfigSupported({ codec: "mp4a.40.2", sampleRate: 48000, numberOfChannels: 2 })`), input name/size/codec/display size/rotation/duration, settings, engine, passes, output size vs target, elapsed seconds, error message.

- [ ] **Step 2: Verify build and lint**

Run: `npm run lint && npx tsc --noEmit && npm run build`
Expected: all succeed; `out/video/lab/index.html` and `out/ffmpeg/core/ffmpeg-core.wasm` exist.

- [ ] **Step 3: Desktop smoke test**

Run: `npx serve@14 out -l 3000`, open `http://localhost:3000/video/lab/` in Chrome. With a real phone clip: Auto + Target 20 MB → result ✓ within target, engine webcodecs. Force ffmpeg + 10-s trim → ✓, engine ffmpeg, download progress shown once. Cancel mid-run → status resets; run again works.

- [ ] **Step 4: Commit**

```bash
git add app/video/lab components/video
git commit -m "feat(video): hidden engine lab page for device checkpoint"
```

---

### Task 6: Checkpoint 1 — owner tests on iPhone and Android

Manual gate. Nothing in Phases 2–4 starts until the owner says go.

- [ ] **Step 1: Serve the build over a temporary HTTPS link**

Run: `npm run build`, then `npx serve@14 out -l 3000`, then `npx cloudflared tunnel --url http://localhost:3000` (if the npm wrapper fails, install with `winget install --id Cloudflare.cloudflared` and run `cloudflared tunnel --url http://localhost:3000`). Expected: a `https://<random>.trycloudflare.com` URL; `<url>/video/lab/` loads on a phone.

- [ ] **Step 2: Send the owner the link and this test list (iPhone Safari and Android Chrome)**

1. A real 30–90 s clip recorded on that phone → Auto, Target 20 MB → expect ✓ within target; play it; send it on WhatsApp; upload it to Instagram as a Reel draft.
2. Same clip → Force ffmpeg, trim to 10 s, Target 5 MB → expect ✓ (slow is fine).
3. Same clip → Quality Balanced, Max long side 1280, Mute → expect a silent 720p-class video.
4. Start test 1, press Cancel halfway, run again → expect a clean second run.
After each test press **Copy report** and paste the reports back.

- [ ] **Step 3: Record results**

Create `docs/superpowers/checkpoints/2026-11-checkpoint-1.md` with the pasted reports, timings per phone, WhatsApp/Instagram outcomes, and the go / fix-first decision. Commit it.

---

## Later phases (planned after Checkpoint 1)

Each gets its own plan once the engine is proven on the owner's phones, so the results (speed, memory limits, codec quirks) shape them:

- **Phase 2 — Video Studio UI + core tools:** layout B (desktop) and phone layout, video dropzone, preview player, clip timeline with trim handles, crop with crop-to-fill and blur-background fit, resize (presets/custom px/percent), rotate/flip, mute, compress (quality/target), convert (MP4/WebM), presets (Instagram Reel/Post, WhatsApp, Form upload, Custom), export screen with progress, Cancel, wake lock, leave-page warning. Checkpoint 2.
- **Phase 3 — Timeline tools:** merge (multi-clip recipe), split into parts (+ZIP), loop, speed with pitch preserved, reverse, volume boost, fade in/out, text and image watermark. Checkpoint 3.
- **Phase 4 — Outputs and site:** GIF, MP3, save frame + "Edit in photo tools", Share button; rename to "ZimonZa Photo & Video Tools", Photo/Video header menus, home page video section, `/video/<tool>` and format-pair SEO pages, sitemap, licenses section, Vercel leftovers removed, lab page removed. Final checkpoint → owner approves merge to `main`.
