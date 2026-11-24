"use client";

import { useEffect, useState } from "react";
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
    return (
      <div className="mx-auto max-w-4xl px-4 py-24 text-center text-muted-foreground" role="status">
        {load.kind === "probing" ? "Reading the video…" : "Preparing preview…"}
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
  const desktop = useIsDesktop();
  const [sheetOpen, setSheetOpen] = useState(false);
  const [exportOpen, setExportOpen] = useState(false);
  const [headerH, setHeaderH] = useState<number | null>(null);

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
  if (load.kind !== "ready") return null;
  const toolLabel = TOOLS.find((t) => t.id === tool)?.label ?? "";
  // The crop box takes the preview's place while the Crop tool is open (on phones: while its sheet is).
  const cropping = tool === "crop" && (desktop || sheetOpen);

  return (
    <div
      style={{ height: headerH === null ? "calc(100dvh - 4rem)" : `calc(100dvh - ${headerH}px)` }}
      className="flex flex-col overflow-hidden lg:grid lg:grid-cols-[72px_1fr_340px] lg:grid-rows-[auto_1fr_auto]"
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

      <section aria-label="Preview" className="flex min-h-0 min-w-0 flex-1 flex-col bg-black/30 lg:col-start-2 lg:row-start-2">
        {cropping ? (
          <CropEditor info={load.info} previewUrl={load.previewUrl} />
        ) : (
          <PreviewPlayer file={load.file} info={load.info} previewUrl={load.previewUrl} proxy={load.proxy} />
        )}
      </section>

      <section
        aria-label="Timeline"
        className="flex h-[88px] flex-col justify-center border-t border-border bg-card/40 px-3 lg:col-span-3 lg:row-start-3 lg:h-[104px]"
      >
        <Timeline file={load.file} info={load.info} />
      </section>

      {!desktop && <EstimateLine className="min-h-10 px-3 py-1" />}

      <div className="lg:col-start-1 lg:row-start-2">
        <ToolRail
          active={tool}
          muted={muted}
          onSelect={(t) => {
            setTool(t);
            setSheetOpen(true);
          }}
        />
      </div>

      {desktop ? (
        <aside
          aria-label="Tool settings"
          className="overflow-y-auto border-l border-border bg-card/40 p-4 lg:col-start-3 lg:row-start-2"
        >
          <h2 className="mb-3 font-display text-base font-semibold">{toolLabel}</h2>
          <ToolPanel tool={tool} />
        </aside>
      ) : (
        sheetOpen && (
          <BottomSheet title={toolLabel} onClose={() => setSheetOpen(false)}>
            <ToolPanel tool={tool} />
          </BottomSheet>
        )
      )}
      {exportOpen && <ExportView onClose={() => setExportOpen(false)} />}
    </div>
  );
}
