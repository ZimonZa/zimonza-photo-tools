"use client";

import { useCallback, useEffect, useMemo, useRef, useState, type ReactNode } from "react";
import { Pause, Play } from "lucide-react";
import { Segmented } from "@/components/ui";
import type { VideoInfo } from "@/lib/video/engines/types";
import { containSize, drawPreviewFrame, previewCanvasSize, previewFrame, type PreviewFrame } from "@/lib/video/preview-render";
import { MB } from "@/lib/video/recipe";
import { formatTime } from "@/lib/video/timeline";
import { useVideoStore } from "@/store/useVideoStore";
import { QualitySwitch } from "./quality-switch";
import { useElementSize } from "./use-element-size";

const MODES = [
  { value: "original" as const, label: "Original" },
  { value: "compressed" as const, label: "Compressed" },
];

/** A store playhead this far from the video's time is a seek, not our own report. */
const SEEK_TOLERANCE_SEC = 0.05;
/** The first frame can sit at the file's start offset; this is how close counts as "the same". */
const OFFSET_TOLERANCE_SEC = 0.2;

/** The part of the clip that plays: the trim, or the whole clip. */
function playRange(frame: PreviewFrame, durationSec: number): { start: number; end: number } {
  return { start: frame.trim?.start ?? 0, end: frame.trim?.end ?? durationSec };
}

const tenths = (t: number) => Math.round(t * 10) / 10;
const hundredths = (t: number) => Math.round(t * 100) / 100;

function StatusPill({ children }: { children: ReactNode }) {
  return (
    <p
      role="status"
      className="absolute left-1/2 top-3 z-10 max-w-[90%] -translate-x-1/2 rounded-full bg-black/75 px-3 py-1 text-center text-xs text-white"
    >
      {children}
    </p>
  );
}

/** Shown when the browser can't play the file and no proxy could be made. Thumbnails arrive with the timeline. */
function NoPlayback() {
  return (
    <div className="absolute inset-0 flex flex-col items-center justify-center gap-4 p-4 text-center">
      <div className="flex gap-1" aria-hidden>
        {Array.from({ length: 6 }, (_, i) => (
          <div key={i} className="h-10 w-14 rounded-md bg-muted" />
        ))}
      </div>
      <p className="max-w-xs text-sm text-muted-foreground">
        This browser can&apos;t play this file, but it can still be converted.
      </p>
    </div>
  );
}

export interface PreviewPlayerProps {
  file: File;
  info: VideoInfo;
  /** Null when the browser can't play the file and no proxy could be made. */
  previewUrl: string | null;
  /** The preview plays a low-resolution copy. */
  proxy: boolean;
  /**
   * Covered by the export view: the video pauses (and stays paused when the view closes) and the
   * compressed sample stops looping until it is uncovered.
   */
  suspended?: boolean;
}

/**
 * The live preview: a hidden `<video>` drawn onto a canvas every frame with the current edits, in
 * the export's frame, looping inside the trim. With Preview quality on, Original | Compressed
 * switches to the store's 3-second compressed sample. The store's playhead is only set on pause,
 * on a loop back to the start, and after a seek, never per frame (each set restarts the sample).
 */
