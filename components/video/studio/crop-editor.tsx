"use client";

import { useLayoutEffect, useRef, useState, type RefObject } from "react";
import Cropper, { type Area, type Point } from "react-easy-crop";
import "react-easy-crop/react-easy-crop.css";
import { create } from "zustand";
import {
  CROP_ASPECTS,
  chipForCrop,
  cropFromCropper,
  cropperStartArea,
  exactZoom,
  sameCrop,
  type CropAspectId,
} from "@/lib/video/crop-view";
import type { VideoInfo } from "@/lib/video/engines/types";
import type { Orientation } from "@/lib/video/frame";
import { displaySize, type Rotation, type Size } from "@/lib/video/geometry";
import { useVideoStore } from "@/store/useVideoStore";
import { useElementSize } from "./use-element-size";

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

/**
 * The Crop tool's centre view: react-easy-crop playing the clip (or its proxy), turned like the
 * recipe. The person moves and zooms the picture under a box of the chosen ratio; at the end of
 * each drag or zoom the box becomes the recipe's crop, scaled to the clip's display size per axis
 * and mirrored for the flips (the cropper shows the picture unflipped). Opening it again starts
 * from the current crop.
 */
export function CropEditor({ info, previewUrl }: { info: VideoInfo; previewUrl: string | null }) {
  const rotate = useVideoStore((s) => s.recipe.rotate);
  const flipH = useVideoStore((s) => s.recipe.flipH);
  const flipV = useVideoStore((s) => s.recipe.flipV);
  const aspect = useCropView((s) => s.aspect);
  const zoom = useCropView((s) => s.zoom);
  const maxZoom = useCropView((s) => s.maxZoom);
  const resetId = useCropView((s) => s.resetId);
  const stageRef = useRef<HTMLDivElement>(null);
  const stage = useElementSize(stageRef);
  const picture = turnedPicture(info, rotate);

  // Start from the current crop: its chip (or Free with its own shape), zoom from the cropper,
  // with room to zoom in as far as a small crop needs.
  useLayoutEffect(() => {
    const crop = useVideoStore.getState().recipe.crop;
    const chip = chipForCrop(crop);
    const shape = crop ? crop.width / crop.height : picture.width / picture.height;
    const maxZoom = Math.max(MAX_CROP_ZOOM, crop ? exactZoom(crop, picture) : 1);
    useCropView.getState().open(chip, chip === "free" ? shape : chipAspect(chip, picture), maxZoom);
    // Only when the tool opens or the picture turns; later edits come from the person.
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [rotate, flipH, flipV, info]);

  if (!previewUrl) {
    return (
      <div className="flex flex-1 items-center justify-center p-6 text-center text-sm text-muted-foreground">
        This browser can&apos;t play this file, so there&apos;s no crop box. Pick a ratio to crop the middle of the
        picture.
      </div>
    );
  }

  // A quarter turn: react-easy-crop fits the unturned video into its box and then turns it, so a
  // square box keeps the turned picture inside.
  const quarter = rotate === 90 || rotate === 270;
  const box = stage && (quarter ? { width: Math.min(stage.width, stage.height), height: Math.min(stage.width, stage.height) } : stage);

  return (
    <div className="flex min-h-0 min-w-0 flex-1 flex-col">
      <div ref={stageRef} className="relative m-3 min-h-0 flex-1">
        {box && (
          <div
            data-testid="crop-editor"
            className="absolute inset-0 m-auto overflow-hidden rounded-lg bg-black"
            style={{ width: box.width, height: box.height }}
          >
            <CropSurface
              key={`${previewUrl}|${rotate}|${flipH}|${flipV}|${resetId}`}
              info={info}
              previewUrl={previewUrl}
              orientation={{ rotate, flipH, flipV }}
              aspect={aspect}
              zoom={zoom}
              maxZoom={maxZoom}
            />
          </div>
        )}
      </div>
      <p className="px-3 pb-3 text-center text-xs text-muted-foreground">
        Drag the picture to place the crop. Scroll, pinch or use Zoom to crop tighter.
      </p>
    </div>
  );
}

function CropSurface({
  info,
  previewUrl,
  orientation,
  aspect,
  zoom,
  maxZoom,
}: {
  info: VideoInfo;
  previewUrl: string;
  orientation: Orientation;
  aspect: number;
  zoom: number;
  maxZoom: number;
}) {
  const updateRecipe = useVideoStore((s) => s.updateRecipe);
  const [position, setPosition] = useState<Point>({ x: 0, y: 0 });
  const videoRef = useRef<RefObject<HTMLVideoElement> | null>(null);
  const lastArea = useRef<Area | null>(null);
  // Read once when the video loads: the crop this view opened with.
  const [start] = useState(() => cropperStartArea(useVideoStore.getState().recipe.crop, info, orientation));

  /** Turn the box's area into the recipe's crop; nothing happens until the person has changed something. */
  const commit = (area: Area | null) => {
    const video = videoRef.current?.current;
    if (!area || !video?.videoWidth || !useCropView.getState().touched) return;
    const crop = cropFromCropper(
      area,
      { width: video.videoWidth, height: video.videoHeight },
      { width: info.width, height: info.height },
      orientation,
      useCropView.getState().aspect
    );
    if (sameCrop(crop, useVideoStore.getState().recipe.crop)) return;
    updateRecipe({ crop });
  };

  return (
    <Cropper
      video={previewUrl}
      rotation={orientation.rotate}
      crop={position}
      zoom={zoom}
      minZoom={MIN_CROP_ZOOM}
      maxZoom={maxZoom}
      aspect={aspect}
      showGrid
      initialCroppedAreaPercentages={start ?? undefined}
      onCropChange={setPosition}
      onZoomChange={(z) => useCropView.getState().setZoom(z, false)}
      onInteractionStart={() => useCropView.getState().touch()}
      onInteractionEnd={() => commit(lastArea.current)}
      onCropComplete={(_percent, pixels) => {
        lastArea.current = pixels;
        commit(pixels);
      }}
      setVideoRef={(ref) => {
        videoRef.current = ref;
      }}
      mediaProps={{ "aria-label": "Crop preview" }}
      cropperProps={{ "aria-label": "Crop box" }}
    />
  );
}
