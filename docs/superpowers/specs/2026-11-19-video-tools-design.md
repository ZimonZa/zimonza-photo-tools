# Video Tools for ZimonZa — Design

Date: 2026-11-19
Status: draft, awaiting owner approval

Notes on sourcing: items marked **(owner)** were decided by the site owner. Items marked
**(my call)** are proposals made during design that the owner has not individually
confirmed; the builder may revisit them with good reason.

---

## 1. Intent and why

ZimonZa is today a free, 100% client-side photo toolkit (resize, crop, convert, compress)
deployed as a static Next.js site on GitHub Pages. The owner wants to add a full set of
**video tools** with the same promise: free, no sign-up, and files never leave the device.

**Who it's for (owner):** everyday people holding **short phone clips (mostly under 500 MB)**
who need them to fit where they're going: **WhatsApp, Instagram, and online forms with
upload size limits**. They don't think in codecs or bitrates; they want "make this fit"
to just work.

**What success looks like:**
- A user can open the site on their phone, drop a clip, apply several edits at once
  (e.g. trim + crop to 9:16 + mute + compress to 20 MB) and download one file that
  plays correctly on WhatsApp/Instagram and is **at or under** the requested size.
- The common path is fast (hardware-accelerated). As a target (my call): a 1-minute
  1080p phone clip compressed to 20 MB finishes in about 1–2 minutes on a mid-range
  Android phone in Chrome.
- Unusual files and browsers still work, just slower, instead of being turned away.

## 2. Goals

All of the following are in scope for the first version **(owner: "add all the extras")**.

Core tools **(owner)**:
1. **Trim** — choose start/end.
2. **Crop** — ratio presets (1:1, 4:5, 9:16, 16:9, free).
3. **Resize** — presets, custom width × height in pixels (with aspect lock), percent.
4. **Compress** — quality levels, or **target file size in MB** (result must be ≤ target).
5. **Convert** — change output format.
6. **Mute** — remove audio.
7. **Merge** — join multiple clips into one.
8. **Loop** — repeat the clip N times.
9. **Speed** — speed up / slow down.
10. **Reverse** — play backwards.

Extras **(owner approved all)**:
11. **Split into parts** — chop into fixed-length pieces (e.g. for WhatsApp Status).
12. **Rotate / flip** — 90° steps, horizontal/vertical flip.
13. **Extract audio as MP3.**
14. **Video → GIF.**
15. **Save a frame as a photo**, with a hand-off into the existing photo tools.
16. **Volume boost** and **fade in/out.**
17. **Text / watermark overlay.**

Also **(owner)**:
- **Fit with blurred background** as an alternative to crop-to-fill when changing aspect
  ratio (e.g. landscape video → 9:16 Reel without cutting anything off).
- **One-tap presets** for destinations (see §6.3).
- **Edits stack** into a single export pass (one encode, not one per tool).
- **Rename the site** to **"ZimonZa Photo & Video Tools"** (see §6.6).

## 3. Non-goals (first version)

- **Batch processing many videos with the same settings** (my call). Video encoding on
  phones is slow and memory-heavy; one project at a time (with multiple clips only for
  merge) keeps it reliable. Could be added later.
- Multi-track editing (overlapping clips, picture-in-picture, transitions between clips,
  keyframed animation). This is a "make it fit" toolkit, not a full NLE.
- Background music library / adding a separate music track (my call; not requested).
- Text that appears only for part of the video (my call: overlay applies to the whole
  output in v1).
- Server-side processing of any kind.

## 4. Anti-goals (would be failures even if it "works")

- **Any upload of user media to a server.** Breaks the core privacy promise.
- **Any paid service, paid API, paid library, or paid theme (owner).** Everything must be
  free and open source.
- Watermarks, sign-up walls, or usage limits added to the user's output.
- A "target size" result that comes out **over** the requested size (forms will reject it).
- MP4 output that WhatsApp or Instagram refuses or plays incorrectly.
- Breaking or moving existing photo tool URLs (they have search rankings).
- Shipping the ~30 MB fallback engine to users who don't need it.

