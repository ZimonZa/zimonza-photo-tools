import { ALL_FORMATS, BlobSource, CanvasSink, Input } from "mediabunny";

/** Top-level MP4 box types in file order, e.g. ["ftyp", "moov", "mdat"]. */
export function topLevelBoxes(buf: ArrayBuffer): string[] {
  const view = new DataView(buf);
  const types: string[] = [];
  let offset = 0;
  while (offset + 8 <= buf.byteLength) {
    let size = view.getUint32(offset);
    const type = new TextDecoder("latin1").decode(new Uint8Array(buf, offset + 4, 4));
    if (size === 1) size = Number(view.getBigUint64(offset + 8));
    else if (size === 0) size = buf.byteLength - offset;
    if (size < 8) break;
    types.push(type);
    offset += size;
  }
  return types;
}

export interface Mp4Inspection {
  boxes: string[];
  videoCodec: string | null;
  audioCodec: string | null;
  /** Display size. */
  width: number;
  height: number;
  rotation: number;
  durationSec: number;
}

/** Read back an encoded file the way a player would. Test-only. */
export async function inspectMp4(blob: Blob): Promise<Mp4Inspection> {
  const buf = await blob.arrayBuffer();
  const input = new Input({ source: new BlobSource(blob), formats: ALL_FORMATS });
  try {
    const video = await input.getPrimaryVideoTrack();
    const audio = await input.getPrimaryAudioTrack();
    return {
      boxes: topLevelBoxes(buf),
      videoCodec: video?.codec ?? null,
      audioCodec: audio?.codec ?? null,
      width: video?.displayWidth ?? 0,
      height: video?.displayHeight ?? 0,
      rotation: video?.rotation ?? 0,
      durationSec: await input.computeDuration(),
    };
  } finally {
    input.dispose();
  }
}

/** The RGB colour of one display pixel of the frame showing at `atSec` (default 0.2 s). Test-only. */
export async function pixelAt(blob: Blob, x: number, y: number, atSec = 0.2): Promise<[number, number, number]> {
  const input = new Input({ source: new BlobSource(blob), formats: ALL_FORMATS });
  try {
    const video = await input.getPrimaryVideoTrack();
    if (!video) throw new Error("No video track");
    const frame = await new CanvasSink(video).getCanvas(atSec);
    if (!frame) throw new Error(`No frame at ${atSec}s`);
    const { canvas } = frame;
    // Two branches so TypeScript can pick each canvas type's getContext overload.
    const ctx = canvas instanceof OffscreenCanvas ? canvas.getContext("2d") : canvas.getContext("2d");
    if (!ctx) throw new Error("No 2D context");
    const { data } = ctx.getImageData(x, y, 1, 1);
    return [data[0], data[1], data[2]];
  } finally {
    input.dispose();
  }
}
