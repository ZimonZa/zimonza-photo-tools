"use client";

import { useCallback } from "react";
import { useDropzone } from "react-dropzone";
import { Film } from "lucide-react";
import { useVideoStore } from "@/store/useVideoStore";
import { cn } from "@/lib/utils";

const ACCEPT = { "video/*": [".mov", ".mkv", ".avi", ".wmv", ".flv", ".3gp", ".m4v"] };

/** Full-width drop area shown while no video is open. */
export function VideoDropzone() {
  const openFile = useVideoStore((s) => s.openFile);
  const onDrop = useCallback(
    (accepted: File[]) => {
      if (accepted[0]) void openFile(accepted[0]);
    },
    [openFile]
  );
  const { getRootProps, getInputProps, isDragActive } = useDropzone({ onDrop, accept: ACCEPT, multiple: false });

  return (
    <div
      {...getRootProps({
        className: cn(
          "glass relative flex cursor-pointer flex-col items-center justify-center overflow-hidden rounded-3xl border-2 border-dashed px-6 py-20 text-center transition-all duration-300 animate-scale-in",
          isDragActive
            ? "animate-drag-pulse border-accent bg-accent/5 shadow-glow-lg"
            : "border-border-strong hover:border-accent/50 hover:shadow-glow"
        ),
      })}
    >
      <div className="bg-glow pointer-events-none absolute inset-0 opacity-60" />
      <input {...getInputProps()} />
      <span className="relative flex h-16 w-16 items-center justify-center rounded-2xl bg-gradient-to-br from-accent to-accent2 text-accent-foreground shadow-glow">
        <Film className="h-8 w-8" />
      </span>
      <p className="relative mt-5 font-display text-xl font-semibold tracking-tight">Drop a video here</p>
      <p className="relative mt-1.5 text-sm text-muted-foreground">or tap to choose · MP4, MOV, WebM, MKV, AVI and more</p>
      <p className="relative mt-6 text-xs text-muted-foreground">🔒 Your video stays on your device — nothing is uploaded.</p>
    </div>
  );
}