## 5. Constraints

- **Static hosting on GitHub Pages** (`output: "export"` in `next.config.mjs`, deployed by
  `.github/workflows/deploy.yml` with `NEXT_PUBLIC_BASE_PATH=/zimonza-photo-tools`).
  No server, no custom HTTP headers. All asset URLs must respect the base path.
- **The one live address is `https://zimonza.github.io/zimonza-photo-tools` (owner).**
  Vercel is **not** used (owner). As part of the rename, remove the Vercel leftovers:
  the Vercel deploy instructions in the README and the `VERCEL_PROJECT_PRODUCTION_URL`
  fallback in `lib/site.ts`. (`.vercel/` is git-ignored and local only; leave it.)
- **Testing before going live:** pushes to `main` publish straight to the live site, so
  the work happens on a **feature branch** and is merged only after the owner approves.
  The owner has **both an iPhone and an Android phone** and will test at checkpoints
  (owner). Phones need an HTTPS link (WebCodecs requires a secure context), so each
  checkpoint is served from the developer's computer through a **free temporary HTTPS
  tunnel** (e.g. Cloudflare's no-account quick tunnel) (my call). Only the site's code
  travels through the tunnel; test videos are still processed on the phone.
- **Checkpoint order (my call):** the plan starts with an **engine spike** (both engines,
  one real compress-to-target job) that the owner tests on both phones, including sending
  the result through WhatsApp and uploading it to Instagram, before the 17 tools are built
  on top of it.
- **All processing in the browser.**
- **Free / open-source only (owner).** License notes for the chosen engines:
  Mediabunny is MPL-2.0; the ffmpeg.wasm core bundles GPL components (e.g. x264), so
  the site must carry the required notices and a link to the source (add to the About
  page or a Licenses section).
- **Inputs:** mostly phone clips under 500 MB, including **iPhone HEVC `.MOV`**, which some
  browsers cannot play natively. Should also accept MP4, WebM, MKV, M4V, 3GP, AVI, WMV, FLV.
- **Phones are the primary device.** Memory is limited; screens lock; tabs get suspended.
- Existing stack: Next.js 14 App Router, TypeScript, Tailwind, Zustand, lucide-react,
  react-dropzone. Heavy libraries are lazy-loaded only when needed (existing pattern
  for HEIC/TIFF decoders) — follow the same pattern.

## 6. What was decided

### 6.1 Engine — approaches considered

| Approach | Pros | Cons |
|---|---|---|
| 1. ffmpeg.wasm only | Does every feature; any input format; one engine | CPU-only, slow on phones (minutes per minute of 1080p); 300–500 MB files can run out of memory; ~30 MB download |
| 2. WebCodecs only (Mediabunny) | Hardware-accelerated, often 10×+ faster; tiny download | Depends on browser support; older Safari / some Firefox and rare formats (AVI, WMV) would be turned away; reverse/merge/speed need custom code |
| **3. Both — WebCodecs first, ffmpeg.wasm fallback** | Fast for most users, nobody turned away; mirrors existing lazy-load pattern | Two engines to build and test |

Rejected outright: server-side processing (costs money, breaks the privacy promise).

**Chosen (owner): Approach 3.**

- **Primary engine:** WebCodecs via **Mediabunny** (MPL-2.0; current at time of writing
  ≈ v1.61). Its Conversion API covers trim, crop, resize, rotate, codec/bitrate changes and
  audio removal; features it doesn't cover (blur-fit, text overlay, fades, speed, reverse,
  loop, merge) are built on its lower-level decode → process frames → encode pipeline,
  using canvas/OffscreenCanvas for per-frame drawing.
- **Fallback engine:** **ffmpeg.wasm**, lazy-loaded in a Web Worker only when the fast path
  can't do the job.
