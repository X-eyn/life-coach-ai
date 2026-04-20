"use client";

import { useCallback, useEffect, useRef, useState, type DragEvent } from "react";
import { AlertTriangle, Upload } from "lucide-react";
import { TranscriptView, parseTurns, type Turn } from "@/components/transcript-view";
import { TranscriptDetailModal } from "@/components/transcript-detail-modal";
import { LibraryPanel, type LibrarySession } from "@/components/library-panel";
import { WaveformPlayer } from "@/components/ui/waveform-player";
import { decodeWaveformPeaks, MINI_PEAKS_COUNT } from "@/lib/audio-utils";
import { cn } from "@/lib/utils";

const LIBRARY_STORAGE_KEY = "atelier_library";
const MAX_LIBRARY_SESSIONS = 50;

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
  const [librarySessions, setLibrarySessions] = useState<LibrarySession[]>([]);
  const [activeSessionId, setActiveSessionId] = useState<string | null>(null);
  const [sessionDisplayName, setSessionDisplayName] = useState<string>("Awaiting session");
  const [elapsedSeconds, setElapsedSeconds] = useState(0);

  const inputRef = useRef<HTMLInputElement>(null);
  const waveformSeekRef = useRef<{ seekTo: (s: number) => void } | null>(null);
  const audioPreviewRef = useRef<AudioPreview>({ duration: null, sampleRate: null });
  const processingStartRef = useRef<number | null>(null);
  const transcriptionIdRef = useRef(0);
  const isWorking = appState === "uploading" || appState === "processing";
  const hasTranscript = transcript !== null;

  // Keep a ref to the latest audioPreview so transcribeFile can read it without a stale closure
  useEffect(() => {
    audioPreviewRef.current = audioPreview;
  }, [audioPreview]);

  // Load library sessions from localStorage on mount
  useEffect(() => {
    try {
      const stored = localStorage.getItem(LIBRARY_STORAGE_KEY);
      if (stored) setLibrarySessions(JSON.parse(stored) as LibrarySession[]);
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

  const saveToLibrary = useCallback(async (nextTranscript: TranscriptData, targetFile: File, duration: number | null) => {
    // Derive speaker data from parsed turns
    const turns = parseTurns(nextTranscript.bengali);
    const speakerWordCounts = new Map<number, number>();
    for (const turn of turns) {
      speakerWordCounts.set(turn.speakerIndex, (speakerWordCounts.get(turn.speakerIndex) ?? 0) + turn.wordCount);
    }
    const speakers = Array.from(speakerWordCounts.entries())
      .sort(([a], [b]) => a - b)
      .map(([id, wordCount]) => ({ id, wordCount }));

    // Compute language split
    const bengaliWords = nextTranscript.bengali.trim().split(/\s+/).filter(Boolean);
    const banglaCount = bengaliWords.filter((w) => /[\u0980-\u09FF]/.test(w)).length;
    const bnPct = bengaliWords.length ? Math.round((banglaCount / bengaliWords.length) * 100) : 50;

    // Decode mini waveform peaks — runs after UI is already updated
    const waveformPeaks = await decodeWaveformPeaks(targetFile, MINI_PEAKS_COUNT).catch(() => [] as number[]);

    const entry: LibrarySession = {
      id: `${Date.now()}_${Math.random().toString(36).slice(2)}`,
      name: formatSessionName(targetFile),
      createdAt: Date.now(),
      transcript: nextTranscript,
      duration,
      wordCount: countWords(`${nextTranscript.bengali} ${nextTranscript.english}`),
      waveformPeaks,
      speakers,
      languageSplit: { bn: bnPct, en: 100 - bnPct },
    };

    setActiveSessionId(entry.id);
    setLibrarySessions((prev) => {
      const deduped = prev.filter((s) => s.name !== entry.name);
      const next = [entry, ...deduped].slice(0, MAX_LIBRARY_SESSIONS);
      try {
        localStorage.setItem(LIBRARY_STORAGE_KEY, JSON.stringify(next));
      } catch {
        // Ignore storage quota errors
      }
      return next;
    });
  }, []);

  const deleteFromLibrary = useCallback((id: string) => {
    setLibrarySessions((prev) => {
      const next = prev.filter((s) => s.id !== id);
      try {
        localStorage.setItem(LIBRARY_STORAGE_KEY, JSON.stringify(next));
      } catch {
        // ignore
      }
      return next;
    });
    setActiveSessionId((prev) => (prev === id ? null : prev));
  }, []);

  const renameInLibrary = useCallback((id: string, name: string) => {
    setLibrarySessions((prev) => {
      const next = prev.map((s) => (s.id === id ? { ...s, name } : s));
      try {
        localStorage.setItem(LIBRARY_STORAGE_KEY, JSON.stringify(next));
      } catch {
        // ignore
      }
      return next;
    });
  }, []);

  const loadFromLibrary = useCallback((session: LibrarySession) => {
    setTranscript(session.transcript);
    setFile(null);
    setAudioPreview({ duration: session.duration, sampleRate: null });
    setError("");
    setAppState("done");
    setSessionDisplayName(session.name);
    setActiveSessionId(session.id);
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
      void saveToLibrary(nextTranscript, targetFile, audioPreviewRef.current.duration);
    } catch (reason) {
      if (transcriptionIdRef.current !== runId) return;
      setError(reason instanceof Error ? reason.message.toUpperCase() : "TRANSCRIPTION FAILED");
      setAppState("error");
    }
  }, [saveToLibrary]);

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
    setActiveSessionId(null);
    setAppState("idle");
    setSessionDisplayName(formatSessionName(nextFile));
    void transcribeFile(nextFile);
  }, [transcribeFile]);

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
    setActiveSessionId(null);
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
      <div className="atelier-shell relative mx-auto grid h-full w-full max-w-[1680px] gap-4 overflow-hidden rounded-[32px] p-4 sm:p-5 min-[980px]:grid-cols-[320px_minmax(340px,1fr)_minmax(340px,1fr)]">
        <LibraryPanel
          file={file}
          appState={appState}
          audioPreview={audioPreview}
          isReadingAudio={isReadingAudio}
          elapsedSeconds={elapsedSeconds}
          error={error}
          activeSessionId={activeSessionId}
          sessions={librarySessions}
          onClear={clear}
          onTranscribeAgain={run}
          onSelectSession={loadFromLibrary}
          onDeleteSession={deleteFromLibrary}
          onRenameSession={renameInLibrary}
        />

        {/* ── Middle panel: waveform player / dropzone ────────────────────── */}
        <section className="flex min-h-0 flex-col overflow-hidden">
          {/* Hidden file input — owned by the middle panel */}
          <input
            ref={inputRef}
            type="file"
            accept=".mp3,.wav,.m4a,.ogg,.flac,.webm,audio/*"
            onChange={(e) => { acceptFile(e.target.files?.[0] ?? null); e.target.value = ""; }}
            className="hidden"
          />
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
                onClick={() => inputRef.current?.click()}
                onDrop={onDrop}
                onDragOver={(e) => { e.preventDefault(); setDragging(true); }}
                onDragLeave={() => setDragging(false)}
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
                <button
                  type="button"
                  onClick={(e) => {
                    e.stopPropagation();
                    fetch("/sample.mp3")
                      .then((r) => r.blob())
                      .then((b) => acceptFile(new File([b], "sample.mp3", { type: "audio/mpeg" })))
                      .catch(() => inputRef.current?.click());
                  }}
                  className="text-[11px] text-[rgba(var(--atelier-ink-rgb),0.38)] underline-offset-2 transition-colors hover:text-[rgba(var(--atelier-ink-rgb),0.6)] hover:underline"
                >
                  Try with sample
                </button>
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
                seekRef={waveformSeekRef}
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
            audioDuration={audioPreview.duration ?? undefined}
            onJumpToTime={(t) => { waveformSeekRef.current?.seekTo(t); }}
            onExpand={() => { setInitialTurnIndex(undefined); setIsTranscriptDetailOpen(true); }}
            onExpandToTurn={(i) => { setInitialTurnIndex(i); setIsTranscriptDetailOpen(true); }}
          />
        ) : (
          <section className="atelier-panel flex min-h-0 flex-col overflow-hidden rounded-[28px]">
            {/* Eyebrow only — skeleton speaks for itself */}
            <div className="border-b border-[rgba(var(--atelier-ink-rgb),0.08)] px-5 pb-3 pt-5">
              <div className="atelier-kicker">Transcript</div>
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
