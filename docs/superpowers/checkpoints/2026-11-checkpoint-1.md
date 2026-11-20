# Video Tools — Checkpoint 1 (engine on real phones)

Date: 2026-11-19 / 2026-11-20
Build: `feature/video-tools` at 199e4f9 (+ lab-only mute warning 102eed9), served from the dev PC via a
temporary Cloudflare quick tunnel, page `/video/lab/`.

## Decision

**Go to Phase 2 (owner, 2026-11-20).** Android passed every core check. iPhone tests are deferred by the
owner ("will test later on iPhone") and run alongside Phase 2; anything they turn up is fixed before
Phase 2's own checkpoint. Cancel on the phone is still to be confirmed.

## Results — Android (Chrome 157, Android 10)

| # | Input | Settings | Engine | Output | Time |
|---|---|---|---|---|---|
| A | HEVC + AAC, 1080×1920 display, rotation 90, 10.3 s, 19.8 MB | target 20 MB, muted | fast | 15.5 MB, 1 pass, ✓ | 8.3 s |
| B | AVC + AAC, 1080×1920, 8.7 s, 8.1 MB | target 20 MB, muted | fast | 6.8 MB, 1 pass, ✓ (no inflation) | 4.3 s |
| C | AVC + AAC, 1080×1920 display, rotation 90, 17.0 s, 46.6 MB | forced backup, quality balanced, 1280 px, muted | ffmpeg | 3.44 MB, 720×1280 | 243 s (incl. 32 MB download) |
| D | AVC + AAC, 360×640, 19.0 s, 0.93 MB | quality high, sound on | fast | 0.94 MB (+1 %) | 3.4 s |
| — | owner-confirmed | test 1 with sound | fast | **plays upright; WhatsApp and Instagram OK, audio OK** | — |

Earlier run labelled "Android" was actually desktop Chrome on Windows (29.2 s 1080×1920, 59.4 MB → 18.41 MB,
1 pass, 70.7 s).

## Findings that shape Phase 2

1. **Fast engine is the product.** HEVC, rotated portrait, AAC all handled on Android, faster than real
   time. Keep the backup engine for rare cases only.
2. **Backup engine is ~12–14× slower than real time on a phone** (17 s clip ≈ 4 min). Phase 2 shows an
   estimated wait and a warning before the backup engine runs on long clips.
3. **Phone encoder rate control is loose.** One HEVC clip came out at ~1.9× the planned bitrate (still
   under target; another clip hit the plan exactly). Target retries will carry this; Phase 2 should
   report the chosen bitrate mode in diagnostics.
4. **Already-tiny clips can grow ~1 %.** The source-bitrate ceiling aims at the source's own rate. Phase 2:
   aim a few % under the source, never use more audio bitrate than the source had, or offer
   "already small enough — keep the original".
5. **Mute switch was misread three times.** The real editor needs an unmistakable sound on/off control.

## Still open

- iPhone (Safari): tests 1–4 plus extras (HDR camera clip, 4K quality/original, 3–5 min quality high,
  WhatsApp-received clip, screen recording).
- Android: confirm Cancel stops a run and shows "Canceled." (the tested clip finished in 3 s).
- Review items deferred to Phase 2 by ruling: encodable-size step-down instead of full-resolution
  backup (4K), and output memory (BufferTarget + in-memory faststart holds the output 2–4×).

## Decisions made during Phase 1 (executor rulings)

- No separate git worktree; work on `feature/video-tools` in the main checkout.
- Git run with `safe.directory` and author identity via environment variables (no global config change).
- Vitest pinned to 4.1.12 (5.x needs newer `@types/node` than the project pins).
- `vitest.config.mts` instead of `.ts` (Vite loaded the ESM config as CommonJS).
- WebCodecs bitrate test moved to 3 Mbps / 1.2× (random noise can't compress to 300 kbps on any encoder).
- Fast engine uses constant bitrate (measured 1.00× of plan vs 1.35× variable), with automatic fallback
  to variable when a device can't encode constant.
- Fast engine treats a silently dropped video/audio track as "unsupported" so the job falls back instead
  of losing sound; conversions use the primary tracks only.
- ffmpeg input mounted via WORKERFS `blobs` (no copy, safe file names); `NEXT_PUBLIC_BASE_PATH` defined
  for browser tests.
- A forced engine skips its precheck; in auto mode a fast-engine "target not reached" also triggers the
  one backup run.
- Desktop smoke test used Chrome-recorded clips instead of the owner's personal videos.
- Final review run before the phone checkpoint; checkpoint list extended with the reviewer's extra cases.
- Not reproduced by a test: ffmpeg crash (out of memory) discards the instance — same code path as the
  tested cancel.
- Set aside as outside Phase 1 (each stands): licence notices (Phase 4); wake lock / leave warning /
  Share / live estimate / HEVC preview (Phase 2); timeline tools (Phase 3); non-square-pixel sources on
  the backup path; iPhone slow-motion ramps; secondary audio tracks; cover-art video streams; Firefox and
  macOS Safari; lab page design; dot-file names.

## Deferred minors (from the final review)

- `normalizeTrim` accepts NaN/Infinity.
- ffmpeg probe `Duration: N/A` silently becomes 0.
- iPhone HDR/HLG 10-bit untested; backup path converts to 8-bit without tone mapping.
- ffmpeg wasm blob URL never revoked; re-downloaded after each cancel; gzip can push the download
  percentage past 100 %.
- A failed AAC-encoder load is cached for the life of the tab.
- An unreadable or non-video file downloads the 32 MB backup engine just to fail.
- A fast-engine pass that throws mid-loop discards an earlier result that was already under target.
- Test gaps: under-filled-at-ceiling stop, software AAC path, fallback status after an encode error.
- `package.json` uses caret ranges; `@ffmpeg/core` and `@ffmpeg/ffmpeg` must stay a matched pair.
- Clearing the lab's target field silently uses 20 MB.
