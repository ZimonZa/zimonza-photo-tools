"use client";

import { AlertCircle, Crop as CropIcon, Loader2, Maximize2 } from "lucide-react";
import { useEffect, useRef, useState } from "react";
import { processImage } from "@/lib/process";
import type { ProcessResult, ProcessSettings } from "@/lib/types";
import { useImageStore } from "@/store/useImageStore";
import { cn, formatBytes } from "@/lib/utils";
import { Dropzone } from "@/components/dropzone";
import { FileQueue } from "@/components/file-queue";
import { OutputSection } from "@/components/output-section";
import { PreviewCanvas } from "@/components/preview-canvas";
import { CropEditor } from "@/components/crop-editor";
import { ResizePanel } from "@/components/panels/resize-panel";
import { CropPanel } from "@/components/panels/crop-panel";
import { DownloadBar } from "@/components/download-bar";

type Tab = "resize" | "crop";

export function ImageStudio({
  tool = "resize",
  initialSettings,
}: {
  tool?: "resize" | "crop" | "convert" | "compress";
  initialSettings?: Partial<ProcessSettings>;
}) {
  const items = useImageStore((s) => s.items);
  const selectedId = useImageStore((s) => s.selectedId);
  const settings = useImageStore((s) => s.settings);
  const updateSettings = useImageStore((s) => s.updateSettings);

  const [tab, setTab] = useState<Tab>(tool === "crop" ? "crop" : "resize");
  const [preview, setPreview] = useState<ProcessResult | null>(null);
  const [loading, setLoading] = useState(false);
  const tokenRef = useRef(0);

  const selected =
    items.find((i) => i.id === selectedId) ??
    items.find((i) => i.status === "ready") ??
    null;
  const selectedReady = selected?.status === "ready" ? selected : null;

  // Apply page-specific initial settings once.
  const appliedRef = useRef(false);
  useEffect(() => {
    if (!appliedRef.current && initialSettings) {
      appliedRef.current = true;
      updateSettings(initialSettings);
    }
  }, [initialSettings, updateSettings]);

  // Debounced live preview of the selected image.
  useEffect(() => {
    if (!selectedReady?.source) {
      setPreview(null);
      return;
    }
    const token = ++tokenRef.current;
    setLoading(true);
    const handle = setTimeout(async () => {
      try {
        const result = await processImage(
          selectedReady.source!,
          selectedReady.width!,
          selectedReady.height!,
          settings
        );
        if (token !== tokenRef.current) {
          URL.revokeObjectURL(result.url);
          return;
        }
        setPreview((prev) => {
          if (prev) URL.revokeObjectURL(prev.url);
          return result;
        });
      } catch {
        /* ignore transient processing errors */
      } finally {
        if (token === tokenRef.current) setLoading(false);
      }
    }, 220);

    return () => clearTimeout(handle);
  }, [selectedReady?.id, selectedReady?.source, selectedReady?.width, selectedReady?.height, settings]);

  // Empty state — big dropzone.
  if (items.length === 0) {
    return (
      <div className="mx-auto max-w-2xl">
        <Dropzone variant="hero" />
      </div>
    );
  }

  return (
    <div className="grid gap-6 lg:grid-cols-[minmax(0,1fr)_360px]">
      {/* Left: preview / crop editor */}
      <div className="order-1">
        {selected?.status === "error" ? (
          <div className="flex min-h-[300px] flex-col items-center justify-center gap-2 rounded-2xl border border-border text-muted-foreground">
            <AlertCircle className="h-6 w-6 text-red-500" />
            <p className="text-sm">{selected.error ?? "This file could not be decoded."}</p>
          </div>
        ) : tab === "crop" && selectedReady ? (
          <div className="space-y-3">
            <CropEditor item={selectedReady} />
            <CropResult preview={preview} loading={loading} />
          </div>
        ) : selectedReady ? (
          <PreviewCanvas
            item={selectedReady}
            previewUrl={preview?.url ?? null}
            loading={loading}
            outWidth={preview?.width}
            outHeight={preview?.height}
            outSize={preview?.blob.size}
          />
        ) : (
          <div className="flex min-h-[300px] items-center justify-center rounded-2xl border border-border text-sm text-muted-foreground">
            Decoding image…
          </div>
        )}
      </div>

      {/* Right: controls */}
      <div className="order-2 space-y-4">
        <FileQueue />
        <OutputSection />

        <div className="rounded-2xl border border-border bg-card p-4">
          <div className="mb-4 inline-flex w-full rounded-xl bg-muted p-1">
            <TabButton active={tab === "resize"} onClick={() => setTab("resize")}>
              <Maximize2 className="h-4 w-4" /> Resize
            </TabButton>
            <TabButton active={tab === "crop"} onClick={() => setTab("crop")}>
              <CropIcon className="h-4 w-4" /> Crop
            </TabButton>
          </div>

          {tab === "resize" ? <ResizePanel /> : <CropPanel />}
        </div>

        <DownloadBar selectedItem={selectedReady} previewResult={preview} />
      </div>
    </div>
  );
}

function CropResult({
  preview,
  loading,
}: {
  preview: ProcessResult | null;
  loading: boolean;
}) {
  return (
    <div className="flex items-center gap-3 rounded-2xl border border-border bg-card p-3">
      <div className="checkerboard relative h-16 w-16 shrink-0 overflow-hidden rounded-lg border border-border">
        {preview?.url ? (
          // eslint-disable-next-line @next/next/no-img-element
          <img
            src={preview.url}
            alt="Cropped result"
            className="h-full w-full object-contain"
          />
        ) : (
          <span className="flex h-full w-full items-center justify-center text-muted-foreground">
            <Loader2 className="h-4 w-4 animate-spin" />
          </span>
        )}
      </div>
      <div className="text-xs text-muted-foreground">
        <p className="font-medium text-foreground">
          Live result {loading && <span className="text-muted-foreground">· updating…</span>}
        </p>
        {preview ? (
          <p className="mt-0.5 tabular-nums">
            {preview.width} × {preview.height} px · {formatBytes(preview.blob.size)}
          </p>
        ) : (
          <p className="mt-0.5">Processing…</p>
        )}
        <p className="mt-1">Drag on the image above to set the crop.</p>
      </div>
    </div>
  );
}

function TabButton({
  children,
  active,
  onClick,
}: {
  children: React.ReactNode;
  active: boolean;
  onClick: () => void;
}) {
  return (
    <button
      type="button"
      onClick={onClick}
      className={cn(
        "flex flex-1 items-center justify-center gap-1.5 rounded-lg px-2 py-1.5 text-sm font-medium transition-colors",
        active
          ? "bg-background text-foreground shadow-sm"
          : "text-muted-foreground hover:text-foreground"
      )}
    >
      {children}
    </button>
  );
}
