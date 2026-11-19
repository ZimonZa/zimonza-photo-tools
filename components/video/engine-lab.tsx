"use client";

import { useEffect, useRef, useState } from "react";
import { Button, FieldGroup, NumberField, Segmented, SelectField, Toggle } from "@/components/ui";
import { formatBytes } from "@/lib/utils";
import { ExportCanceledError, InvalidTrimError, TargetTooSmallError } from "@/lib/video/errors";
import type { ExportResult, ExportStatus } from "@/lib/video/export";
import { MB, type EditRecipe, type QualityLevel } from "@/lib/video/recipe";

type EngineChoice = "auto" | "webcodecs" | "ffmpeg";
type MaxLong = "original" | "1920" | "1280" | "854";
type SizeKind = "target" | "quality";

const ACCEPT = "video/*,.mov,.mkv,.avi,.wmv,.flv,.3gp,.m4v";

function mb(bytes: number): string {
  return `${(bytes / MB).toFixed(2)} MB`;
}

function describeStatus(s: ExportStatus): string {
  switch (s.phase) {
    case "probing":
      return "Reading the video…";
    case "loading-engine":
      return `Downloading backup engine… ${mb(s.loadedBytes)} of ${s.totalBytes ? mb(s.totalBytes) : "~32 MB"}`;
    case "encoding":
      return `Encoding with the ${s.engine === "webcodecs" ? "fast" : "backup"} engine — pass ${s.attempt}`;
    case "fallback":
      return `Switching to the backup engine: ${s.reason}`;
  }
}

function parseSeconds(text: string): number | null {
  if (text.trim() === "") return null;
  const n = Number(text);
  return Number.isFinite(n) && n >= 0 ? n : null;
}

