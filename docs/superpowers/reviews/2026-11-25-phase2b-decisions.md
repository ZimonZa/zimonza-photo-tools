# Phase 2B (video editor UI) — decisions, rulings and open items

Range: `feature/video-tools` 94477ab..80c8daf, plus this doc.
- Tasks 1–8 each passed a task review.
- Task 9, Checkpoint 2, passed on the owner's iPhone and Android ([checkpoint record](../checkpoints/2026-11-checkpoint-2.md)).
- The final whole-branch review returned "ready to merge with fixes": 2 Important, 14 Minor.
- One fix wave (0429565..26cb3f5) addressed every finding, plus the owner's WebM decision.
- A scoped re-review found everything addressed and no new Critical or Important issues.
- Suites at 26cb3f5: unit 245, browser 77, e2e 75 passed / 13 skipped by project, tsc, lint and build all clean.

## Owner decisions

- **WebM on the backup engine: option (c).** When a WebM export would need the slow backup engine but MP4
  would run on the fast engine, the slow-engine question offers "Export as MP4" first, "Make WebM anyway"
  (the existing all-intra VP9 path) and Cancel. Choosing MP4 switches the editor's format to MP4.
- **Checkpoint 2 passed on both phones,** including the items deferred from Checkpoint 1 and Phase 2A.

## Executor rulings, in order

Each ruling ends with what it costs if it turns out wrong.

1. **No separate worktree:** branch `feature/video-tools` in the main checkout, as in Phases 1 and 2A. *Cost:* a shared checkout.
2. **Commit trailers:** subagent commits carry the trailer for the model that wrote them. Earlier commits were not rewritten. *Cost:* a few commits name the wrong co-author model.
3. **Store tests live next to the store** (`store/**/*.test.ts` in the unit project). *Cost:* none.
4. **Quality switch survives a new file:** opening a new file or resetting keeps the person's quality-preview on/off and mode. *Cost:* a phone user who turned it on keeps it on across files.
5. **Sample-only number:** `quality.estimatedBytes` comes only from the sample. The instant estimate comes from `planOutput`. *Cost:* none.
6. **Rotate panel built early in Task 4** for its e2e. Task 6 extended it. *Cost:* none.
7. **`clipSize` parameter:** `drawPreviewFrame` took an optional `clipSize` parameter for proxy crop scaling. *Cost:* none.
8. **Default preview mode is "Original":** live edits stay visible, and Compressed is one tap away. *Cost:* one extra tap to see the sample.
9. **Phone Playwright project uses a mobile Chrome user agent.** *Cost:* none after Task 8.
10. **Trim handles overlapping at the 0.1 s minimum gap** was raised to Important and fixed. *Cost:* small extra scope.
11. **Preset kept when only the fit changes:** e.g. Instagram Reel + Blurred background stays "Instagram Reel". *Cost:* none.
12. **Free crop allows any rectangle** (the spec binds over the plan). It uses Width × Height shape fields with react-easy-crop, with zoom for size and drag for position. *Cost:* Free needs two numbers instead of a corner drag.
13. **Fallback-dialog component test** overrides `answerFallback` on the global store. *Cost:* the dialog-to-store wiring is covered only at the component level.
14. **Cancel e2e race** folded into a fix round. *Cost:* small extra scope.
15. **Safe-area padding stays, without `viewport-fit=cover`.** iOS Safari keeps content out of the notch and home-bar areas by itself. Adding cover would need insets on the site header and every edge. This revises the earlier ruling to add cover on /video. *Cost:* a bottom control close to the home bar. Checkpoint 2 passed.
16. **Clip strip hidden while a sheet other than Trim is open on phones.** *Cost:* a one-line revert if the owner wants it back.
17. **Crop panel shows Zoom above the Free fields on desktop too.** *Cost:* a trivial reorder.
18. **The one-frame stretch after rotate is unit-tested only.** *Cost:* a visual glitch. None was seen at Checkpoint 2.
19. **Target too small: top-bar Export stays enabled** (that error only), so the export view can show the MB field. *Cost:* one extra tap to see the same error.
20. **Time remaining:** elapsed time is kept, and an honest per-pass "About N s left" is added. *Cost:* the owner may want the rough estimate removed.
21. **Full-screen editor on phones (spec §6.5) deferred to Phase 4,** with the header and nav rework. *Cost:* about 12 % less editor height on phones until then.
22. **Maintainability tidy-up (M13)** went into the same fix wave, done last. *Cost:* a larger diff to re-review.
23. **Checkpoint 2 ran on a frozen copy of the 0429565 build,** so the fix wave could rebuild. The fixed build was served afterwards. *Cost:* I1, I2, W1 and M1 need a quick recheck on the fixed build.
24. **Fast-engine progress runs ahead of the encode** (Mediabunny counts frames handed to the encoder). Parked as the first item of the next phase. *Cost:* the bar sits at about 99 % for around 20 s on a 1080p export.
25. **ffmpeg jobs serialised inside the engine** (`lib/video/engines/job-queue.ts`), not by the store waiting. *Cost:* none expected.
26. **Unexpected export failures keep "Something went wrong: {engine message}".** *Cost:* a technical line on a rare crash.
27. **Five new minors from the re-review parked** (listed below). *Cost:* rare edge cases until the next phase.

