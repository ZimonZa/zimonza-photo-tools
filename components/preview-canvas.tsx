"use client";

import { Loader2 } from "lucide-react";
import { useEffect, useState } from "react";
import { sourceToDisplayUrl } from "@/lib/process";
import type { ImageItem } from "@/lib/types";
import { cn, formatBytes } from "@/lib/utils";

export function PreviewCanvas({
  item,
  previewUrl,
  loading,
  outWidth,
  outHeight,
  outSize,
}: {
  item: ImageItem;
  previewUrl: string | null;
  loading: boolean;
  outWidth?: number;
  outHeight?: number;
  outSize?: number;
}) {
  const [originalUrl, setOriginalUrl] = useState<string | null>(null);
  const [showOriginal, setShowOriginal] = useState(false);

  // Lazily build a full-res original URL the first time "compare" is used.
  useEffect(() => {
    setOriginalUrl(null);
    setShowOriginal(false);
  }, [item.id]);

  // Revoke the original blob URL when it changes or the component unmounts.
  useEffect(() => {
    return () => {
      if (originalUrl) URL.revokeObjectURL(originalUrl);
    };
  }, [originalUrl]);

  async function ensureOriginal() {
    if (!originalUrl && item.source && item.width && item.height) {
      const { url } = await sourceToDisplayUrl(item.source, item.width, item.height, 2000);
      setOriginalUrl(url);
    }
  }

  const shown = showOriginal && originalUrl ? originalUrl : previewUrl;

  return (
    <div className="flex h-full flex-col">
      <div className="relative flex min-h-[300px] flex-1 items-center justify-center overflow-hidden rounded-2xl border border-border lg:min-h-[420px]">
        <div className="checkerboard absolute inset-0" />
        {shown ? (
          // eslint-disable-next-line @next/next/no-img-element
          <img
            src={shown}
            alt={item.name}
            className="relative max-h-full max-w-full object-contain"
          />
        ) : (
          <span className="relative text-muted-foreground">
            <Loader2 className="h-6 w-6 animate-spin" />
          </span>
        )}

        {loading && shown && (
          <span className="absolute right-3 top-3 flex items-center gap-1.5 rounded-full bg-background/90 px-2.5 py-1 text-xs text-muted-foreground shadow-sm">
            <Loader2 className="h-3 w-3 animate-spin" /> Updating
          </span>
        )}

        {showOriginal && (
          <span className="absolute left-3 top-3 rounded-full bg-foreground/80 px-2.5 py-1 text-xs text-background">
            Original
          </span>
        )}
      </div>

      <div className="mt-3 flex items-center justify-between gap-3 text-xs text-muted-foreground">
        <div className="tabular-nums">
          {outWidth && outHeight ? (
            <span>
              {outWidth} × {outHeight} px
              {typeof outSize === "number" && (
                <>
                  {" · "}
                  <span className="font-medium text-foreground">
                    {formatBytes(outSize)}
                  </span>
                  {" · was "}
                  {formatBytes(item.originalSize)}
                </>
              )}
            </span>
          ) : (
            <span>Preview</span>
          )}
        </div>

        <button
          type="button"
          onMouseDown={async () => {
            await ensureOriginal();
            setShowOriginal(true);
          }}
          onMouseUp={() => setShowOriginal(false)}
          onMouseLeave={() => setShowOriginal(false)}
          onTouchStart={async () => {
            await ensureOriginal();
            setShowOriginal(true);
          }}
          onTouchEnd={() => setShowOriginal(false)}
          className={cn(
            "rounded-lg border border-border px-2.5 py-1 transition-colors hover:bg-muted",
            showOriginal && "bg-muted"
          )}
        >
          Hold to compare
        </button>
      </div>
    </div>
  );
}
