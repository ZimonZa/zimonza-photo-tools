# Video Tools — Checkpoint 2 (editor on real phones)

Date: 2026-11-24 / 2026-11-25
Build: `feature/video-tools` at 0429565 (end of Phase 2B Task 8), a frozen copy of `out/` served from the dev
PC via a temporary Cloudflare quick tunnel, page `/video/`. The final-review fix wave (0429565..26cb3f5) was
built after this copy and was not part of this run.

## Decision

**Passed (owner, 2026-11-25).** The owner reported every test passed on both phones (iPhone and Android),
including the items deferred from Checkpoint 1 and Phase 2A. No timings or per-file sizes were reported.

## Tests run (both phones, all passed)

1. Drop a phone clip: the preview plays upright.
2. Instagram Reel preset on a landscape clip, Blurred background, export: plays upright and posts to Instagram.
3. Trim to 10 s with the handles, Sound Off, Form upload 5 MB: under 5 MB, silent.
4. Crop 1:1 then rotate: the crop follows the picture.
5. Quality preview on: the sample and estimate appear.
6. Cancel an export, then export again.
7. Deferred items:
   - an iPhone HDR camera clip (colours)
   - a 4K clip on Quality High at Original size
   - a 3–5 min clip on Quality High (memory)
   - a WhatsApp-received clip with Target 20 MB (no growth)
   - a screen recording
   - WebM output on iPhone (backup engine)
   - starting an export while a quality sample runs
8. Phone layout:
   - Export on the first top-bar row
   - tool sheets never cover the tool bar, estimate or picture
   - trim handles usable by finger
   - multi-pass progress never shows 100 % while working
   - controls clear of the iPhone home bar

## Owner decisions at this checkpoint

- **WebM on the backup engine → option (c):** when a WebM export would need the slow backup engine but MP4
  would run on the fast engine, offer "Export as MP4" first, with "Make WebM anyway" (today's path) and
  Cancel. Implemented in the fix wave (W1).

## Re-check on the fixed build

These fixes landed after the tested copy, so recheck them on the next served build:

- **I1:** press Export while the clip plays. The preview stops, with no sound under the export view.
- **I2:** open an AVI or WMV on mobile data. Engine-download progress shows. Tap Cancel mid-load, re-drop: no error.
- **W1:** WebM export on iPhone offers MP4.
- **M1:** quality preview on a 2–3 s trim while it loops. The sample appears.

## Findings for the next phase

1. **Fast-engine progress runs ahead of the encode.** Mediabunny reports frames handed to the encoder, so
   the bar reaches ~99 % within a second and sits there for the rest of the encode (~20 s on a 1080p clip).
   The new "About N s left" line therefore shows only briefly on the fast engine. Report progress from
   encoded output instead. This is first in line for the next phase.
2. **Full-screen editor on phones (spec §6.5)** is not done. The ~105 px site header stays above the
   editor, and the footer can be reached by swiping. This is deferred to Phase 4's header and nav rework
   for the rename.
3. **Landscape phones** have only been reasoned about, not tested.
