# Video Tools — Phase 2A: decisions and open items

Plan: `docs/superpowers/plans/2026-11-20-video-tools-phase2a-edits-engine.md` · Range: 82d0e2e..9b2c20e on
`feature/video-tools` · Final state: unit 125/125, browser 35/35, tsc, lint, build clean.

Process: one fresh implementer per task, a task review after each, a final whole-branch review on the
most capable model (verdict "with fixes"), one fix wave (F1–F6), one scoped re-review (all addressed).

## Decisions made on the owner's behalf (in order)

1. No separate git worktree; work on `feature/video-tools` in the main checkout. Cost if wrong: shared checkout with the editor.
2. Task 3 must keep Task 2's "a smaller size may work" signal in the fast-engine precheck. Cost: none.
3. Task 1 gave the hand-built browser-test jobs default edits/container so existing tests kept compiling. Cost: none.
4. After the fast engine lowers a size and then fails, the backup run keeps the lowered size (user is told; estimate matches). Cost: a backup encode at lower resolution than ffmpeg could have managed.
5. The fast-engine precheck takes the output container (needed to check VP9 vs H.264). Cost: none.
6. Two extra test assertions (off-centre crop-to-fill; blur background darker than centre) because the planned checks couldn't tell a fit from a stretch. Cost: none.
7. **Backup-engine WebM uses all-intra VP9 (`-cpu-used 5 -g 1`) and low-complexity Opus** — the self-hosted ffmpeg core crashes with the planned settings. WebM only reaches the backup engine when the browser can't encode VP9. Cost: poorer quality per byte; may miss tight targets (see open decision below).
8. ffmpeg is rebuilt before a WebM encode once the instance has been used (crash root cause unknown). Cost: a short reload per WebM backup job.
9. Final review covered this plan's range only (Phase 1 had its own). Cost: none.
10. Corrected an earlier note: the quality preview *could* reach ffmpeg through its probe → fixed (F1).
11. Upgraded "NaN/tiny sizes" from minor to must-fix (F5): the 2B crop box could produce them. Cost: small extra scope.
12. Upgraded "Form upload preset must be MP4" to must-fix (F6), per spec §6.3. Cost: none.
13. WebM-on-backup target/speed measurement deferred to Checkpoint 2; the 2B wait dialog says "at least ~N min". Cost: until measured, backup WebM jobs may fail after slow passes and the dialog may understate the wait.
14. Reviewer recommendations (a pure plan/estimate function for the live size estimate; a crop-remap helper for rotation/flip changes) go into the Phase 2B plan. Cost: none.
15. Set aside as scheduled: HDR/HLG through canvas and output memory for long clips (iPhone checkpoint); non-square pixels, secondary audio, cover art, slow-motion, Firefox/macOS Safari, real HEVC/Safari automation (Checkpoint 2); lab UX; WhatsApp Status preset + split (Phase 3); licence notices (Phase 4); "keep original" option (2B UI).
16. Accepted fix-wave design notes: rotation+crop tests verified by mutation (engines were already right); internal probe options object; a sample stopped by an export resolves to "no preview"; source-size output under 16 px also refuses. Cost: none.
17. Rule for 2B: never run two ffmpeg jobs at once (the preview now never uses ffmpeg, and exports stop previews first).

## Open decision for the owner

**WebM on the backup engine.** Options: (a) keep all-intra VP9 (works, heavy files); (b) switch the backup
engine to VP8 for WebM (normal inter frames work in this core); (c) when WebM would need the backup
engine, offer MP4 instead. MP4 is unaffected and is what WhatsApp, Instagram and forms use.

## Still-open minor items (deferred)

- Tests: confirmFallback on the fast-engine-error path; non-null clamped crop end-to-end; flipH in the orchestrator tests; mediabunnyTransform identity case; percent after crop; step-down in target mode / multi-step; navigator branches of `isMobileDevice`; WebM with no audio; target-cap line unexercised (can't trigger today).
- Step-down loop continues past non-size precheck failures (harmless).
- Blur canvases shared across the constant→variable set-up attempts (safe while sequential).
- Backup WebM is heavy/low quality — don't oversell it in copy.
- Code tidy-ups: nested ternary for audio args; `inspectMp4` name for WebM; duplicated no-edits constants; local `OUT` naming.
- Lab-only (replaced by 2B): stale sample after Run; preset select doesn't return to Custom; duplicated number parsing; empty percent = 100; invalid "at second" = 0; no Cancel for preview; `PLATFORM_LIMITS` not `as const`; preset immutability untested.
- iPadOS reports a desktop user agent → backup wait estimate ~3× too low.
- ffmpeg blur fails for outputs whose short side is under ~160 px.
- Blur looks slightly different on each engine.
- Blur on rotated/cropped 4K renders full-size frames first (cost per frame on phones) — measure at Checkpoint 2.
- Quality-mode estimate ignores the sample's real size (phone encoders can overshoot).
- Very low-bitrate sources can still grow slightly (128 kbps audio floor).
- The wait dialog isn't raced against Cancel — 2B's dialog must answer "no" on cancel.
- An export waits for a stopped preview to settle, with no timeout.

## Add to Checkpoint 2 (phones)

WebM tight target + speed on the backup engine; 4K HEVC to the backup engine (estimate vs real time);
blurred background on a rotated 4K clip; starting an export while a quality sample runs; plus the deferred
iPhone tests from Checkpoint 1 (HDR, 4K, 3–5 min Quality High, WhatsApp-received clip, screen recording).
