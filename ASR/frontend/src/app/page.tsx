"use client";

import { useCallback, useEffect, useRef, useState, type ChangeEvent, type DragEvent } from "react";
import { AlertTriangle, Upload, X } from "lucide-react";
import { Persona, type PersonaState } from "@/components/persona";
import { TranscriptView } from "@/components/transcript-view";
import { cn } from "@/lib/utils";

type AppState = "idle" | "uploading" | "processing" | "done" | "error";

interface TranscriptData {
  bengali: string;
  english: string;
}

interface AudioPreview {
  duration: number | null;
  sampleRate: number | null;
  peaks: number[];
}

type TranscriptResponse = {
  transcript?: {
    bengali?: unknown;
    english?: unknown;
  };
  bengali?: unknown;
  english?: unknown;
  error?: unknown;
};

const STATUS: Record<AppState, string> = {
  idle: "IDLE",
  uploading: "UPLOADING",
  processing: "PROCESSING",
  done: "COMPLETE",
  error: "ERROR",
};

const IDLE_WAVEFORM = [
  0.22, 0.38, 0.56, 0.42, 0.64, 0.28, 0.72, 0.35, 0.58, 0.44,
  0.76, 0.34, 0.62, 0.48, 0.68, 0.24, 0.54, 0.3, 0.73, 0.39,
  0.61, 0.46, 0.69, 0.27, 0.51, 0.33, 0.66, 0.43, 0.75, 0.37,
  0.57, 0.29, 0.7, 0.41, 0.59, 0.31, 0.67, 0.45, 0.63, 0.36,
];

function fmtBytes(bytes: number) {
  if (!bytes) return "0 B";
  const sizes = ["B", "KB", "MB", "GB"];
  const level = Math.min(Math.floor(Math.log(bytes) / Math.log(1024)), sizes.length - 1);
  return `${(bytes / 1024 ** level).toFixed(level === 0 ? 0 : 1)} ${sizes[level]}`;
}

function fmtDuration(seconds: number | null) {
  if (!seconds || Number.isNaN(seconds)) return "--";
  const total = Math.max(0, Math.round(seconds));
  const mins = Math.floor(total / 60);
  const secs = total % 60;
  return `${mins.toString().padStart(2, "0")}:${secs.toString().padStart(2, "0")}`;
}

function inferFileType(file: File | null) {
  if (!file) return "--";
  const ext = file.name.split(".").pop()?.trim().toUpperCase();
  return ext || file.type.replace("audio/", "").toUpperCase() || "--";
}

function normalizeTranscriptPayload(payload: TranscriptResponse): TranscriptData | null {
  const candidate = payload?.transcript && typeof payload.transcript === "object"
    ? payload.transcript
    : payload;

  if (typeof candidate?.bengali !== "string" || typeof candidate?.english !== "string") {
    return null;
  }

  return {
    bengali: candidate.bengali,
    english: candidate.english,
  };
}

async function parseResponsePayload(response: Response): Promise<TranscriptResponse> {
  const text = await response.text();
  if (!text) return {};

  try {
    return JSON.parse(text) as TranscriptResponse;
  } catch {
    return { error: text };
  }
}

async function requestTranscription(file: File): Promise<TranscriptData> {
  const endpoints = ["/api/transcribe", "http://127.0.0.1:5001/api/transcribe"];
  let lastError = "TRANSCRIPTION FAILED";

  for (const endpoint of endpoints) {
    try {
      const formData = new FormData();
      formData.append("file", file);

      const response = await fetch(endpoint, {
        method: "POST",
        body: formData,
      });

      const payload = await parseResponsePayload(response);

      if (!response.ok) {
        const message =
          typeof payload.error === "string"
            ? payload.error
            : `HTTP ${response.status}`;
        throw new Error(message);
      }

      const transcript = normalizeTranscriptPayload(payload);
      if (!transcript) {
        console.error("Invalid transcript payload", { endpoint, payload });
        throw new Error("INVALID TRANSCRIPT RESPONSE");
      }

      return transcript;
    } catch (error) {
      lastError = error instanceof Error ? error.message : "TRANSCRIPTION FAILED";
      console.warn(`Transcription attempt failed for ${endpoint}`, error);
    }
  }

  throw new Error(lastError);
}

