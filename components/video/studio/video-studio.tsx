"use client";

import { useEffect, useRef, useState } from "react";
import { Loader2 } from "lucide-react";
import { cn } from "@/lib/utils";
import { useVideoStore, type ToolId } from "@/store/useVideoStore";
import { BottomSheet } from "./bottom-sheet";
import { CropEditor } from "./crop-editor";
import { EstimateLine } from "./estimate-line";
import { ExportView } from "./export-view";
import { CropPanel } from "./panels/crop-panel";
import { RotatePanel } from "./panels/rotate-panel";
import { SizePanel } from "./panels/size-panel";
import { SoundPanel } from "./panels/sound-panel";
import { TrimPanel } from "./panels/trim-panel";
import { PreviewPlayer } from "./preview-player";
import { Timeline } from "./timeline";
import { TOOLS, ToolRail } from "./tool-rail";
import { TopBar } from "./top-bar";
import { PHONE_TOUCH } from "./touch";
import { useIsDesktop } from "./use-is-desktop";
import { VideoDropzone } from "./video-dropzone";

/** Client root of the /video editor: dropzone while empty, the editor shell once a file is open. */
export function VideoStudio() {
  const load = useVideoStore((s) => s.load);
  const reset = useVideoStore((s) => s.reset);

  if (load.kind === "empty") {
    return (
      <div className="mx-auto max-w-4xl px-4 py-10">
        <VideoDropzone />
      </div>
    );
  }
  if (load.kind === "probing" || load.kind === "preparing-preview") {
    // Either can take a while (the backup reader and its one-time download, a proxy for a file the browser can't play).
    return (
      <div className="mx-auto flex max-w-4xl flex-col items-center gap-5 px-4 py-24 text-center">
        <p role="status" className="flex items-center gap-2 tabular-nums text-muted-foreground">
          <Loader2 className="h-4 w-4 shrink-0 animate-spin text-accent" aria-hidden />
          {load.kind === "probing" ? (load.statusText ?? "Reading the video…") : "Preparing preview…"}
        </p>
        <button
          type="button"
          onClick={reset}
          className="min-h-11 rounded-lg border border-border px-4 text-sm hover:bg-muted"
        >
          Cancel
        </button>
      </div>
    );
  }
  if (load.kind === "error") {
    return (
      <div className="mx-auto max-w-4xl px-4 py-24 text-center" role="alert">
        <p className="text-amber-500">{load.message}</p>
        <button type="button" onClick={reset} className="mt-4 rounded-lg border border-border px-3 py-1.5 text-sm hover:bg-muted">
          New video
        </button>
      </div>
    );
  }
  return <EditorShell />;
}

function ToolPanel({ tool }: { tool: ToolId }) {
  switch (tool) {
    case "trim":
      return <TrimPanel />;
    case "crop":
      return <CropPanel />;
    case "size":
      return <SizePanel />;
    case "rotate":
      return <RotatePanel />;
    case "sound":
      return <SoundPanel />;
  }
}

