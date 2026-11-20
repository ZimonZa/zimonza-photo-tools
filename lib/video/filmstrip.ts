/** Thumbnails for the timeline. Mediabunny is loaded only when a strip is requested. */

/** The thumbnail time for slot `i` of `count`: the middle of that slot, relative to the clip start. */
function slotTime(i: number, count: number, durationSec: number): number {
  return ((i + 0.5) / count) * durationSec;
}

function toJpeg(canvas: HTMLCanvasElement | OffscreenCanvas): Promise<Blob | null> {
  if ("convertToBlob" in canvas) return canvas.convertToBlob({ type: "image/jpeg", quality: 0.7 });
  return new Promise((resolve) => canvas.toBlob(resolve, "image/jpeg", 0.7));
}

/**
 * `count` JPEG thumbnails, `height` px tall, evenly spaced over the primary video track.
 * Resolves to an empty array when the file can't be read, so a strip failure never breaks the editor.
 */
export async function makeFilmstrip(file: File, count: number, height: number): Promise<Blob[]> {
  if (count <= 0) return [];
  const { ALL_FORMATS, BlobSource, CanvasSink, Input } = await import("mediabunny");
  const input = new Input({ source: new BlobSource(file), formats: ALL_FORMATS });
  try {
    const track = await input.getPrimaryVideoTrack();
    if (!track) return [];
    const start = Math.max(0, await input.getFirstTimestamp());
    const duration = (await input.computeDuration()) - start;
    if (!(duration > 0)) return [];
    const sink = new CanvasSink(track, { height: Math.max(1, Math.round(height)), poolSize: 2 });
    const times = Array.from({ length: count }, (_, i) => start + slotTime(i, count, duration));
    const blobs: Blob[] = [];
    let last: Blob | null = null;
    for await (const wrapped of sink.canvasesAtTimestamps(times)) {
      const blob: Blob | null = wrapped ? await toJpeg(wrapped.canvas) : last;
      if (!blob) return [];
      blobs.push(blob);
      last = blob;
    }
    return blobs.length === count ? blobs : [];
  } catch {
    return [];
  } finally {
    input.dispose();
  }
}