function seedWaveform(seed: string, length = 40) {
  let hash = 0;
  for (const char of seed) hash = (hash * 31 + char.charCodeAt(0)) >>> 0;

  return Array.from({ length }, (_, index) => {
    const angle = (hash + index * 23) * 0.11;
    const raw = Math.abs(Math.sin(angle) * 0.62 + Math.cos(angle * 0.45) * 0.26);
    return Math.max(0.14, Math.min(0.9, raw + (index % 5) * 0.02));
  });
}

function createWaveform(data: Float32Array, length = 40) {
  if (!data.length) return seedWaveform("empty", length);

  const chunkSize = Math.max(1, Math.floor(data.length / length));
  const peaks = Array.from({ length }, (_, index) => {
    const start = index * chunkSize;
    const end = Math.min(start + chunkSize, data.length);
    let max = 0;

    for (let cursor = start; cursor < end; cursor += 1) {
      const current = Math.abs(data[cursor] ?? 0);
      if (current > max) max = current;
    }

    return max;
  });

  const ceiling = Math.max(...peaks, 0.08);
  return peaks.map((value, index) => {
    const normalized = value / ceiling;
    return Math.max(0.14, Math.min(0.96, normalized * 0.9 + (index % 4 === 0 ? 0.04 : 0)));
  });
}

async function buildAudioPreview(file: File): Promise<AudioPreview> {
  const fallback = {
    duration: null,
    sampleRate: null,
    peaks: seedWaveform(file.name),
  };

  if (typeof window === "undefined") return fallback;

  const AudioContextCtor =
    window.AudioContext ??
    (window as Window & { webkitAudioContext?: typeof AudioContext }).webkitAudioContext;

  if (!AudioContextCtor) return fallback;

  let context: AudioContext | null = null;

  try {
    context = new AudioContextCtor();
    const buffer = await file.arrayBuffer();
    const decoded = await context.decodeAudioData(buffer.slice(0));

    return {
      duration: decoded.duration,
      sampleRate: decoded.sampleRate,
      peaks: createWaveform(decoded.getChannelData(0)),
    };
  } catch {
    return fallback;
  } finally {
    try {
      await context?.close();
    } catch {
      // Ignore close failures from browser audio contexts.
    }
  }
}

function PropertyRow({ label, value }: { label: string; value: string }) {
  return (
    <div className="grid grid-cols-[110px_1fr] gap-4 border-t border-[rgba(255,230,0,0.18)] pt-3 first:border-t-0 first:pt-0">
      <dt className="text-[10px] tracking-[0.3em] text-[rgba(255,230,0,0.6)]">{label}</dt>
      <dd className="break-all text-sm leading-6 text-[rgba(255,230,0,0.94)]">{value}</dd>
    </div>
  );
}

function WaveformPreview({ peaks, active }: { peaks: number[]; active: boolean }) {
  return (
    <div className="relative h-36 overflow-hidden border border-[rgba(255,230,0,0.72)] bg-[rgba(255,230,0,0.02)] px-3 py-4">
      <div className="absolute left-0 right-0 top-1/2 h-px -translate-y-1/2 bg-[rgba(255,230,0,0.22)]" />
      <div className="wave-grid absolute inset-0" />
      <div className="relative z-10 flex h-full items-center gap-[5px]">
        {peaks.map((peak, index) => (
          <span
            key={`${index}-${peak}`}
            className={cn("wave-bar flex-1 rounded-none", active && "wave-bar-active")}
            style={{
              height: `${Math.max(18, peak * 100)}%`,
              animationDelay: `${index * 0.05}s`,
            }}
          />
        ))}
      </div>
    </div>
  );
}

