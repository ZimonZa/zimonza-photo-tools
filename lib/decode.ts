export interface DecodedImage {
  source: CanvasImageSource;
  width: number;
  height: number;
}

type SniffedFormat =
  | "heic"
  | "avif"
  | "tiff"
  | "png"
  | "jpeg"
  | "gif"
  | "bmp"
  | "webp"
  | "ico"
  | "svg"
  | "unknown";

/* ----------------------------- format sniffing ----------------------------- */

function ascii(bytes: Uint8Array, start: number, length: number): string {
  let out = "";
  for (let i = start; i < start + length && i < bytes.length; i++) {
    out += String.fromCharCode(bytes[i]);
  }
  return out;
}

/**
 * Detect the real image format from magic bytes, so files are routed by what
 * they ARE — a JPEG renamed to .heic still decodes via the native path.
 * DNG shares the TIFF signature and is handled inside the TIFF path.
 */
export function sniffFormat(bytes: Uint8Array): SniffedFormat {
  if (bytes.length < 12) return "unknown";

  // ISO-BMFF container: [size]{4} "ftyp" [brand]{4}
  if (ascii(bytes, 4, 4) === "ftyp") {
    const brand = ascii(bytes, 8, 4).toLowerCase();
    if (brand.startsWith("avi")) return "avif"; // avif, avis
    // heic, heix, heim, heis, hevc, hevx, mif1, msf1 — all libheif territory
    return "heic";
  }

  if (bytes[0] === 0x89 && ascii(bytes, 1, 3) === "PNG") return "png";
  if (bytes[0] === 0xff && bytes[1] === 0xd8 && bytes[2] === 0xff) return "jpeg";
  if (ascii(bytes, 0, 3) === "GIF") return "gif";
  if (bytes[0] === 0x42 && bytes[1] === 0x4d) return "bmp";
  if (ascii(bytes, 0, 4) === "RIFF" && ascii(bytes, 8, 4) === "WEBP") return "webp";
  if (bytes[0] === 0x00 && bytes[1] === 0x00 && bytes[2] === 0x01 && bytes[3] === 0x00)
    return "ico";
  if (
    (bytes[0] === 0x49 && bytes[1] === 0x49 && bytes[2] === 0x2a) ||
    (bytes[0] === 0x4d && bytes[1] === 0x4d && bytes[2] === 0x00 && bytes[3] === 0x2a)
  )
    return "tiff";

  const head = ascii(bytes, 0, Math.min(bytes.length, 256)).trimStart();
  if (head.startsWith("<svg") || head.startsWith("<?xml")) return "svg";

  return "unknown";
}

/* ------------------------------ decoders ---------------------------------- */

function loadImageElement(url: string): Promise<HTMLImageElement> {
  return new Promise((resolve, reject) => {
    const img = new Image();
    img.onload = () => resolve(img);
    img.onerror = () => reject(new Error("The browser could not decode this image."));
    img.src = url;
  });
}

/**
 * Native decode — covers jpg/png/webp/gif/bmp/avif/ico/svg.
 * Prefers createImageBitmap (decodes off the main thread — noticeably faster
 * for large photos); falls back to <img> which also handles SVG.
 */
async function decodeNative(file: Blob): Promise<DecodedImage> {
  if (typeof createImageBitmap === "function" && file.type !== "image/svg+xml") {
    try {
      const bitmap = await createImageBitmap(file);
      if (bitmap.width && bitmap.height) {
        return { source: bitmap, width: bitmap.width, height: bitmap.height };
      }
    } catch {
      /* fall through to <img> decode */
    }
  }

  const url = URL.createObjectURL(file);
  try {
    const img = await loadImageElement(url);
    let width = img.naturalWidth;
    let height = img.naturalHeight;
    if (!width || !height) {
      // SVG without intrinsic size — fall back to a sensible default.
      width = 1024;
      height = 1024;
    }
    return { source: img, width, height };
  } finally {
    URL.revokeObjectURL(url);
  }
}

function rgbaToCanvas(rgba: Uint8ClampedArray, width: number, height: number): HTMLCanvasElement {
  const canvas = document.createElement("canvas");
  canvas.width = width;
  canvas.height = height;
  const ctx = canvas.getContext("2d");
  if (!ctx) throw new Error("Canvas is not available.");
  const imageData = ctx.createImageData(width, height);
  imageData.data.set(rgba);
  ctx.putImageData(imageData, 0, 0);
  return canvas;
}

