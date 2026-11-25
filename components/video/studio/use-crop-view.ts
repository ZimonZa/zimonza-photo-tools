"use client";

import { create } from "zustand";
import { CROP_ASPECTS, type CropAspectId } from "@/lib/video/crop-view";
import type { VideoInfo } from "@/lib/video/engines/types";
import { displaySize, type Rotation, type Size } from "@/lib/video/geometry";

export const MIN_CROP_ZOOM = 1;
export const MAX_CROP_ZOOM = 5;

/**
 * What the Crop panel and the crop editor share while the Crop tool is open: the ratio chip, the
 * box's shape (width / height), the zoom and its limit, and whether the person has changed anything
 * yet (until then the cropper's own reports never touch the recipe, so opening the tool changes
 * nothing).
 */
interface CropView {
  chip: CropAspectId;
  aspect: number;
  zoom: number;
  /** At least `MAX_CROP_ZOOM`; higher when a small Free size needs it. */
  maxZoom: number;
  touched: boolean;
  /** Changes on Reset so the editor recentres the picture. */
  resetId: number;
  open(chip: CropAspectId, aspect: number, maxZoom: number): void;
  pickChip(chip: CropAspectId, aspect: number): void;
  /** Free: a typed width × height sets the box's shape and the zoom at which it covers exactly that size. */
  setShape(aspect: number, zoom: number): void;
  setZoom(zoom: number, byPerson: boolean): void;
  touch(): void;
  reset(pictureAspect: number): void;
}

export const useCropView = create<CropView>((set) => ({
  chip: "free",
  aspect: 16 / 9,
  zoom: 1,
  maxZoom: MAX_CROP_ZOOM,
  touched: false,
  resetId: 0,
  open: (chip, aspect, maxZoom) => set({ chip, aspect, zoom: 1, maxZoom, touched: false }),
  pickChip: (chip, aspect) => set({ chip, aspect, touched: true }),
  setShape: (aspect, zoom) =>
    set((s) => ({ chip: "free", aspect, zoom, maxZoom: Math.max(s.maxZoom, zoom), touched: true })),
  setZoom: (zoom, byPerson) => set(byPerson ? { zoom, touched: true } : { zoom }),
  touch: () => set({ touched: true }),
  reset: (pictureAspect) =>
    set((s) => ({ chip: "free", aspect: pictureAspect, zoom: 1, maxZoom: MAX_CROP_ZOOM, resetId: s.resetId + 1 })),
}));

/** The clip's picture after the user's turn: what the crop box moves over. */
export function turnedPicture(info: VideoInfo, rotate: Rotation): Size {
  return displaySize({ width: info.width, height: info.height }, rotate);
}

/** The box shape for a chip: its ratio, or for Free the picture's own shape. */
export function chipAspect(chip: CropAspectId, picture: Size): number {
  return CROP_ASPECTS.find((a) => a.id === chip)?.ratio ?? picture.width / picture.height;
}
