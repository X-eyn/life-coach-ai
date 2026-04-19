"use client";

import { useCallback, useEffect, useRef, useState, type ChangeEvent, type DragEvent } from "react";
import { AlertTriangle, History, Upload, X } from "lucide-react";
import { Persona, type PersonaState } from "@/components/persona";
import { TranscriptView } from "@/components/transcript-view";
import { TranscriptDetailModal } from "@/components/transcript-detail-modal";
import { RecentTranscriptionsPane, type RecentTranscription } from "@/components/recent-transcriptions-pane";
import { LiveWaveform } from "@/components/ui/live-waveform";
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

const STATUS: Record<AppState, string> = {
  idle: "Waiting",
  uploading: "Scanning",
  processing: "Transcribing",
  done: "Ready",
  error: "Error",
};

const STATE_COPY: Record<AppState, { description: string; note: string }> = {
  idle: {
    description: "Upload a session to activate the stage and start the transcription flow.",
    note: "The output panel is reserved for the bilingual transcript once processing finishes.",
  },
  uploading: {
    description: "The file is being read and the waveform preview is being prepared.",
    note: "Audio metadata stays visible while the backend handoff begins.",
  },
  processing: {
    description: "The backend is producing the transcript while the interface stays fully interactive.",
    note: "As soon as the payload returns, the output panel switches into transcript mode automatically.",
  },
  done: {
    description: "The transcript is ready to review, switch by language, copy, and export.",
    note: "All actions remain live inside this screen. No extra route or page transition is needed.",
  },
  error: {
    description: "The request failed, but the session surface stays intact so you can retry quickly.",
    note: "Use clear or rerun without losing the current visual context.",
  },
};

const STATE_PILL_CLASS: Record<AppState, string> = {
  idle: "border-[rgba(var(--atelier-gold-rgb),0.28)] bg-[rgba(var(--atelier-gold-rgb),0.18)] text-[rgba(var(--atelier-ink-rgb),0.82)]",
  uploading: "border-[rgba(var(--atelier-terracotta-rgb),0.24)] bg-[rgba(var(--atelier-terracotta-rgb),0.12)] text-[var(--atelier-terracotta)]",
  processing: "border-[rgba(var(--atelier-cobalt-rgb),0.22)] bg-[rgba(var(--atelier-cobalt-rgb),0.12)] text-[var(--atelier-cobalt)]",
  done: "border-[rgba(var(--atelier-teal-rgb),0.22)] bg-[rgba(var(--atelier-teal-rgb),0.12)] text-[var(--atelier-teal)]",
  error: "border-[rgba(var(--atelier-terracotta-rgb),0.24)] bg-[rgba(var(--atelier-terracotta-rgb),0.12)] text-[var(--atelier-terracotta)]",
};

