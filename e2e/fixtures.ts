import { expect, type Locator, type Page, type TestInfo } from "@playwright/test";

export interface ClipOptions {
  seconds?: number;
  width?: number;
  height?: number;
  mime?: string;
  /** "motion" (default): moving colour blocks. "quadrants": still red top-left, green top-right, blue bottom-left, white bottom-right. */
  pattern?: "motion" | "quadrants";
}

/**
 * Record an animated canvas plus a 440 Hz tone with MediaRecorder inside the page, then put the
 * result (`test-clip.mp4`) on the dropzone's file input. Fails fast when the browser can't record
 * `mime` or the recorder errors, and records once more when a take comes out without a picture.
 */
export async function recordClip(page: Page, opts: ClipOptions = {}): Promise<void> {
  const {
    seconds = 4,
    width = 1280,
    height = 720,
    mime = "video/mp4;codecs=avc1,mp4a.40.2",
    pattern = "motion",
  } = opts;
  await page.waitForSelector("input[type=file]", { state: "attached" });
  await page.evaluate(
    async ({ seconds, width, height, mime, pattern }) => {
      if (!MediaRecorder.isTypeSupported(mime)) throw new Error(`recordClip: this browser can't record ${mime}`);

      const record = async (): Promise<Blob> => {
        const canvas = document.createElement("canvas");
        canvas.width = width;
        canvas.height = height;
        const ctx = canvas.getContext("2d")!;
        const stream = canvas.captureStream(30);
        const ac = new AudioContext();
        const osc = ac.createOscillator();
        const dest = ac.createMediaStreamDestination();
        osc.connect(dest);
        osc.start();
        stream.addTrack(dest.stream.getAudioTracks()[0]);
        const rec = new MediaRecorder(stream, { mimeType: mime, videoBitsPerSecond: 4_000_000 });
        const chunks: Blob[] = [];
        rec.ondataavailable = (e) => chunks.push(e.data);
        let frame = 0;
        const drawMotion = () => {
          ctx.fillStyle = `hsl(${(frame * 5) % 360} 60% 45%)`;
          ctx.fillRect(0, 0, width, height);
          for (let i = 0; i < 40; i++) {
            ctx.fillStyle = `hsl(${(i * 37 + frame * 3) % 360} 80% 60%)`;
            ctx.fillRect((i * 97 + frame * 7) % width, (i * 53 + frame * 4) % height, 80, 80);
          }
        };
        // Redrawn every tick (same picture) so the canvas stream keeps producing frames.
        const drawQuadrants = () => {
          const w = width / 2;
          const h = height / 2;
          const quads: [number, number, string][] = [
            [0, 0, "#ff0000"],
            [w, 0, "#00ff00"],
            [0, h, "#0000ff"],
            [w, h, "#ffffff"],
          ];
          for (const [x, y, colour] of quads) {
            ctx.fillStyle = colour;
            ctx.fillRect(x, y, w, h);
          }
        };
        const draw = pattern === "quadrants" ? drawQuadrants : drawMotion;
        draw();
        const timer = setInterval(() => {
          frame++;
          draw();
        }, 33);
        try {
          const failed = new Promise<never>((_, reject) => {
            rec.onerror = (e) => reject(new Error(`recordClip: MediaRecorder error ${(e as ErrorEvent).message ?? ""}`));
          });
          rec.start(500);
          await Promise.race([new Promise((r) => setTimeout(r, seconds * 1000)), failed]);
          const stopped = new Promise((r) => (rec.onstop = r));
          rec.stop();
          await Promise.race([stopped, failed]);
        } finally {
          clearInterval(timer);
          osc.stop();
          void ac.close();
          stream.getTracks().forEach((t) => t.stop());
        }
        return new Blob(chunks, { type: mime.split(";")[0] });
      };

      /** Whether the browser finds a picture in the take (a video track with a size). */
      const hasPicture = (blob: Blob) =>
        new Promise<boolean>((resolve) => {
          const v = document.createElement("video");
          const url = URL.createObjectURL(blob);
          let settled = false;
          const done = (ok: boolean) => {
            if (settled) return;
            settled = true;
            clearTimeout(timer);
            v.removeAttribute("src");
            v.load();
            URL.revokeObjectURL(url);
            resolve(ok);
          };
          const timer = setTimeout(() => done(false), 10_000);
          v.muted = true;
          v.preload = "metadata";
          v.onloadedmetadata = () => done(v.videoWidth > 0);
          v.onerror = () => done(false);
          // setAttribute, not the src property: a test may stub that to fake an unplayable file.
          v.setAttribute("src", url);
        });

      let blob = await record();
      if (!(await hasPicture(blob))) {
        blob = await record();
        if (!(await hasPicture(blob))) throw new Error("recordClip: the recording has no video track (twice)");
      }

      const file = new File([blob], "test-clip.mp4", { type: blob.type });
      const input = document.querySelector("input[type=file]") as HTMLInputElement;
      const dt = new DataTransfer();
      dt.items.add(file);
      input.files = dt.files;
      input.dispatchEvent(new Event("change", { bubbles: true }));
    },
    { seconds, width, height, mime, pattern }
  );
}

/* Shared by the specs: the editor's parts, and opening a clip. */

export const isPhone = (info: TestInfo) => info.project.name === "phone";
export const estimate = (page: Page) => page.getByTestId("estimate");
export const presetPicker = (page: Page) => page.getByRole("combobox", { name: "Preset" });
export const previewCanvas = (page: Page) => page.getByLabel("Preview", { exact: true }).locator("canvas");
export const startHandle = (page: Page) => page.getByRole("slider", { name: "Trim start" });
export const endHandle = (page: Page) => page.getByRole("slider", { name: "Trim end" });
export const track = (page: Page) => page.getByTestId("timeline-track");

/** A number attribute of `loc` (by default a slider's value). */
export const num = async (loc: Locator, attr = "aria-valuenow") => Number(await loc.getAttribute(attr));

/** The MB figure on the estimate line ("≈ 1.2 MB · …"). */
export async function estimateMb(page: Page): Promise<number> {
  const text = await estimate(page).innerText();
  return Number(/≈ ([\d.]+) MB/.exec(text)![1]);
}

/** A tap on the phone project, a click on the desktop one. */
export async function tapOrClick(loc: Locator, info: TestInfo): Promise<void> {
  if (isPhone(info)) await loc.tap();
  else await loc.click();
}

/** Open the editor and wait for its dropzone. */
export async function gotoStudio(page: Page): Promise<void> {
  await page.goto("/video/");
  await expect(page.getByText("Drop a video here")).toBeVisible();
}

/**
 * Record a clip (4 s at 1280×720 unless `opts` says otherwise), open it, and wait for the editor:
 * the file name, an estimate and the preview.
 */
export async function openClip(page: Page, opts: ClipOptions = {}): Promise<void> {
  await recordClip(page, { seconds: 4, width: 1280, height: 720, ...opts });
  await expect(page.getByText("test-clip.mp4")).toBeVisible();
  await expect(estimate(page)).toContainText("MB");
  await expect(previewCanvas(page)).toBeVisible();
}