export function EngineLab() {
  const [file, setFile] = useState<File | null>(null);
  const [trimStart, setTrimStart] = useState("");
  const [trimEnd, setTrimEnd] = useState("");
  const [maxLong, setMaxLong] = useState<MaxLong>("original");
  const [muted, setMuted] = useState(false);
  const [sizeKind, setSizeKind] = useState<SizeKind>("target");
  const [targetMb, setTargetMb] = useState<number | null>(20);
  const [level, setLevel] = useState<QualityLevel>("balanced");
  const [engine, setEngine] = useState<EngineChoice>("auto");

  const [running, setRunning] = useState(false);
  const [statusLog, setStatusLog] = useState<string[]>([]);
  const [progress, setProgress] = useState(0);
  const [elapsedMs, setElapsedMs] = useState(0);
  const [result, setResult] = useState<ExportResult | null>(null);
  const [resultUrl, setResultUrl] = useState<string | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [caps, setCaps] = useState("checking…");
  const [copied, setCopied] = useState(false);

  const controllerRef = useRef<AbortController | null>(null);

  useEffect(() => {
    (async () => {
      const videoEncoder = typeof VideoEncoder !== "undefined";
      let aac = "no AudioEncoder";
      if (typeof AudioEncoder !== "undefined") {
        try {
          const r = await AudioEncoder.isConfigSupported({ codec: "mp4a.40.2", sampleRate: 48_000, numberOfChannels: 2 });
          aac = r.supported ? "yes" : "no";
        } catch {
          aac = "error";
        }
      }
      setCaps(`VideoEncoder: ${videoEncoder ? "yes" : "no"} · native AAC encode: ${aac}`);
    })();
  }, []);

  useEffect(() => () => {
    if (resultUrl) URL.revokeObjectURL(resultUrl);
  }, [resultUrl]);

  useEffect(() => {
    if (!running) return;
    const started = Date.now();
    const id = setInterval(() => setElapsedMs(Date.now() - started), 250);
    return () => clearInterval(id);
  }, [running]);

  async function run() {
    if (!file) return;
    const start = parseSeconds(trimStart);
    const end = parseSeconds(trimEnd);
    const recipe: EditRecipe = {
      file,
      trim: start !== null || end !== null ? { start: start ?? 0, end: end ?? Number.MAX_SAFE_INTEGER } : null,
      maxLongSide: maxLong === "original" ? null : Number(maxLong),
      muted,
      size: sizeKind === "target" ? { kind: "target", bytes: (targetMb ?? 20) * MB } : { kind: "quality", level },
    };

    const controller = new AbortController();
    controllerRef.current = controller;
    setRunning(true);
    setStatusLog([]);
    setProgress(0);
    setElapsedMs(0);
    setResult(null);
    setResultUrl(null);
    setError(null);
    setCopied(false);

    try {
      const { exportVideo } = await import("@/lib/video/export");
      const r = await exportVideo(recipe, {
        engine,
        signal: controller.signal,
        onProgress: setProgress,
        onStatus: (s) =>
          setStatusLog((log) => {
            const line = describeStatus(s);
            // Download progress fires per chunk — keep one line for it.
            return s.phase === "loading-engine" && log[log.length - 1]?.startsWith("Downloading")
              ? [...log.slice(0, -1), line]
              : [...log, line];
          }),
      });
      setResult(r);
      setResultUrl(URL.createObjectURL(r.blob));
      setElapsedMs(r.elapsedMs);
    } catch (e) {
      if (e instanceof TargetTooSmallError) {
        setError(`Target too small for this length. Try at least ${Math.ceil(e.minBytes / 100_000) / 10} MB, or trim the video.`);
      } else if (e instanceof InvalidTrimError) {
        setError("Trim range is too short or outside the video.");
      } else if (e instanceof ExportCanceledError) {
        setError("Canceled.");
      } else {
        setError(e instanceof Error ? `${e.name}: ${e.message}` : String(e));
      }
    } finally {
      setRunning(false);
      controllerRef.current = null;
    }
  }

  const targetBytes = sizeKind === "target" ? (targetMb ?? 20) * MB : null;
  const withinTarget = result && targetBytes !== null ? result.blob.size <= targetBytes : null;

  function report(): string {
    const lines = [
      "ZimonZa video engine lab report",
      `Device: ${navigator.userAgent}`,
      `Capabilities: ${caps}`,
      file ? `Input: ${file.name} · ${file.size} bytes (${mb(file.size)})` : "Input: none",
      result
        ? `Input info: ${result.info.videoCodec ?? "?"}/${result.info.audioCodec ?? "no audio"} · ${result.info.width}x${result.info.height} · rotation ${result.info.rotation} · ${result.info.durationSec.toFixed(2)} s · readable by fast engine: ${result.info.readableByMediabunny}`
        : null,
      `Settings: trim ${trimStart || "-"}..${trimEnd || "-"} · max long side ${maxLong} · muted ${muted} · ${sizeKind === "target" ? `target ${targetMb} MB` : `quality ${level}`} · engine ${engine}`,
      `Status: ${statusLog.join(" | ") || "-"}`,
      result
        ? `Result: ${result.engine} · ${result.blob.size} bytes (${mb(result.blob.size)})${targetBytes !== null ? ` · target ${targetBytes} · within target: ${withinTarget}` : ""} · ${result.width}x${result.height} · passes ${result.attempts} · stepped down ${result.steppedDown}`
        : null,
      `Elapsed: ${(elapsedMs / 1000).toFixed(1)} s`,
      error ? `Error: ${error}` : null,
    ];
    return lines.filter((l): l is string => l !== null).join("\n");
  }

  async function copyReport() {
    try {
      await navigator.clipboard.writeText(report());
      setCopied(true);
    } catch {
      setCopied(false);
      window.prompt("Copy this report:", report());
    }
  }

  return (
    <div className="grid gap-6 lg:grid-cols-[360px_minmax(0,1fr)]">
      <div className="glass space-y-5 rounded-2xl p-4">
        <FieldGroup title="Video">
          <input
            type="file"
            accept={ACCEPT}
            onChange={(e) => setFile(e.target.files?.[0] ?? null)}
            className="block w-full text-sm file:mr-3 file:rounded-lg file:border-0 file:bg-muted file:px-3 file:py-1.5 file:text-sm file:font-medium"
          />
          {file && <p className="text-xs text-muted-foreground">{file.name} · {formatBytes(file.size)}</p>}
        </FieldGroup>

        <FieldGroup title="Trim (seconds, optional)">
          <div className="grid grid-cols-2 gap-3">
            <DecimalField label="Start" value={trimStart} onChange={setTrimStart} />
            <DecimalField label="End" value={trimEnd} onChange={setTrimEnd} />
          </div>
        </FieldGroup>

        <FieldGroup title="Size">
          <SelectField<MaxLong>
            label="Max long side"
            value={maxLong}
            onChange={setMaxLong}
            options={[
              { value: "original", label: "Original" },
              { value: "1920", label: "1920 px" },
              { value: "1280", label: "1280 px" },
              { value: "854", label: "854 px" },
            ]}
          />
          <Segmented<SizeKind>
            value={sizeKind}
            onChange={setSizeKind}
            options={[
              { value: "target", label: "Target MB" },
              { value: "quality", label: "Quality" },
            ]}
          />
          {sizeKind === "target" ? (
            <NumberField label="Target size" value={targetMb} onChange={setTargetMb} suffix="MB" />
          ) : (
            <Segmented<QualityLevel>
              value={level}
              onChange={setLevel}
              options={[
                { value: "high", label: "High" },
                { value: "balanced", label: "Balanced" },
                { value: "small", label: "Small" },
              ]}
            />
          )}
          <Toggle label="Mute" checked={muted} onChange={setMuted} />
        </FieldGroup>

        <FieldGroup title="Engine">
          <SelectField<EngineChoice>
            value={engine}
            onChange={setEngine}
            options={[
              { value: "auto", label: "Auto (fast, backup if needed)" },
              { value: "webcodecs", label: "Force fast engine (WebCodecs)" },
              { value: "ffmpeg", label: "Force backup engine (ffmpeg)" },
            ]}
          />
          <p className="text-xs text-muted-foreground">{caps}</p>
        </FieldGroup>

        <div className="flex gap-2">
          <Button variant="primary" onClick={run} disabled={!file || running} className="flex-1">
            {running ? "Running…" : "Run"}
          </Button>
          <Button onClick={() => controllerRef.current?.abort()} disabled={!running}>
            Cancel
          </Button>
        </div>
      </div>

      <div className="glass space-y-4 rounded-2xl p-4">
        <div>
          <div className="h-2 overflow-hidden rounded-full bg-muted">
            <div className="h-full bg-gradient-to-r from-accent to-accent2 transition-all" style={{ width: `${Math.round(progress * 100)}%` }} />
          </div>
          <p className="mt-2 text-xs tabular-nums text-muted-foreground">
            {Math.round(progress * 100)}% · {(elapsedMs / 1000).toFixed(1)} s
          </p>
          <ul className="mt-2 space-y-0.5 text-sm">
            {statusLog.map((line, i) => (
              <li key={i}>{line}</li>
            ))}
          </ul>
        </div>

        {error && <p className="rounded-xl bg-red-500/10 p-3 text-sm text-red-400">{error}</p>}

        {result && resultUrl && (
          <div className="space-y-3">
            <dl className="grid grid-cols-2 gap-x-4 gap-y-1 text-sm">
              <dt className="text-muted-foreground">Output</dt>
              <dd className="tabular-nums">
                {mb(result.blob.size)} ({result.blob.size.toLocaleString()} bytes)
              </dd>
              {targetBytes !== null && (
                <>
                  <dt className="text-muted-foreground">Target</dt>
                  <dd>
                    {mb(targetBytes)} · {withinTarget ? "✓ within target" : "✗ over target"}
                  </dd>
                </>
              )}
              <dt className="text-muted-foreground">Engine</dt>
              <dd>{result.engine === "webcodecs" ? "Fast (WebCodecs)" : "Backup (ffmpeg)"}</dd>
              <dt className="text-muted-foreground">Size</dt>
              <dd>
                {result.width} × {result.height}
                {result.steppedDown ? " (lowered to fit)" : ""}
              </dd>
              <dt className="text-muted-foreground">Passes</dt>
              <dd>{result.attempts}</dd>
            </dl>
            <video src={resultUrl} controls playsInline className="max-h-[50vh] w-full rounded-xl bg-black" />
            <a
              href={resultUrl}
              download={result.fileName}
              className="inline-flex w-full items-center justify-center rounded-xl bg-gradient-to-r from-accent to-accent2 px-4 py-2 text-sm font-semibold text-accent-foreground"
            >
              Download {result.fileName}
            </a>
          </div>
        )}

        <Button onClick={copyReport} disabled={running || (!result && !error)} className="w-full">
          {copied ? "Report copied ✓" : "Copy report"}
        </Button>
      </div>
    </div>
  );
}

function DecimalField({ label, value, onChange }: { label: string; value: string; onChange: (v: string) => void }) {
  return (
    <label className="block">
      <span className="mb-1.5 block text-xs font-medium text-muted-foreground">{label}</span>
      <input
        type="text"
        inputMode="decimal"
        value={value}
        placeholder="—"
        onChange={(e) => onChange(e.target.value)}
        className="w-full rounded-xl border border-border bg-card/60 px-3 py-2 text-sm outline-none focus:border-accent/60"
      />
    </label>
  );
}
