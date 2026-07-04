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

/** Native decode via <img> — covers jpg/png/webp/gif/bmp/avif/svg. */
async function decodeNative(file: Blob): Promise<DecodedImage> {
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

/** TIFF decode via utif. */
async function decodeTiff(buffer: ArrayBuffer): Promise<DecodedImage> {
  const UTIF = (await import("utif")).default;
  const ifds = UTIF.decode(buffer);
  if (!ifds.length) throw new Error("Could not read TIFF data.");
  UTIF.decodeImage(buffer, ifds[0]);
  const rgba = UTIF.toRGBA8(ifds[0]);
  const { width, height } = ifds[0];
  return {
    source: rgbaToCanvas(new Uint8ClampedArray(rgba.buffer, rgba.byteOffset, rgba.byteLength), width, height),
    width,
    height,
  };
}

/* ------------------------------ entry point -------------------------------- */

/**
 * Decode any supported input into a drawable source + dimensions.
 *
 * Routing is based on magic-byte sniffing (not the file extension), and every
 * path has a fallback so a single decoder failure never kills a decodable file:
 *   1. sniffed format → specialized decoder (HEIC → libheif, TIFF → utif)
 *   2. on failure → native <img> decode
 *   3. native failure on a HEIC-family file → libheif as a last resort
 */
export async function decodeFile(file: File): Promise<DecodedImage> {
  const buffer = await file.arrayBuffer();
  const format = sniffFormat(new Uint8Array(buffer, 0, Math.min(buffer.byteLength, 256)));

  const attempts: Array<() => Promise<DecodedImage>> = [];
  if (format === "heic") {
    attempts.push(() => decodeHeic(buffer), () => decodeNative(file));
  } else if (format === "tiff") {
    attempts.push(() => decodeTiff(buffer), () => decodeNative(file));
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
