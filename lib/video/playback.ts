/** Browser playback checks for the editor preview, and a small proxy for files the browser can't play. */
import type { VideoInfo } from "@/lib/video/engines/types";
import { ExportCanceledError } from "@/lib/video/errors";
import { exportVideo } from "@/lib/video/export";
import { BASE_RECIPE } from "@/lib/video/recipe";

/** Long side of the preview proxy, in px. */
const PROXY_LONG_SIDE = 640;

/**
 * Whether a hidden `<video>` can decode a picture from `file`: true on `loadeddata` with a video
 * size, false on `error` or after `timeoutMs`.
 */
export function canPlayNatively(file: File, timeoutMs = 5000): Promise<boolean> {
  if (typeof document === "undefined") return Promise.resolve(false);
  return new Promise((resolve) => {
    const video = document.createElement("video");
    const url = URL.createObjectURL(file);
    let done = false;
    let timer: ReturnType<typeof setTimeout> | undefined;
    const finish = (ok: boolean) => {
      if (done) return;
      done = true;
      clearTimeout(timer);
      video.removeEventListener("loadeddata", onData);
      video.removeEventListener("error", onError);
      video.pause();
      video.removeAttribute("src");
      video.load();
      URL.revokeObjectURL(url);
      resolve(ok);
    };
    // Audio alone also fires loadeddata; without a picture there is nothing to preview.
    const onData = () => finish(video.videoWidth > 0);
    const onError = () => finish(false);
    timer = setTimeout(() => finish(false), timeoutMs);
    video.addEventListener("loadeddata", onData);
    video.addEventListener("error", onError);
    video.muted = true;
    video.playsInline = true;
    video.preload = "auto";
    video.src = url;
    // iOS Safari loads no frames until playback starts; a muted inline play needs no tap.
    video.play().catch(() => {});
  });
}

/**
 * A low-resolution H.264 copy for previewing a file the browser can't play, made on the fast
 * engine only. Resolves null when it can't be made; rejects with `ExportCanceledError` on cancel.
 */
export async function makePreviewProxy(file: File, info: VideoInfo, signal: AbortSignal): Promise<Blob | null> {
  if (signal.aborted) throw new ExportCanceledError();
  // The fast engine can't read it, so it can't make the proxy either.
  if (!info.readableByMediabunny) return null;
  try {
    const result = await exportVideo(
      {
        ...BASE_RECIPE,
        file,
        frame: { kind: "source", maxLongSide: PROXY_LONG_SIDE },
        size: { kind: "quality", level: "small" },
      },
      { engine: "webcodecs", signal }
    );
    return result.blob;
  } catch (e) {
    if (e instanceof ExportCanceledError || signal.aborted) throw new ExportCanceledError();
    return null;
  }
}
