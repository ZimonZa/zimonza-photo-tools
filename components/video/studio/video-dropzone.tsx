"use client";

import { useCallback, useState } from "react";
import { useDropzone, type FileRejection } from "react-dropzone";
import { Film } from "lucide-react";
import { useVideoStore } from "@/store/useVideoStore";
import { cn } from "@/lib/utils";

const ACCEPT = { "video/*": [".mov", ".mkv", ".avi", ".wmv", ".flv", ".3gp", ".m4v"] };

/** Why a drop was turned away, in the dropzone's own words. */
function rejectionMessage(rejections: FileRejection[]): string {
  return rejections.some((r) => r.errors.some((e) => e.code === "too-many-files"))
    ? "Pick one video at a time."
    : "That file isn't a video. Pick a video file.";
}

/** Full-width drop area shown while no video is open. A file it can't take says why under the text. */
export function VideoDropzone() {
  const openFile = useVideoStore((s) => s.openFile);
  const [rejected, setRejected] = useState<string | null>(null);
  const onDrop = useCallback(
    (accepted: File[], rejections: FileRejection[]) => {
      if (accepted[0]) {
        setRejected(null);
        void openFile(accepted[0]);
      } else if (rejections.length) {
        setRejected(rejectionMessage(rejections));
      }
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
      {rejected && (
        <p role="alert" className="relative mt-4 text-sm font-medium text-amber-700 dark:text-amber-500">
          {rejected}
        </p>
      )}
      <p className="relative mt-6 text-xs text-muted-foreground">🔒 Your video stays on your device — nothing is uploaded.</p>
    </div>
  );
}