const MOSAIC_TILES = [
  "left-5 top-5 h-16 w-20 rounded-[22px] bg-[rgba(var(--atelier-terracotta-rgb),0.18)]",
  "right-8 top-8 h-[72px] w-[72px] rounded-[22px] bg-[rgba(var(--atelier-cobalt-rgb),0.16)]",
  "left-8 bottom-10 h-14 w-24 rounded-[20px] bg-[rgba(var(--atelier-teal-rgb),0.16)]",
  "right-8 bottom-8 h-16 w-16 rounded-[20px] bg-[rgba(var(--atelier-gold-rgb),0.18)]",
  "left-1/2 top-8 h-12 w-12 -translate-x-1/2 rounded-[16px] bg-[rgba(var(--atelier-paper-strong-rgb),0.7)]",
  "left-6 top-1/2 h-10 w-10 -translate-y-1/2 rounded-[16px] bg-[rgba(var(--atelier-paper-strong-rgb),0.64)]",
  "right-6 top-1/2 h-10 w-14 -translate-y-1/2 rounded-[16px] bg-[rgba(var(--atelier-paper-strong-rgb),0.64)]",
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

function formatSessionName(file: File | null) {
  if (!file) return "Awaiting session";
  const stem = file.name.replace(/\.[^/.]+$/, "");
  return stem.replace(/[_-]+/g, " ").trim() || file.name;
}

function countWords(text: string) {
  return text.trim().split(/\s+/).filter(Boolean).length;
}

function generateSummary(transcript: TranscriptData, duration: number | null): { title: string; description: string } {
  const bengaliWords = countWords(transcript.bengali);
  const englishWords = countWords(transcript.english);
  const totalWords = bengaliWords + englishWords;
  
  // Extract first 200 characters of english transcript for context
  const snippetLength = 150;
  const englishSnippet = transcript.english.substring(0, snippetLength).trim();
  const hasMoreContent = transcript.english.length > snippetLength;
  
  // Generate contextual title and description
  const durationStr = duration ? ` • ${fmtDuration(duration)}` : "";
  const languageInfo = `Bilingual (Bengali & English)`;
  
  // Create a concise summary description
  const description = `${languageInfo}${durationStr} • ${totalWords.toLocaleString()} words total
  
${englishSnippet}${hasMoreContent ? "..." : ""}`;

  return {
    title: `Session Summary`,
    description: description,
  };
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

function PropertyRow({ label, value }: { label: string; value: string }) {
  return (
    <div className="grid grid-cols-[88px_1fr] gap-4 border-t border-[rgba(var(--atelier-ink-rgb),0.08)] pt-3 first:border-t-0 first:pt-0">
      <dt className="atelier-kicker text-[10px] text-[rgba(var(--atelier-ink-rgb),0.5)]">{label}</dt>
      <dd className="break-all text-sm leading-6 text-[rgba(var(--atelier-ink-rgb),0.82)]">{value}</dd>
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
  });
  const [isReadingAudio, setIsReadingAudio] = useState(false);
  const [isTranscriptDetailOpen, setIsTranscriptDetailOpen] = useState(false);
  const [isSidePaneOpen, setIsSidePaneOpen] = useState(false);
  const [recentTranscriptions, setRecentTranscriptions] = useState<RecentTranscription[]>([]);

  const inputRef = useRef<HTMLInputElement>(null);
  const audioPreviewRef = useRef<AudioPreview>({ duration: null, sampleRate: null });
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
    setIsSidePaneOpen(false);
  }, []);

  const transcribeFile = useCallback(async (targetFile: File) => {
    setError("");
    setTranscript(null);
    setAppState("uploading");

    try {
      setAppState("processing");
      const nextTranscript = await requestTranscription(targetFile);
      setTranscript(nextTranscript);
      setAppState("done");
      saveToRecent(nextTranscript, targetFile, audioPreviewRef.current.duration);
    } catch (reason) {
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

  const sessionName = formatSessionName(file);
  const totalTranscriptWords = transcript ? countWords(`${transcript.bengali} ${transcript.english}`) : 0;
  const stageCopy = STATE_COPY[appState];
  const stagePill = STATE_PILL_CLASS[appState];
  const fileLabel = file ? file.name : dragging ? "Drop the file here" : "No file loaded";

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

      <div className="atelier-shell relative mx-auto grid h-full w-full max-w-[1680px] gap-4 overflow-hidden rounded-[32px] p-4 sm:p-5 min-[980px]:grid-cols-[minmax(260px,0.82fr)_minmax(300px,0.96fr)_minmax(340px,1.08fr)]">
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

            {/* AI Persona Circle */}
            <div className="relative flex min-h-0 flex-1 items-center justify-center overflow-hidden rounded-[20px]">
              <div className="relative z-10 flex flex-col items-center gap-4">
                <div className="rounded-[24px] p-2">
                  <Persona variant="halo" state={personaState} className="size-[200px] sm:size-[220px] lg:size-[240px]" />
                </div>
              </div>
            </div>

            {/* Properties Grid */}
            <div className="rounded-[16px] bg-[rgba(var(--atelier-ink-rgb),0.02)] border border-[rgba(var(--atelier-ink-rgb),0.08)] p-4">
              <div className="text-[10px] font-semibold text-[rgba(var(--atelier-ink-rgb),0.5)] tracking-[0.08em] uppercase mb-3">Properties</div>
              <div className="grid grid-cols-2 gap-x-4 gap-y-4">
                <div>
                  <dt className="text-[12px] font-medium text-[rgba(var(--atelier-ink-rgb),0.6)]">Type</dt>
                  <dd className="mt-1 text-sm font-semibold text-[rgba(var(--atelier-ink-rgb),0.85)]">{inferFileType(file)}</dd>
                </div>
                <div>
                  <dt className="text-[12px] font-medium text-[rgba(var(--atelier-ink-rgb),0.6)]">Length</dt>
                  <dd className="mt-1 text-sm font-semibold text-[rgba(var(--atelier-ink-rgb),0.85)]">{isReadingAudio ? "Scanning" : fmtDuration(audioPreview.duration)}</dd>
                </div>
                <div>
                  <dt className="text-[12px] font-medium text-[rgba(var(--atelier-ink-rgb),0.6)]">Size</dt>
                  <dd className="mt-1 text-sm font-semibold text-[rgba(var(--atelier-ink-rgb),0.85)]">{file ? fmtBytes(file.size) : "--"}</dd>
                </div>
                <div>
                  <dt className="text-[12px] font-medium text-[rgba(var(--atelier-ink-rgb),0.6)]">Rate</dt>
                  <dd className="mt-1 text-sm font-semibold text-[rgba(var(--atelier-ink-rgb),0.85)]">{isReadingAudio ? "Scanning" : audioPreview.sampleRate ? `${audioPreview.sampleRate.toLocaleString()} Hz` : "--"}</dd>
                </div>
              </div>
            </div>

            {error && (
              <div className="atelier-enter flex items-start gap-2 rounded-[12px] border border-[rgba(var(--atelier-terracotta-rgb),0.2)] bg-[rgba(var(--atelier-terracotta-rgb),0.08)] px-3 py-2 text-[rgba(var(--atelier-ink-rgb),0.8)]">
                <AlertTriangle size={16} className="mt-0.5 shrink-0 text-[var(--atelier-terracotta)]" />
                <p className="text-xs leading-5">{error}</p>
              </div>
            )}

            {/* Transcribe Button */}
            <button
              type="button"
              onClick={run}
              disabled={!file || isWorking}
              className="h-12 w-full rounded-[12px] border border-[rgba(var(--atelier-terracotta-rgb),0.3)] bg-[rgba(var(--atelier-terracotta-rgb),0.08)] px-4 text-sm font-semibold text-[var(--atelier-terracotta)] transition-[background-color,transform,box-shadow] duration-200 hover:bg-[rgba(var(--atelier-terracotta-rgb),0.14)] hover:-translate-y-0.5 hover:shadow-[0_6px_20px_rgba(207,90,67,0.18)] active:scale-[0.97] active:translate-y-0 disabled:cursor-not-allowed disabled:opacity-40 disabled:transform-none disabled:shadow-none"
            >
              {appState === "done" ? "Transcribe Again" : isWorking ? STATUS[appState] : "Transcribe"}
            </button>
          </div>
        </section>

        <section className="flex min-h-0 flex-col overflow-hidden">
          <div className="flex min-h-0 flex-1 flex-col gap-3 p-4 sm:p-5">
            {/* Waveform visualization area */}
            <div
              className={cn(
                "relative flex min-h-0 flex-1 flex-col items-center justify-center rounded-[28px] transition-colors duration-200",
                dragging && "bg-[rgba(var(--atelier-gold-rgb),0.1)]",
              )}
              onDrop={onDrop}
              onDragOver={(event) => {
                event.preventDefault();
                setDragging(true);
              }}
              onDragLeave={() => setDragging(false)}
            >
              <LiveWaveform
                processing={isWorking || isReadingAudio}
                mode="static"
                barWidth={6}
                barHeight={12}
                barGap={3}
                barRadius={999}
                height={140}
                sensitivity={1.2}
                fadeEdges
                className="h-40 w-full text-[rgb(var(--atelier-terracotta-rgb))]"
              />
              <p className="mt-4 text-center text-sm font-medium text-[rgba(var(--atelier-ink-rgb),0.7)]">
                {fileLabel}
              </p>
            </div>

            <div className="atelier-card rounded-[18px] p-3">
              <div className="atelier-kicker text-[9px]">Session</div>
              <div className="mt-1 text-sm font-semibold text-[var(--atelier-ink)]">{sessionName}</div>
              {hasTranscript ? (
                <div className="mt-3 space-y-2">
                  {(() => {
                    const summary = generateSummary(transcript, audioPreview.duration);
                    return (
                      <>
                        <div className="text-xs font-semibold text-[rgba(var(--atelier-ink-rgb),0.7)] uppercase tracking-[0.05em]">
                          {summary.title}
                        </div>
                        <p className="text-xs leading-5 text-[rgba(var(--atelier-ink-rgb),0.68)] whitespace-pre-wrap">
                          {summary.description}
                        </p>
                      </>
                    );
                  })()}
                </div>
              ) : (
                <p className="mt-1 text-xs leading-5 text-[rgba(var(--atelier-ink-rgb),0.68)]">
                  Output ready when backend responds.
                </p>
              )}
            </div>
          </div>
        </section>

        {hasTranscript ? (
          <TranscriptView
            transcript={transcript}
            className="min-h-0 atelier-enter"
            onExpand={() => setIsTranscriptDetailOpen(true)}
          />
        ) : (
          <section className="atelier-panel flex min-h-0 flex-col overflow-hidden rounded-[28px]">
            <div className="border-b border-[rgba(var(--atelier-ink-rgb),0.08)] px-4 py-4 sm:px-5">
              <div className="atelier-kicker">Transcript</div>
              <div className="mt-2 flex items-center justify-between gap-3">
                <h2 className="atelier-display text-[clamp(1.9rem,3vw,2.8rem)] leading-[0.92] text-[var(--atelier-ink)]">
                  Output
                </h2>
                <div className={cn("rounded-full border px-4 py-2 text-[11px] font-semibold tracking-[0.16em]", stagePill)}>
                  {STATUS[appState].toUpperCase()}
                </div>
              </div>
            </div>

            <div className="relative flex min-h-0 flex-1 items-center justify-center overflow-hidden p-5">
              <div className="atelier-wave-grid absolute inset-0 opacity-35" />
              <div className="absolute left-6 top-6 h-20 w-20 rounded-[24px] bg-[rgba(var(--atelier-terracotta-rgb),0.16)]" />
              <div className="absolute right-6 top-10 h-16 w-24 rounded-[22px] bg-[rgba(var(--atelier-cobalt-rgb),0.14)]" />
              <div className="absolute bottom-8 left-8 h-14 w-24 rounded-[20px] bg-[rgba(var(--atelier-teal-rgb),0.14)]" />
              <div className="absolute bottom-8 right-8 h-16 w-16 rounded-[20px] bg-[rgba(var(--atelier-gold-rgb),0.18)]" />

              <div className="relative z-10 max-w-[24rem] rounded-[28px] border border-[rgba(var(--atelier-ink-rgb),0.1)] bg-[rgba(255,255,255,0.62)] p-6 text-center shadow-[0_22px_56px_rgba(41,25,18,0.12)]">
                <div className="atelier-kicker">Status</div>
                <div className="atelier-display mt-4 text-[1.95rem] leading-[0.92] text-[var(--atelier-ink)]">
                  {appState === "error"
                    ? "Retry the session."
                    : isWorking
                      ? "Composing transcript."
                      : "Waiting for audio."}
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
        />
      )}
    </main>
  );
}
