"use client";

import { saveAs } from "file-saver";
import { Download, Loader2, Package } from "lucide-react";
import { useState } from "react";
import { OUTPUT_FORMATS } from "@/lib/formats";
import { processImage } from "@/lib/process";
import type { ImageItem, ProcessResult, ProcessSettings } from "@/lib/types";
import { useImageStore } from "@/store/useImageStore";
import { baseName } from "@/lib/utils";
import { Button } from "@/components/ui";

async function buildBlob(item: ImageItem, settings: ProcessSettings): Promise<Blob> {
  const result = await processImage(item.source!, item.width!, item.height!, {
    ...settings,
    crop: item.crop ?? null, // each image is cropped only by its own rect
  });
  URL.revokeObjectURL(result.url); // we only need the blob here
  return result.blob;
}

export function DownloadBar({
  selectedItem,
  previewResult,
}: {
  selectedItem: ImageItem | null;
  previewResult: ProcessResult | null;
}) {
  const items = useImageStore((s) => s.items);
  const settings = useImageStore((s) => s.settings);
  const [busy, setBusy] = useState<null | "single" | "zip">(null);
  const [progress, setProgress] = useState({ done: 0, total: 0 });

  const ready = items.filter((i) => i.status === "ready");
  const ext = OUTPUT_FORMATS[settings.format].extension;

  async function downloadSingle() {
    if (!selectedItem) return;
    setBusy("single");
    try {
      const blob = previewResult?.blob ?? (await buildBlob(selectedItem, settings));
      saveAs(blob, `${baseName(selectedItem.name)}.${ext}`);
    } finally {
      setBusy(null);
    }
  }

  async function downloadZip() {
    if (!ready.length) return;
    setBusy("zip");
    setProgress({ done: 0, total: ready.length });
    try {
      const JSZip = (await import("jszip")).default;
      const zip = new JSZip();
      const used = new Set<string>();

      for (let i = 0; i < ready.length; i++) {
        const item = ready[i];
        const blob = await buildBlob(item, settings);
        let name = `${baseName(item.name)}.${ext}`;
        let n = 1;
        while (used.has(name)) name = `${baseName(item.name)}-${n++}.${ext}`;
        used.add(name);
        zip.file(name, blob);
        setProgress({ done: i + 1, total: ready.length });
      }

      const out = await zip.generateAsync({ type: "blob" });
      saveAs(out, "zimonza-images.zip");
    } finally {
      setBusy(null);
    }
  }

  return (
    <div className="sticky bottom-0 z-10 mt-4 rounded-2xl border border-border bg-card/95 p-3 backdrop-blur">
      <div className="flex flex-col gap-2 sm:flex-row">
        <Button
          variant="primary"
          className="flex-1"
          onClick={downloadSingle}
          disabled={!selectedItem || busy !== null}
        >
          {busy === "single" ? (
            <Loader2 className="h-4 w-4 animate-spin" />
          ) : (
            <Download className="h-4 w-4" />
          )}
          Download
        </Button>

        {ready.length > 1 && (
          <Button
            variant="outline"
            className="flex-1"
            onClick={downloadZip}
            disabled={busy !== null}
          >
            {busy === "zip" ? (
              <Loader2 className="h-4 w-4 animate-spin" />
            ) : (
              <Package className="h-4 w-4" />
            )}
            {busy === "zip"
              ? `Zipping ${progress.done}/${progress.total}`
              : `Download all (${ready.length})`}
          </Button>
        )}
      </div>
    </div>
  );
}
