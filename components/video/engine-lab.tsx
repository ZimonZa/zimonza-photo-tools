"use client";

import { useEffect, useRef, useState } from "react";
import { Button, FieldGroup, NumberField, Segmented, SelectField, Toggle } from "@/components/ui";
import { formatBytes } from "@/lib/utils";
import { ExportCanceledError, InvalidSizeError, InvalidTrimError, TargetTooSmallError } from "@/lib/video/errors";
import type { VideoInfo } from "@/lib/video/engines/types";
import type { ExportResult, ExportStatus } from "@/lib/video/export";
import type { FitMode, OutputFrame } from "@/lib/video/frame";
import type { Rotation } from "@/lib/video/geometry";
import { describeInfo, describeStatus } from "@/lib/video/messages";
import { applyPreset, VIDEO_PRESETS, type PresetId } from "@/lib/video/presets";
import { BASE_RECIPE, MB, type Container, type EditRecipe, type QualityLevel } from "@/lib/video/recipe";

type EngineChoice = "auto" | "webcodecs" | "ffmpeg";
type MaxLong = "original" | "1920" | "1280" | "854";
type SizeKind = "target" | "quality";
type FrameKind = "source" | "percent" | "exact";

const ACCEPT = "video/*,.mov,.mkv,.avi,.wmv,.flv,.3gp,.m4v";
const INVALID_SIZE_NOTE = "Output size is too small or not a number. Use at least 16 px a side.";

function mb(bytes: number): string {
  return `${(bytes / MB).toFixed(2)} MB`;
}

function describeFrame(f: OutputFrame): string {
  if (f.kind === "source") return `original (max long side ${f.maxLongSide ?? "none"})`;
  if (f.kind === "percent") return `${f.percent}%`;
  return `${f.width}x${f.height} (${f.fit === "blur" ? "blurred background" : "crop to fill"})`;
}

function describeCrop(r: EditRecipe): string {
  return r.crop ? `${r.crop.width}x${r.crop.height} at ${r.crop.left},${r.crop.top}` : "none";
}

/** Settings frozen when Run is pressed, so reports describe the run, not the current form. */
interface RunSettings {
  summary: string;
  targetBytes: number | null;
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
  const [preset, setPreset] = useState<PresetId>("custom");
  const [rotate, setRotate] = useState<Rotation>(0);
  const [flipH, setFlipH] = useState(false);
  const [flipV, setFlipV] = useState(false);
  const [cropLeft, setCropLeft] = useState("");
  const [cropTop, setCropTop] = useState("");
  const [cropWidth, setCropWidth] = useState("");
  const [cropHeight, setCropHeight] = useState("");
  const [frameKind, setFrameKind] = useState<FrameKind>("source");
  const [percent, setPercent] = useState<number | null>(50);
  const [exactW, setExactW] = useState<number | null>(1080);
  const [exactH, setExactH] = useState<number | null>(1920);
  const [fit, setFit] = useState<FitMode>("cover");
  const [container, setContainer] = useState<Container>("mp4");
  const [previewAt, setPreviewAt] = useState("0");
  const [previewing, setPreviewing] = useState(false);
  const [sampleUrl, setSampleUrl] = useState<string | null>(null);
  const [sampleLabel, setSampleLabel] = useState<string | null>(null);
  const [sampleNote, setSampleNote] = useState<string | null>(null);

  const [running, setRunning] = useState(false);
  const [statusLog, setStatusLog] = useState<string[]>([]);
  const [progress, setProgress] = useState(0);
  const [elapsedMs, setElapsedMs] = useState(0);
  const [result, setResult] = useState<ExportResult | null>(null);
  const [resultUrl, setResultUrl] = useState<string | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [caps, setCaps] = useState("checking…");
  const [copied, setCopied] = useState(false);
  const [probed, setProbed] = useState<VideoInfo | null>(null);
  const [runSettings, setRunSettings] = useState<RunSettings | null>(null);