- **Routing rule:** before export, check capabilities for this input + these settings
  (e.g. `VideoDecoder.isConfigSupported` for the input codec, `VideoEncoder` for H.264 at
  the output size, `AudioEncoder` for AAC, container demux support). If anything is
  unsupported → use ffmpeg.wasm. If the fast path throws mid-export → automatically retry
  once with ffmpeg.wasm. The user sees a one-time "Downloading video engine (~30 MB)…"
  progress the first time the fallback loads.
- **Single-threaded ffmpeg core, no service-worker header hack (my call).** The
  multi-threaded core needs cross-origin isolation, which GitHub Pages can only get via
  `coi-serviceworker` (forces a reload, and COEP can break future third-party scripts
  such as ads/analytics). Since the fallback is the rare path, single-threaded is the
  safer trade.
- **Self-host the ffmpeg core (my call)** under the site's own origin (copied from
  `node_modules` into the static output at build time, not committed to git), instead of
  loading from a public CDN — no third-party request, no CDN outage risk.
- **One job may mix engines (my call)** where that avoids the slow path for the whole job,
  e.g. hardware video encode via WebCodecs + software audio encode on browsers lacking a
  WebCodecs `AudioEncoder` for AAC (older iOS Safari), instead of sending everything to
  ffmpeg.wasm.
- **Both engines must produce the same output contract:** MP4 = H.264 video + AAC audio,
  `faststart` (moov at front), even dimensions, standard pixel format (yuv420p), so the
  files play on WhatsApp and Instagram.

### 6.2 Feature behaviour

Order of operations in the single export pass (my call):
**merge (in timeline order) → per-clip trim → speed / reverse / loop → rotate / flip →
crop or blur-fit → resize → text / watermark → fade → audio (mute / volume) → encode
(quality or target size) → split into parts (if on).**

| Feature | Behaviour |
|---|---|
| Trim | Per clip. Draggable start/end handles on the timeline plus exact time inputs. |
| Split into parts | Applied to the final output. Part length selectable (presets incl. WhatsApp Status length, or custom seconds). Produces several files; offer "download all" as ZIP (JSZip already in the project). |
| Crop | Ratios 1:1, 4:5, 9:16, 16:9, 4:3, free; draggable crop box on the preview. Two modes: **Crop to fill** and **Fit with blurred background** (owner). |
| Resize | Presets (1080×1920, 1080×1350, 1080×1080, 1920×1080, 1280×720, 854×480), custom px with aspect lock, percent. "Don't enlarge" on by default (my call, mirrors photo tools). Output dimensions forced to even numbers. |
| Rotate / flip | 90° steps; flip H / V. Respect the input's rotation metadata (phone videos often carry it). |
| Speed | 0.25×–4× (my call). Audio pitch preserved (no chipmunk voices) (my call). |
| Reverse | Video reversed; audio reversed too by default, with option to mute (my call). |
| Loop | Repeat 2–10 times (my call). |
| Merge | **Trim and crop position are per clip; every other edit applies to the whole merged result (my call).** Add clips via "+" on the timeline; drag to reorder. Clips with different sizes/ratios are fitted into one output frame using the chosen crop/blur-fit mode. Different frame rates / audio sample rates are normalised. Clips without audio get silence. |
| Mute | Remove audio track entirely. |
| Volume | 0–300% (my call), with clipping protection. |
| Fade in / out | Picture fades from/to black and sound fades in/out together; length 0.5–3 s (my call). |
| Text / watermark | Text: content, font size, colour, optional background box, position (drag on preview or 9-point grid). Image watermark: upload a PNG/JPG logo, size, opacity, position. Applies to whole video (v1). |
| Compress | Levels: High quality / Balanced / Small file. Or **Target size in MB** (see §6.4). |
| Convert | Output formats: **MP4 (default)**, WebM, GIF, MP3 (audio only). |
| Video → GIF | Options: frame rate, width, loop forever. Warn when the GIF would be very large. |
| Extract audio | MP3 output of the (edited) audio. |
| Save frame | Pick a frame on the timeline → download as JPG/PNG, **or "Edit in photo tools"**, which puts the frame into the existing image store (`store/useImageStore.ts`) and navigates to `/resize`. |

