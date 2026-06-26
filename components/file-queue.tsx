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
          {items.length} image{items.length === 1 ? "" : "s"}
        </p>
        {items.length > 0 && (
          <button
            type="button"
            onClick={clear}
            className="text-xs text-muted-foreground transition-colors hover:text-foreground"
          >
            Clear all
          </button>
        )}
      </div>

      <div className="grid grid-cols-4 gap-2 sm:grid-cols-6 lg:grid-cols-4">
        {items.map((item) => {
          const active = item.id === selectedId;
          return (
            <button
              key={item.id}
              type="button"
              onClick={() => select(item.id)}
              title={item.name}
              className={cn(
                "group relative aspect-square overflow-hidden rounded-xl border bg-muted transition-all",
                active ? "border-accent ring-2 ring-accent/40" : "border-border hover:border-accent/50"
              )}
            >
              {item.status === "ready" && item.thumbUrl ? (
                // eslint-disable-next-line @next/next/no-img-element
                <img
                  src={item.thumbUrl}
                  alt={item.name}
                  className="checkerboard h-full w-full object-cover"
                />
              ) : item.status === "error" ? (
                <span className="flex h-full w-full items-center justify-center text-red-500">
                  <AlertCircle className="h-5 w-5" />
                </span>
              ) : (
                <span className="flex h-full w-full items-center justify-center text-muted-foreground">
                  <Loader2 className="h-5 w-5 animate-spin" />
                </span>
              )}

              <span
                role="button"
                tabIndex={-1}
                onClick={(e) => {
                  e.stopPropagation();
                  removeItem(item.id);
                }}
                className="absolute right-1 top-1 flex h-5 w-5 items-center justify-center rounded-full bg-background/80 text-foreground opacity-0 transition-opacity group-hover:opacity-100"
              >
                <X className="h-3 w-3" />
              </span>
            </button>
          );
        })}
      </div>

      <Dropzone variant="compact" />

      {items.some((i) => i.status === "error") && (
        <p className="text-xs text-red-500">
          Some files could not be decoded and were skipped.
        </p>
      )}

      {selectedId && (
        <SelectedMeta />
      )}
    </div>
  );
}

function SelectedMeta() {
  const item = useImageStore((s) => s.items.find((i) => i.id === s.selectedId));
  if (!item) return null;
  return (
    <div className="rounded-xl border border-border bg-muted/30 p-3 text-xs">
      <p className="truncate font-medium" title={item.name}>
        {item.name}
      </p>
      <p className="mt-1 text-muted-foreground">
        {item.width && item.height ? `${item.width} × ${item.height} px · ` : ""}
        {formatBytes(item.originalSize)}
      </p>
    </div>
  );
}