export function PreviewPlayer({ file, info, previewUrl, proxy, suspended = false }: PreviewPlayerProps) {
  const recipe = useVideoStore((s) => s.recipe);
  const quality = useVideoStore((s) => s.quality);
  const seekRequest = useVideoStore((s) => s.seekRequest);
  const setPlayhead = useVideoStore((s) => s.setPlayhead);
  const reportTime = useVideoStore((s) => s.reportTime);
  const setPreviewMode = useVideoStore((s) => s.setPreviewMode);

  const frame = useMemo(() => previewFrame(info, { ...recipe, file }), [info, recipe, file]);
  const canvasSize = previewCanvasSize(frame.out);
  const stageRef = useRef<HTMLDivElement>(null);
  const videoRef = useRef<HTMLVideoElement>(null);
  const canvasRef = useRef<HTMLCanvasElement>(null);
  const sampleRef = useRef<HTMLVideoElement>(null);
  const frameRef = useRef(frame);
  /** Seconds the `<video>` clock runs ahead of the clip's own (the file's first timestamp, in browsers that keep it). */
  const offsetRef = useRef(0);
  const lastSeekId = useRef(seekRequest.id);
  // Sized in the same render as the canvas's backing size, so a turn never shows a stretched frame.
  const stage = useElementSize(stageRef);
  const box = stage && containSize(stage, frame.out);
  const [playing, setPlaying] = useState(false);
  const [time, setTime] = useState(0);

  const compressed = quality.enabled && quality.mode === "compressed";
  const sampleUrl = compressed ? quality.url : null;
  const { start: rangeStart, end: rangeEnd } = playRange(frame, info.durationSec);

  /** Draw the video's current frame with the latest edits. */
  const draw = useCallback(() => {
    const video = videoRef.current;
    const canvas = canvasRef.current;
    if (!video || !canvas || video.readyState < HTMLMediaElement.HAVE_CURRENT_DATA || !video.videoWidth) return;
    const ctx = canvas.getContext("2d");
    if (!ctx) return;
    drawPreviewFrame(
      ctx,
      video,
      { width: video.videoWidth, height: video.videoHeight },
      frameRef.current.edits,
      { width: canvas.width, height: canvas.height },
      { width: info.width, height: info.height }
    );
  }, [info.width, info.height]);

  // New edits or a new canvas size: redraw now, also while paused.
  useEffect(() => {
    frameRef.current = frame;
    draw();
  }, [frame, canvasSize.width, canvasSize.height, draw]);

  // Per-frame drawing and the trim loop, for the life of this source. Times here are clip time (trim time);
  // `at` / `clipTime` convert from and to the element's clock.
  useEffect(() => {
    const video = videoRef.current;
    if (!video) return;
    const hasFrameCallback = typeof video.requestVideoFrameCallback === "function";
    let frameHandle: number | null = null;
    let rafHandle: number | null = null;
    const clipTime = () => video.currentTime - offsetRef.current;
    const at = (t: number) => {
      video.currentTime = t + offsetRef.current;
    };
    const show = (t: number) => {
      setTime(tenths(t));
      reportTime(hundredths(t));
    };
    /** Wrap to the trim start and keep playing. */
    const loopBack = (start: number) => {
      at(start);
      show(start);
      setPlayhead(start);
      if (video.paused) void video.play().catch(() => {});
    };

    const onFrame = () => {
      const t = clipTime();
      const { start, end } = playRange(frameRef.current, info.durationSec);
      if (!video.paused && (t >= end || t < start - SEEK_TOLERANCE_SEC)) {
        loopBack(start);
        return;
      }
      show(t);
      draw();
    };
    const frameLoop = () => {
      onFrame();
      frameHandle = video.requestVideoFrameCallback(frameLoop);
    };
    const rafLoop = () => {
      onFrame();
      rafHandle = requestAnimationFrame(rafLoop);
    };
    const stopRaf = () => {
      if (rafHandle !== null) cancelAnimationFrame(rafHandle);
      rafHandle = null;
    };

    const onPlay = () => {
      setPlaying(true);
      if (!hasFrameCallback && rafHandle === null) rafHandle = requestAnimationFrame(rafLoop);
    };
    const onPause = () => {
      setPlaying(false);
      stopRaf();
      show(clipTime());
      setPlayhead(clipTime());
    };
    const onEnded = () => loopBack(playRange(frameRef.current, info.durationSec).start);
    const onLoaded = () => {
      // Some browsers show the first frame at the file's own start time; keep our clock relative to it.
      offsetRef.current =
        info.startSec > 0 && Math.abs(video.currentTime - info.startSec) < OFFSET_TOLERANCE_SEC ? info.startSec : 0;
      const { start, end } = playRange(frameRef.current, info.durationSec);
      // Coming back (e.g. from the Crop tool) picks up where the timeline shows.
      const resume = useVideoStore.getState().currentTime;
      if (resume > start && resume < end) at(resume);
      else if (clipTime() < start) at(start);
      draw();
    };
    const onSeeked = () => {
      show(clipTime());
      draw();
    };

    if (hasFrameCallback) frameHandle = video.requestVideoFrameCallback(frameLoop);
    video.addEventListener("play", onPlay);
    video.addEventListener("pause", onPause);
    video.addEventListener("ended", onEnded);
    video.addEventListener("loadeddata", onLoaded);
    video.addEventListener("seeked", onSeeked);
    return () => {
      video.removeEventListener("play", onPlay);
      video.removeEventListener("pause", onPause);
      video.removeEventListener("ended", onEnded);
      video.removeEventListener("loadeddata", onLoaded);
      video.removeEventListener("seeked", onSeeked);
      if (frameHandle !== null) video.cancelVideoFrameCallback(frameHandle);
      stopRaf();
      video.pause();
    };
  }, [previewUrl, info.durationSec, info.startSec, draw, setPlayhead, reportTime]);

  // A user seek (timeline, keyboard) moves the video. It has its own request id, so seeking to the
  // time the store already holds still moves a video that has played on.
  useEffect(() => {
    if (seekRequest.id === lastSeekId.current) return;
    lastSeekId.current = seekRequest.id;
    const video = videoRef.current;
    if (!video) return;
    video.currentTime = seekRequest.time + offsetRef.current;
    setTime(tenths(seekRequest.time));
  }, [seekRequest]);

  // A new trim that leaves the video outside it moves the video to its start.
  useEffect(() => {
    const video = videoRef.current;
    if (!video) return;
    const t = video.currentTime - offsetRef.current;
    if (t >= rangeStart - SEEK_TOLERANCE_SEC && t <= rangeEnd) return;
    video.currentTime = rangeStart + offsetRef.current;
    setTime(tenths(rangeStart));
    reportTime(hundredths(rangeStart));
    setPlayhead(rangeStart);
  }, [rangeStart, rangeEnd, previewUrl, setPlayhead, reportTime]);

  useEffect(() => {
    if (videoRef.current) videoRef.current.muted = recipe.muted;
  }, [recipe.muted, previewUrl]);

  // The compressed sample replaces the live picture; stop the original so its sound stops too.
  useEffect(() => {
    if (sampleUrl) videoRef.current?.pause();
  }, [sampleUrl]);

  // Under the export view nothing plays: no sound, no per-frame drawing competing with the export.
  // Only the sample (which always loops while it shows) starts again when the view closes.
  useEffect(() => {
    if (suspended) videoRef.current?.pause();
  }, [suspended, previewUrl]);
  useEffect(() => {
    const sample = sampleRef.current;
    if (!sample) return;
    if (suspended) sample.pause();
    else void sample.play().catch(() => {});
  }, [suspended, sampleUrl]);

  const togglePlay = () => {
    const video = videoRef.current;
    if (!video) return;
    if (!video.paused) {
      video.pause();
      return;
    }
    const { start, end } = playRange(frameRef.current, info.durationSec);
    const t = video.currentTime - offsetRef.current;
    if (t < start || t >= end) video.currentTime = start + offsetRef.current;
    void video.play().catch(() => {});
  };

  const boxStyle = box ?? { visibility: "hidden" as const };

  return (
    <div className="flex min-h-0 min-w-0 flex-1 flex-col">
      <div ref={stageRef} className="relative m-3 min-h-0 flex-1">
        {previewUrl ? (
          <>
            {/* Rendered under the canvas (not display:none) so every browser keeps decoding frames. */}
            <video
              key={previewUrl}
              ref={videoRef}
              src={previewUrl}
              muted={recipe.muted}
              playsInline
              preload="auto"
              aria-hidden
              tabIndex={-1}
              className="pointer-events-none absolute inset-0 m-auto"
              style={boxStyle}
            />
            <canvas
              ref={canvasRef}
              role="img"
              aria-label="Video preview"
              width={canvasSize.width}
              height={canvasSize.height}
              className="absolute inset-0 m-auto bg-black shadow-card"
              style={boxStyle}
            />
          </>
        ) : (
          <NoPlayback />
        )}
        {sampleUrl && box && (
          <video
            key={sampleUrl}
            ref={sampleRef}
            src={sampleUrl}
            autoPlay={!suspended}
            loop
            muted
            playsInline
            aria-label="Compressed sample"
            className="absolute inset-0 m-auto bg-black object-contain"
            style={box}
          />
        )}
        {compressed && (quality.status === "idle" || quality.status === "working") && (
          <StatusPill>Preparing sample…</StatusPill>
        )}
        {compressed && quality.status === "unavailable" && (
          <StatusPill>Quality preview isn&apos;t available on this device.</StatusPill>
        )}
      </div>

      <div className="flex flex-wrap items-center gap-x-3 gap-y-2 px-3 pb-3 text-sm">
        {previewUrl && !sampleUrl && (
          <>
            <button
              type="button"
              onClick={togglePlay}
              aria-label={playing ? "Pause" : "Play"}
              className="inline-flex h-11 w-11 shrink-0 items-center justify-center rounded-full bg-accent/15 text-foreground transition-colors hover:bg-accent/25 lg:h-9 lg:w-9"
            >
              {playing ? <Pause className="h-4 w-4" /> : <Play className="h-4 w-4" />}
            </button>
            <span className="tabular-nums text-muted-foreground">
              {formatTime(time)} / {formatTime(info.durationSec)}
            </span>
          </>
        )}
        {sampleUrl && <span className="text-muted-foreground">3-second sample</span>}
        {proxy && (
          <span className="rounded-full border border-border px-2 py-0.5 text-xs text-muted-foreground">Low-res preview</span>
        )}
        {/* Phones: the switch ends the first row; estimate and toggle share the second. */}
        <div className="ml-auto lg:hidden">
          <QualitySwitch />
        </div>
        {quality.enabled && (
          <div className="flex w-full items-center justify-end gap-3 lg:ml-auto lg:w-auto">
            {quality.estimatedBytes !== null && (
              <span className="mr-auto tabular-nums lg:mr-0">
                Estimated size {(quality.estimatedBytes / MB).toFixed(2)} MB
              </span>
            )}
            <div className="w-44 shrink-0 lg:w-52">
              <Segmented value={quality.mode} onChange={setPreviewMode} options={MODES} />
            </div>
          </div>
        )}
      </div>
    </div>
  );
}