/** HEIC/HEIF decode via libheif (modern build — handles current iPhone files). */
async function decodeHeic(buffer: ArrayBuffer): Promise<DecodedImage> {
  const mod = await import("libheif-js/wasm-bundle");
  const libheif = (mod.default ?? mod) as { HeifDecoder: new () => { decode(b: ArrayBuffer): unknown[] } };
  const decoder = new libheif.HeifDecoder();
  const images = decoder.decode(buffer) as Array<{
    get_width(): number;
    get_height(): number;
    display(
      target: { data: Uint8ClampedArray; width: number; height: number },
      cb: (result: { data: Uint8ClampedArray } | null) => void
    ): void;
    free(): void;
  }>;
  if (!images.length) throw new Error("No image found inside the HEIC file.");

  // Bursts / live photos hold several frames — use the first.
  const image = images[0];
  const width = image.get_width();
  const height = image.get_height();

  try {
    const rgba = await new Promise<Uint8ClampedArray>((resolve, reject) => {
      image.display(
        { data: new Uint8ClampedArray(width * height * 4), width, height },
        (result) => {
          if (!result) reject(new Error("HEIC pixel decode failed."));
          else resolve(result.data);
        }
      );
    });
    return { source: rgbaToCanvas(rgba, width, height), width, height };
  } finally {
    images.forEach((img) => img.free());
  }
}

/* ------------------------- TIFF / DNG decoding ----------------------------- */

/**
 * Walk the TIFF/DNG structure (main IFD chain + SubIFDs via tag 330) and
 * collect embedded JPEG candidates, largest first:
 *  - tag 513/514 = JPEGInterchangeFormat offset/length (classic previews)
 *  - JPEG-compressed strips (tag 259 = 6 or 7, with tags 273/279)
 * UTIF doesn't descend into SubIFDs, where DNGs keep their big previews —
 * so this is a small self-contained walker. Exported for the Node test.
 */
export function findEmbeddedJpegs(buffer: ArrayBuffer): Uint8Array[] {
  const bytes = new Uint8Array(buffer);
  const dv = new DataView(buffer);
  if (dv.byteLength < 8) return [];
  const le = dv.getUint16(0, false) === 0x4949; // "II" little-endian
  const u16 = (o: number) => dv.getUint16(o, le);
  const u32 = (o: number) => dv.getUint32(o, le);

  // Read a SHORT/LONG tag's values (inline or via offset).
  const tagValues = (entry: number): number[] => {
    const type = u16(entry + 2);
    const count = u32(entry + 4);
    const size = type === 3 ? 2 : type === 4 ? 4 : 0;
    if (!size || count === 0 || count > 64) return [];
    const src = size * count > 4 ? u32(entry + 8) : entry + 8;
    if (src + size * count > dv.byteLength) return [];
    const out: number[] = [];
    for (let i = 0; i < count; i++) out.push(size === 2 ? u16(src + i * 2) : u32(src + i * 4));
    return out;
  };

  const candidates: Array<{ offset: number; length: number }> = [];
  const queue: number[] = [u32(4)];
  const seen = new Set<number>();

  while (queue.length && seen.size < 32) {
    const off = queue.shift()!;
    if (!off || seen.has(off) || off + 2 > dv.byteLength) continue;
    seen.add(off);
    const n = u16(off);
    if (n > 512 || off + 2 + n * 12 + 4 > dv.byteLength) continue;

    const tags = new Map<number, number[]>();
    for (let i = 0; i < n; i++) {
      const entry = off + 2 + i * 12;
      const tag = u16(entry);
      if ([259, 273, 279, 330, 513, 514].includes(tag)) tags.set(tag, tagValues(entry));
    }

    const jifOffset = tags.get(513)?.[0];
    const jifLength = tags.get(514)?.[0];
    if (jifOffset && jifLength) candidates.push({ offset: jifOffset, length: jifLength });

    const compression = tags.get(259)?.[0];
    const stripOffset = tags.get(273)?.[0];
    const stripBytes = tags.get(279)?.[0];
    if ((compression === 6 || compression === 7) && stripOffset && stripBytes) {
      candidates.push({ offset: stripOffset, length: stripBytes });
    }

    for (const sub of tags.get(330) ?? []) queue.push(sub); // SubIFDs
    queue.push(u32(off + 2 + n * 12)); // next IFD in the chain
  }

  candidates.sort((a, b) => b.length - a.length);
  const out: Uint8Array[] = [];
  for (const c of candidates) {
    if (c.offset + c.length > bytes.length) continue;
    if (bytes[c.offset] === 0xff && bytes[c.offset + 1] === 0xd8 && bytes[c.offset + 2] === 0xff) {
      out.push(bytes.subarray(c.offset, c.offset + c.length));
    }
  }
  return out;
}