### 6.3 Presets

| Preset | Sets |
|---|---|
| Instagram Reel / Story | 9:16, 1080×1920, MP4 |
| Instagram Post | 4:5, 1080×1350, MP4 (with 1:1 1080×1080 as an option) |
| WhatsApp | MP4, long side ≤ 1280 px, Balanced quality (my call) |
| WhatsApp Status | Split into parts of the current Status length, MP4 |
| Form upload | Asks "under how many MB?", target-size mode, MP4 |
| Custom | No changes; user sets everything |

Platform limits change. At design time, third-party sources (no official statement found)
put WhatsApp Status at **90 seconds** and Instagram Reels at **1080×1920, up to 3 minutes**
for most accounts. Keep these values as named constants in one file so they're easy to
update, and re-check them before launch.

### 6.4 Target file size (compress to N MB)

- Compute the video bitrate from target size, duration (after trim/speed/loop) and an
  audio budget (default 128 kbps AAC; drop to 96/64 kbps for tight targets; 0 if muted),
  with a safety margin for container overhead.
- Encode, measure. If over target, lower bitrate and re-encode (bounded number of retries).
  The final file must be **≤ target**; aim for ≥ ~90% of target so quality isn't wasted.
- If the target is too small for the duration at the chosen resolution (bitrate would be
  unwatchable), **automatically step down resolution** and tell the user what changed
  (my call). If still impossible, explain and suggest trimming.
- Show an estimated output size live in the editor before exporting.
- **"MB" means 1,000,000 bytes (my call)** for video targets, so the result also fits
  forms that count 1 MB as 1,048,576 bytes. (The photo tools use 1,048,576; leave them.)
- **Split + target size (my call):** the target applies to **each part**.

### 6.5 Screen layout (owner picked layout "B", editor style)

Mockups: `.superpowers/brainstorm/1289-1795089246/content/video-studio-layout.html`
(option B) and `video-studio-mobile.html`.

**Desktop:**
- Top bar: preset dropdown, Export button.
- Left: vertical tool rail — Trim, Crop, Size, Speed, Audio, Effects, Text, More
  (exact grouping left to builder; every feature in §6.2 must be reachable).
- Centre: large preview player (shows crop box / text overlay / rotation live).
- Right: settings panel for the selected tool.
- Bottom: clip timeline spanning the width; clips shown as filmstrip blocks; "+" adds a
  clip (merge); drag to reorder; playhead.

**Phone:**
1. Main screen: preset + Export on top, preview, clip strip, horizontally swipeable tool bar
   at the bottom.
2. Tapping a tool opens a **bottom sheet** with only that tool's settings; preview stays
   visible above.
3. Export screen: format, size (best quality / target MB with estimate), resolution,
   **progress bar with time remaining and Cancel**, then Download.

**Live preview — both kinds (owner, 2026-11-19):**
- **Edits preview (instant):** the centre player shows trim range, crop box / blur-fit, rotation/flip,
  output size and text overlay live on the original video while settings change.
- **Compressed-quality preview:** shows what the exported file will actually look like. My calls on
  how: when the "Preview quality" switch is on, encode a ~3-second sample around the playhead with the
  real engine and the current plan, about 1 s after settings stop changing; show an
  **Original | Compressed** toggle on the player plus the estimated final file size. Off by default on
  phones to save battery; a sample encode must never block or slow the main export.

**Custom resize (owner, confirmed 2026-11-19):** width × height in px with aspect lock, presets and
percent, as in §6.2; unlocking the ratio uses crop-to-fill or blur-fit.

**Tool pages (my call):** each page shows its header and a video dropzone first; once a
file is dropped, the editor opens (full-screen on phones).