  const controllerRef = useRef<AbortController | null>(null);
  const previewControllerRef = useRef<AbortController | null>(null);

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

  useEffect(() => () => {
    if (sampleUrl) URL.revokeObjectURL(sampleUrl);
  }, [sampleUrl]);

  useEffect(() => () => previewControllerRef.current?.abort(), []);

  useEffect(() => {
    if (!running) return;
    const started = Date.now();
    const id = setInterval(() => setElapsedMs(Date.now() - started), 250);
    return () => clearInterval(id);
  }, [running]);

  function parseCrop(text: string): number | null {
    if (text.trim() === "") return null;
    const n = Number(text);
    return Number.isFinite(n) && n >= 0 ? n : null;
  }

  const cropTexts = [cropLeft, cropTop, cropWidth, cropHeight];
  const cropValues = cropTexts.map(parseCrop);
  const cropAny = cropTexts.some((t) => t.trim() !== "");
  const cropInvalid =
    cropAny && (cropTexts.slice(0, 2).some((t, i) => t.trim() !== "" && cropValues[i] === null) || !cropValues[2] || !cropValues[3]);
  const exactInvalid = frameKind === "exact" && (!exactW || !exactH);
  const formError = exactInvalid
    ? "Exact size needs both width and height."
    : cropInvalid
      ? "Crop needs a width and a height (left and top default to 0)."
      : null;

  function currentFrame(): OutputFrame | null {
    if (frameKind === "source") return { kind: "source", maxLongSide: maxLong === "original" ? null : Number(maxLong) };
    if (frameKind === "percent") return { kind: "percent", percent: percent ?? 100 };
    if (!exactW || !exactH) return null;
    return { kind: "exact", width: exactW, height: exactH, fit };
  }

  function buildRecipe(f: File): EditRecipe | null {
    if (formError) return null;
    const frame = currentFrame();
    if (!frame) return null;
    const start = parseSeconds(trimStart);
    const end = parseSeconds(trimEnd);
    return {
      ...BASE_RECIPE,
      file: f,
      trim: start !== null || end !== null ? { start: start ?? 0, end: end ?? Number.MAX_SAFE_INTEGER } : null,
      frame,
      muted,
      size: sizeKind === "target" ? { kind: "target", bytes: (targetMb ?? 20) * MB } : { kind: "quality", level },
      rotate,
      flipH,
      flipV,
      crop: cropAny
        ? { left: cropValues[0] ?? 0, top: cropValues[1] ?? 0, width: cropValues[2] ?? 0, height: cropValues[3] ?? 0 }
        : null,
      container,
    };
  }

  function choosePreset(id: PresetId) {
    setPreset(id);
    const p = VIDEO_PRESETS.find((x) => x.id === id);
    if (!p) return;
    const base: EditRecipe = {
      ...BASE_RECIPE,
      file: file ?? new File([], "preset"),
      frame: currentFrame() ?? BASE_RECIPE.frame,
      container,
      size: sizeKind === "target" ? { kind: "target", bytes: (targetMb ?? 10) * MB } : { kind: "quality", level },
    };
    const next = applyPreset(base, p, targetMb ?? 10);
    setContainer(next.container);
    const fr = next.frame;
    setFrameKind(fr.kind);
    if (fr.kind === "source") setMaxLong(fr.maxLongSide === null ? "original" : (String(fr.maxLongSide) as MaxLong));
    if (fr.kind === "percent") setPercent(fr.percent);
    if (fr.kind === "exact") {
      setExactW(fr.width);
      setExactH(fr.height);
      setFit(fr.fit);
    }
    if (next.size.kind === "target") {
      setSizeKind("target");
      setTargetMb(next.size.bytes / MB);
    } else {
      setSizeKind("quality");
      setLevel(next.size.level);
    }
  }

