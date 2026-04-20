"use client";

import { useCallback, useEffect, useRef, useState, type ChangeEvent, type DragEvent } from "react";
import { AlertTriangle, History, Upload, X } from "lucide-react";
import { TranscriptView, parseTurns, type Turn } from "@/components/transcript-view";
import { TranscriptDetailModal } from "@/components/transcript-detail-modal";
import { RecentTranscriptionsPane, type RecentTranscription } from "@/components/recent-transcriptions-pane";
import { WaveformPlayer } from "@/components/ui/waveform-player";
import { cn } from "@/lib/utils";

const RECENT_STORAGE_KEY = "recent_transcriptions";
const MAX_RECENT = 15;

type AppState = "idle" | "uploading" | "processing" | "done" | "error";

interface TranscriptData {
  bengali: string;
  english: string;
}

interface AudioPreview {
  duration: number | null;
  sampleRate: number | null;
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

function formatSessionName(file: File | null) {
  if (!file) return "Awaiting session";
  const stem = file.name.replace(/\.[^/.]+$/, "");
  return stem.replace(/[_-]+/g, " ").trim() || file.name;
}

function countWords(text: string) {
  return text.trim().split(/\s+/).filter(Boolean).length;
}

function stripMarkdown(text: string): string {
  return text
    .replace(/\*\*([^*\n]+)\*\*/g, "$1")
    .replace(/\*([^*\n]+)\*/g, "$1")
    .replace(/\[([^\]\n]+)\]:\s*/g, "$1: ")
    .replace(/^#{1,6}\s+/gm, "")
    .replace(/^\s*[-*]\s+/gm, "")
    .replace(/\n{2,}/g, " ")
    .replace(/\n/g, " ")
    .trim();
}

function generateSummaryText(transcript: TranscriptData): string {
  const stripped = stripMarkdown(transcript.english);
  const words = stripped.split(/\s+/).filter(Boolean);
  const preview = words.slice(0, 55).join(" ");
  return preview + (words.length > 55 ? "…" : "");
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

async function buildAudioPreview(file: File): Promise<AudioPreview> {
  const fallback = {
    duration: null,
    sampleRate: null,
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



export default function HomePage() {
  const [appState, setAppState] = useState<AppState>("idle");
  const [file, setFile] = useState<File | null>(null);
  const [transcript, setTranscript] = useState<TranscriptData | null>(null);
  const [error, setError] = useState("");
  const [dragging, setDragging] = useState(false);
  const [audioPreview, setAudioPreview] = useState<AudioPreview>({
    duration: null,
    sampleRate: null,
  });
  const [isReadingAudio, setIsReadingAudio] = useState(false);
  const [isTranscriptDetailOpen, setIsTranscriptDetailOpen] = useState(false);
  const [initialTurnIndex, setInitialTurnIndex] = useState<number | undefined>(undefined);
  const [isSidePaneOpen, setIsSidePaneOpen] = useState(false);
  const [recentTranscriptions, setRecentTranscriptions] = useState<RecentTranscription[]>([]);
  const [sessionDisplayName, setSessionDisplayName] = useState<string>("Awaiting session");
  const [elapsedSeconds, setElapsedSeconds] = useState(0);

  const inputRef = useRef<HTMLInputElement>(null);
  const audioPreviewRef = useRef<AudioPreview>({ duration: null, sampleRate: null });
  const processingStartRef = useRef<number | null>(null);
  const transcriptionIdRef = useRef(0);
  const isWorking = appState === "uploading" || appState === "processing";
  const hasTranscript = transcript !== null;

  // Keep a ref to the latest audioPreview so transcribeFile can read it without a stale closure
  useEffect(() => {
    audioPreviewRef.current = audioPreview;
  }, [audioPreview]);

  // Load recent transcriptions from localStorage on mount
  useEffect(() => {
    try {
      const stored = localStorage.getItem(RECENT_STORAGE_KEY);
      if (stored) setRecentTranscriptions(JSON.parse(stored) as RecentTranscription[]);
    } catch {
      // ignore corrupt data
    }
  }, []);

  useEffect(() => {
    if (!file) {
      setAudioPreview({
        duration: null,
        sampleRate: null,
      });
      setIsReadingAudio(false);
      return;
    }

    let cancelled = false;
    setIsReadingAudio(true);
    setAudioPreview({
      duration: null,
      sampleRate: null,
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

  // Handle escape key to close modal
  useEffect(() => {
    const handleEscape = (event: KeyboardEvent) => {
      if (event.key === "Escape" && isTranscriptDetailOpen) {
        setIsTranscriptDetailOpen(false);
      }
    };

    if (isTranscriptDetailOpen) {
      window.addEventListener("keydown", handleEscape);
      return () => window.removeEventListener("keydown", handleEscape);
    }
  }, [isTranscriptDetailOpen]);

  // Elapsed counter while transcribing
  useEffect(() => {
    if (!isWorking) {
      setElapsedSeconds(0);
      return;
    }
    processingStartRef.current = Date.now();
    const id = setInterval(() => {
      setElapsedSeconds(Math.floor((Date.now() - (processingStartRef.current ?? Date.now())) / 1000));
    }, 1000);
    return () => clearInterval(id);
  }, [isWorking]);

  const saveToRecent = useCallback((nextTranscript: TranscriptData, targetFile: File, duration: number | null) => {
    const entry: RecentTranscription = {
      id: `${Date.now()}_${Math.random().toString(36).slice(2)}`,
      fileName: formatSessionName(targetFile),
      timestamp: Date.now(),
      transcript: nextTranscript,
      duration,
      wordCount: countWords(`${nextTranscript.bengali} ${nextTranscript.english}`),
    };

    setRecentTranscriptions((prev) => {
      // Remove any existing entry with the same file name so we don't duplicate
      const deduped = prev.filter((t) => t.fileName !== entry.fileName);
      const next = [entry, ...deduped].slice(0, MAX_RECENT);
      try {
        localStorage.setItem(RECENT_STORAGE_KEY, JSON.stringify(next));
      } catch {
        // Ignore storage quota errors
      }
      return next;
    });
  }, []);

  const deleteFromRecent = useCallback((id: string) => {
    setRecentTranscriptions((prev) => {
      const next = prev.filter((t) => t.id !== id);
      try {
        localStorage.setItem(RECENT_STORAGE_KEY, JSON.stringify(next));
      } catch {
        // ignore
      }
      return next;
    });
  }, []);

  const loadFromRecent = useCallback((t: RecentTranscription) => {
    setTranscript(t.transcript);
    setFile(null);
    setAudioPreview({ duration: t.duration, sampleRate: null });
    setError("");
    setAppState("done");
    setSessionDisplayName(t.fileName);
    setIsSidePaneOpen(false);
  }, []);

  const transcribeFile = useCallback(async (targetFile: File) => {
    const runId = ++transcriptionIdRef.current;
    setError("");
    setTranscript(null);
    setAppState("uploading");

    try {
      setAppState("processing");
      const nextTranscript = await requestTranscription(targetFile);
      if (transcriptionIdRef.current !== runId) return;
      setTranscript(nextTranscript);
      setAppState("done");
      saveToRecent(nextTranscript, targetFile, audioPreviewRef.current.duration);
    } catch (reason) {
      if (transcriptionIdRef.current !== runId) return;
      setError(reason instanceof Error ? reason.message.toUpperCase() : "TRANSCRIPTION FAILED");
      setAppState("error");
    }
  }, [saveToRecent]);

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
    setSessionDisplayName(formatSessionName(nextFile));
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
    transcriptionIdRef.current++;
    setFile(null);
    setTranscript(null);
    setError("");
    setAppState("idle");
    setSessionDisplayName("Awaiting session");
    setElapsedSeconds(0);
  };

  const run = async () => {
    if (!file || isWorking) return;
    await transcribeFile(file);
  };

  const totalTranscriptWords = transcript ? countWords(`${transcript.bengali} ${transcript.english}`) : 0;

  // Parse turns for WaveformPlayer speaker colouring
  const waveformTurns = transcript
    ? parseTurns(transcript.bengali).map((t: Turn) => ({
        speaker: t.speaker,
        speakerIndex: t.speakerIndex,
        wordCount: t.wordCount,
      }))
    : [];

  return (
    <main className="h-screen overflow-hidden p-3 sm:p-4">
      {/* Side-pane toggle tab — sits just outside the shell's left edge */}
      <button
        type="button"
        onClick={() => setIsSidePaneOpen((v) => !v)}
        className={cn(
          "fixed left-3 top-1/2 z-50 -translate-y-1/2",
          "flex h-14 w-8 flex-col items-center justify-center gap-1.5 rounded-[12px]",
          "border border-[rgba(var(--atelier-ink-rgb),0.12)] backdrop-blur-[8px]",
          "transition-colors duration-200",
          isSidePaneOpen
            ? "bg-[rgba(var(--atelier-terracotta-rgb),0.12)] border-[rgba(var(--atelier-terracotta-rgb),0.22)] text-[var(--atelier-terracotta)]"
            : "bg-[rgba(255,255,255,0.72)] text-[rgba(var(--atelier-ink-rgb),0.55)] hover:bg-[rgba(255,255,255,0.9)] hover:text-[rgba(var(--atelier-ink-rgb),0.75)]",
          "shadow-[0_4px_16px_rgba(13,18,32,0.1)]",
        )}
        aria-label={isSidePaneOpen ? "Close recent sessions" : "Open recent sessions"}
      >
        <History size={14} strokeWidth={2.2} />
        {recentTranscriptions.length > 0 && !isSidePaneOpen && (
          <span className="text-[9px] font-bold leading-none tracking-tight">
            {recentTranscriptions.length > 9 ? "9+" : recentTranscriptions.length}
          </span>
        )}
      </button>

      <div className="atelier-shell relative mx-auto grid h-full w-full max-w-[1680px] gap-4 overflow-hidden rounded-[32px] p-4 sm:p-5 min-[980px]:grid-cols-[minmax(180px,0.52fr)_minmax(340px,1.14fr)_minmax(340px,1.08fr)]">
        {/* Collapsible recent transcriptions pane */}
        <RecentTranscriptionsPane
          isOpen={isSidePaneOpen}
          onClose={() => setIsSidePaneOpen(false)}
          transcriptions={recentTranscriptions}
          onSelect={loadFromRecent}
          onDelete={deleteFromRecent}
        />
        <section className="atelier-panel flex min-h-0 flex-col overflow-hidden rounded-[28px]">
          <input
            ref={inputRef}
            type="file"
            accept=".mp3,.wav,.m4a,.ogg,.flac,.webm,audio/*"
            onChange={onChange}
            className="hidden"
          />
          <div className="flex min-h-0 flex-1 flex-col gap-3 p-5 sm:p-6">
            {/* Header with Select and Clear buttons */}
            <div className="flex items-center justify-between gap-3">
              <button
                type="button"
                onClick={() => inputRef.current?.click()}
                className="inline-flex h-10 items-center gap-2 rounded-[12px] border border-[rgba(var(--atelier-ink-rgb),0.2)] bg-transparent px-4 text-sm font-semibold text-[rgba(var(--atelier-ink-rgb),0.8)] transition-[background-color,border-color,transform] duration-150 hover:border-[rgba(var(--atelier-ink-rgb),0.3)] hover:bg-[rgba(var(--atelier-ink-rgb),0.03)] active:scale-95"
              >
                <Upload size={16} strokeWidth={2.1} />
                <span>Select</span>
              </button>

              {file && (
                <button
                  type="button"
                  onClick={clear}
                  className="flex h-10 w-10 items-center justify-center rounded-full bg-[rgba(var(--atelier-ink-rgb),0.1)] text-[rgba(var(--atelier-ink-rgb),0.6)] transition-[background-color,transform] duration-150 hover:bg-[rgba(var(--atelier-ink-rgb),0.15)] active:scale-90"
                  aria-label="Clear file"
                >
                  <X size={18} strokeWidth={2} />
                </button>
              )}
            </div>


            {/* Compact file info strip */}
            {file && (
              <div className="flex items-center gap-2 rounded-[12px] border border-[rgba(var(--atelier-ink-rgb),0.07)] bg-[rgba(var(--atelier-ink-rgb),0.018)] px-3 py-2.5">
                <span className="font-mono text-[11px] font-medium text-[rgba(var(--atelier-ink-rgb),0.52)]">
                  {inferFileType(file)}
                </span>
                {(audioPreview.duration || isReadingAudio) && (
                  <>
                    <span className="text-[rgba(var(--atelier-ink-rgb),0.2)]">&middot;</span>
                    <span className="font-mono text-[11px] font-medium text-[rgba(var(--atelier-ink-rgb),0.52)]">
                      {isReadingAudio ? "—" : fmtDuration(audioPreview.duration)}
                    </span>
                  </>
                )}
                <span className="text-[rgba(var(--atelier-ink-rgb),0.2)]">&middot;</span>
                <span className="font-mono text-[11px] font-medium text-[rgba(var(--atelier-ink-rgb),0.52)]">
                  {fmtBytes(file.size)}
                </span>
              </div>
            )}

            {error && (
              <div className="atelier-enter flex items-start gap-2 rounded-[12px] border border-[rgba(var(--atelier-terracotta-rgb),0.2)] bg-[rgba(var(--atelier-terracotta-rgb),0.08)] px-3 py-2 text-[rgba(var(--atelier-ink-rgb),0.8)]">
                <AlertTriangle size={16} className="mt-0.5 shrink-0 text-[var(--atelier-terracotta)]" />
                <p className="text-xs leading-5">{error}</p>
              </div>
            )}

            {/* Transcribe / Cancel button */}
            <button
              type="button"
              onClick={isWorking ? clear : run}
              disabled={!file && !isWorking}
              className={cn(
                "h-12 w-full rounded-[12px] px-4 text-sm font-semibold transition-[background-color,transform,box-shadow] duration-200 active:scale-[0.97] active:translate-y-0",
                isWorking
                  ? "border border-[rgba(var(--atelier-ink-rgb),0.18)] bg-[rgba(var(--atelier-ink-rgb),0.05)] text-[rgba(var(--atelier-ink-rgb),0.58)] hover:bg-[rgba(var(--atelier-ink-rgb),0.09)]"
                  : "border border-[rgba(var(--atelier-terracotta-rgb),0.3)] bg-[rgba(var(--atelier-terracotta-rgb),0.08)] text-[var(--atelier-terracotta)] hover:bg-[rgba(var(--atelier-terracotta-rgb),0.14)] hover:-translate-y-0.5 hover:shadow-[0_6px_20px_rgba(207,90,67,0.18)] disabled:cursor-not-allowed disabled:opacity-40 disabled:transform-none disabled:shadow-none",
              )}
            >
              {isWorking ? "Cancel" : appState === "done" ? "Transcribe Again" : "Transcribe"}
            </button>
          </div>
        </section>

        {/* ── Middle panel: waveform player / dropzone ────────────────────── */}
        <section className="flex min-h-0 flex-col overflow-hidden">
          <div className="flex min-h-0 flex-1 flex-col gap-3 p-4 sm:p-5">

            {/* ── Empty state dropzone (idle, no file) ── */}
            {appState === "idle" && !file ? (
              <div
                className={cn(
                  "relative flex min-h-0 flex-1 cursor-pointer flex-col items-center justify-center gap-4 rounded-[24px] border-2 border-dashed p-6 text-center transition-all duration-200",
                  dragging
                    ? "border-[var(--atelier-gold)] bg-[rgba(var(--atelier-gold-rgb),0.07)] scale-[1.005]"
                    : "border-[rgba(var(--atelier-ink-rgb),0.13)] bg-[rgba(var(--atelier-ink-rgb),0.012)] hover:border-[rgba(var(--atelier-terracotta-rgb),0.35)] hover:bg-[rgba(var(--atelier-terracotta-rgb),0.025)]",
                )}
                onDrop={onDrop}
                onDragOver={(e) => { e.preventDefault(); setDragging(true); }}
                onDragLeave={() => setDragging(false)}
                onClick={() => inputRef.current?.click()}
                role="button"
                tabIndex={0}
                onKeyDown={(e) => e.key === "Enter" && inputRef.current?.click()}
              >
                <div
                  className={cn(
                    "flex h-11 w-11 items-center justify-center rounded-[14px] transition-transform duration-200",
                    "bg-[rgba(var(--atelier-terracotta-rgb),0.09)] text-[var(--atelier-terracotta)]",
                    dragging ? "scale-110" : "",
                  )}
                >
                  <Upload size={20} strokeWidth={1.8} />
                </div>
                <div>
                  <p className="text-sm font-semibold text-[rgba(var(--atelier-ink-rgb),0.78)]">
                    {dragging ? "Drop to upload" : "Drop an audio file here"}
                  </p>
                  <p className="mt-0.5 text-xs text-[rgba(var(--atelier-ink-rgb),0.44)]">
                    or click to browse
                  </p>
                </div>
                <div className="flex flex-wrap items-center justify-center gap-1.5">
                  {["MP3", "WAV", "M4A", "FLAC", "OGG"].map((fmt) => (
                    <span
                      key={fmt}
                      className="rounded-[6px] bg-[rgba(var(--atelier-ink-rgb),0.05)] px-2 py-0.5 font-mono text-[10px] font-medium text-[rgba(var(--atelier-ink-rgb),0.38)]"
                    >
                      {fmt}
                    </span>
                  ))}
                </div>
              </div>

            ) : isWorking ? (
              /* ── Processing state ── */
              <div className="relative flex min-h-0 flex-1 flex-col items-center justify-center gap-5 overflow-hidden rounded-[24px] bg-[rgba(var(--atelier-ink-rgb),0.018)]">
                {/* Animated bars — fill left-to-right based on estimated progress */}
                <div className="flex h-14 items-end justify-center gap-[3px] px-4">
                  {Array.from({ length: 28 }, (_, i) => {
                    const fillFrac = audioPreview.duration
                      ? Math.min(1, elapsedSeconds / Math.max(1, Math.round(audioPreview.duration * 0.45)))
                      : 0;
                    const isFilled = (i / 28) < fillFrac;
                    return (
                      <div
                        key={i}
                        className="w-[3px] rounded-full bg-[var(--atelier-terracotta)] transition-opacity duration-700"
                        style={{
                          height: `${20 + Math.abs(Math.sin(i * 0.6)) * 36}%`,
                          opacity: isFilled ? 0.85 : 0.18,
                          animationDelay: `${i * 45}ms`,
                          animation: isFilled ? "waveBar 1.2s ease-in-out infinite alternate" : "none",
                        }}
                      />
                    );
                  })}
                </div>

                {/* Elapsed time + estimate */}
                <div className="flex flex-col items-center gap-1">
                  <div className="flex items-baseline gap-2 tabular-nums">
                    <span className="font-mono text-2xl font-semibold tracking-tight text-[rgba(var(--atelier-ink-rgb),0.78)]">
                      {String(Math.floor(elapsedSeconds / 60)).padStart(2, "0")}:{String(elapsedSeconds % 60).padStart(2, "0")}
                    </span>
                    <span className="text-[11px] text-[rgba(var(--atelier-ink-rgb),0.36)]">elapsed</span>
                  </div>
                  {audioPreview.duration && (() => {
                    const est = Math.round(audioPreview.duration * 0.45);
                    const rem = Math.max(0, est - elapsedSeconds);
                    return (
                      <p className="text-[11px] text-[rgba(var(--atelier-ink-rgb),0.36)]">
                        {rem > 0 ? `~${rem}s remaining` : "almost done…"}
                      </p>
                    );
                  })()}
                </div>

                {/* Stage tracker with connecting lines */}
                <div className="flex items-center">
                  {(["Upload", "Transcribe", "Analyse"] as const).map((stage, i) => {
                    const stageIndex = appState === "uploading" ? 0 : 1;
                    const isDone = i < stageIndex;
                    const isActive = i === stageIndex;
                    const isLast = i === 2;
                    return (
                      <div key={stage} className="flex items-center">
                        <div className="flex flex-col items-center gap-1">
                          <div
                            className={cn(
                              "flex h-5 w-5 items-center justify-center rounded-full border text-[9px] font-bold transition-colors",
                              isActive
                                ? "animate-pulse border-[var(--atelier-terracotta)] bg-[rgba(207,90,67,0.1)] text-[var(--atelier-terracotta)]"
                                : isDone
                                  ? "border-[var(--atelier-teal)] bg-[rgba(31,126,122,0.1)] text-[var(--atelier-teal)]"
                                  : "border-[rgba(var(--atelier-ink-rgb),0.14)] text-[rgba(var(--atelier-ink-rgb),0.2)]",
                            )}
                          >
                            {isDone ? "✓" : i + 1}
                          </div>
                          <span
                            className={cn(
                              "text-[10px] font-medium transition-colors",
                              isActive
                                ? "text-[rgba(var(--atelier-ink-rgb),0.7)]"
                                : isDone
                                  ? "text-[var(--atelier-teal)]"
                                  : "text-[rgba(var(--atelier-ink-rgb),0.26)]",
                            )}
                          >
                            {stage}
                          </span>
                        </div>
                        {!isLast && (
                          <div
                            className={cn(
                              "mb-4 h-px w-8 transition-colors",
                              isDone ? "bg-[rgba(31,126,122,0.4)]" : "bg-[rgba(var(--atelier-ink-rgb),0.1)]",
                            )}
                          />
                        )}
                      </div>
                    );
                  })}
                </div>

                {/* Activity log */}
                <div className="flex flex-col items-start gap-1.5 text-[11px]">
                  <div className="flex items-center gap-1.5 text-[var(--atelier-teal)]">
                    <span>✓</span><span>File received</span>
                  </div>
                  {audioPreview.duration && (
                    <div className="flex items-center gap-1.5 text-[var(--atelier-teal)]">
                      <span>✓</span><span>Audio decoded &middot; {fmtDuration(audioPreview.duration)}</span>
                    </div>
                  )}
                  <div className="flex items-center gap-1.5 text-[rgba(var(--atelier-ink-rgb),0.45)]">
                    <span className="animate-pulse">⋯</span><span>Transcribing audio</span>
                  </div>
                </div>
                <p className="font-mono text-[9px] tracking-widest text-[rgba(var(--atelier-ink-rgb),0.22)]">
                  ESC TO CANCEL
                </p>
              </div>

            ) : hasTranscript || file ? (
              /* ── Loaded state: speaker-coloured interactive waveform ── */
              <WaveformPlayer
                file={file}
                turns={waveformTurns}
                duration={audioPreview.duration}
                className="pt-1"
              />

            ) : null}

            {/* Error banner */}
            {appState === "error" && (
              <div className="flex items-start gap-2 rounded-[12px] border border-[rgba(var(--atelier-terracotta-rgb),0.2)] bg-[rgba(var(--atelier-terracotta-rgb),0.07)] px-3 py-2.5">
                <AlertTriangle size={14} className="mt-0.5 shrink-0 text-[var(--atelier-terracotta)]" />
                <p className="text-xs leading-5 text-[rgba(var(--atelier-ink-rgb),0.75)]">{error || "Something went wrong."}</p>
              </div>
            )}
          </div>
        </section>

        {hasTranscript ? (
          <TranscriptView
            transcript={transcript}
            className="min-h-0 atelier-enter"
            onExpand={() => { setInitialTurnIndex(undefined); setIsTranscriptDetailOpen(true); }}
            onExpandToTurn={(i) => { setInitialTurnIndex(i); setIsTranscriptDetailOpen(true); }}
          />
        ) : (
          <section className="atelier-panel flex min-h-0 flex-col overflow-hidden rounded-[28px]">
            {/* Header — no status pill; title shows session name when known */}
            <div className="border-b border-[rgba(var(--atelier-ink-rgb),0.08)] px-5 pb-3 pt-5">
              <div className="atelier-kicker">Transcript</div>
              <h2 className="atelier-display mt-1 truncate text-[clamp(1.2rem,2.2vw,1.7rem)] leading-[0.96] text-[var(--atelier-ink)] opacity-50">
                {sessionDisplayName !== "Awaiting session" ? sessionDisplayName : "Ready when done"}
              </h2>
            </div>

            {/* Skeleton body — mimics the shape of the loaded TranscriptView */}
            <div className="flex min-h-0 flex-1 flex-col gap-4 overflow-hidden px-5 py-4">

              {/* Stats chips row */}
              <div className="flex items-center gap-2">
                {[56, 44, 68].map((w) => (
                  <div key={w} className="atelier-shimmer h-6 rounded-[7px]" style={{ width: `${w}px` }} />
                ))}
              </div>

              <div className="border-t border-[rgba(var(--atelier-ink-rgb),0.06)]" />

              {/* Speakers skeleton */}
              <div>
                <div className="atelier-shimmer mb-2.5 h-2.5 w-14 rounded-full" />
                <div className="flex h-5 w-full overflow-hidden rounded-full gap-[2px]">
                  <div className="atelier-shimmer h-full rounded-full" style={{ width: "58%" }} />
                  <div className="atelier-shimmer h-full rounded-full" style={{ width: "42%" }} />
                </div>
                <div className="mt-2 flex gap-4">
                  {[52, 42].map((w) => (
                    <div key={w} className="atelier-shimmer h-2.5 rounded-full" style={{ width: `${w}px` }} />
                  ))}
                </div>
              </div>

              {/* Language skeleton */}
              <div>
                <div className="atelier-shimmer mb-2.5 h-2.5 w-16 rounded-full" />
                <div className="flex h-2.5 w-full overflow-hidden rounded-full gap-[2px]">
                  <div className="atelier-shimmer h-full rounded-full" style={{ width: "63%" }} />
                  <div className="atelier-shimmer h-full rounded-full" style={{ width: "37%" }} />
                </div>
              </div>

              <div className="border-t border-[rgba(var(--atelier-ink-rgb),0.06)]" />

              {/* Conversation turn skeletons */}
              <div>
                <div className="atelier-shimmer mb-3 h-2.5 w-24 rounded-full" />
                <div className="flex flex-col gap-3.5">
                  {[0.82, 0.55, 0.70, 0.48].map((frac, i) => (
                    <div key={i} className="flex items-start gap-2.5">
                      <div className="atelier-shimmer mt-0.5 h-4 w-4 shrink-0 rounded-full" />
                      <div className="flex flex-1 flex-col gap-1.5">
                        <div className="atelier-shimmer h-2.5 rounded-full" style={{ width: `${Math.round(frac * 100)}%` }} />
                        <div className="atelier-shimmer h-2.5 rounded-full" style={{ width: `${Math.round(frac * 66)}%` }} />
                      </div>
                    </div>
                  ))}
                </div>
              </div>
            </div>
          </section>
        )}
      </div>

      {/* Transcript Detail Modal */}
      {transcript && (
        <TranscriptDetailModal
          isOpen={isTranscriptDetailOpen}
          onClose={() => setIsTranscriptDetailOpen(false)}
          transcript={transcript}
          audioUrl={file ? URL.createObjectURL(file) : undefined}
          initialTurnIndex={initialTurnIndex}
        />
      )}
    </main>
  );
}
