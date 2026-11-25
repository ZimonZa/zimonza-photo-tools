"use client";

import { useEffect, useRef, useState, type KeyboardEvent, type PointerEvent, type RefObject } from "react";
import { ImageOff } from "lucide-react";
import type { VideoInfo } from "@/lib/video/engines/types";
import { makeFilmstrip } from "@/lib/video/filmstrip";
import type { TrimRange } from "@/lib/video/recipe";
import { dragTrim, formatTime, timeToX, trimOrNull, xToTime } from "@/lib/video/timeline";
import { cn } from "@/lib/utils";
import { useVideoStore } from "@/store/useVideoStore";

const PHONE_THUMBS = 6;
const DESKTOP_THUMBS = 10;
/** Thumbnail height in px: twice the strip's tallest height, so they stay sharp on dense screens. */
const THUMB_HEIGHT = 112;
/** Lets the preview start decoding before the strip competes for the CPU. */
const FILMSTRIP_DELAY_MS = 300;
const STEP_SEC = 0.1;
const BIG_STEP_SEC = 1;

type Strip = { kind: "loading" } | { kind: "failed" } | { kind: "ready"; urls: string[] };

/** Thumbnails for one clip, built shortly after it opens and revoked when the clip changes. A failure says so in the strip. */
function useFilmstrip(file: File, info: VideoInfo): Strip {
  const [strip, setStrip] = useState<Strip>({ kind: "loading" });
  useEffect(() => {
    if (!info.readableByMediabunny) {
      setStrip({ kind: "failed" });
      return;
    }
    setStrip({ kind: "loading" });
    let cancelled = false;
    let urls: string[] = [];
    const count = window.matchMedia("(min-width: 1024px)").matches ? DESKTOP_THUMBS : PHONE_THUMBS;
    const timer = setTimeout(() => {
      makeFilmstrip(file, count, THUMB_HEIGHT)
        .catch(() => [] as Blob[])
        .then((blobs) => {
          if (cancelled) return;
          urls = blobs.map((b) => URL.createObjectURL(b));
          setStrip(urls.length ? { kind: "ready", urls } : { kind: "failed" });
        });
    }, FILMSTRIP_DELAY_MS);
    return () => {
      cancelled = true;
      clearTimeout(timer);
      urls.forEach((u) => URL.revokeObjectURL(u));
    };
  }, [file, info]);
  return strip;
}

const stepFor = (e: KeyboardEvent) => (e.shiftKey ? BIG_STEP_SEC : STEP_SEC) * (e.key === "ArrowLeft" ? -1 : 1);
const isArrow = (e: KeyboardEvent) => e.key === "ArrowLeft" || e.key === "ArrowRight";

interface HandleProps {
  which: "start" | "end";
  trim: TrimRange;
  durationSec: number;
  trackRef: RefObject<HTMLDivElement>;
  onChange(next: TrimRange, moved: "start" | "end"): void;
}

/** One trim handle: dragged with a mouse, finger or pen (pointer capture), moved with the arrow keys. */
function TrimHandle({ which, trim, durationSec, trackRef, onChange }: HandleProps) {
  const grab = useRef<number | null>(null);
  const value = trim[which];
  const label = which === "start" ? "Trim start" : "Trim end";

  const onPointerDown = (e: PointerEvent<HTMLDivElement>) => {
    const rect = trackRef.current?.getBoundingClientRect();
    if (!rect) return;
    e.stopPropagation();
    e.currentTarget.setPointerCapture(e.pointerId);
    // Keep the spot of the handle that was grabbed under the pointer.
    grab.current = e.clientX - (rect.left + timeToX(value, durationSec, rect.width));
    e.currentTarget.focus();
  };
  const onPointerMove = (e: PointerEvent<HTMLDivElement>) => {
    const rect = trackRef.current?.getBoundingClientRect();
    if (!rect || grab.current === null) return;
    onChange(dragTrim(trim, which, xToTime(e.clientX - grab.current - rect.left, durationSec, rect.width), durationSec), which);
  };
  const release = (e: PointerEvent<HTMLDivElement>) => {
    grab.current = null;
    if (e.currentTarget.hasPointerCapture(e.pointerId)) e.currentTarget.releasePointerCapture(e.pointerId);
  };
  const onKeyDown = (e: KeyboardEvent<HTMLDivElement>) => {
    if (!isArrow(e)) return;
    e.preventDefault();
    onChange(dragTrim(trim, which, value + stepFor(e), durationSec), which);
  };

  return (
    <div
      role="slider"
      tabIndex={0}
      aria-label={label}
      aria-orientation="horizontal"
      aria-valuemin={which === "start" ? 0 : Math.min(durationSec, trim.start + STEP_SEC)}
      aria-valuemax={which === "start" ? Math.max(0, trim.end - STEP_SEC) : durationSec}
      aria-valuenow={value}
      aria-valuetext={formatTime(value)}
      onPointerDown={onPointerDown}
      onPointerMove={onPointerMove}
      onPointerUp={release}
      onPointerCancel={release}
      onKeyDown={onKeyDown}
      style={{ left: `${timeToX(value, durationSec, 100)}%` }}
      className={cn(
        // Hit areas reach outward from the value (start leftwards, end rightwards), so they never overlap.
        // Phones: 44 px wide for a finger (the strip is inset by as much, so they stay on screen).
        "group absolute inset-y-0 z-20 flex w-11 cursor-ew-resize touch-none items-center outline-none lg:w-7",
        which === "start" ? "-translate-x-full justify-end" : "justify-start"
      )}
    >
      <span
        aria-hidden
        className="h-[calc(100%_+_8px)] w-3.5 rounded-md bg-accent shadow-card group-focus-visible:ring-2 group-focus-visible:ring-ring lg:h-full lg:w-2.5 lg:rounded-sm"
      />
      <span
        aria-hidden
        className={cn("absolute h-5 w-px bg-accent-foreground/70", which === "start" ? "right-1.5 lg:right-1" : "left-1.5 lg:left-1")}
      />
    </div>
  );
}