export default function HomePage() {
  const [appState, setAppState] = useState<AppState>("idle");
  const [file, setFile] = useState<File | null>(null);
  const [transcript, setTranscript] = useState<TranscriptData | null>(null);
  const [error, setError] = useState("");
  const [dragging, setDragging] = useState(false);
  const [audioPreview, setAudioPreview] = useState<AudioPreview>({
    duration: null,
    sampleRate: null,
    peaks: IDLE_WAVEFORM,
  });
  const [isReadingAudio, setIsReadingAudio] = useState(false);

  const inputRef = useRef<HTMLInputElement>(null);
  const isWorking = appState === "uploading" || appState === "processing";
  const hasTranscript = transcript !== null;

  const personaState: PersonaState =
    appState === "uploading"
      ? "listening"
      : appState === "processing"
        ? "thinking"
        : appState === "done"
          ? "speaking"
          : appState === "error"
            ? "asleep"
            : "idle";

  useEffect(() => {
    if (!file) {
      setAudioPreview({
        duration: null,
        sampleRate: null,
        peaks: IDLE_WAVEFORM,
      });
      setIsReadingAudio(false);
      return;
    }

    let cancelled = false;
    setIsReadingAudio(true);
    setAudioPreview({
      duration: null,
      sampleRate: null,
      peaks: seedWaveform(file.name),
    });

    void buildAudioPreview(file)
      .then((preview) => {
        if (!cancelled) setAudioPreview(preview);
      })
      .finally(() => {
        if (!cancelled) setIsReadingAudio(false);
      });

    return () => {
      cancelled = true;
    };
  }, [file]);

  const transcribeFile = useCallback(async (targetFile: File) => {
    setError("");
    setTranscript(null);
    setAppState("uploading");

    try {
      setAppState("processing");
      const nextTranscript = await requestTranscription(targetFile);
      setTranscript(nextTranscript);
      setAppState("done");
    } catch (reason) {
      setError(reason instanceof Error ? reason.message.toUpperCase() : "TRANSCRIPTION FAILED");
      setAppState("error");
    }
  }, []);

  const acceptFile = useCallback((nextFile: File | null) => {
    if (!nextFile) return;

    if (!/\.(mp3|wav|m4a|ogg|flac|webm)$/i.test(nextFile.name)) {
      setError("UNSUPPORTED AUDIO FORMAT");
      setAppState("error");
      return;
    }

    setFile(nextFile);
    setTranscript(null);
    setError("");
    setAppState("idle");
    void transcribeFile(nextFile);
  }, [transcribeFile]);

  const onChange = (event: ChangeEvent<HTMLInputElement>) => {
    acceptFile(event.target.files?.[0] ?? null);
    event.target.value = "";
  };

  const onDrop = (event: DragEvent<HTMLDivElement>) => {
    event.preventDefault();
    setDragging(false);
    acceptFile(event.dataTransfer.files?.[0] ?? null);
  };

  const clear = () => {
    setFile(null);
    setTranscript(null);
    setError("");
    setAppState("idle");
  };

  const run = async () => {
    if (!file || isWorking) return;
    await transcribeFile(file);
  };

  return (
    <main className="h-screen overflow-hidden p-3 sm:p-4">
      <div className="ink-shell grid h-full w-full grid-cols-[minmax(280px,0.8fr)_minmax(360px,1fr)_minmax(420px,1.1fr)] overflow-hidden rounded-[28px] border border-[rgba(255,230,0,0.82)]">
        <section className="ink-panel min-w-0 overflow-hidden border-r border-[rgba(255,230,0,0.72)]">
          <div className="flex h-full flex-col gap-4 p-4 sm:p-5">
            <input
              ref={inputRef}
              type="file"
              accept=".mp3,.wav,.m4a,.ogg,.flac,.webm,audio/*"
              onChange={onChange}
              className="hidden"
            />

            <div className="flex items-center justify-between gap-3">
              <button
                type="button"
                onClick={() => inputRef.current?.click()}
                className="ink-button inline-flex h-14 items-center gap-4 px-4 text-xs font-semibold tracking-[0.28em]"
              >
                <span className="flex h-9 w-9 items-center justify-center border border-current">
                  <Upload size={17} strokeWidth={2.4} />
                </span>
                <span>UPLOAD</span>
              </button>

              {file && (
                <button
                  type="button"
                  onClick={clear}
                  className="ink-button flex h-12 w-12 items-center justify-center"
                  aria-label="Clear file"
                >
                  <X size={18} strokeWidth={2.4} />
                </button>
              )}
            </div>

            <div
              className={cn("ink-box p-4 transition-colors duration-200", dragging && "bg-[rgba(255,230,0,0.1)]")}
              onDrop={onDrop}
              onDragOver={(event) => {
                event.preventDefault();
                setDragging(true);
              }}
              onDragLeave={() => setDragging(false)}
            >
              <div className="mb-3 text-[10px] tracking-[0.34em] text-[rgba(255,230,0,0.62)]">WAVEFORM</div>
              <WaveformPreview peaks={file ? audioPreview.peaks : IDLE_WAVEFORM} active={isWorking || isReadingAudio} />
              <div className="mt-3 flex items-center justify-between gap-3 text-[10px] tracking-[0.18em] text-[rgba(255,230,0,0.72)]">
                <span className="truncate">{file ? file.name : dragging ? "DROP FILE HERE" : "NO FILE LOADED"}</span>
                <span>{isReadingAudio ? "SCANNING" : fmtDuration(audioPreview.duration)}</span>
              </div>
            </div>

            <div className="ink-box flex-1 p-4">
              <div className="mb-4 text-[10px] tracking-[0.34em] text-[rgba(255,230,0,0.62)]">AUDIO PROPERTIES</div>
              <dl className="space-y-3">
                <PropertyRow label="FILE TYPE" value={inferFileType(file)} />
                <PropertyRow label="LENGTH" value={isReadingAudio ? "SCANNING" : fmtDuration(audioPreview.duration)} />
                <PropertyRow label="SIZE" value={file ? fmtBytes(file.size) : "--"} />
                <PropertyRow
                  label="SAMPLE RATE"
                  value={isReadingAudio ? "SCANNING" : audioPreview.sampleRate ? `${audioPreview.sampleRate.toLocaleString()} HZ` : "--"}
                />
              </dl>
            </div>

            {error && (
              <div className="ink-box flex items-start gap-3 border-[rgba(255,230,0,0.92)] px-4 py-3">
                <AlertTriangle size={16} className="mt-0.5 shrink-0" />
                <p className="text-xs leading-6 tracking-[0.16em] text-[rgba(255,230,0,0.92)]">{error}</p>
              </div>
            )}

            <button
              type="button"
              onClick={run}
              disabled={!file || isWorking}
              className="ink-button h-12 w-full px-4 text-xs font-semibold tracking-[0.32em] disabled:cursor-not-allowed disabled:opacity-35"
            >
              {appState === "done" ? "RUN AGAIN" : isWorking ? STATUS[appState] : "TRANSCRIBE"}
            </button>
          </div>
        </section>

        <section className="ink-panel min-w-0 overflow-hidden border-r border-[rgba(255,230,0,0.72)]">
          <div className="relative flex h-full flex-col items-center justify-center overflow-hidden px-6 py-8">
            <div className="absolute inset-x-0 top-1/2 h-px -translate-y-1/2 bg-[rgba(255,230,0,0.2)]" />
            <div className="absolute left-1/2 top-0 h-full w-px -translate-x-1/2 bg-[rgba(255,230,0,0.2)]" />
            <div className="absolute h-[420px] w-[420px] rounded-full border border-[rgba(255,230,0,0.2)]" />
            <div className="absolute h-[300px] w-[300px] rounded-full border border-[rgba(255,230,0,0.14)]" />

            <div className="relative z-10 flex flex-col items-center gap-7">
              <Persona variant="halo" state={personaState} className="size-[300px] xl:size-[360px]" />
              <div className="flex flex-col items-center gap-3 text-center">
                <div className="text-[10px] tracking-[0.34em] text-[rgba(255,230,0,0.62)]">STATE</div>
                <div className="ink-box min-w-[180px] px-6 py-3 text-sm tracking-[0.28em]">
                  {personaState.toUpperCase()}
                </div>
              </div>
            </div>
          </div>
        </section>

        <section className="ink-panel min-w-0 overflow-hidden">
          {hasTranscript ? (
            <TranscriptView transcript={transcript} className="h-full" />
          ) : (
            <div className="flex h-full items-center justify-center p-6">
              <div className="text-center">
                <div className="text-[11px] tracking-[0.34em] text-[rgba(255,230,0,0.62)]">TRANSCRIPT</div>
                <div className="mt-6 text-[clamp(1.8rem,3vw,3rem)] font-semibold tracking-[0.32em] text-[rgba(255,230,0,0.9)]">
                  {appState === "error" ? "ERROR" : isWorking ? "TRANSCRIBING" : appState === "done" ? "NO DATA" : "WAITING"}
                </div>
              </div>
            </div>
          )}
        </section>
      </div>
    </main>
  );
}
