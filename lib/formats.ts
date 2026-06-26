/** Output formats the encoder supports (all available natively via canvas.toBlob). */
export type OutputFormat = "jpeg" | "png" | "webp";

export interface OutputFormatInfo {
  id: OutputFormat;
  label: string;
  extension: string;
  mime: string;
  lossy: boolean;
  supportsAlpha: boolean;
}

export const OUTPUT_FORMATS: Record<OutputFormat, OutputFormatInfo> = {
  jpeg: {
    id: "jpeg",
    label: "JPG",
    extension: "jpg",
    mime: "image/jpeg",
    lossy: true,
    supportsAlpha: false,
  },
  png: {
    id: "png",
    label: "PNG",
    extension: "png",
    mime: "image/png",
    lossy: false,
    supportsAlpha: true,
  },
  webp: {
    id: "webp",
    label: "WebP",
    extension: "webp",
    mime: "image/webp",
    lossy: true,
    supportsAlpha: true,
  },
};

export const OUTPUT_FORMAT_LIST = Object.values(OUTPUT_FORMATS);

/** Accepted input types for the dropzone (broad support incl. HEIC/TIFF/AVIF). */
export const ACCEPTED_INPUT = {
  "image/jpeg": [".jpg", ".jpeg"],
  "image/png": [".png"],
  "image/webp": [".webp"],
  "image/gif": [".gif"],
  "image/bmp": [".bmp"],
  "image/tiff": [".tif", ".tiff"],
  "image/svg+xml": [".svg"],
  "image/avif": [".avif"],
  "image/heic": [".heic"],
  "image/heif": [".heif"],
} as const;

/** Tool routes used by the header nav and home grid. */
export interface ToolItem {
  href: string;
  title: string;
  short: string;
  description: string;
}

export const TOOLS: ToolItem[] = [
  {
    href: "/resize",
    title: "Image Resizer",
    short: "Resize",
    description: "Resize by pixels, percentage, presets, or a target file size.",
  },
  {
    href: "/crop",
    title: "Image Cropper",
    short: "Crop",
    description: "Crop freely or with locked aspect ratios. Rotate and flip.",
  },
  {
    href: "/convert",
    title: "Image Converter",
    short: "Convert",
    description: "Convert HEIC, AVIF, PNG and more to JPG, PNG, or WebP.",
  },
  {
    href: "/compress",
    title: "Image Compressor",
    short: "Compress",
    description: "Shrink file size with a quality slider or a target size.",
  },
];

/** Common output dimensions offered in the Resize panel. */
export interface ResizePreset {
  id: string;
  label: string;
  width: number;
  height: number;
}

export const RESIZE_PRESETS: ResizePreset[] = [
  { id: "fhd", label: "1920 × 1080 — Full HD", width: 1920, height: 1080 },
  { id: "hd", label: "1280 × 720 — HD", width: 1280, height: 720 },
  { id: "ig-square", label: "1080 × 1080 — Instagram", width: 1080, height: 1080 },
  { id: "ig-portrait", label: "1080 × 1350 — IG Portrait", width: 1080, height: 1350 },
  { id: "story", label: "1080 × 1920 — Story / Reel", width: 1080, height: 1920 },
  { id: "og", label: "1200 × 630 — Social share", width: 1200, height: 630 },
  { id: "fb-cover", label: "820 × 312 — Facebook cover", width: 820, height: 312 },
  { id: "passport", label: "600 × 600 — Passport", width: 600, height: 600 },
  { id: "avatar", label: "512 × 512 — Avatar", width: 512, height: 512 },
];

/** Aspect-ratio presets for the Crop panel. `ratio` is width / height. */
export interface AspectPreset {
  id: string;
  label: string;
  ratio: number | null;
}

export const ASPECT_PRESETS: AspectPreset[] = [
  { id: "free", label: "Free", ratio: null },
  { id: "1:1", label: "1:1", ratio: 1 },
  { id: "4:3", label: "4:3", ratio: 4 / 3 },
  { id: "3:2", label: "3:2", ratio: 3 / 2 },
  { id: "16:9", label: "16:9", ratio: 16 / 9 },
  { id: "3:4", label: "3:4", ratio: 3 / 4 },
  { id: "9:16", label: "9:16", ratio: 9 / 16 },
];

/** Format-pair landing pages for SEO, e.g. /heic-to-jpg. */
export interface FormatPair {
  slug: string;
  from: string;
  to: OutputFormat;
  fromLabel: string;
}

export const FORMAT_PAIRS: FormatPair[] = [
  { slug: "heic-to-jpg", from: "heic", to: "jpeg", fromLabel: "HEIC" },
  { slug: "heic-to-png", from: "heic", to: "png", fromLabel: "HEIC" },
  { slug: "png-to-jpg", from: "png", to: "jpeg", fromLabel: "PNG" },
  { slug: "jpg-to-png", from: "jpg", to: "png", fromLabel: "JPG" },
  { slug: "webp-to-jpg", from: "webp", to: "jpeg", fromLabel: "WebP" },
  { slug: "webp-to-png", from: "webp", to: "png", fromLabel: "WebP" },
  { slug: "png-to-webp", from: "png", to: "webp", fromLabel: "PNG" },
  { slug: "jpg-to-webp", from: "jpg", to: "webp", fromLabel: "JPG" },
  { slug: "avif-to-jpg", from: "avif", to: "jpeg", fromLabel: "AVIF" },
  { slug: "avif-to-png", from: "avif", to: "png", fromLabel: "AVIF" },
];