  async function preview() {
    if (!file) return;
    const recipe = buildRecipe(file);
    if (!recipe) return;
    const controller = new AbortController();
    previewControllerRef.current = controller;
    setPreviewing(true);
    setSampleUrl(null);
    setSampleLabel(null);
    setSampleNote("Making a sample…");
    try {
      const { previewSample } = await import("@/lib/video/export");
      const r = await previewSample(recipe, parseSeconds(previewAt) ?? 0, { signal: controller.signal });
      if (!r) {
        setSampleNote("Quality preview isn't available on this device (fast engine can't run)");
      } else {
        setSampleUrl(URL.createObjectURL(r.blob));
        setSampleLabel(`Sample — estimated final size ${mb(r.estimatedBytes)}`);
        setSampleNote(null);
      }
    } catch (e) {
      setSampleNote(
        e instanceof ExportCanceledError
          ? "Canceled."
          : e instanceof InvalidSizeError
            ? INVALID_SIZE_NOTE
            : e instanceof Error
              ? `${e.name}: ${e.message}`
              : String(e)
      );
    } finally {
      setPreviewing(false);
      previewControllerRef.current = null;
    }
  }

  async function run() {
    if (!file) return;
    const recipe = buildRecipe(file);
    if (!recipe) return;

    setRunSettings({
      summary: `file ${file.name} (${file.size} bytes) · preset ${preset} · trim ${trimStart || "-"}..${trimEnd || "-"} · rotate ${recipe.rotate} · flip H ${recipe.flipH} / V ${recipe.flipV} · crop ${describeCrop(recipe)} · frame ${describeFrame(recipe.frame)} · format ${recipe.container} · muted ${muted} · ${sizeKind === "target" ? `target ${targetMb ?? 20} MB` : `quality ${level}`} · engine ${engine}`,
      targetBytes: recipe.size.kind === "target" ? recipe.size.bytes : null,
    });
    setProbed(null);

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
        confirmFallback:
          engine === "auto"
            ? async ({ estimatedSec }) =>
                window.confirm(
                  `The fast engine can't do this on your device. The backup engine will take about ${Math.max(1, Math.round(estimatedSec / 60))} min. Continue?`
                )
            : undefined,
        onStatus: (s) => {
          if (s.phase === "probed") setProbed(s.info);
          setStatusLog((log) => {
            const line = describeStatus(s);
            // Download progress fires per chunk — keep one line for it.
            return s.phase === "loading-engine" && log[log.length - 1]?.startsWith("Downloading")
              ? [...log.slice(0, -1), line]
              : [...log, line];
          });
        },
      });
      setResult(r);
      setResultUrl(URL.createObjectURL(r.blob));
      setElapsedMs(r.elapsedMs);
    } catch (e) {
      if (e instanceof TargetTooSmallError) {
        setError(`Target too small for this length. Try at least ${Math.ceil(e.minBytes / 100_000) / 10} MB, or trim the video.`);
      } else if (e instanceof InvalidTrimError) {
        setError("Trim range is too short or outside the video.");
      } else if (e instanceof InvalidSizeError) {
        setError(INVALID_SIZE_NOTE);
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

  const targetBytes = runSettings?.targetBytes ?? null;
  const withinTarget = result && targetBytes !== null ? result.blob.size <= targetBytes : null;

  function report(): string {
    const lines = [
      "ZimonZa video engine lab report",
      `Device: ${navigator.userAgent}`,
      `Capabilities: ${caps}`,
      `Run: ${runSettings?.summary ?? "-"}`,
      `Input info: ${probed ? describeInfo(probed) : "not read"}`,
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

  const busy = running || previewing;

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

        <FieldGroup title="Preset">
          <SelectField<PresetId>
            value={preset}
            onChange={choosePreset}
            options={VIDEO_PRESETS.map((p) => ({
              value: p.id,
              label: p.id === "form" ? `Form upload (under ${targetMb ?? 10} MB)` : p.label,
            }))}
          />
        </FieldGroup>

        <FieldGroup title="Trim (seconds, optional)">
          <div className="grid grid-cols-2 gap-3">
            <DecimalField label="Start" value={trimStart} onChange={setTrimStart} />
            <DecimalField label="End" value={trimEnd} onChange={setTrimEnd} />
          </div>
        </FieldGroup>

        <FieldGroup title="Rotate and flip">
          <Segmented<string>
            value={String(rotate)}
            onChange={(v) => setRotate(Number(v) as Rotation)}
            options={[
              { value: "0", label: "0°" },
              { value: "90", label: "90°" },
              { value: "180", label: "180°" },
              { value: "270", label: "270°" },
            ]}
          />
          <Toggle label="Flip horizontal" checked={flipH} onChange={setFlipH} />
          <Toggle label="Flip vertical" checked={flipV} onChange={setFlipV} />
        </FieldGroup>

        <FieldGroup title="Crop (px, optional)">
          <div className="grid grid-cols-2 gap-3">
            <DecimalField label="Crop left" value={cropLeft} onChange={setCropLeft} />
            <DecimalField label="Crop top" value={cropTop} onChange={setCropTop} />
            <DecimalField label="Crop width" value={cropWidth} onChange={setCropWidth} />
            <DecimalField label="Crop height" value={cropHeight} onChange={setCropHeight} />
          </div>
        </FieldGroup>

        <FieldGroup title="Output size">
          <Segmented<FrameKind>
            value={frameKind}
            onChange={setFrameKind}
            options={[
              { value: "source", label: "Original" },
              { value: "percent", label: "Percent" },
              { value: "exact", label: "Exact" },
            ]}
          />
          {frameKind === "source" && (
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
          )}
          {frameKind === "percent" && (
            <NumberField label="Percent of picture size" value={percent} onChange={setPercent} suffix="%" />
          )}
          {frameKind === "exact" && (
            <>
              <div className="grid grid-cols-2 gap-3">
                <NumberField label="Width" value={exactW} onChange={setExactW} suffix="px" />
                <NumberField label="Height" value={exactH} onChange={setExactH} suffix="px" />
              </div>
              <Segmented<FitMode>
                value={fit}
                onChange={setFit}
                options={[
                  { value: "cover", label: "Crop to fill" },
                  { value: "blur", label: "Blurred background" },
                ]}
              />
            </>
          )}
          {formError && <p className="text-xs text-red-400">{formError}</p>}
        </FieldGroup>

        <FieldGroup title="Format and quality">
          <Segmented<Container>
            value={container}
            onChange={setContainer}
            options={[
              { value: "mp4", label: "MP4" },
              { value: "webm", label: "WebM" },
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

        <FieldGroup title="Preview quality">
          <DecimalField label="At second" value={previewAt} onChange={setPreviewAt} />
          <Button onClick={preview} disabled={!file || busy || formError !== null} className="w-full">
            {previewing ? "Making sample…" : "Preview quality"}
          </Button>
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

        {muted && (
          <p className="rounded-xl bg-amber-500/10 p-2 text-sm font-medium text-amber-400">
            🔇 Mute is ON — the output will have no sound. Tap the Mute switch to turn it off.
          </p>
        )}
        <div className="flex gap-2">
          <Button variant="primary" onClick={run} disabled={!file || busy || formError !== null} className="flex-1">
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

        {(sampleNote || (sampleUrl && sampleLabel)) && (
          <div className="space-y-2" data-testid="sample">
            {sampleNote && <p className="text-sm text-muted-foreground">{sampleNote}</p>}
            {sampleUrl && sampleLabel && (
              <>
                <p className="text-sm font-medium">{sampleLabel}</p>
                <video src={sampleUrl} controls playsInline className="max-h-[40vh] w-full rounded-xl bg-black" />
              </>
            )}
          </div>
        )}

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
