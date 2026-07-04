"use client";

import { Loader2 } from "lucide-react";
import { useEffect, useRef, useState } from "react";
import Cropper, { type Area } from "react-easy-crop";
import "react-easy-crop/react-easy-crop.css";
import { sourceToDisplayUrl } from "@/lib/process";
import type { ImageItem } from "@/lib/types";
import { useImageStore } from "@/store/useImageStore";

// Cap the cropper's working image so dragging stays smooth on large photos / mobile.
const DISPLAY_MAX = 1600;

export function CropEditor({ item }: { item: ImageItem }) {
  const settings = useImageStore((s) => s.settings);
  const setItemCrop = useImageStore((s) => s.setItemCrop);

  const [url, setUrl] = useState<string | null>(null);
  const [crop, setCrop] = useState({ x: 0, y: 0 });
  const [zoom, setZoom] = useState(1);
  const scaleRef = useRef(1); // display px -> full-res px

  // Build a (downscaled) display URL for the cropper, revoked on change.
  // Pan/zoom also reset — they are meaningless on a different image.
  useEffect(() => {
    let current: string | null = null;
    let cancelled = false;
    setUrl(null);
    setCrop({ x: 0, y: 0 });
    setZoom(1);
    if (item.source && item.width && item.height) {
      sourceToDisplayUrl(item.source, item.width, item.height, DISPLAY_MAX).then(
        ({ url: u, scale }) => {
          if (cancelled) {
            URL.revokeObjectURL(u);
            return;
          }
          current = u;
          scaleRef.current = scale;
          setUrl(u);
        }
      );
    }
    return () => {
      cancelled = true;
      if (current) URL.revokeObjectURL(current);
    };
  }, [item.id, item.source, item.width, item.height]);

  function onCropComplete(_area: Area, areaPixels: Area) {
    const f = scaleRef.current;
    setItemCrop(item.id, {
      x: Math.round(areaPixels.x * f),
      y: Math.round(areaPixels.y * f),
      width: Math.round(areaPixels.width * f),
      height: Math.round(areaPixels.height * f),
    });
  }

  return (
    <div className="relative h-full min-h-[320px] overflow-hidden rounded-2xl border border-border bg-foreground/5 lg:min-h-[460px]">
      {url ? (
        <Cropper
          image={url}
          crop={crop}
          zoom={zoom}
          minZoom={1}
          maxZoom={5}
          aspect={settings.cropAspect ?? undefined}
          onCropChange={setCrop}
          onZoomChange={setZoom}
          onCropComplete={onCropComplete}
          showGrid
        />
      ) : (
        <div className="flex h-full items-center justify-center text-muted-foreground">
          <Loader2 className="h-6 w-6 animate-spin" />
        </div>
      )}
    </div>
  );
}