/** The playhead line. Focusable, so the arrow keys step it by 0.1 s (Shift: 1 s). */
function PlayheadMarker({ now, duration, onSeek }: { now: number; duration: number; onSeek(t: number): void }) {
  const onKeyDown = (e: KeyboardEvent<HTMLDivElement>) => {
    if (!isArrow(e)) return;
    e.preventDefault();
    onSeek(Math.min(duration, Math.max(0, now + stepFor(e))));
  };
  return (
    <div
      role="slider"
      tabIndex={0}
      aria-label="Playhead"
      aria-valuemin={0}
      aria-valuemax={duration}
      aria-valuenow={now}
      aria-valuetext={formatTime(now)}
      onKeyDown={onKeyDown}
      style={{ left: `${timeToX(now, duration, 100)}%` }}
      className="pointer-events-none absolute -inset-y-1 z-10 w-0.5 -translate-x-1/2 rounded-full bg-white shadow-card outline-none focus-visible:ring-2 focus-visible:ring-ring"
    />
  );
}

/**
 * The filmstrip timeline: thumbnails, two trim handles with the cut-away parts shaded, and a playhead
 * moved by clicking or dragging the strip. A trim covering the whole clip is stored as `null`.
 */
export function Timeline({ file, info }: { file: File; info: VideoInfo }) {
  const trim = useVideoStore((s) => s.recipe.trim);
  const currentTime = useVideoStore((s) => s.currentTime);
  const updateRecipe = useVideoStore((s) => s.updateRecipe);
  const seek = useVideoStore((s) => s.seek);
  const strip = useFilmstrip(file, info);
  const trackRef = useRef<HTMLDivElement>(null);
  const scrubbing = useRef(false);
  const duration = info.durationSec;
  const range = trim ?? { start: 0, end: duration };
  const startPct = timeToX(range.start, duration, 100);
  const endPct = timeToX(range.end, duration, 100);

  const setTrim = (next: TrimRange, moved: "start" | "end") => updateRecipe({ trim: trimOrNull(next, duration, moved) });
  const seekToX = (clientX: number) => {
    const rect = trackRef.current?.getBoundingClientRect();
    if (rect) seek(xToTime(clientX - rect.left, duration, rect.width));
  };

  return (
    <div className="mx-auto flex w-full max-w-5xl flex-col gap-1">
      <div className="flex items-center justify-between px-8 text-xs tabular-nums text-muted-foreground lg:px-4">
        <span>{formatTime(range.start)}</span>
        <span>{formatTime(range.end - range.start)} selected</span>
        <span>{formatTime(range.end)}</span>
      </div>
      <div className="px-8 lg:px-4">
        <div
          ref={trackRef}
          data-testid="timeline-track"
          onPointerDown={(e) => {
            scrubbing.current = true;
            e.currentTarget.setPointerCapture(e.pointerId);
            seekToX(e.clientX);
          }}
          onPointerMove={(e) => scrubbing.current && seekToX(e.clientX)}
          onPointerUp={(e) => {
            scrubbing.current = false;
            if (e.currentTarget.hasPointerCapture(e.pointerId)) e.currentTarget.releasePointerCapture(e.pointerId);
          }}
          onPointerCancel={() => (scrubbing.current = false)}
          className="relative h-12 cursor-pointer touch-none select-none lg:h-14"
        >
          <div className="absolute inset-0 flex overflow-hidden rounded-md bg-muted" aria-hidden>
            {strip.kind === "ready" ? (
              strip.urls.map((u, i) => (
                // eslint-disable-next-line @next/next/no-img-element
                <img key={i} src={u} alt="" draggable={false} className="h-full min-w-0 flex-1 object-cover" />
              ))
            ) : strip.kind === "loading" ? (
              <div className="h-full w-full animate-pulse bg-border" />
            ) : (
              <span className="flex h-full w-full items-center justify-center gap-1.5 text-xs text-muted-foreground">
                <ImageOff className="h-3.5 w-3.5 shrink-0" aria-hidden />
                No thumbnails for this video
              </span>
            )}
            <div className="absolute inset-y-0 left-0 bg-black/60" style={{ width: `${startPct}%` }} />
            <div className="absolute inset-y-0 right-0 bg-black/60" style={{ width: `${100 - endPct}%` }} />
          </div>
          <div
            aria-hidden
            className="pointer-events-none absolute inset-y-0 rounded-sm border-y-2 border-accent"
            style={{ left: `${startPct}%`, width: `${endPct - startPct}%` }}
          />
          <PlayheadMarker now={Math.min(duration, Math.max(0, currentTime))} duration={duration} onSeek={seek} />
          <TrimHandle which="start" trim={range} durationSec={duration} trackRef={trackRef} onChange={setTrim} />
          <TrimHandle which="end" trim={range} durationSec={duration} trackRef={trackRef} onChange={setTrim} />
        </div>
      </div>
    </div>
  );
}
