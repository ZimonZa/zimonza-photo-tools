"use client";

import { Loader2 } from "lucide-react";
import { useEffect, useState } from "react";
import Cropper, { type Area } from "react-easy-crop";
import "react-easy-crop/react-easy-crop.css";
import { sourceToDisplayUrl } from "@/lib/process";
import type { ImageItem } from "@/lib/types";
import { useImageStore } from "@/store/useImageStore";

export function CropEditor({ item }: { item: ImageItem }) {
  const settings = useImageStore((s) => s.settings);
  const update = useImageStore((s) => s.updateSettings);

  const [url, setUrl] = useState<string | null>(null);
  const [crop, setCrop] = useState({ x: 0, y: 0 });
  const [zoom, setZoom] = useState(1);

  // Build a full-resolution display URL for the cropper (revoked on change).
  useEffect(() => {
    let revoked: string | null = null;
    let cancelled = false;
    if (item.source && item.width && item.height) {
      sourceToDisplayUrl(item.source, item.width, item.height).then((u) => {
        if (cancelled) {
          URL.revokeObjectURL(u);
          return;
        }
        revoked = u;
        setUrl(u);
      });
    }
    return () => {
      cancelled = true;
      if (revoked) URL.revokeObjectURL(revoked);
    };
  }, [item.id, item.source, item.width, item.height]);

  function onCropComplete(_area: Area, areaPixels: Area) {
    update({
      crop: {
        x: Math.round(areaPixels.x),
        y: Math.round(areaPixels.y),
        width: Math.round(areaPixels.width),
        height: Math.round(areaPixels.height),
      },
    });
  }

  return (
    <div className="relative h-full min-h-[300px] overflow-hidden rounded-2xl border border-border bg-foreground/5 lg:min-h-[420px]">
      {url ? (
        <Cropper
          image={url}
          crop={crop}
          zoom={zoom}
          aspect={settings.cropAspect ?? undefined}
          onCropChange={setCrop}
          onZoomChange={setZoom}
          onCropComplete={onCropComplete}
          restrictPosition={false}
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
