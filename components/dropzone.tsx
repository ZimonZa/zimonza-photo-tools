"use client";

import { useCallback } from "react";
import { useDropzone } from "react-dropzone";
import { UploadCloud, ImagePlus } from "lucide-react";
import { ACCEPTED_INPUT } from "@/lib/formats";
import { useImageStore } from "@/store/useImageStore";
import { cn } from "@/lib/utils";

const FORMAT_CHIPS = ["JPG", "PNG", "WebP", "HEIC", "AVIF", "TIFF", "DNG", "GIF", "SVG", "ICO", "BMP"];

export function Dropzone({ variant = "hero" }: { variant?: "hero" | "compact" }) {
  const addFiles = useImageStore((s) => s.addFiles);

  const onDrop = useCallback(
    (accepted: File[]) => {
      if (accepted.length) addFiles(accepted);
    },
    [addFiles]
  );

  const { getRootProps, getInputProps, isDragActive, open } = useDropzone({
    onDrop,
    accept: ACCEPTED_INPUT,
    noClick: variant === "hero" ? false : true,
  });

  if (variant === "compact") {
    return (
      <button
        type="button"
        onClick={open}
        {...getRootProps({
          className: cn(
            "flex w-full items-center justify-center gap-2 rounded-xl border border-dashed border-border-strong py-3 text-sm text-muted-foreground transition-all duration-200 hover:border-accent/60 hover:bg-accent/5 hover:text-foreground",
            isDragActive && "animate-drag-pulse border-accent bg-accent/10 text-foreground"
          ),
        })}
      >
        <input {...getInputProps()} />
        <ImagePlus className="h-4 w-4" />
        Add more images
      </button>
    );
  }

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

      <span
        className={cn(
          "relative flex h-16 w-16 items-center justify-center rounded-2xl bg-gradient-to-br from-accent to-accent2 text-accent-foreground shadow-glow transition-transform duration-300",
          isDragActive ? "scale-110" : "animate-float"
        )}
      >
        <UploadCloud className="h-8 w-8" />
      </span>

      <p className="relative mt-5 font-display text-xl font-semibold tracking-tight">
        {isDragActive ? "Drop your images here" : "Drag & drop images here"}
      </p>
      <p className="relative mt-1.5 text-sm text-muted-foreground">
        or click anywhere to browse — batch supported
      </p>

      <div className="relative mt-6 flex max-w-md flex-wrap items-center justify-center gap-1.5">
        {FORMAT_CHIPS.map((chip) => (
          <span
            key={chip}
            className="rounded-full border border-border bg-muted/50 px-2.5 py-0.5 text-[11px] font-medium text-muted-foreground"
          >
            {chip}
          </span>
        ))}
      </div>

      <p className="relative mt-6 text-xs text-muted-foreground">
        🔒 Files are processed privately on your device — nothing is uploaded.
      </p>
    </div>
  );
}