## Open items for the next phase

Most important first.

1. **Fast-engine progress** should report encoded output, not frames handed to the encoder. This makes the bar and "About N s left" honest.
2. **After "Export as MP4" (W1), a fast-engine failure gets "Something went wrong"** instead of the backup-engine question (`export.ts:363-366`).
3. **An ffmpeg probe takes no abort signal.** A cancelled probe holds the job queue until it returns (`ffmpeg.ts:119-122`).
4. **`loopBack` can restart a suspended preview** in a narrow end-of-clip race when the export view opens (`preview-player.tsx:147-152`).
5. **The store switches to MP4 on an "mp4" answer the orchestrator didn't offer.** The UI can't send it.
6. **`act()` warnings** from the export view's 500 ms ticker in the browser suite.
7. **`describeProbeError`** shows raw engine text on the loading-error screen.
8. **`presets.ts:42` stores fractional target bytes.**
9. **Full-screen editor on phones** (Phase 4, with the header and nav). The footer can still be reached by swiping.
10. **Landscape phones** have only been reasoned about, not tested.

## Deferred minors still open, from the task reviews

- **Types and duplication:**
  - `planOutput` exposes `base`/`sourceBps`/`planFor` on its public type.
  - There is a duplicate `mb` helper (messages vs lab).
  - `file: undefined as unknown as File` cast around `applyPreset`.
- **Crop tests:** `remapCrop` tests lack from-side flips, 180/270 and combined cases. Add an all-16-orientation round-trip test next time `frame.ts` changes.
- **Samples and filmstrip:**
  - A sample is rescheduled behind the Done view right after an export finishes (desktop only; phones default off).
  - A superseded filmstrip build is not aborted (CPU waste, no leak).
- **Playback:**
  - `canPlayNatively`'s 5 s timeout may misreport big playable files on slow storage.
  - The proxy keeps audio.
- **Layout:**
  - A 4rem header fallback causes a one-frame layout shift.
  - The header selectors depend on page structure.
- **Trim:**
  - `trimOrNull` defaults to `moved="end"`.
  - An unreachable end < 0.1 edge in the pushback branch.
  - Edge hit width is about 16 px at the clip ends on phones.
  - A sweep test's `if (stored)` guard can pass silently.
- **Crop and size panels:**
  - The cropper shows the picture unflipped. The content is correct, but the box looks mirrored against the preview.
  - The zoom slider commits per step.
  - Locked typing flashes amber.
  - Custom size mode is forgotten on reopen.
  - The cropper video ignores trim and playhead.
  - The Free-size draft is cleared when the crop changes mid-edit.
  - maxZoom can reach about 45× for a 16×16 Free crop on 720p.
  - The Free e2e is desktop-only.
- **Size and export dialogs:**
  - The Segmented control switching to Target with an invalid retained draft gives no feedback.
  - `sizeDraftError` from the Size panel can't be cleared from the modal.
  - Export-view test store state isn't reset.
  - The guards "throws" test asserts nothing.
  - The per-step focus effect may skip initial focus if the panel isn't mounted yet.
  - There is no StrictMode test.
- **Phone UI:**
  - The bottom sheet's Escape works only while focus is inside it.
  - Phone tool buttons carry both `aria-pressed` and `aria-expanded`.
  - The `touch.ts` `[class*=min-h-]` opt-out also matches `lg:min-h-0`.
- **Tooling noise:**
  - vitest "esbuild and oxc options" warning
  - an npm "serve will be installed" line in the Playwright web server
  - the `libheif-js` build warning

## Resolved by the fix wave

These deferred minors were resolved in the fix wave or closed:
- `setPlayhead` restarting the debounce
- pause-before-ended storing the end time
- wake-lock double acquire
- the phone disabled-Export reason
- e2e coverage for the No-sound badge, amber errors and loading states
- recordClip hardening
- the sheet covering the tool bar
