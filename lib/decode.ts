export interface DecodedImage {
  source: CanvasImageSource;
  width: number;
  height: number;
}

function loadImageElement(url: string): Promise<HTMLImageElement> {
  return new Promise((resolve, reject) => {
    const img = new Image();
    img.onload = () => resolve(img);
    img.onerror = () => reject(new Error("The browser could not decode this image."));
    img.src = url;
  });
}

function extOf(name: string): string {
  return name.split(".").pop()?.toLowerCase() ?? "";
}

/**
 * Decode any supported input file into a drawable source + dimensions.
 * HEIC/HEIF and TIFF use dedicated decoders (lazy-loaded); everything else
 * (jpg, png, webp, gif, bmp, avif, svg) is decoded natively by the browser.
 */
export async function decodeFile(file: File): Promise<DecodedImage> {
  const ext = extOf(file.name);
  const type = file.type;
  const isHeic =
    type === "image/heic" || type === "image/heif" || ext === "heic" || ext === "heif";
  const isTiff = type === "image/tiff" || ext === "tif" || ext === "tiff";

  if (isHeic) {
    const heic2any = (await import("heic2any")).default;
    const converted = (await heic2any({ blob: file, toType: "image/png" })) as Blob | Blob[];
    const blob = Array.isArray(converted) ? converted[0] : converted;
    const url = URL.createObjectURL(blob);
    try {
      const img = await loadImageElement(url);
      return { source: img, width: img.naturalWidth, height: img.naturalHeight };
    } finally {
      URL.revokeObjectURL(url);
    }
  }

  if (isTiff) {
    const UTIF = (await import("utif")).default;
    const buf = await file.arrayBuffer();
    const ifds = UTIF.decode(buf);
    if (!ifds.length) throw new Error("Could not read TIFF data.");
    UTIF.decodeImage(buf, ifds[0]);
    const rgba = UTIF.toRGBA8(ifds[0]);
    const { width, height } = ifds[0];
    const canvas = document.createElement("canvas");
    canvas.width = width;
    canvas.height = height;
    const ctx = canvas.getContext("2d");
    if (!ctx) throw new Error("Canvas is not available.");
    const imageData = ctx.createImageData(width, height);
    imageData.data.set(rgba);
    ctx.putImageData(imageData, 0, 0);
    return { source: canvas, width, height };
  }

  // Native path (also covers SVG via <img>).
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
