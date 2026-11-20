"use client";

import { useEffect, useMemo, useState } from "react";
import { VolumeX } from "lucide-react";
import { useVideoStore, type ToolId } from "@/store/useVideoStore";
import { planOutput } from "@/lib/video/plan-output";
import { describeExportError } from "@/lib/video/messages";
import { MB } from "@/lib/video/recipe";
import { BottomSheet } from "./bottom-sheet";
import { RotatePanel } from "./panels/rotate-panel";
import { PreviewPlayer } from "./preview-player";
import { TOOLS, ToolRail } from "./tool-rail";
import { TopBar } from "./top-bar";
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

/** "≈ X MB · W×H", or the planning error in amber, plus a No sound badge. */
function EstimateLine() {
  const load = useVideoStore((s) => s.load);
  const recipe = useVideoStore((s) => s.recipe);
  const text = useMemo(() => {
    if (load.kind !== "ready") return null;
    try {
      const { plan, estimatedBytes } = planOutput(load.info, { ...recipe, file: load.file });
      return { ok: true as const, line: `≈ ${(estimatedBytes / MB).toFixed(1)} MB · ${plan.width}×${plan.height}` };
    } catch (e) {
      const d = describeExportError(e, recipe.size.kind === "target" ? recipe.size.bytes : null);
      return { ok: false as const, line: d ? (d.hint ? `${d.message} ${d.hint}` : d.message) : "Can't plan this export." };
    }
  }, [load, recipe]);
  if (!text) return null;
  return (
    <div className="flex h-10 items-center justify-center gap-2 px-3 text-sm lg:pointer-events-none lg:z-10 lg:col-start-2 lg:row-start-1 lg:h-14">
      <span className={text.ok ? "font-medium" : "text-amber-500"}>{text.line}</span>
      {recipe.muted && (
        <span className="inline-flex items-center gap-1 rounded-full border border-amber-500/40 bg-amber-500/10 px-2 py-0.5 text-xs text-amber-500">
          <VolumeX className="h-3 w-3" />
          No sound
        </span>
      )}
    </div>
  );
}

function ToolPanel({ tool, label }: { tool: ToolId; label: string }) {
  if (tool === "rotate") return <RotatePanel />;
  return <p className="text-sm text-muted-foreground">{label} settings will appear here.</p>;
}

function EditorShell() {
  const load = useVideoStore((s) => s.load);
  const tool = useVideoStore((s) => s.tool);
  const muted = useVideoStore((s) => s.recipe.muted);
  const setTool = useVideoStore((s) => s.setTool);
  const reset = useVideoStore((s) => s.reset);
  const [sheetOpen, setSheetOpen] = useState(false);
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

  return (
    <div
      style={{ height: headerH === null ? "calc(100dvh - 4rem)" : `calc(100dvh - ${headerH}px)` }}
      className="flex flex-col overflow-hidden lg:grid lg:grid-cols-[72px_1fr_340px] lg:grid-rows-[auto_1fr_auto]">
      <TopBar fileName={load.file.name} onNewVideo={reset} />

      <section aria-label="Preview" className="flex min-h-0 min-w-0 flex-1 flex-col bg-black/30 lg:col-start-2 lg:row-start-2">
        <PreviewPlayer file={load.file} info={load.info} previewUrl={load.previewUrl} proxy={load.proxy} />
      </section>

      <section
        aria-label="Timeline"
        className="flex h-16 items-center justify-center border-t border-border bg-card/40 px-3 text-sm text-muted-foreground lg:col-span-3 lg:row-start-3 lg:h-24"
      >
        Timeline
      </section>

      <EstimateLine />

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

      <aside
        aria-label="Tool settings"
        className="hidden border-l border-border bg-card/40 p-4 lg:col-start-3 lg:row-start-2 lg:block"
      >
        <h2 className="mb-3 font-display text-base font-semibold">{toolLabel}</h2>
        <ToolPanel tool={tool} label={toolLabel} />
      </aside>

      {sheetOpen && (
        <BottomSheet title={toolLabel} onClose={() => setSheetOpen(false)}>
          <ToolPanel tool={tool} label={toolLabel} />
        </BottomSheet>
      )}
    </div>
  );
}