/**
 * TIFF/DNG decode via utif. Plain TIFFs decode directly. Camera DNGs store
 * lossless-JPEG raw data utif can't decode — but they embed a large JPEG
 * preview, which we extract and decode natively instead.
 */
async function decodeTiff(buffer: ArrayBuffer, isDng: boolean): Promise<DecodedImage> {
  const tryRaw = async (): Promise<DecodedImage | null> => {
    try {
      const UTIF = (await import("utif")).default;
      const ifds = UTIF.decode(buffer);
      if (!ifds.length) return null;
      UTIF.decodeImage(buffer, ifds[0]);
      const rgba = UTIF.toRGBA8(ifds[0]);
      const { width, height } = ifds[0];
      if (!width || !height || !rgba?.length) return null;
      return {
        source: rgbaToCanvas(
          new Uint8ClampedArray(rgba.buffer, rgba.byteOffset, rgba.byteLength),
          width,
          height
        ),
        width,
        height,
      };
    } catch {
      return null;
    }
  };

  // Try embedded JPEGs largest-first; skip ones the browser can't decode
  // (e.g. the lossless-JPEG raw stream inside a DNG).
  const tryPreview = async (): Promise<DecodedImage | null> => {
    for (const jpeg of findEmbeddedJpegs(buffer)) {
      try {
        // slice() detaches from the (subarray-view) source buffer.
        return await decodeNative(new Blob([jpeg.slice()], { type: "image/jpeg" }));
      } catch {
        /* next candidate */
      }
    }
    return null;
  };

  // DNG: the embedded preview is color-correct; raw CFA data usually isn't.
  const result = isDng
    ? (await tryPreview()) ?? (await tryRaw())
    : (await tryRaw()) ?? (await tryPreview());
  if (result) return result;
  throw new Error(isDng ? "Could not extract a preview from this DNG." : "Could not decode TIFF data.");
}

/* ------------------------------ entry point -------------------------------- */

/**
 * Decode any supported input into a drawable source + dimensions.
 *
 * Routing is based on magic-byte sniffing (not the file extension), and every
 * path has a fallback so a single decoder failure never kills a decodable file:
 *   1. sniffed format → specialized decoder (HEIC → libheif, TIFF/DNG → utif)
 *   2. on failure → native decode (ImageBitmap, then <img>)
 *   3. native failure on a HEIC-family file → libheif as a last resort
 */
export async function decodeFile(file: File): Promise<DecodedImage> {
  const buffer = await file.arrayBuffer();
  const format = sniffFormat(new Uint8Array(buffer, 0, Math.min(buffer.byteLength, 256)));
  const isDng = /\.dng$/i.test(file.name);

  const attempts: Array<() => Promise<DecodedImage>> = [];
  if (format === "heic") {
    attempts.push(() => decodeHeic(buffer), () => decodeNative(file));
  } else if (format === "tiff") {
    attempts.push(() => decodeTiff(buffer, isDng), () => decodeNative(file));
  } else {
    // Native first; libheif as a rescue for mislabeled/odd container files.
    attempts.push(() => decodeNative(file));
    if (format === "unknown" || format === "avif") {
      attempts.push(() => decodeHeic(buffer));
    }
  }

  let lastError: Error | null = null;
  for (const attempt of attempts) {
    try {
      return await attempt();
    } catch (err) {
      lastError = err as Error;
    }
  }

  const label = format === "unknown" ? "this file" : `${format.toUpperCase()} file`;
  throw new Error(
    `Could not decode ${label} (${file.name}). ${lastError?.message ?? ""}`.trim()
  );
}
