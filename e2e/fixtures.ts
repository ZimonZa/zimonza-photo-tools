import type { Page } from "@playwright/test";

export interface ClipOptions {
  seconds?: number;
  width?: number;
  height?: number;
  mime?: string;
}

/**
 * Record an animated canvas plus a 440 Hz tone with MediaRecorder inside the page, then put the
 * result (`test-clip.mp4`) on the dropzone's file input.
 */
export async function recordClip(page: Page, opts: ClipOptions = {}): Promise<void> {
  const { seconds = 4, width = 1280, height = 720, mime = "video/mp4;codecs=avc1,mp4a.40.2" } = opts;
  await page.waitForSelector("input[type=file]", { state: "attached" });
  await page.evaluate(
    async ({ seconds, width, height, mime }) => {
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
      const timer = setInterval(() => {
        frame++;
        ctx.fillStyle = `hsl(${(frame * 5) % 360} 60% 45%)`;
        ctx.fillRect(0, 0, width, height);
        for (let i = 0; i < 40; i++) {
          ctx.fillStyle = `hsl(${(i * 37 + frame * 3) % 360} 80% 60%)`;
          ctx.fillRect((i * 97 + frame * 7) % width, (i * 53 + frame * 4) % height, 80, 80);
        }
      }, 33);
      rec.start(500);
      await new Promise((r) => setTimeout(r, seconds * 1000));
      const stopped = new Promise((r) => (rec.onstop = r));
      rec.stop();
      await stopped;
      clearInterval(timer);
      osc.stop();
      const type = mime.split(";")[0];
      const file = new File(chunks, "test-clip.mp4", { type });
      const input = document.querySelector("input[type=file]") as HTMLInputElement;
      const dt = new DataTransfer();
      dt.items.add(file);
      input.files = dt.files;
      input.dispatchEvent(new Event("change", { bubbles: true }));
    },
    { seconds, width, height, mime }
  );
}
