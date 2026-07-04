"use client";

import { Loader2, X, AlertCircle } from "lucide-react";
import { Dropzone } from "@/components/dropzone";
import { useImageStore } from "@/store/useImageStore";
import { cn, formatBytes } from "@/lib/utils";

export function FileQueue() {
  const items = useImageStore((s) => s.items);
  const selectedId = useImageStore((s) => s.selectedId);
  const select = useImageStore((s) => s.select);
  const removeItem = useImageStore((s) => s.removeItem);
  const clear = useImageStore((s) => s.clear);

  return (
    <div className="space-y-3">
      <div className="flex items-center justify-between">
        <p className="text-sm font-medium">
          <span className="mr-1.5 inline-flex h-5 min-w-5 items-center justify-center rounded-md bg-accent/15 px-1 text-xs font-semibold text-accent">
            {items.length}
          </span>
          image{items.length === 1 ? "" : "s"}
        </p>
        {items.length > 0 && (
          <button
            type="button"
            onClick={clear}
            className="text-xs text-muted-foreground transition-colors hover:text-red-400"
          >
            Clear all
          </button>
        )}
      </div>

      <div className="grid grid-cols-4 gap-2 sm:grid-cols-6 lg:grid-cols-4">
        {items.map((item) => {
          const active = item.id === selectedId;
          return (
            <div
              key={item.id}
              className={cn(
                "group relative aspect-square overflow-hidden rounded-xl border bg-muted transition-all duration-200",
                active
                  ? "border-transparent shadow-glow ring-2 ring-accent"
                  : "border-border hover:border-accent/50"
              )}
            >
              <button
                type="button"
                onClick={() => select(item.id)}
                title={item.name}
                aria-label={`Select ${item.name}`}
                className="block h-full w-full"
              >
                {item.status === "ready" && item.thumbUrl ? (
                  // eslint-disable-next-line @next/next/no-img-element
                  <img
                    src={item.thumbUrl}
                    alt={item.name}
                    className="checkerboard h-full w-full object-cover transition-transform duration-300 group-hover:scale-105"
                  />
                ) : item.status === "error" ? (
                  <span className="flex h-full w-full items-center justify-center text-red-400">
                    <AlertCircle className="h-5 w-5" />
                  </span>
                ) : (
                  <span className="flex h-full w-full items-center justify-center text-muted-foreground">
                    <Loader2 className="h-5 w-5 animate-spin" />
                  </span>
                )}
              </button>

              <button
                type="button"
                onClick={() => removeItem(item.id)}
                aria-label={`Remove ${item.name}`}
                className="absolute right-1 top-1 z-10 flex h-5 w-5 items-center justify-center rounded-full bg-background/90 text-foreground opacity-0 shadow transition-all duration-150 hover:bg-red-500 hover:text-white focus-visible:opacity-100 group-hover:opacity-100"
              >
                <X className="h-3 w-3" />
              </button>
            </div>
          );
        })}
      </div>

      <Dropzone variant="compact" />

      {items.some((i) => i.status === "error") && (
        <p className="flex items-center gap-1.5 text-xs text-red-400">
          <AlertCircle className="h-3.5 w-3.5" />
          Some files could not be decoded and were skipped.
        </p>
      )}

      {selectedId && <SelectedMeta />}
    </div>
  );
}

function SelectedMeta() {
  const item = useImageStore((s) => s.items.find((i) => i.id === s.selectedId));
  if (!item) return null;
  return (
    <div className="glass rounded-xl p-3 text-xs">
      <p className="truncate font-medium" title={item.name}>
        {item.name}
      </p>
      <p className="mt-1 tabular-nums text-muted-foreground">
        {item.width && item.height ? `${item.width} × ${item.height} px · ` : ""}
        {formatBytes(item.originalSize)}
      </p>
    </div>
  );
}
