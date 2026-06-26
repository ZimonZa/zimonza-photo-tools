"use client";

import { useCallback } from "react";
import { useDropzone } from "react-dropzone";
import { UploadCloud, ImagePlus } from "lucide-react";
import { ACCEPTED_INPUT } from "@/lib/formats";
import { useImageStore } from "@/store/useImageStore";
import { cn } from "@/lib/utils";

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
            "flex w-full items-center justify-center gap-2 rounded-xl border border-dashed border-border py-3 text-sm text-muted-foreground transition-colors hover:border-accent/50 hover:text-foreground",
            isDragActive && "border-accent bg-accent/5 text-foreground"
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
          "flex cursor-pointer flex-col items-center justify-center rounded-3xl border-2 border-dashed border-border bg-card px-6 py-16 text-center transition-colors animate-fade-in",
          isDragActive ? "border-accent bg-accent/5" : "hover:border-accent/50"
        ),
      })}
    >
      <input {...getInputProps()} />
      <span className="flex h-14 w-14 items-center justify-center rounded-2xl bg-accent/10 text-accent">
        <UploadCloud className="h-7 w-7" />
      </span>
      <p className="mt-4 text-lg font-semibold">
        {isDragActive ? "Drop your images here" : "Drag & drop images here"}
      </p>
      <p className="mt-1 text-sm text-muted-foreground">
        or click to browse — JPG, PNG, WebP, GIF, HEIC, AVIF, TIFF, SVG
      </p>
      <p className="mt-4 text-xs text-muted-foreground">
        Files are processed privately on your device.
      </p>
    </div>
  );
}
