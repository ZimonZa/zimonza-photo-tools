import type { OutputFormat } from "@/lib/formats";

export type DimensionMode = "original" | "px" | "percent" | "preset";

export interface CropRect {
  x: number;
  y: number;
  width: number;
  height: number;
}

/** All global settings applied to images in the queue. */
export interface ProcessSettings {
  // dimensions
  dimensionMode: DimensionMode;
  width: number | null;
  height: number | null;
  lockAspect: boolean;
  percent: number;
  preset: string | null;
  noEnlarge: boolean;

  // geometry (crop / orientation), in source pixel space
  crop: CropRect | null;
  cropAspect: number | null; // aspect ratio lock for the crop UI (w/h)
  rotation: number; // 0 | 90 | 180 | 270
  flipH: boolean;
  flipV: boolean;

  // output
  format: OutputFormat;
  quality: number; // 0..1 (lossy formats only)
  targetSizeEnabled: boolean;
  targetSizeKB: number;
  bgColor: string; // flatten color when exporting transparency to JPG
}

export const DEFAULT_SETTINGS: ProcessSettings = {
  dimensionMode: "original",
  width: null,
  height: null,
  lockAspect: true,
  percent: 100,
  preset: null,
  noEnlarge: true,
  crop: null,
  cropAspect: null,
  rotation: 0,
  flipH: false,
  flipV: false,
  format: "jpeg",
  quality: 0.85,
  targetSizeEnabled: false,
  targetSizeKB: 200,
  bgColor: "#ffffff",
};

export type ItemStatus = "decoding" | "ready" | "error";

export interface ImageItem {
  id: string;
  file: File;
  name: string;
  status: ItemStatus;
  error?: string;
  originalSize: number;
  width?: number;
  height?: number;
  source?: CanvasImageSource;
  thumbUrl?: string;
  /** Per-image crop rect in source pixels — crops never leak between images. */
  crop?: CropRect | null;
}

export interface ProcessResult {
  blob: Blob;
  width: number;
  height: number;
  url: string;
}