**Export behaviour (my calls):** besides Download, offer a **Share** button (Web Share API,
free, built into phones) so users can send the result straight to WhatsApp/Instagram or
save it to their gallery; request a Screen Wake Lock during export where
supported so the phone doesn't sleep; warn before leaving the page mid-export; output
file named `<original-name>-zimonza.<ext>` (or `-part1`, `-part2` … for splits).

**Preview of files the browser can't play** (e.g. HEVC on some browsers): generate a
low-resolution preview proxy so the editor still works. Approach left to builder.

### 6.6 Site changes

- **Rename (owner):** "ZimonZa Photo Tools" → **"ZimonZa Photo & Video Tools"** everywhere:
  `app/layout.tsx` metadata (title, template, description, keywords, OpenGraph), header logo
  text (`components/site-header.tsx`), footer, About, Privacy ("images" → "photos and
  videos"), README, home page copy.
- **Address unchanged (owner):** keep `zimonza.github.io/zimonza-photo-tools` and all
  existing photo routes as they are.
- **Header:** separate **Photo** and **Video** menus (dropdowns on desktop; grouped pill
  rows on mobile). Split `TOOLS` in `lib/formats.ts` into photo and video lists; the home
  page grid and `app/sitemap.ts` use both.
- **Home page:** add a video section and video CTA alongside the photo one; hero copy
  covers both.
- **Dropzone:** a video-specific dropzone (accepted video types, video wording) rather
  than changing the photo one.

### 6.7 Routes (my call)

- `/video` — the full editor (all tools).
- One page per tool for search, each opening the same editor with that tool pre-selected
  and a tool-specific title, description and FAQ (reuse `components/tool-page.tsx`):
  `/video/compress`, `/video/trim`, `/video/merge`, `/video/resize`, `/video/crop`,
  `/video/convert`, `/video/mute`, `/video/speed`, `/video/reverse`, `/video/loop`,
  `/video/rotate`, `/video/split`, `/video/to-gif`, `/video/to-mp3`, `/video/text`,
  `/video/frame`, `/video/volume`.
- Format-pair pages for search, e.g. `/video/mov-to-mp4`, `/video/webm-to-mp4`,
  `/video/mkv-to-mp4`, `/video/avi-to-mp4`, `/video/mp4-to-webm`.
- Keeping video under `/video/` avoids clashing with the existing top-level
  `app/[conversion]` image route.
- All new routes added to the sitemap.

## 7. Left to the builder

- Exact Mediabunny and ffmpeg.wasm versions and package names (verify against current
  docs; ffmpeg.wasm package naming for the single-thread core has varied by version).
- Internal architecture: worker layout, how the editor state store is shaped (a new
  Zustand store alongside `useImageStore` is the natural fit), how the two engines share
  one "edit recipe" format.
- Pitch-preserving time-stretch technique on the WebCodecs path (a free library such as
  SoundTouch-based JS, or routing such jobs to ffmpeg's `atempo`).
- Reverse on long clips: memory strategy (e.g. reverse GOP-by-GOP). Must work for at least
  60-second phone clips on a mid-range phone; above a safe limit, show a clear message.
- GIF encoder and MP3 encoder choice (must be free/open source).
- Exact tool-rail grouping and icons, FAQ copy per page, final route list.
- Memory guardrails for 300–500 MB inputs on phones (e.g. streaming reads from the `File`
  rather than loading it whole; mounting the file into ffmpeg's filesystem without copying).
- Test matrix: sample clips (iPhone HEVC MOV, Android MP4, WebM, AVI) across Chrome
  (desktop + Android), Safari (iOS + macOS), Firefox desktop; verify outputs play on
  WhatsApp and upload to Instagram.
- Licenses section content for ffmpeg (GPL) and Mediabunny (MPL-2.0).
- Add `.superpowers/` to `.gitignore` (brainstorm mockups live there).