function EditorShell() {
  const load = useVideoStore((s) => s.load);
  const tool = useVideoStore((s) => s.tool);
  const muted = useVideoStore((s) => s.recipe.muted);
  const setTool = useVideoStore((s) => s.setTool);
  const reset = useVideoStore((s) => s.reset);
  const setPreviewSuspended = useVideoStore((s) => s.setPreviewSuspended);
  const desktop = useIsDesktop();
  const [sheetOpen, setSheetOpen] = useState(false);
  const [exportOpen, setExportOpen] = useState(false);
  const [headerH, setHeaderH] = useState<number | null>(null);
  const railRef = useRef<HTMLDivElement>(null);

  // Fill exactly the viewport below the site header, whatever height it has (phone nav wraps to a second row).
  useEffect(() => {
    const header = document.querySelector("body header");
    if (!header) return;
    const measure = () => setHeaderH(Math.round(header.getBoundingClientRect().height));
    measure();
    const ro = new ResizeObserver(measure);
    ro.observe(header);
    return () => ro.disconnect();
  }, []);

  // The export view covers the preview: no quality samples meanwhile (the player pauses itself).
  useEffect(() => setPreviewSuspended(exportOpen), [exportOpen, setPreviewSuspended]);
  useEffect(() => () => setPreviewSuspended(false), [setPreviewSuspended]);
  if (load.kind !== "ready") return null;
  const toolLabel = TOOLS.find((t) => t.id === tool)?.label ?? "";
  const phoneSheet = !desktop && sheetOpen;
  // The crop box takes the preview's place while the Crop tool is open (on phones: while its sheet is).
  const cropping = tool === "crop" && (desktop || sheetOpen);

  /** Close the phone sheet and put focus back on the tool button that opened it. */
  const closeSheet = () => {
    setSheetOpen(false);
    railRef.current?.querySelector<HTMLElement>(`[data-tool="${tool}"]`)?.focus({ preventScroll: true });
  };
  const selectTool = (t: ToolId) => {
    // Phones: tapping the open tool again closes its sheet.
    if (phoneSheet && t === tool) return closeSheet();
    setTool(t);
    setSheetOpen(true);
  };

  return (
    <div
      style={{ height: headerH === null ? "calc(100dvh - 4rem)" : `calc(100dvh - ${headerH}px)` }}
      className={cn(
        "flex flex-col overflow-hidden lg:grid lg:grid-cols-[72px_1fr_340px] lg:grid-rows-[auto_1fr_auto]",
        PHONE_TOUCH
      )}
    >
      <TopBar
        fileName={load.file.name}
        onNewVideo={reset}
        onExport={() => {
          setSheetOpen(false);
          setExportOpen(true);
        }}
        estimate={desktop ? <EstimateLine /> : undefined}
      />

      {/*
        Phones: the preview keeps about a third of the screen (unless the screen is too short for
        the bars); an open sheet gives up height first and scrolls inside itself.
      */}
      <section
        aria-label="Preview"
        className="flex min-h-[min(32dvh,calc(100%_-_20rem))] min-w-0 flex-1 flex-col bg-black/30 lg:col-start-2 lg:row-start-2 lg:min-h-0"
      >
        {cropping ? (
          <CropEditor info={load.info} previewUrl={load.previewUrl} suspended={exportOpen} />
        ) : (
          <PreviewPlayer
            file={load.file}
            info={load.info}
            previewUrl={load.previewUrl}
            proxy={load.proxy}
            suspended={exportOpen}
          />
        )}
      </section>

      {/* Phones: a sheet other than Trim takes the clip strip's place (hidden, so its thumbnails stay). */}
      <section
        aria-label="Timeline"
        className={cn(
          "flex h-[88px] shrink-0 flex-col justify-center border-t border-border bg-card/40 px-3 lg:col-span-3 lg:row-start-3 lg:h-[104px]",
          phoneSheet && tool !== "trim" && "max-lg:hidden"
        )}
      >
        <Timeline file={load.file} info={load.info} />
      </section>

      {phoneSheet && (
        <BottomSheet title={toolLabel} focusKey={tool} onClose={closeSheet}>
          <ToolPanel tool={tool} />
        </BottomSheet>
      )}

      {!desktop && <EstimateLine className="min-h-10 shrink-0 px-3 py-1" />}

      <div ref={railRef} className="shrink-0 lg:col-start-1 lg:row-start-2">
        <ToolRail active={tool} muted={muted} sheetOpen={desktop ? undefined : sheetOpen} onSelect={selectTool} />
      </div>

      {desktop && (
        <aside
          aria-label="Tool settings"
          className="overflow-y-auto border-l border-border bg-card/40 p-4 lg:col-start-3 lg:row-start-2"
        >
          <h2 className="mb-3 font-display text-base font-semibold">{toolLabel}</h2>
          <ToolPanel tool={tool} />
        </aside>
      )}
      {exportOpen && <ExportView onClose={() => setExportOpen(false)} />}
    </div>
  );
}
