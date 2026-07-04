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

  // Size delta vs the original file (negative = smaller = good).
  const delta =
    typeof outSize === "number" && item.originalSize > 0
      ? Math.round(((outSize - item.originalSize) / item.originalSize) * 100)
      : null;

  return (
    <div className="flex h-full flex-col">
      <div className="glass relative flex min-h-[320px] flex-1 items-center justify-center overflow-hidden rounded-2xl p-2 lg:min-h-[460px]">
        <div className="checkerboard absolute inset-2 rounded-xl" />
        {shown ? (
          // eslint-disable-next-line @next/next/no-img-element
          <img
            src={shown}
            alt={item.name}
            className="relative max-h-full max-w-full rounded-lg object-contain shadow-card"
          />
        ) : (
          <span className="relative text-muted-foreground">
            <Loader2 className="h-6 w-6 animate-spin" />
          </span>
        )}

        {loading && shown && (
          <span className="glass absolute right-4 top-4 flex items-center gap-1.5 rounded-full px-3 py-1 text-xs text-muted-foreground">
            <Loader2 className="h-3 w-3 animate-spin text-accent" /> Updating
          </span>
        )}

        {showOriginal && (
          <span className="absolute left-4 top-4 rounded-full bg-foreground/85 px-3 py-1 text-xs font-medium text-background">
            Original
          </span>
        )}
      </div>

      <div className="mt-3 flex flex-wrap items-center justify-between gap-3 text-xs text-muted-foreground">
        <div className="flex items-center gap-2 tabular-nums">
          {outWidth && outHeight ? (
            <>
              <span className="rounded-md bg-muted px-2 py-1 font-medium text-foreground">
                {outWidth} × {outHeight}
              </span>
              {typeof outSize === "number" && (
                <>
                  <span className="rounded-md bg-muted px-2 py-1 font-medium text-foreground">
                    {formatBytes(outSize)}
                  </span>
                  {delta !== null && delta !== 0 && (
                    <span
                      className={cn(
                        "rounded-md px-2 py-1 font-semibold",
                        delta < 0
                          ? "bg-emerald-500/15 text-emerald-500"
                          : "bg-amber-500/15 text-amber-500"
                      )}
                    >
                      {delta < 0 ? "−" : "+"}
                      {Math.abs(delta)}%
                    </span>
                  )}
                </>
              )}
            </>
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
            "glass rounded-full px-3 py-1.5 font-medium transition-all duration-200 hover:border-accent/50 hover:text-foreground",
            showOriginal && "border-accent/50 bg-accent/10 text-accent"
          )}
        >
          Hold to compare
        </button>
      </div>
    </div>
  );
}
