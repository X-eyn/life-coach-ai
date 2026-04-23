"use client";

import React, {
  type ChangeEvent,
  type FormEvent,
  type RefObject,
  useCallback,
  useEffect,
  useMemo,
  useRef,
  useState,
} from "react";
import {
  ArrowRight,
  ArrowLeft,
  Search,
  Moon,
  Sun,
  ChevronDown,
  ChevronRight,
  LayoutDashboard,
  FileText,
  Users,
  BookOpen,
  Trash2,
  Crown,
  Plus,
  Share2,
  Download,
  MoreHorizontal,
  MoreVertical,
  Play,
  Pause,
  RotateCcw,
  RotateCw,
  Hash,
  Zap,
  Copy,
  Pencil,
  PencilLine,
  Star,
  SlidersHorizontal,
  Maximize2,
  Wand2,
  Gauge,
  X,
  Check,
  Loader2,
  Upload,
  LogOut,
  Settings,
} from "lucide-react";
import { cn } from "@/lib/utils";
import { decodeWaveformPeaks, downsamplePeaks } from "@/lib/audio-utils";
import {
  EVAL_KEY,
  type Highlight,
  type LibrarySession,
  type Note,
  type Topic,
  type Turn,
  extractTopics,
  fmtDuration,
  formatSessionName,
  langSplit,
  loadHighlights,
  loadNotes,
  loadSessions,
  parseTurns,
  primaryLanguage,
  quickSummary,
  removeSession,
  renameSession as renameInList,
  saveHighlights,
  saveNotes,
  saveSessions,
  speakerShares,
  timeAgo,
  upsertSession,
} from "@/lib/bacbon";
import DashboardView from "@/components/dashboard-view";

/* Constants */
const BRAND = "#EA580C";
const TEAL = "#0D9488";
const PURPLE = "#8B5CF6";
const GRAY_BAR = "#E5E7EB";
const SPEAKER_COLORS = [BRAND, TEAL, "#3B82F6", "#F59E0B"];
const PLAYBACK_RATES = [0.5, 0.75, 1, 1.25, 1.5, 2] as const;
const USER_EMAIL = "zanium.ahmed@gmail.com";

/* ─────────────────────────────────────────────────────────────────────────
   Shared context types
   ───────────────────────────────────────────────────────────────────────── */

type Toast = { id: number; text: string; tone: "ok" | "err" | "info" };
type ViewFilter = "dashboard" | "my-transcripts" | "shared" | "library" | "trash";

/* ─────────────────────────────────────────────────────────────────────────
   Demo fallback — shown when no sessions exist yet
   ───────────────────────────────────────────────────────────────────────── */

const DEMO_BENGALI = [
  "**Speaker 1:** Thanks for joining us today. To start off, can you tell us a bit about your experience with our product?",
  "**Speaker 2:** Absolutely. Overall, I've been really impressed with how intuitive and easy to use the product is. It has definitely improved our team's productivity.",
  "**Speaker 1:** That's great to hear! Are there any specific features that you find most valuable?",
  "**Speaker 2:** The real-time collaboration and the reporting tools are game changers. They save us a lot of time every week.",
  "**Speaker 1:** Wonderful. Is there anything you think we could improve, or features you'd like to see added?",
  "**Speaker 2:** More integrations with tools like Notion and Linear would be huge. And a polished mobile app experience is at the top of my wishlist.",
].join("\n\n");

const DEMO_SESSION: LibrarySession = {
  id: "__demo__customer-interview",
  name: "Customer Interview",
  createdAt: Date.now() - 60 * 60 * 1000,
  duration: 849,
  wordCount: 119,
  transcript: { bengali: DEMO_BENGALI, english: DEMO_BENGALI },
  waveformPeaks: [],
  fullWaveformPeaks: [],
  fullBarSpeakers: [],
  speakers: [
    { id: 0, wordCount: 73 },
    { id: 1, wordCount: 46 },
  ],
  languageSplit: { bn: 0, en: 100 },
};

/* ─────────────────────────────────────────────────────────────────────────
   Audio helper: computes turn -> time offsets using approximate
   word-per-second pacing derived from the transcript + audio duration.
   ───────────────────────────────────────────────────────────────────────── */

function turnTimings(turns: Turn[], duration: number | null): number[] {
  if (!duration || duration <= 0 || turns.length === 0) {
    // Fall back to even spacing
    return turns.map((_, i) => (i / Math.max(1, turns.length)) * (duration ?? 0));
  }
  const totalWords = turns.reduce((s, t) => s + t.wordCount, 0) || 1;
  let cum = 0;
  return turns.map((t) => {
    const start = (cum / totalWords) * duration;
    cum += t.wordCount;
    return start;
  });
}

/* ─────────────────────────────────────────────────────────────────────────
   Page
   ───────────────────────────────────────────────────────────────────────── */

export default function HomePage() {
  // ── Library state ──
  const [sessions, setSessions] = useState<LibrarySession[]>([]);
  const [activeSessionId, setActiveSessionId] = useState<string | null>(null);
  const [trashedSessions, setTrashedSessions] = useState<LibrarySession[]>([]);

  // Audio object URL map: sessionId -> blob URL (only for freshly uploaded files)
  const audioUrls = useRef<Map<string, string>>(new Map());

  // ── Upload state ──
  const [uploadState, setUploadState] = useState<"idle" | "uploading" | "processing" | "done" | "error">(
    "idle",
  );
  const [uploadError, setUploadError] = useState<string>("");
  const [uploadFileName, setUploadFileName] = useState<string>("");
  const [uploadProgress, setUploadProgress] = useState<number>(0);
  const uploadStartRef = useRef<number>(0);

  // ── UI state ──
  const [activeView, setActiveView] = useState<ViewFilter>("my-transcripts");
  const [activeTab, setActiveTab] = useState<"transcript" | "speakers" | "notes" | "highlights">(
    "transcript",
  );
  const [theme, setTheme] = useState<"light" | "dark">("light");
  const [globalSearch, setGlobalSearch] = useState<string>("");
  const [transcriptSearch, setTranscriptSearch] = useState<string>("");
  const [renamingTitle, setRenamingTitle] = useState<boolean>(false);
  const [titleDraft, setTitleDraft] = useState<string>("");
  const [profileOpen, setProfileOpen] = useState<boolean>(false);
  const [moreOpen, setMoreOpen] = useState<boolean>(false);
  const [summaryOpen, setSummaryOpen] = useState<boolean>(false);
  const [allTopicsOpen, setAllTopicsOpen] = useState<boolean>(false);
  const [speakerFilter, setSpeakerFilter] = useState<Set<number>>(new Set());
  const [filterMenuOpen, setFilterMenuOpen] = useState<boolean>(false);
  const [expandedTranscript, setExpandedTranscript] = useState<boolean>(false);
  const [transcriptLang, setTranscriptLang] = useState<"bn" | "en">("bn");

  // ── Audio playback state ──
  const [isPlaying, setIsPlaying] = useState<boolean>(false);
  const [currentTime, setCurrentTime] = useState<number>(0);
  const [playbackRate, setPlaybackRate] = useState<number>(1);
  const audioRef = useRef<HTMLAudioElement | null>(null);

  // ── Notes & highlights for active session ──
  const [notes, setNotes] = useState<Note[]>([]);
  const [highlights, setHighlights] = useState<Highlight[]>([]);
  const [noteDraft, setNoteDraft] = useState<string>("");
  const [notesDrawerOpen, setNotesDrawerOpen] = useState<boolean>(false);

  // ── Toasts ──
  const [toasts, setToasts] = useState<Toast[]>([]);
  const toastIdRef = useRef<number>(0);
  const pushToast = useCallback((text: string, tone: "ok" | "err" | "info" = "ok") => {
    const id = ++toastIdRef.current;
    setToasts((t) => [...t, { id, text, tone }]);
    setTimeout(() => setToasts((t) => t.filter((x) => x.id !== id)), 3200);
  }, []);

  // ── Refs ──
  const searchRef = useRef<HTMLInputElement>(null);
  const fileInputRef = useRef<HTMLInputElement>(null);
  const titleInputRef = useRef<HTMLInputElement>(null);

  // ── Load library + theme on mount ──
  useEffect(() => {
    const stored = loadSessions();
    setSessions(stored);
    if (stored.length > 0) setActiveSessionId(stored[0].id);

    try {
      if (localStorage.getItem("bacbon_theme") === "dark") {
        setTheme("dark");
        document.documentElement.classList.add("dark");
      }
    } catch {}
  }, []);

  // ── Apply theme ──
  useEffect(() => {
    try {
      if (theme === "dark") {
        document.documentElement.classList.add("dark");
        localStorage.setItem("bacbon_theme", "dark");
      } else {
        document.documentElement.classList.remove("dark");
        localStorage.setItem("bacbon_theme", "light");
      }
    } catch {}
  }, [theme]);

  // ── Load notes/highlights when active session changes ──
  useEffect(() => {
    if (!activeSessionId) {
      setNotes([]);
      setHighlights([]);
      return;
    }
    setNotes(loadNotes(activeSessionId));
    setHighlights(loadHighlights(activeSessionId));
  }, [activeSessionId]);

  // ── Resolve active session (falls back to demo) ──
  const activeSession: LibrarySession = useMemo(() => {
    if (activeSessionId) {
      const hit = sessions.find((s) => s.id === activeSessionId);
      if (hit) return hit;
    }
    return sessions[0] ?? DEMO_SESSION;
  }, [sessions, activeSessionId]);

  const isDemo = activeSession.id === DEMO_SESSION.id;

  // ── Derived: turns, topics, speaker shares ──
  // ── Derived: turns (always Bengali — used for speaker analysis / highlights)
  const turns = useMemo(
    () => parseTurns(activeSession.transcript.bengali || activeSession.transcript.english),
    [activeSession],
  );

  // ── Display turns — follow the active language toggle ──
  const displayTurns = useMemo(() => {
    const src =
      transcriptLang === "en" && activeSession.transcript.english
        ? activeSession.transcript.english
        : activeSession.transcript.bengali || activeSession.transcript.english;
    return parseTurns(src);
  }, [activeSession, transcriptLang]);

  const timings = useMemo(
    () => turnTimings(turns, activeSession.duration),
    [turns, activeSession.duration],
  );

  const topics = useMemo(
    () => extractTopics(activeSession.transcript.english || activeSession.transcript.bengali, 5),
    [activeSession],
  );

  const allTopics = useMemo(
    () => extractTopics(activeSession.transcript.english || activeSession.transcript.bengali, 20),
    [activeSession],
  );

  const sharesData = useMemo(() => {
    const s = speakerShares(turns);
    return s.map((x, i) => ({ ...x, color: SPEAKER_COLORS[i % SPEAKER_COLORS.length] }));
  }, [turns]);

  const language = useMemo(() => {
    const split = activeSession.languageSplit ?? langSplit(activeSession.transcript.bengali);
    return primaryLanguage(split);
  }, [activeSession]);

  // ── Filtered recent list (global search) ──
  const recentList = useMemo(() => {
    const list = sessions.length > 0 ? sessions : [];
    const q = globalSearch.trim().toLowerCase();
    if (!q) return list;
    return list.filter((s) =>
      s.name.toLowerCase().includes(q) ||
      (s.transcript.english ?? "").toLowerCase().includes(q),
    );
  }, [sessions, globalSearch]);

  // ── Visible recent in sidebar (cap to 8) ──
  const sidebarRecent = recentList.slice(0, 8);

  // ── Filtered transcript (per-panel search + speaker filter) ──
  const visibleTurns = useMemo(() => {
    const q = transcriptSearch.trim().toLowerCase();
    return displayTurns
      .map((t, idx) => ({ t, idx }))
      .filter(({ t }) => {
        if (speakerFilter.size > 0 && !speakerFilter.has(t.speakerIndex)) return false;
        if (!q) return true;
        return t.text.toLowerCase().includes(q);
      });
  }, [displayTurns, transcriptSearch, speakerFilter]);

  // ── Handle global ⌘K ──
  useEffect(() => {
    const onKey = (e: KeyboardEvent) => {
      if ((e.metaKey || e.ctrlKey) && e.key.toLowerCase() === "k") {
        e.preventDefault();
        searchRef.current?.focus();
      } else if (e.key === "Escape") {
        setProfileOpen(false);
        setMoreOpen(false);
        setFilterMenuOpen(false);
        setAllTopicsOpen(false);
        setSummaryOpen(false);
        setExpandedTranscript(false);
      } else if (e.key === " " && document.activeElement?.tagName !== "INPUT" && document.activeElement?.tagName !== "TEXTAREA") {
        // Space toggles play/pause when not in a text field
        const a = audioRef.current;
        if (a && a.src) {
          e.preventDefault();
          if (a.paused) void a.play(); else a.pause();
        }
      }
    };
    window.addEventListener("keydown", onKey);
    return () => window.removeEventListener("keydown", onKey);
  }, []);

  // ── Focus title input when renaming begins ──
  useEffect(() => {
    if (renamingTitle) titleInputRef.current?.focus();
  }, [renamingTitle]);

  // ── Audio element: sync playback rate ──
  useEffect(() => {
    if (audioRef.current) audioRef.current.playbackRate = playbackRate;
  }, [playbackRate]);

  // ── Audio element: swap source when active session changes ──
  useEffect(() => {
    const a = audioRef.current;
    if (!a) return;
    const url = activeSessionId ? audioUrls.current.get(activeSessionId) ?? "" : "";
    if (url && a.src !== url) {
      a.src = url;
      setCurrentTime(0);
      setIsPlaying(false);
    } else if (!url) {
      a.removeAttribute("src");
      a.load();
      setCurrentTime(0);
      setIsPlaying(false);
    }
  }, [activeSessionId]);

  // ── Transcription flow ──
  const acceptFile = useCallback(
    async (file: File) => {
      if (!/\.(mp3|wav|m4a|ogg|flac|webm)$/i.test(file.name)) {
        setUploadError("Unsupported audio format. Try MP3, WAV, M4A, OGG, FLAC, or WEBM.");
        setUploadState("error");
        pushToast("Unsupported audio format", "err");
        return;
      }

      setUploadFileName(file.name);
      setUploadState("uploading");
      setUploadError("");
      setUploadProgress(0);
      uploadStartRef.current = Date.now();

      // Simulated progress advances toward an asymptote until the real response arrives.
      const progressTimer = setInterval(() => {
        setUploadProgress((p) => Math.min(90, p + (90 - p) * 0.08));
      }, 250);

      try {
        setUploadState("processing");
        const formData = new FormData();
        formData.append("file", file);

        const response = await fetch("/api/transcribe", { method: "POST", body: formData });
        if (!response.ok) {
          const body = await response.json().catch(() => ({}));
          throw new Error(body?.error ?? `HTTP ${response.status}`);
        }
        const data = (await response.json()) as { transcript?: { bengali?: string; english?: string } };
        const bengali = data.transcript?.bengali ?? "";
        const english = data.transcript?.english ?? "";
        if (!bengali && !english) throw new Error("Empty transcript returned");

        // Decode duration & waveform in parallel
        const audio = document.createElement("audio");
        audio.src = URL.createObjectURL(file);
        const duration = await new Promise<number | null>((resolve) => {
          audio.addEventListener("loadedmetadata", () => resolve(isFinite(audio.duration) ? audio.duration : null));
          audio.addEventListener("error", () => resolve(null));
          setTimeout(() => resolve(null), 4000);
        });

        const fullPeaks: number[] = await decodeWaveformPeaks(file, 600).catch(() => [] as number[]);
        const miniPeaks = fullPeaks.length ? downsamplePeaks(fullPeaks, 30) : [];

        // Derive per-bar speaker indices so the waveform is coloured by turn
        const derivedTurns = parseTurns(bengali || english);
        const totalWords = derivedTurns.reduce((s, t) => s + t.wordCount, 0) || 1;
        let cum = 0;
        const turnSegs = derivedTurns.map((t) => {
          const start = cum / totalWords;
          cum += t.wordCount;
          return { start, end: cum / totalWords, speakerIndex: t.speakerIndex };
        });
        const fullBarSpeakers = fullPeaks.map((_, i) => {
          const p = i / Math.max(1, fullPeaks.length);
          const seg = turnSegs.find((s) => p >= s.start && p < s.end) ?? turnSegs[turnSegs.length - 1];
          return seg?.speakerIndex ?? 0;
        });

        const wordCounts = new Map<number, number>();
        for (const t of derivedTurns) {
          wordCounts.set(t.speakerIndex, (wordCounts.get(t.speakerIndex) ?? 0) + t.wordCount);
        }

        const entry: LibrarySession = {
          id: `${Date.now()}_${Math.random().toString(36).slice(2, 8)}`,
          name: formatSessionName(file),
          createdAt: Date.now(),
          duration,
          wordCount: totalWords,
          transcript: { bengali, english },
          waveformPeaks: miniPeaks,
          fullWaveformPeaks: fullPeaks,
          fullBarSpeakers,
          speakers: [...wordCounts.entries()].sort(([a], [b]) => a - b).map(([id, c]) => ({ id, wordCount: c })),
          languageSplit: langSplit(bengali || english),
        };

        // Keep the audio URL for playback (session lifetime)
        audioUrls.current.set(entry.id, audio.src);

        setSessions((prev) => {
          const next = upsertSession(prev, entry);
          saveSessions(next);
          return next;
        });
        setActiveSessionId(entry.id);
        setUploadProgress(100);
        setUploadState("done");
        pushToast(`Transcribed "${entry.name}"`, "ok");
      } catch (err) {
        setUploadError(err instanceof Error ? err.message : "Transcription failed");
        setUploadState("error");
        pushToast(err instanceof Error ? err.message : "Transcription failed", "err");
      } finally {
        clearInterval(progressTimer);
        setTimeout(() => setUploadState("idle"), 900);
      }
    },
    [pushToast],
  );

  const onFileChange = (e: ChangeEvent<HTMLInputElement>) => {
    const f = e.target.files?.[0];
    if (f) void acceptFile(f);
    e.target.value = "";
  };

  const onOpenFilePicker = () => fileInputRef.current?.click();

  // ── Session actions ──
  const commitRename = (name: string) => {
    const trimmed = name.trim();
    if (!trimmed || isDemo) {
      setRenamingTitle(false);
      return;
    }
    setSessions((prev) => {
      const next = renameInList(prev, activeSession.id, trimmed);
      saveSessions(next);
      return next;
    });
    setRenamingTitle(false);
    pushToast("Renamed", "ok");
  };

  const deleteActive = () => {
    if (isDemo) {
      pushToast("Cannot delete the demo session", "info");
      return;
    }
    const doomed = activeSession;
    // Compute next synchronously so no side effects live inside the updater.
    // React Strict Mode runs updater functions twice — any setState call inside
    // an updater fires twice, which was the root cause of duplicate trash entries.
    const next = removeSession(sessions, doomed.id);
    saveSessions(next);
    setSessions(next);
    setActiveSessionId(next[0]?.id ?? null);
    setTrashedSessions((prev) => [doomed, ...prev.filter((x) => x.id !== doomed.id)]);
  };

  const downloadDocx = async () => {
    try {
      pushToast("Preparing download…", "info");
      const response = await fetch("/api/download-word", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify(activeSession.transcript),
      });
      if (!response.ok) throw new Error(`HTTP ${response.status}`);
      const blob = await response.blob();
      const url = URL.createObjectURL(blob);
      const a = document.createElement("a");
      a.href = url;
      a.download = `${activeSession.name}.docx`;
      document.body.appendChild(a);
      a.click();
      a.remove();
      URL.revokeObjectURL(url);
      pushToast("Downloaded", "ok");
    } catch (err) {
      pushToast(err instanceof Error ? err.message : "Download failed", "err");
    }
  };

  const shareLink = async () => {
    const url = `${typeof window !== "undefined" ? window.location.origin : ""}/?s=${encodeURIComponent(activeSession.id)}`;
    try {
      if (navigator.share) {
        await navigator.share({ title: activeSession.name, url });
      } else {
        await navigator.clipboard.writeText(url);
        pushToast("Link copied to clipboard", "ok");
      }
    } catch {
      pushToast("Share cancelled", "info");
    }
  };

  const copyTranscript = async () => {
    try {
      const text = activeSession.transcript.english || activeSession.transcript.bengali;
      await navigator.clipboard.writeText(text);
      pushToast("Transcript copied", "ok");
    } catch {
      pushToast("Copy failed", "err");
    }
  };

  // ── Playback ──
  const togglePlay = useCallback(() => {
    const a = audioRef.current;
    if (!a || !a.src) {
      if (isDemo) pushToast("Upload audio to play", "info");
      else pushToast("Audio file not in session — re-upload to play", "info");
      return;
    }
    if (a.paused) void a.play();
    else a.pause();
  }, [isDemo, pushToast]);

  const seekBy = (delta: number) => {
    const a = audioRef.current;
    if (!a || !a.src) return;
    a.currentTime = Math.max(0, Math.min((a.duration || 0), a.currentTime + delta));
  };

  const seekTo = (seconds: number) => {
    const a = audioRef.current;
    if (!a || !a.src) return;
    a.currentTime = Math.max(0, Math.min(a.duration || 0, seconds));
  };

  const cyclePlaybackRate = () => {
    const i = PLAYBACK_RATES.findIndex((r) => r === playbackRate);
    const next = PLAYBACK_RATES[(i + 1) % PLAYBACK_RATES.length];
    setPlaybackRate(next);
    pushToast(`Speed ${next}×`, "info");
  };

  // ── Notes & highlights ──
  const addNote = () => {
    const text = noteDraft.trim();
    if (!text || isDemo) {
      if (isDemo) pushToast("Upload a session to add notes", "info");
      return;
    }
    const note: Note = { id: `${Date.now()}`, text, createdAt: Date.now() };
    const next = [note, ...notes];
    setNotes(next);
    saveNotes(activeSession.id, next);
    setNoteDraft("");
    setActiveTab("notes");
    pushToast("Note added", "ok");
  };

  const deleteNote = (id: string) => {
    const next = notes.filter((n) => n.id !== id);
    setNotes(next);
    saveNotes(activeSession.id, next);
  };

  const createHighlight = () => {
    if (isDemo) {
      pushToast("Upload a session to add highlights", "info");
      return;
    }
    const sel = window.getSelection();
    const text = sel ? sel.toString().trim() : "";
    if (!text) {
      pushToast("Select text in the transcript first", "info");
      return;
    }
    // Find which turn contains the selection
    const turnIndex = turns.findIndex((t) => t.text.includes(text));
    const h: Highlight = {
      id: `${Date.now()}`,
      turnIndex: turnIndex >= 0 ? turnIndex : 0,
      text,
      createdAt: Date.now(),
    };
    const next = [h, ...highlights];
    setHighlights(next);
    saveHighlights(activeSession.id, next);
    sel?.removeAllRanges();
    pushToast("Highlight saved", "ok");
    setActiveTab("highlights");
  };

  const deleteHighlight = (id: string) => {
    const next = highlights.filter((h) => h.id !== id);
    setHighlights(next);
    saveHighlights(activeSession.id, next);
  };

  // ── AI Summary: load cached; on open, if none, fetch evaluation ──
  const [summary, setSummary] = useState<string>("");
  const [evaluation, setEvaluation] = useState<{
    overall_score?: number;
    summary?: string;
    categories?: Record<string, { score: number; feedback: string }>;
    recommendations?: string[];
  } | null>(null);
  const [evaluating, setEvaluating] = useState<boolean>(false);

  useEffect(() => {
    // Quick heuristic summary immediately
    setSummary(quickSummary(activeSession.transcript, turns));
    // Try to load cached evaluation
    try {
      const raw = localStorage.getItem(EVAL_KEY(activeSession.id));
      setEvaluation(raw ? JSON.parse(raw) : null);
    } catch {
      setEvaluation(null);
    }
  }, [activeSession.id, activeSession.transcript, turns]);

  const runEvaluation = useCallback(async () => {
    if (evaluating || isDemo) {
      if (isDemo) pushToast("Upload a transcript first", "info");
      return;
    }
    setEvaluating(true);
    try {
      const response = await fetch("/api/evaluate", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ transcript: activeSession.transcript.english || activeSession.transcript.bengali }),
      });
      if (!response.ok) {
        const body = await response.json().catch(() => ({}));
        throw new Error(body?.error ?? `HTTP ${response.status}`);
      }
      const data = await response.json();
      // Normalize flat backend shape → frontend shape
      // Backend: { academic_coaching: { score, justification, key_evidence }, ..., overall_score, key_observations, recommendations }
      // Frontend expects: { overall_score, summary, categories: { [key]: { score, feedback } }, recommendations }
      const EVAL_CATS = ["academic_coaching", "communication", "student_participation", "attitude_of_teacher"];
      const categories: Record<string, { score: number; feedback: string }> = {};
      for (const key of EVAL_CATS) {
        const cat = data[key];
        if (cat && typeof cat === "object") {
          categories[key] = { score: cat.score ?? 0, feedback: cat.justification ?? cat.feedback ?? "" };
        }
      }
      const normalized = {
        overall_score: data.overall_score,
        summary: data.key_observations ?? data.summary,
        categories: Object.keys(categories).length > 0 ? categories : undefined,
        recommendations: Array.isArray(data.recommendations) ? data.recommendations : undefined,
      };
      setEvaluation(normalized);
      try {
        localStorage.setItem(EVAL_KEY(activeSession.id), JSON.stringify(data));
      } catch {}
      pushToast("Evaluation complete", "ok");
    } catch (err) {
      pushToast(err instanceof Error ? err.message : "Evaluation failed", "err");
    } finally {
      setEvaluating(false);
    }
  }, [activeSession, evaluating, isDemo, pushToast]);

  // ── Back / clear active ──
  const goBack = () => {
    setActiveSessionId(null);
    setActiveView("dashboard");
  };

  /* ─────────────────────────────────────────────────────────────────── */

  return (
    <main
      className="grid h-screen w-screen overflow-hidden"
      style={{ background: "var(--app-bg)", gridTemplateColumns: "260px 1fr" }}
    >
      {/* Hidden audio element powers all playback */}
      <audio
        ref={audioRef}
        onTimeUpdate={(e) => setCurrentTime(e.currentTarget.currentTime)}
        onPlay={() => setIsPlaying(true)}
        onPause={() => setIsPlaying(false)}
        onEnded={() => setIsPlaying(false)}
        preload="metadata"
        hidden
      />

      {/* Hidden file input powers "New Transcription" */}
      <input
        ref={fileInputRef}
        type="file"
        accept=".mp3,.wav,.m4a,.ogg,.flac,.webm,audio/*"
        onChange={onFileChange}
        className="hidden"
      />

      <LeftSidebar
        activeView={activeView}
        setActiveView={setActiveView}
        activeSessionId={activeSession.id}
        setActiveSessionId={setActiveSessionId}
        recentList={sidebarRecent}
        sessions={sessions}
        onNewTranscription={onOpenFilePicker}
        onDeleteSession={(id) => {
          // Compute next outside any updater so all side effects run exactly once.
          // setSessions updater functions are called twice in React Strict Mode,
          // so any setState call inside an updater fires twice and causes duplicates.
          const doomed = sessions.find((s) => s.id === id);
          const next = removeSession(sessions, id);
          saveSessions(next);
          setSessions(next);
          if (activeSessionId === id) setActiveSessionId(next[0]?.id ?? null);
          if (doomed) setTrashedSessions((t) => [doomed, ...t.filter((x) => x.id !== doomed.id)]);
          pushToast("Moved to trash", "info");
        }}
        onRenameSession={(id, name) => {
          setSessions((prev) => {
            const next = renameInList(prev, id, name);
            saveSessions(next);
            return next;
          });
          pushToast("Renamed", "ok");
        }}
      />

      <div className="grid min-h-0 grid-rows-[72px_1fr] overflow-hidden">
        <TopBar
          theme={theme}
          setTheme={setTheme}
          searchRef={searchRef}
          value={globalSearch}
          onChange={setGlobalSearch}
          onUpgrade={() => pushToast("Upgrade flow coming soon", "info")}
          profileOpen={profileOpen}
          setProfileOpen={setProfileOpen}
          onSignOut={() => pushToast("Signed out (demo)", "info")}
        />

        {/* ── View switcher ── */}
        {activeView === "dashboard" ? (
          <DashboardView
            sessions={sessions}
            onUpload={onOpenFilePicker}
            onSelectSession={(id) => {
              setActiveSessionId(id);
              setActiveView("my-transcripts");
            }}
          />
        ) : activeView === "my-transcripts" ? (
          <div className="grid min-h-0 overflow-hidden" style={{ gridTemplateColumns: "1fr 320px" }}>
            <CenterPanel
              session={activeSession}
              turns={turns}
              visibleTurns={visibleTurns}
              shares={sharesData}
              language={language}
              activeTab={activeTab}
              setActiveTab={setActiveTab}
              isPlaying={isPlaying}
              currentTime={currentTime}
              playbackRate={playbackRate}
              onPlay={togglePlay}
              onSeekBy={seekBy}
              onSeekTo={(t) => seekTo(t)}
              onCycleRate={cyclePlaybackRate}
              renamingTitle={renamingTitle}
              titleDraft={titleDraft}
              setTitleDraft={setTitleDraft}
              onStartRename={() => {
                if (isDemo) { pushToast("Upload a session to rename", "info"); return; }
                setTitleDraft(activeSession.name);
                setRenamingTitle(true);
              }}
              onCommitRename={commitRename}
              onCancelRename={() => setRenamingTitle(false)}
              titleInputRef={titleInputRef}
              onBack={goBack}
              onShare={shareLink}
              onDownload={downloadDocx}
              moreOpen={moreOpen}
              setMoreOpen={setMoreOpen}
              onDelete={deleteActive}
              onCopyTranscript={copyTranscript}
              transcriptSearch={transcriptSearch}
              setTranscriptSearch={setTranscriptSearch}
              filterMenuOpen={filterMenuOpen}
              setFilterMenuOpen={setFilterMenuOpen}
              speakerFilter={speakerFilter}
              setSpeakerFilter={setSpeakerFilter}
              onExpand={() => setExpandedTranscript(true)}
              timings={timings}
              highlights={highlights}
              notes={notes}
              noteDraft={noteDraft}
              setNoteDraft={setNoteDraft}
              onAddNote={addNote}
              onDeleteNote={deleteNote}
              onDeleteHighlight={deleteHighlight}
              isDemo={isDemo}
              audioRef={audioRef}
              transcriptLang={transcriptLang}
              setTranscriptLang={setTranscriptLang}
            />

            <RightSidebar
              session={activeSession}
              summary={summary}
              evaluation={evaluation}
              topics={topics}
              shares={sharesData}
              onViewSummary={() => {
                setSummaryOpen(true);
                if (!evaluation && !isDemo) void runEvaluation();
              }}
              onViewAllTopics={() => setAllTopicsOpen(true)}
              onAddNote={() => setNotesDrawerOpen(true)}
              onCreateHighlight={createHighlight}
              onCopyTranscript={copyTranscript}
            />
          </div>
        ) : activeView === "trash" ? (
          <TrashView
            sessions={trashedSessions}
            onRestore={(s) => {
              setTrashedSessions((prev) => prev.filter((x) => x.id !== s.id));
              setSessions((prev) => {
                const next = [s, ...prev];
                saveSessions(next);
                return next;
              });
              pushToast("Restored", "ok");
            }}
            onDeletePermanently={(id) => {
              setTrashedSessions((prev) => prev.filter((x) => x.id !== id));
              pushToast("Permanently deleted", "info");
            }}
            onEmptyTrash={() => {
              setTrashedSessions([]);
              pushToast("Trash emptied", "info");
            }}
          />
        ) : (
          <PlaceholderView
            view={activeView}
            onUpload={onOpenFilePicker}
          />
        )}
      </div>

      {/* Upload progress overlay */}
      {uploadState !== "idle" && (
        <UploadOverlay
          state={uploadState}
          error={uploadError}
          fileName={uploadFileName}
          progress={uploadProgress}
          onDismiss={() => setUploadState("idle")}
        />
      )}

      {/* Notes drawer */}
      {notesDrawerOpen && (
        <NotesDrawer
          noteDraft={noteDraft}
          setNoteDraft={setNoteDraft}
          onAdd={() => { addNote(); setNotesDrawerOpen(false); }}
          onClose={() => setNotesDrawerOpen(false)}
        />
      )}

      {/* Summary modal */}
      {summaryOpen && (
        <SummaryModal
          onClose={() => setSummaryOpen(false)}
          summary={summary}
          evaluation={evaluation}
          evaluating={evaluating}
          onEvaluate={runEvaluation}
          isDemo={isDemo}
        />
      )}

      {/* All topics modal */}
      {allTopicsOpen && (
        <AllTopicsModal onClose={() => setAllTopicsOpen(false)} topics={allTopics} />
      )}

      {/* Expanded transcript modal */}
      {expandedTranscript && (
        <ExpandedTranscriptModal
          onClose={() => setExpandedTranscript(false)}
          turns={visibleTurns}
          timings={timings}
          searchQuery={transcriptSearch}
          onSeek={seekTo}
          hasBoth={!!(activeSession.transcript.bengali && activeSession.transcript.english)}
          transcriptLang={transcriptLang}
          setTranscriptLang={setTranscriptLang}
        />
      )}

      {/* Toasts */}
      <ToastStack toasts={toasts} />
    </main>
  );
}

/* ═════════════════════════════════════════════════════════════════════════
   LEFT SIDEBAR
   ═════════════════════════════════════════════════════════════════════════ */

type NavItem = {
  id: ViewFilter;
  label: string;
  icon: React.ComponentType<{ size?: number; strokeWidth?: number; className?: string }>;
};

const NAV_ITEMS: NavItem[] = [
  { id: "dashboard", label: "Dashboard", icon: LayoutDashboard },
  { id: "my-transcripts", label: "My Transcripts", icon: FileText },
  { id: "shared", label: "Shared with me", icon: Users },
  { id: "library", label: "Library", icon: BookOpen },
  { id: "trash", label: "Trash", icon: Trash2 },
];

function LeftSidebar({
  activeView,
  setActiveView,
  activeSessionId,
  setActiveSessionId,
  recentList,
  sessions,
  onNewTranscription,
  onDeleteSession,
  onRenameSession,
}: {
  activeView: ViewFilter;
  setActiveView: (v: ViewFilter) => void;
  activeSessionId: string;
  setActiveSessionId: (id: string) => void;
  recentList: LibrarySession[];
  sessions: LibrarySession[];
  onNewTranscription: () => void;
  onDeleteSession: (id: string) => void;
  onRenameSession: (id: string, name: string) => void;
}) {
  return (
    <aside
      className="flex h-full min-h-0 flex-col px-4 pt-6 pb-4"
      style={{ background: "var(--surface)", borderRight: "1px solid var(--border)" }}
    >
      <div className="flex items-center gap-3 px-2">
        <BrandMark />
        <div className="leading-tight">
          <div className="text-[18px] font-bold tracking-tight" style={{ color: "var(--text-900)" }}>
            BacBon
          </div>
          <div className="-mt-0.5 text-[12px]" style={{ color: "var(--text-500)" }}>
            AI Transcriber
          </div>
        </div>
      </div>

      <div className="mt-8">
        <button className="btn-primary-dark" onClick={onNewTranscription}>
          <span className="inline-flex items-center gap-2.5">
            <Plus size={16} strokeWidth={2.2} />
            <span>New Transcription</span>
          </span>
          <ChevronRight size={16} strokeWidth={2} />
        </button>
      </div>

      <nav className="mt-6 flex flex-col gap-2">
        {NAV_ITEMS.map((item) => {
          const Icon = item.icon;
          const active = activeView === item.id;
          return (
            <button
              key={item.id}
              onClick={() => setActiveView(item.id)}
              className={cn("nav-item text-left", active && "is-active")}
            >
              <Icon size={18} strokeWidth={1.8} className="nav-icon" />
              <span>{item.label}</span>
            </button>
          );
        })}
      </nav>

      <div className="mt-8 flex min-h-0 flex-1 flex-col">
        <div className="mb-3 flex items-center justify-between px-3">
          <span
            className="text-[11px] font-bold uppercase"
            style={{ color: "var(--text-400)", letterSpacing: "0.05em" }}
          >
            Recent
          </span>
          <button
            className="text-[12px] transition-colors hover:underline"
            style={{ color: "var(--text-400)" }}
            onClick={() => setActiveView("my-transcripts")}
          >
            See all
          </button>
        </div>

        <div className="flex min-h-0 flex-1 flex-col gap-0.5 overflow-y-auto pr-0.5">
          {recentList.length === 0 ? (
            <EmptyRecent onUpload={onNewTranscription} />
          ) : (
            recentList.map((item, idx) => (
              <RecentRow
                key={item.id}
                item={item}
                tint={idx % 2 === 0 ? "brand" : "teal"}
                active={activeSessionId === item.id}
                onSelect={() => setActiveSessionId(item.id)}
                onDelete={() => onDeleteSession(item.id)}
                onRename={(name) => onRenameSession(item.id, name)}
              />
            ))
          )}
        </div>
      </div>

      <ProfileCard sessions={sessions} />
    </aside>
  );
}

/* ─────────────────────────────────────────────────────────────────────────
   Trash view
   ───────────────────────────────────────────────────────────────────────── */
function TrashView({
  sessions,
  onRestore,
  onDeletePermanently,
  onEmptyTrash,
}: {
  sessions: LibrarySession[];
  onRestore: (s: LibrarySession) => void;
  onDeletePermanently: (id: string) => void;
  onEmptyTrash: () => void;
}) {
  return (
    <div className="flex min-h-0 flex-1 flex-col overflow-y-auto px-8 py-8">
      <div className="mb-6 flex items-center justify-between">
        <div>
          <h2 className="text-[20px] font-bold" style={{ color: "var(--text-900)" }}>Trash</h2>
          <p className="mt-1 text-[13px]" style={{ color: "var(--text-400)" }}>
            Items here are not permanently deleted — restore them any time.
          </p>
        </div>
        {sessions.length > 0 && (
          <button
            onClick={onEmptyTrash}
            className="flex items-center gap-2 rounded-lg border px-4 py-2 text-[13px] font-medium transition-colors hover:bg-red-50"
            style={{ borderColor: "#FCA5A5", color: "#DC2626" }}
          >
            <Trash2 size={14} />
            Empty Trash
          </button>
        )}
      </div>

      {sessions.length === 0 ? (
        <div className="flex flex-1 flex-col items-center justify-center gap-3 text-center">
          <div
            className="flex h-16 w-16 items-center justify-center rounded-2xl"
            style={{ background: "var(--surface)", border: "1.5px solid var(--border)" }}
          >
            <Trash2 size={28} style={{ color: "var(--text-300)" }} />
          </div>
          <p className="text-[15px] font-medium" style={{ color: "var(--text-900)" }}>Trash is empty</p>
          <p className="text-[13px]" style={{ color: "var(--text-400)" }}>Deleted transcripts will appear here</p>
        </div>
      ) : (
        <div className="grid gap-3" style={{ gridTemplateColumns: "repeat(auto-fill, minmax(280px, 1fr))" }}>
          {/* Deduplicate by id as a defensive guard before rendering */}
          {[...new Map(sessions.map((s) => [s.id, s])).values()].map((s) => (
            <div
              key={s.id}
              className="card flex flex-col gap-3"
              style={{ opacity: 0.85 }}
            >
              <div className="flex items-start gap-3">
                <div
                  className="flex h-9 w-9 flex-shrink-0 items-center justify-center rounded-lg"
                  style={{ background: "#FEF2F2" }}
                >
                  <FileText size={16} style={{ color: "#DC2626" }} />
                </div>
                <div className="min-w-0 flex-1">
                  <p className="truncate text-[13px] font-semibold" style={{ color: "var(--text-900)" }}>
                    {s.name}
                  </p>
                  <p className="mt-0.5 text-[11px]" style={{ color: "var(--text-400)" }}>
                    {timeAgo(s.createdAt)}
                    {s.duration != null ? ` · ${fmtDuration(s.duration)}` : ""}
                  </p>
                </div>
              </div>
              <div className="flex gap-2">
                <button
                  onClick={() => onRestore(s)}
                  className="flex flex-1 items-center justify-center gap-1.5 rounded-lg py-1.5 text-[12px] font-medium transition-colors hover:opacity-80"
                  style={{ background: "var(--app-bg)", border: "1.5px solid var(--border)", color: "var(--text-600)" }}
                >
                  <RotateCcw size={12} />
                  Restore
                </button>
                <button
                  onClick={() => onDeletePermanently(s.id)}
                  className="flex flex-1 items-center justify-center gap-1.5 rounded-lg py-1.5 text-[12px] font-medium transition-colors hover:bg-red-50"
                  style={{ background: "var(--app-bg)", border: "1.5px solid #FCA5A5", color: "#DC2626" }}
                >
                  <Trash2 size={12} />
                  Delete forever
                </button>
              </div>
            </div>
          ))}
        </div>
      )}
    </div>
  );
}

/* ─────────────────────────────────────────────────────────────────────────
   Placeholder view — Shared with me / Library
   ───────────────────────────────────────────────────────────────────────── */
function PlaceholderView({
  view,
  onUpload,
}: {
  view: string;
  onUpload: () => void;
}) {
  const meta: Record<string, { icon: React.ReactNode; title: string; desc: string; cta?: string }> = {
    shared: {
      icon: <Users size={28} style={{ color: "var(--text-300)" }} />,
      title: "Nothing shared yet",
      desc: "Transcripts shared with you will appear here.",
    },
    library: {
      icon: <BookOpen size={28} style={{ color: "var(--text-300)" }} />,
      title: "Your library is empty",
      desc: "Save transcripts to your library for quick access.",
      cta: "Upload a transcription",
    },
  };

  const info = meta[view] ?? {
    icon: <FileText size={28} style={{ color: "var(--text-300)" }} />,
    title: "Nothing here yet",
    desc: "Content for this section will appear here.",
  };

  return (
    <div className="flex flex-1 flex-col items-center justify-center gap-4 text-center">
      <div
        className="flex h-16 w-16 items-center justify-center rounded-2xl"
        style={{ background: "var(--surface)", border: "1.5px solid var(--border)" }}
      >
        {info.icon}
      </div>
      <div>
        <p className="text-[16px] font-semibold" style={{ color: "var(--text-900)" }}>{info.title}</p>
        <p className="mt-1 text-[13px]" style={{ color: "var(--text-400)" }}>{info.desc}</p>
      </div>
      {info.cta && (
        <button
          onClick={onUpload}
          className="btn-primary-dark mt-2 flex items-center gap-2"
        >
          <Plus size={15} />
          {info.cta}
        </button>
      )}
    </div>
  );
}

function BrandMark() {
  const heights = [12, 18, 22, 16];
  return (
    <div className="flex h-8 items-end gap-[3px]">
      {heights.map((h, i) => (
        <span
          key={i}
          className="block w-[3px] rounded-full"
          style={{ height: `${h}px`, background: BRAND }}
        />
      ))}
    </div>
  );
}

function EmptyRecent({ onUpload }: { onUpload: () => void }) {
  return (
    <button
      onClick={onUpload}
      className="mt-2 flex flex-col items-center gap-2 rounded-[10px] border border-dashed px-3 py-6 text-center transition-colors hover:bg-[var(--surface-muted)]"
      style={{ borderColor: "var(--border)" }}
    >
      <Upload size={18} style={{ color: "var(--text-400)" }} />
      <span className="text-[12px]" style={{ color: "var(--text-500)" }}>
        Upload audio to get started
      </span>
    </button>
  );
}

function RecentRow({
  item,
  tint,
  active,
  onSelect,
  onDelete,
  onRename,
}: {
  item: LibrarySession;
  tint: "brand" | "teal";
  active: boolean;
  onSelect: () => void;
  onDelete: () => void;
  onRename: (name: string) => void;
}) {
  const [menuOpen, setMenuOpen] = useState(false);
  const [editing, setEditing] = useState(false);
  const [draft, setDraft] = useState(item.name);
  const menuRef = useRef<HTMLDivElement>(null);

  useEffect(() => {
    if (!menuOpen) return;
    const onClick = (e: MouseEvent) => {
      if (menuRef.current && !menuRef.current.contains(e.target as Node)) setMenuOpen(false);
    };
    document.addEventListener("mousedown", onClick);
    return () => document.removeEventListener("mousedown", onClick);
  }, [menuOpen]);

  const commit = () => {
    const n = draft.trim();
    if (n) onRename(n);
    setEditing(false);
  };

  return (
    <div
      role="button"
      tabIndex={0}
      onClick={() => !editing && onSelect()}
      onKeyDown={(e) => {
        if (editing) return;
        if (e.key === "Enter" || e.key === " ") {
          e.preventDefault();
          onSelect();
        }
      }}
      className={cn("group recent-row relative cursor-pointer", active && "is-active")}
    >
      <RecentAvatar tint={tint} />
      <div className="min-w-0 flex-1">
        {editing ? (
          <input
            autoFocus
            value={draft}
            onChange={(e) => setDraft(e.target.value)}
            onClick={(e) => e.stopPropagation()}
            onBlur={commit}
            onKeyDown={(e) => {
              e.stopPropagation();
              if (e.key === "Enter") commit();
              if (e.key === "Escape") { setDraft(item.name); setEditing(false); }
            }}
            className="w-full rounded border px-1.5 py-0.5 text-[14px] font-medium outline-none focus:border-[rgba(var(--brand-rgb),0.4)]"
            style={{ color: "var(--text-900)", borderColor: "var(--border)" }}
          />
        ) : (
          <div className="truncate text-[14px] font-medium" style={{ color: "var(--text-900)" }}>
            {item.name}
          </div>
        )}
        <div className="tnum truncate text-[12px]" style={{ color: "var(--text-500)" }}>
          {fmtDuration(item.duration)} · {timeAgo(item.createdAt)}
        </div>
      </div>

      <div className="relative" ref={menuRef}>
        <button
          aria-label="More"
          onClick={(e) => { e.stopPropagation(); setMenuOpen((o) => !o); }}
          className={cn(
            "shrink-0 transition-opacity",
            menuOpen || active ? "opacity-100" : "opacity-0 group-hover:opacity-100",
          )}
          style={{ color: "var(--text-400)" }}
        >
          <MoreVertical size={16} strokeWidth={1.8} />
        </button>
        {menuOpen && (
          <div
            className="absolute right-0 top-6 z-20 w-40 overflow-hidden rounded-[8px] border bg-white shadow-lg"
            style={{ borderColor: "var(--border)" }}
            onClick={(e) => e.stopPropagation()}
          >
            <MenuItem
              icon={<Pencil size={13} />}
              label="Rename"
              onClick={() => { setEditing(true); setMenuOpen(false); }}
            />
            <MenuItem
              icon={<Trash2 size={13} />}
              label="Delete"
              onClick={() => { onDelete(); setMenuOpen(false); }}
              danger
            />
          </div>
        )}
      </div>
    </div>
  );
}

function MenuItem({
  icon,
  label,
  onClick,
  danger,
}: {
  icon: React.ReactNode;
  label: string;
  onClick: () => void;
  danger?: boolean;
}) {
  return (
    <button
      onClick={onClick}
      className="flex w-full items-center gap-2 px-3 py-2 text-left text-[13px] transition-colors hover:bg-[var(--surface-muted)]"
      style={{ color: danger ? "#dc2626" : "var(--text-700)" }}
    >
      {icon}
      <span>{label}</span>
    </button>
  );
}

function RecentAvatar({ tint }: { tint: "brand" | "teal" }) {
  const color = tint === "brand" ? BRAND : TEAL;
  const heights = [5, 9, 12, 8, 11, 6];
  return (
    <span
      className="flex h-9 w-9 items-center justify-center rounded-full"
      style={{
        background:
          tint === "brand"
            ? "rgba(234, 88, 12, 0.10)"
            : "rgba(13, 148, 136, 0.10)",
      }}
    >
      <span className="flex items-center gap-[1.5px]">
        {heights.map((h, i) => (
          <span
            key={i}
            className="block w-[2px] rounded-full"
            style={{ height: `${h}px`, background: color }}
          />
        ))}
      </span>
    </span>
  );
}

function ProfileCard({ sessions }: { sessions: LibrarySession[] }) {
  const totalRecordings = sessions.length;
  const totalSeconds = sessions.reduce((s, r) => s + (r.duration ?? 0), 0);
  const totalWords = sessions.reduce((s, r) => s + (r.wordCount ?? 0), 0);
  const avgBn =
    sessions.length > 0
      ? Math.round(sessions.reduce((s, r) => s + (r.languageSplit?.bn ?? 0), 0) / sessions.length)
      : 0;
  const avgEn = 100 - avgBn;

  const fmtTime = (secs: number) => {
    if (secs < 60) return `${secs}s`;
    if (secs < 3600) return `${Math.floor(secs / 60)}m`;
    const h = Math.floor(secs / 3600);
    const m = Math.floor((secs % 3600) / 60);
    return m > 0 ? `${h}h ${m}m` : `${h}h`;
  };

  const stats: { label: string; value: string; sub?: string }[] = [
    { label: "Recordings", value: String(totalRecordings) },
    { label: "Audio processed", value: fmtTime(totalSeconds) },
    { label: "Words transcribed", value: totalWords >= 1000 ? `${(totalWords / 1000).toFixed(1)}k` : String(totalWords) },
    { label: "Language mix", value: totalRecordings > 0 ? `${avgBn}% BN` : "—", sub: totalRecordings > 0 ? `${avgEn}% EN` : undefined },
  ];

  return (
    <div
      className="mt-4 p-4"
      style={{ background: "var(--app-bg)", border: "1px solid var(--border)", borderRadius: "12px" }}
    >
      <div className="mb-3 flex items-center gap-2">
        <Gauge size={14} strokeWidth={2.2} style={{ color: BRAND }} />
        <span className="text-[13px] font-semibold" style={{ color: "var(--text-900)" }}>
          Your Activity
        </span>
      </div>
      <div className="grid grid-cols-2 gap-2">
        {stats.map((s) => (
          <div
            key={s.label}
            className="flex flex-col gap-0.5 rounded-lg px-2 py-2"
            style={{ background: "var(--surface)" }}
          >
            <span className="text-[18px] font-bold leading-none" style={{ color: "var(--text-900)" }}>
              {s.value}
              {s.sub && (
                <span className="ml-1 text-[11px] font-normal" style={{ color: "var(--text-400)" }}>
                  / {s.sub}
                </span>
              )}
            </span>
            <span className="text-[10px] uppercase tracking-wide" style={{ color: "var(--text-400)" }}>
              {s.label}
            </span>
          </div>
        ))}
      </div>
    </div>
  );
}

/* ═════════════════════════════════════════════════════════════════════════
   TOP BAR
   ═════════════════════════════════════════════════════════════════════════ */

function TopBar({
  theme,
  setTheme,
  searchRef,
  value,
  onChange,
  onUpgrade,
  profileOpen,
  setProfileOpen,
  onSignOut,
}: {
  theme: "light" | "dark";
  setTheme: (t: "light" | "dark") => void;
  searchRef: RefObject<HTMLInputElement | null>;
  value: string;
  onChange: (v: string) => void;
  onUpgrade: () => void;
  profileOpen: boolean;
  setProfileOpen: (b: boolean) => void;
  onSignOut: () => void;
}) {
  const profileRef = useRef<HTMLDivElement>(null);
  useEffect(() => {
    if (!profileOpen) return;
    const onClick = (e: MouseEvent) => {
      if (profileRef.current && !profileRef.current.contains(e.target as Node)) setProfileOpen(false);
    };
    document.addEventListener("mousedown", onClick);
    return () => document.removeEventListener("mousedown", onClick);
  }, [profileOpen, setProfileOpen]);

  return (
    <header
      className="flex items-center justify-between gap-4 px-8"
      style={{ borderBottom: "1px solid var(--border)", background: "var(--app-bg)" }}
    >
      <div className="relative mx-auto w-[400px]">
        <Search
          size={16}
          strokeWidth={2}
          className="pointer-events-none absolute left-3.5 top-1/2 -translate-y-1/2"
          style={{ color: "var(--text-400)" }}
        />
        <input
          ref={searchRef}
          type="text"
          placeholder="Search transcripts..."
          value={value}
          onChange={(e) => onChange(e.target.value)}
          className="topbar-search"
          aria-label="Search transcripts"
        />
        <span className="pointer-events-none absolute right-3 top-1/2 -translate-y-1/2">
          <kbd className="kbd tnum">⌘K</kbd>
        </span>
      </div>

      <div className="flex items-center gap-4">
        <button className="btn-upgrade-pill" onClick={onUpgrade}>
          <SparkleFour size={14} />
          <span>Upgrade</span>
        </button>

        <button
          className="icon-btn"
          style={{ width: 36, height: 36 }}
          aria-label="Toggle dark mode"
          onClick={() => setTheme(theme === "dark" ? "light" : "dark")}
        >
          {theme === "dark" ? <Sun size={20} strokeWidth={1.6} /> : <Moon size={20} strokeWidth={1.6} />}
        </button>

        <span className="block" style={{ width: 1, height: 24, background: "var(--border)" }} />

        <div className="relative" ref={profileRef}>
          <button
            className="flex items-center gap-1.5 transition-opacity hover:opacity-80"
            onClick={() => setProfileOpen(!profileOpen)}
          >
            <Avatar />
            <ChevronDown
              size={16}
              strokeWidth={2}
              style={{ color: "var(--text-500)", transform: profileOpen ? "rotate(180deg)" : undefined, transition: "transform 150ms" }}
            />
          </button>
          {profileOpen && (
            <div
              className="absolute right-0 top-12 z-30 w-60 overflow-hidden rounded-[10px] border bg-white shadow-lg"
              style={{ borderColor: "var(--border)" }}
            >
              <div className="px-4 py-3" style={{ borderBottom: "1px solid var(--border)" }}>
                <div className="text-[13px] font-medium" style={{ color: "var(--text-900)" }}>
                  Signed in as
                </div>
                <div className="tnum truncate text-[12px]" style={{ color: "var(--text-500)" }}>
                  {USER_EMAIL}
                </div>
              </div>
              <MenuItem icon={<Settings size={13} />} label="Settings" onClick={() => setProfileOpen(false)} />
              <MenuItem icon={<LogOut size={13} />} label="Sign out" onClick={() => { onSignOut(); setProfileOpen(false); }} danger />
            </div>
          )}
        </div>
      </div>
    </header>
  );
}

function SparkleFour({ size = 14, color = "currentColor" }: { size?: number; color?: string }) {
  return (
    <svg width={size} height={size} viewBox="0 0 16 16" fill="none" aria-hidden>
      <path
        d="M8 1.5 L9.1 6.9 L14.5 8 L9.1 9.1 L8 14.5 L6.9 9.1 L1.5 8 L6.9 6.9 Z"
        fill={color}
      />
    </svg>
  );
}

function Avatar() {
  return (
    <span className="relative block h-8 w-8 overflow-hidden rounded-full">
      <svg viewBox="0 0 32 32" className="absolute inset-0 h-full w-full">
        <defs>
          <linearGradient id="avatar-grad" x1="0" y1="0" x2="0" y2="1">
            <stop offset="0%" stopColor="#fde3c7" />
            <stop offset="100%" stopColor="#f4a76a" />
          </linearGradient>
        </defs>
        <rect width="32" height="32" fill="url(#avatar-grad)" />
        <circle cx="16" cy="12" r="5" fill="#8a5a3a" />
        <path d="M4 30 C4 22, 11 18, 16 18 C 21 18, 28 22, 28 30 Z" fill="#b07048" />
      </svg>
      <span className="absolute bottom-0 right-0 block h-2.5 w-2.5 rounded-full ring-2 ring-white" style={{ background: "var(--success)" }} />
    </span>
  );
}

/* ═════════════════════════════════════════════════════════════════════════
   CENTER PANEL
   ═════════════════════════════════════════════════════════════════════════ */

type ShareInfo = { id: number; name: string; percent: number; color: string };

function CenterPanel(props: {
  session: LibrarySession;
  turns: Turn[];
  visibleTurns: { t: Turn; idx: number }[];
  shares: ShareInfo[];
  language: string;
  activeTab: "transcript" | "speakers" | "notes" | "highlights";
  setActiveTab: (t: "transcript" | "speakers" | "notes" | "highlights") => void;
  isPlaying: boolean;
  currentTime: number;
  playbackRate: number;
  onPlay: () => void;
  onSeekBy: (d: number) => void;
  onSeekTo: (t: number) => void;
  onCycleRate: () => void;
  renamingTitle: boolean;
  titleDraft: string;
  setTitleDraft: (v: string) => void;
  onStartRename: () => void;
  onCommitRename: (v: string) => void;
  onCancelRename: () => void;
  titleInputRef: RefObject<HTMLInputElement | null>;
  onBack: () => void;
  onShare: () => void;
  onDownload: () => void;
  moreOpen: boolean;
  setMoreOpen: (b: boolean) => void;
  onDelete: () => void;
  onCopyTranscript: () => void;
  transcriptSearch: string;
  setTranscriptSearch: (v: string) => void;
  filterMenuOpen: boolean;
  setFilterMenuOpen: (b: boolean) => void;
  speakerFilter: Set<number>;
  setSpeakerFilter: (s: Set<number>) => void;
  onExpand: () => void;
  timings: number[];
  highlights: Highlight[];
  notes: Note[];
  noteDraft: string;
  setNoteDraft: (v: string) => void;
  onAddNote: () => void;
  onDeleteNote: (id: string) => void;
  onDeleteHighlight: (id: string) => void;
  isDemo: boolean;
  audioRef: RefObject<HTMLAudioElement | null>;
  transcriptLang: "bn" | "en";
  setTranscriptLang: (l: "bn" | "en") => void;
}) {
  return (
    <section className="flex min-h-0 flex-col overflow-hidden">
      <div className="flex min-h-0 flex-1 flex-col gap-6 overflow-y-auto px-8 py-8">
        <TranscriptHeader {...props} />
        <AudioPlayerCard {...props} />
        <TranscriptCard {...props} />
      </div>
    </section>
  );
}

function TranscriptHeader(props: Parameters<typeof CenterPanel>[0]) {
  const moreRef = useRef<HTMLDivElement>(null);
  useEffect(() => {
    if (!props.moreOpen) return;
    const onClick = (e: MouseEvent) => {
      if (moreRef.current && !moreRef.current.contains(e.target as Node)) props.setMoreOpen(false);
    };
    document.addEventListener("mousedown", onClick);
    return () => document.removeEventListener("mousedown", onClick);
  }, [props]);

  return (
    <div className="flex items-start justify-between gap-4 enter-1">
      <div className="flex items-start gap-4">
        <button className="btn-outline btn-outline-40" aria-label="Back" onClick={props.onBack}>
          <ArrowLeft size={18} strokeWidth={1.8} style={{ color: "var(--text-700)" }} />
        </button>
        <div>
          <div className="flex items-center gap-2">
            {props.renamingTitle ? (
              <input
                ref={props.titleInputRef}
                value={props.titleDraft}
                onChange={(e) => props.setTitleDraft(e.target.value)}
                onBlur={() => props.onCommitRename(props.titleDraft)}
                onKeyDown={(e) => {
                  if (e.key === "Enter") props.onCommitRename(props.titleDraft);
                  if (e.key === "Escape") props.onCancelRename();
                }}
                className="rounded border px-2 py-0.5 text-[24px] font-bold tracking-tight outline-none focus:border-[rgba(var(--brand-rgb),0.4)]"
                style={{ color: "var(--text-900)", borderColor: "var(--border)" }}
              />
            ) : (
              <h1
                className="text-[24px] font-bold tracking-tight"
                style={{ color: "var(--text-900)" }}
              >
                {props.session.name}
              </h1>
            )}
            <button
              aria-label="Rename"
              className="transition-colors hover:opacity-70"
              style={{ color: "var(--text-400)" }}
              onClick={props.onStartRename}
            >
              <Pencil size={16} strokeWidth={1.8} />
            </button>
          </div>
          <div className="mt-1.5 flex items-center gap-2 text-[13px]" style={{ color: "var(--text-500)" }}>
            <span className="tnum">{fmtDuration(props.session.duration)}</span>
            <Bullet />
            <span>{props.shares.length || 1} {props.shares.length === 1 ? "Speaker" : "Speakers"}</span>
            <Bullet />
            <span>{props.language}</span>
            <Bullet />
            <span>Created {timeAgo(props.session.createdAt)}</span>
          </div>
        </div>
      </div>

      <div className="flex items-center gap-2">
        <button className="btn-outline" onClick={props.onShare}>
          <Share2 size={14} strokeWidth={1.8} />
          <span>Share</span>
        </button>
        <button className="btn-outline" onClick={props.onDownload}>
          <Download size={14} strokeWidth={1.8} />
          <span>Download</span>
        </button>
        <div className="relative" ref={moreRef}>
          <button
            className="btn-outline btn-outline-square"
            aria-label="More options"
            onClick={() => props.setMoreOpen(!props.moreOpen)}
          >
            <MoreHorizontal size={16} strokeWidth={1.8} />
          </button>
          {props.moreOpen && (
            <div
              className="absolute right-0 top-10 z-20 w-48 overflow-hidden rounded-[8px] border bg-white shadow-lg"
              style={{ borderColor: "var(--border)" }}
            >
              <MenuItem icon={<Copy size={13} />} label="Copy transcript" onClick={() => { props.onCopyTranscript(); props.setMoreOpen(false); }} />
              <MenuItem icon={<Download size={13} />} label="Download .docx" onClick={() => { props.onDownload(); props.setMoreOpen(false); }} />
              <MenuItem icon={<Share2 size={13} />} label="Copy link" onClick={() => { props.onShare(); props.setMoreOpen(false); }} />
              <MenuItem icon={<Trash2 size={13} />} label="Delete" onClick={props.onDelete} danger />
            </div>
          )}
        </div>
      </div>
    </div>
  );
}

function Bullet() {
  return (
    <span className="inline-block h-1 w-1 rounded-full" style={{ background: "var(--text-400)" }} />
  );
}

function AudioPlayerCard(props: Parameters<typeof CenterPanel>[0]) {
  const duration = props.session.duration ?? 0;
  const progressPct = duration > 0 ? (props.currentTime / duration) * 100 : 0;

  return (
    <div className="card enter-2 px-5 pt-4 pb-4">
      <WaveformVisualizer
        session={props.session}
        progressPct={progressPct}
        isPlaying={props.isPlaying}
        audioRef={props.audioRef as React.RefObject<HTMLAudioElement | null>}
        onSeekPct={(pct) => props.onSeekTo((duration || 0) * pct)}
      />

      <div className="mt-3 flex items-center justify-between">
        <span className="tnum text-[12px] font-normal w-12" style={{ color: "var(--text-500)" }}>
          {fmtDuration(props.currentTime)}
        </span>

        <div className="flex items-center gap-5">
          <button
            className="transition-transform hover:scale-110"
            aria-label="Back 15s"
            style={{ color: "var(--text-700)" }}
            onClick={() => props.onSeekBy(-15)}
          >
            <Skip15 direction="back" />
          </button>
          <button
            onClick={props.onPlay}
            aria-label={props.isPlaying ? "Pause" : "Play"}
            className="flex h-10 w-10 items-center justify-center rounded-full transition-transform hover:scale-105 active:scale-95"
            style={{ background: "var(--text-900)", color: "#fff" }}
          >
            {props.isPlaying ? (
              <Pause size={16} strokeWidth={0} fill="#fff" />
            ) : (
              <Play size={16} strokeWidth={0} fill="#fff" className="translate-x-[1px]" />
            )}
          </button>
          <button
            className="transition-transform hover:scale-110"
            aria-label="Forward 15s"
            style={{ color: "var(--text-700)" }}
            onClick={() => props.onSeekBy(15)}
          >
            <Skip15 direction="forward" />
          </button>
        </div>

        <div className="flex items-center justify-end gap-2.5 w-28">
          <span className="tnum text-[12px] font-normal text-right" style={{ color: "var(--text-500)" }}>
            {fmtDuration(duration)}
          </span>
          <button
            onClick={props.onCycleRate}
            className="inline-flex items-center gap-1 rounded-full border px-2.5 py-1 text-[12px] transition-colors hover:bg-[var(--surface-muted)]"
            style={{ borderColor: "var(--border)", color: "var(--text-700)" }}
          >
            <Gauge size={12} strokeWidth={1.9} />
            <span className="tnum">{props.playbackRate}x</span>
          </button>
        </div>
      </div>
    </div>
  );
}

function WaveformVisualizer({
  session,
  progressPct,
  isPlaying,
  audioRef,
  onSeekPct,
}: {
  session: LibrarySession;
  progressPct: number;
  isPlaying: boolean;
  audioRef: React.RefObject<HTMLAudioElement | null>;
  onSeekPct: (pct: number) => void;
}) {
  const rawPeaks = session.fullWaveformPeaks?.length ? session.fullWaveformPeaks : [];
  const speakers = session.fullBarSpeakers ?? [];
  const BAR_COUNT = 110;

  // ── Static bars derived from real decoded peaks ──────────────────────────
  const staticBars = useMemo(() => {
    if (rawPeaks.length > 0) {
      const step = rawPeaks.length / BAR_COUNT;
      return Array.from({ length: BAR_COUNT }, (_, i) => {
        // Average-pool over the window for each bar so amplitude is accurate
        const start = Math.floor(i * step);
        const end = Math.min(Math.floor((i + 1) * step), rawPeaks.length);
        let sum = 0;
        for (let j = start; j < end; j++) sum += rawPeaks[j] ?? 0;
        const h = end > start ? sum / (end - start) : (rawPeaks[start] ?? 0.3);
        const sp = speakers[start] ?? 0;
        return { h: Math.max(0.04, h), color: sp === 1 ? "teal" : sp === 0 ? "brand" : "gray" };
      });
    }
    // No audio decoded yet — show flat placeholder bars
    return Array.from({ length: BAR_COUNT }, (_, i) => ({
      h: 0.08 + 0.04 * Math.abs(Math.sin(i * 0.3)),
      color: "gray" as "gray",
    }));
  }, [rawPeaks, speakers]);

  // ── Real-time analyser overlay ───────────────────────────────────────────
  // Stores per-bar amplitude multipliers [0..1] driven by AnalyserNode
  const [liveAmplitudes, setLiveAmplitudes] = useState<Float32Array | null>(null);
  const analyserRef = useRef<AnalyserNode | null>(null);
  const sourceRef   = useRef<MediaElementAudioSourceNode | null>(null);
  const audioCtxRef = useRef<AudioContext | null>(null);
  const rafRef      = useRef<number>(0);
  // Ref on the inner bar strip — click positions are measured against this,
  // NOT the outer container, so justify-center offset doesn't skew seek.
  const barsRef     = useRef<HTMLDivElement>(null);

  // ── Smooth seek lerp ─────────────────────────────────────────────────────
  // displayPct follows progressPct with exponential ease so the "played" wash
  // sweeps across the bars fluidly instead of snapping on seek.
  const [displayPct, setDisplayPct] = useState(progressPct);
  const displayPctRef = useRef(progressPct);
  const lerpRafRef    = useRef<number>(0);

  useEffect(() => {
    const target = progressPct;
    const LERP = 0.14;
    const step = () => {
      const diff = target - displayPctRef.current;
      if (Math.abs(diff) < 0.06) {
        displayPctRef.current = target;
        setDisplayPct(target);
        return;
      }
      displayPctRef.current += diff * LERP;
      setDisplayPct(displayPctRef.current);
      lerpRafRef.current = requestAnimationFrame(step);
    };
    cancelAnimationFrame(lerpRafRef.current);
    lerpRafRef.current = requestAnimationFrame(step);
    return () => cancelAnimationFrame(lerpRafRef.current);
  }, [progressPct]);

  // ── Hover ghost cursor + fisheye hover state ─────────────────────────────
  const [hoverPct, setHoverPct] = useState<number | null>(null);
  const onMouseMove = (e: React.MouseEvent<HTMLDivElement>) => {
    const el = barsRef.current;
    if (!el) return;
    const rect = el.getBoundingClientRect();
    setHoverPct(Math.max(0, Math.min(100, ((e.clientX - rect.left) / rect.width) * 100)));
  };
  const onMouseLeave = () => setHoverPct(null);

  useEffect(() => {
    const audio = audioRef.current;
    if (!audio || !isPlaying) {
      cancelAnimationFrame(rafRef.current);
      setLiveAmplitudes(null);
      return;
    }

    // Create / reuse AudioContext + analyser
    if (!audioCtxRef.current) {
      const Ctor =
        window.AudioContext ??
        (window as Window & { webkitAudioContext?: typeof AudioContext }).webkitAudioContext;
      if (!Ctor) return;
      audioCtxRef.current = new Ctor();
    }
    const ctx = audioCtxRef.current;

    if (ctx.state === "suspended") ctx.resume().catch(() => {});

    // Connect source → analyser only once per audio element
    if (!sourceRef.current) {
      try {
        sourceRef.current = ctx.createMediaElementSource(audio);
      } catch {
        // Already connected — ignore
      }
    }
    if (!analyserRef.current) {
      const an = ctx.createAnalyser();
      an.fftSize = 256;           // 128 frequency bins
      an.smoothingTimeConstant = 0.75;
      analyserRef.current = an;
      sourceRef.current?.connect(an);
      an.connect(ctx.destination);
    }

    const analyser = analyserRef.current;
    const binCount = analyser.frequencyBinCount; // 128
    const freqData = new Uint8Array(binCount);

    const tick = () => {
      analyser.getByteFrequencyData(freqData);

      // Map frequency bins → BAR_COUNT bars by averaging buckets
      const binsPerBar = binCount / BAR_COUNT;
      const amplitudes = new Float32Array(BAR_COUNT);
      for (let i = 0; i < BAR_COUNT; i++) {
        const start = Math.floor(i * binsPerBar);
        const end   = Math.min(Math.floor((i + 1) * binsPerBar), binCount);
        let sum = 0;
        for (let j = start; j < end; j++) sum += freqData[j] ?? 0;
        amplitudes[i] = sum / (255 * Math.max(1, end - start));
      }
      setLiveAmplitudes(amplitudes);
      rafRef.current = requestAnimationFrame(tick);
    };

    rafRef.current = requestAnimationFrame(tick);
    return () => {
      cancelAnimationFrame(rafRef.current);
      setLiveAmplitudes(null);
    };
  }, [isPlaying, audioRef]);

  const onClick = (e: React.MouseEvent<HTMLDivElement>) => {
    // Always measure against the inner bar strip so centering offset is excluded
    const target = barsRef.current ?? e.currentTarget;
    const rect = target.getBoundingClientRect();
    const pct = (e.clientX - rect.left) / rect.width;
    onSeekPct(Math.max(0, Math.min(1, pct)));
  };

  return (
    <div
      role="slider"
      aria-label="Audio position"
      aria-valuenow={Math.round(progressPct)}
      aria-valuemin={0}
      aria-valuemax={100}
      onClick={onClick}
      onMouseMove={onMouseMove}
      onMouseLeave={onMouseLeave}
      className="relative flex h-[124px] w-full items-center cursor-pointer select-none overflow-visible"
    >
      <div
        ref={barsRef}
        className="relative w-full flex items-center justify-between overflow-visible"
      >
      {staticBars.map((b, i) => {
        const color = b.color === "brand" ? BRAND : b.color === "teal" ? TEAL : GRAY_BAR;
        const barPct = (i / BAR_COUNT) * 100;
        const passed = barPct < displayPct;

        // ─ Gaussian fisheye — bars near cursor grow, distant bars untouched──────
        // sigma controls the spread (~8% of waveform width = ~9 bars)
        let barScaleY = 1;
        if (hoverPct !== null) {
          const dist = Math.abs(barPct - hoverPct) / 100;
          const sigma = 0.08;
          barScaleY = 1 + 0.75 * Math.exp(-(dist * dist) / (2 * sigma * sigma));
        }

        // When playing, blend decoded amplitude with real-time analyser value
        let heightPx: number;
        if (liveAmplitudes && isPlaying) {
          // Use real-time frequency magnitude for current bar position
          // For past bars: blend decoded peak with live; for future bars: decoded only
          const live = liveAmplitudes[i] ?? 0;
          if (passed) {
            // Past: show static peak height, boost if currently near playhead
            const distFromHead = Math.abs(barPct - progressPct) / 100;
            const boost = Math.max(0, 1 - distFromHead * BAR_COUNT * 0.4);
            heightPx = Math.max(4, Math.round((b.h + live * boost * 0.6) * 112));
          } else {
            heightPx = Math.max(4, Math.round(b.h * 112));
          }
        } else {
          heightPx = Math.max(4, Math.round(b.h * 112));
        }

        return (
          <span
            key={i}
            className="block rounded-full"
            style={{
              width: 3,
              height: `${heightPx}px`,
              background: color,
              opacity: passed ? 1 : 0.35,
              transform: `scaleY(${barScaleY.toFixed(3)})`,
              transformOrigin: "center",
              transition: "opacity 90ms ease-out, height 80ms ease-out, transform 260ms cubic-bezier(0.34, 1.56, 0.64, 1)",
              flexShrink: 0,
            }}
          />
        );
      })}

      {/* Hover ghost cursor — shows where click would seek */}
      {hoverPct !== null && (
        <span
          className="pointer-events-none absolute inset-y-[-6px] w-px"
          style={{
            left: `${hoverPct}%`,
            transform: "translateX(-50%)",
            background: "var(--text-400, #9ca3af)",
            opacity: 0.5,
            borderRadius: 1,
          }}
        />
      )}

      {/* Playhead — smooth animated position indicator */}
      {displayPct > 0.5 && (
        <span
          className="pointer-events-none absolute inset-y-[-4px] w-[2px] rounded-full"
          style={{
            left: `${displayPct}%`,
            transform: "translateX(-50%)",
            background: BRAND,
            opacity: 0.85,
            boxShadow: `0 0 6px 1px ${BRAND}55`,
          }}
        />
      )}
      </div>
    </div>
  );
}

function Skip15({ direction }: { direction: "back" | "forward" }) {
  const Icon = direction === "back" ? RotateCcw : RotateCw;
  return (
    <span className="relative inline-flex h-6 w-6 items-center justify-center">
      <Icon size={24} strokeWidth={1.6} />
      <span
        className="tnum absolute inset-0 flex items-center justify-center pt-[2px] text-[8.5px] font-bold"
        style={{ color: "inherit" }}
      >
        15
      </span>
    </span>
  );
}

function TranscriptCard(props: Parameters<typeof CenterPanel>[0]) {
  const hasBoth =
    !!(props.session.transcript.bengali && props.session.transcript.english);

  return (
    <div className="card enter-3">
      <div
        className="flex items-center justify-between px-6"
        style={{ borderBottom: "1px solid var(--border)" }}
      >
        <div className="flex items-center gap-6">
          {(["transcript", "speakers", "notes", "highlights"] as const).map((t) => {
            const count =
              t === "notes" ? props.notes.length :
              t === "highlights" ? props.highlights.length :
              0;
            return (
              <button
                key={t}
                onClick={() => props.setActiveTab(t)}
                className={cn("panel-tab capitalize", props.activeTab === t && "is-active")}
              >
                {t}
                {count > 0 && (
                  <span
                    className="ml-1.5 tnum rounded-full px-1.5 text-[10px] font-semibold"
                    style={{ background: "var(--surface-gray)", color: "var(--text-500)" }}
                  >
                    {count}
                  </span>
                )}
              </button>
            );
          })}
        </div>

        <div className="flex items-center gap-2">
          {/* Language toggle — only visible on transcript tab when both languages exist */}
          {props.activeTab === "transcript" && hasBoth && (
            <div
              className="flex items-center rounded-lg p-0.5"
              style={{ background: "var(--surface-gray)", gap: 2 }}
            >
              {(["bn", "en"] as const).map((l) => (
                <button
                  key={l}
                  onClick={() => props.setTranscriptLang(l)}
                  className="rounded-md px-2.5 py-1 text-[11px] font-semibold transition-colors"
                  style={{
                    background: props.transcriptLang === l ? "var(--app-bg)" : "transparent",
                    color: props.transcriptLang === l ? "var(--text-900)" : "var(--text-400)",
                    boxShadow: props.transcriptLang === l ? "0 1px 3px rgba(0,0,0,.08)" : "none",
                  }}
                >
                  {l === "bn" ? "বাংলা" : "English"}
                </button>
              ))}
            </div>
          )}
          <PanelTools
            transcriptSearch={props.transcriptSearch}
            setTranscriptSearch={props.setTranscriptSearch}
            filterMenuOpen={props.filterMenuOpen}
            setFilterMenuOpen={props.setFilterMenuOpen}
            speakerFilter={props.speakerFilter}
            setSpeakerFilter={props.setSpeakerFilter}
            shares={props.shares}
            onExpand={props.onExpand}
          />
        </div>
      </div>

      <div className="p-6">
        {props.activeTab === "transcript" && (
          <TranscriptList
            turns={props.visibleTurns}
            timings={props.timings}
            currentTime={props.currentTime}
            searchQuery={props.transcriptSearch}
            onSeek={props.onSeekTo}
          />
        )}
        {props.activeTab === "speakers" && <SpeakersTab shares={props.shares} turns={props.turns} />}
        {props.activeTab === "notes" && (
          <NotesTab
            notes={props.notes}
            noteDraft={props.noteDraft}
            setNoteDraft={props.setNoteDraft}
            onAdd={props.onAddNote}
            onDelete={props.onDeleteNote}
          />
        )}
        {props.activeTab === "highlights" && (
          <HighlightsTab
            highlights={props.highlights}
            turns={props.turns}
            onDelete={props.onDeleteHighlight}
            timings={props.timings}
            onSeek={props.onSeekTo}
          />
        )}
      </div>
    </div>
  );
}

function PanelTools({
  transcriptSearch,
  setTranscriptSearch,
  filterMenuOpen,
  setFilterMenuOpen,
  speakerFilter,
  setSpeakerFilter,
  shares,
  onExpand,
}: {
  transcriptSearch: string;
  setTranscriptSearch: (v: string) => void;
  filterMenuOpen: boolean;
  setFilterMenuOpen: (b: boolean) => void;
  speakerFilter: Set<number>;
  setSpeakerFilter: (s: Set<number>) => void;
  shares: ShareInfo[];
  onExpand: () => void;
}) {
  const filterRef = useRef<HTMLDivElement>(null);
  useEffect(() => {
    if (!filterMenuOpen) return;
    const onClick = (e: MouseEvent) => {
      if (filterRef.current && !filterRef.current.contains(e.target as Node)) setFilterMenuOpen(false);
    };
    document.addEventListener("mousedown", onClick);
    return () => document.removeEventListener("mousedown", onClick);
  }, [filterMenuOpen, setFilterMenuOpen]);

  const toggle = (id: number) => {
    const next = new Set(speakerFilter);
    if (next.has(id)) next.delete(id); else next.add(id);
    setSpeakerFilter(next);
  };

  return (
    <div className="flex items-center gap-2">
      <div className="relative">
        <Search
          size={13}
          strokeWidth={2}
          className="pointer-events-none absolute left-2.5 top-1/2 -translate-y-1/2"
          style={{ color: "var(--text-400)" }}
        />
        <input
          type="text"
          placeholder="Search in transcript"
          value={transcriptSearch}
          onChange={(e) => setTranscriptSearch(e.target.value)}
          className="panel-search w-[220px]"
        />
      </div>
      <div className="relative" ref={filterRef}>
        <button
          className={cn("icon-btn", speakerFilter.size > 0 && "bg-[var(--brand-soft)]")}
          style={{ width: 32, height: 32, color: speakerFilter.size > 0 ? BRAND : undefined }}
          aria-label="Filter speakers"
          onClick={() => setFilterMenuOpen(!filterMenuOpen)}
        >
          <SlidersHorizontal size={15} strokeWidth={1.8} />
        </button>
        {filterMenuOpen && (
          <div
            className="absolute right-0 top-10 z-20 w-52 overflow-hidden rounded-[8px] border bg-white p-2 shadow-lg"
            style={{ borderColor: "var(--border)" }}
          >
            <div className="px-2 pb-1.5 text-[11px] font-semibold uppercase tracking-wide" style={{ color: "var(--text-500)" }}>
              Filter by speaker
            </div>
            {shares.length === 0 && (
              <div className="px-2 py-1.5 text-[12px]" style={{ color: "var(--text-500)" }}>No speakers detected</div>
            )}
            {shares.map((s) => (
              <label
                key={s.id}
                className="flex cursor-pointer items-center gap-2 rounded px-2 py-1.5 text-[13px] transition-colors hover:bg-[var(--surface-muted)]"
                style={{ color: "var(--text-700)" }}
              >
                <input
                  type="checkbox"
                  checked={speakerFilter.has(s.id)}
                  onChange={() => toggle(s.id)}
                  className="h-3.5 w-3.5 accent-[var(--brand)]"
                />
                <span className="dot" style={{ background: s.color }} />
                <span className="flex-1">{s.name}</span>
                <span className="tnum text-[11px]" style={{ color: "var(--text-500)" }}>{s.percent}%</span>
              </label>
            ))}
            {speakerFilter.size > 0 && (
              <button
                className="mt-1.5 w-full rounded px-2 py-1.5 text-left text-[12px] transition-colors hover:bg-[var(--surface-muted)]"
                style={{ color: "var(--text-500)" }}
                onClick={() => setSpeakerFilter(new Set())}
              >
                Clear filter
              </button>
            )}
          </div>
        )}
      </div>
      <button className="icon-btn" style={{ width: 32, height: 32 }} aria-label="Expand" onClick={onExpand}>
        <Maximize2 size={14} strokeWidth={1.8} />
      </button>
    </div>
  );
}

function TranscriptList({
  turns,
  timings,
  currentTime,
  searchQuery,
  onSeek,
}: {
  turns: { t: Turn; idx: number }[];
  timings: number[];
  currentTime: number;
  searchQuery: string;
  onSeek: (t: number) => void;
}) {
  const containerRef = useRef<HTMLDivElement>(null);
  // Map from visible-list index → row DOM element
  const rowRefs = useRef<Map<number, HTMLDivElement>>(new Map());

  // Which visible-list row is currently active
  const activeVisibleIdx = useMemo(() => {
    if (turns.length === 0) return -1;
    let best = -1;
    for (let vi = 0; vi < turns.length; vi++) {
      const t = timings[turns[vi].idx] ?? 0;
      if (t <= currentTime) best = vi;
    }
    return best;
  }, [currentTime, timings, turns]);

  const prevActiveRef = useRef(-1);

  useEffect(() => {
    if (activeVisibleIdx < 0 || activeVisibleIdx === prevActiveRef.current) return;
    prevActiveRef.current = activeVisibleIdx;

    const container = containerRef.current;
    const row = rowRefs.current.get(activeVisibleIdx);
    if (!container || !row) return;

    // Scroll within the container — never touches the page scroll
    const containerRect = container.getBoundingClientRect();
    const rowRect = row.getBoundingClientRect();
    const relTop = rowRect.top - containerRect.top + container.scrollTop;
    const relBottom = relTop + rowRect.height;
    const pad = 24; // px of breathing room above the active row

    // Only scroll if row is not already comfortably visible
    const visTop = container.scrollTop;
    const visBottom = visTop + container.clientHeight;
    if (relTop - pad < visTop || relBottom + pad > visBottom) {
      container.scrollTo({ top: Math.max(0, relTop - pad), behavior: "smooth" });
    }
  }, [activeVisibleIdx]);

  if (turns.length === 0) {
    return (
      <div className="py-8 text-center text-[13px]" style={{ color: "var(--text-500)" }}>
        No matches
      </div>
    );
  }

  return (
    <div
      ref={containerRef}
      className="overflow-y-auto"
      style={{ maxHeight: "480px", scrollbarGutter: "stable" }}
    >
      <div className="flex flex-col py-2" style={{ gap: "28px" }}>
      {turns.map(({ t, idx }, vi) => (
        <TranscriptRow
          key={t.id}
          turn={t}
          time={timings[idx] ?? 0}
          searchQuery={searchQuery}
          isActive={vi === activeVisibleIdx}
          onSeek={onSeek}
          rowRef={(el) => {
            if (el) rowRefs.current.set(vi, el);
            else rowRefs.current.delete(vi);
          }}
        />
      ))}
      </div>
    </div>
  );
}

function TranscriptRow({
  turn,
  time,
  searchQuery,
  isActive,
  onSeek,
  rowRef,
}: {
  turn: Turn;
  time: number;
  searchQuery: string;
  isActive: boolean;
  onSeek: (t: number) => void;
  rowRef: (el: HTMLDivElement | null) => void;
}) {
  const color = SPEAKER_COLORS[turn.speakerIndex % SPEAKER_COLORS.length];
  return (
    <div
      ref={rowRef}
      className="flex items-start gap-6 rounded-[8px] transition-all duration-300"
      style={{
        paddingLeft: isActive ? "10px" : "0px",
        borderLeft: isActive ? `3px solid ${color}` : "3px solid transparent",
        opacity: isActive ? 1 : 0.75,
      }}
    >
      <button
        onClick={() => onSeek(time)}
        className="tnum shrink-0 pt-0.5 text-[14px] transition-colors hover:text-[var(--brand)]"
        style={{ color: "var(--text-400)", minWidth: "60px", textAlign: "left" }}
        aria-label={`Jump to ${fmtDuration(time)}`}
      >
        {fmtDuration(time)}
      </button>
      <div className="min-w-0 flex-1">
        <div className="mb-2 flex items-center gap-2">
          <span className="dot" style={{ background: color }} />
          <span className="text-[14px] font-medium" style={{ color }}>
            {turn.speaker || `Speaker ${turn.speakerIndex + 1}`}
          </span>
        </div>
        <p className="text-[15px]" style={{ color: "var(--text-700)", lineHeight: 1.6 }}>
          <HighlightedText text={turn.text} query={searchQuery} />
        </p>
      </div>
    </div>
  );
}

function HighlightedText({ text, query }: { text: string; query: string }) {
  const q = query.trim();
  if (!q) return <>{text}</>;
  const idx = text.toLowerCase().indexOf(q.toLowerCase());
  if (idx < 0) return <>{text}</>;
  return (
    <>
      {text.slice(0, idx)}
      <mark
        className="rounded px-0.5"
        style={{ background: "rgba(234, 88, 12, 0.18)", color: "var(--text-900)" }}
      >
        {text.slice(idx, idx + q.length)}
      </mark>
      {text.slice(idx + q.length)}
    </>
  );
}

/* ═════════════════════════════════════════════════════════════════════════
   TABS — Speakers / Notes / Highlights
   ═════════════════════════════════════════════════════════════════════════ */

function SpeakersTab({ shares, turns }: { shares: ShareInfo[]; turns: Turn[] }) {
  const totalWords = turns.reduce((s, t) => s + t.wordCount, 0);
  return (
    <div className="flex flex-col gap-4">
      {shares.length === 0 && (
        <div className="py-8 text-center text-[13px]" style={{ color: "var(--text-500)" }}>
          No speakers detected
        </div>
      )}
      {shares.map((s) => {
        const words = turns
          .filter((t) => t.speakerIndex === s.id)
          .reduce((acc, t) => acc + t.wordCount, 0);
        return (
          <div
            key={s.id}
            className="rounded-[10px] p-4"
            style={{ border: "1px solid var(--border)", background: "var(--surface-muted)" }}
          >
            <div className="flex items-center justify-between">
              <div className="flex items-center gap-2">
                <span className="dot" style={{ background: s.color }} />
                <span className="text-[14px] font-semibold" style={{ color: s.color }}>
                  {s.name}
                </span>
              </div>
              <span className="tnum text-[13px] font-medium" style={{ color: "var(--text-900)" }}>
                {s.percent}%
              </span>
            </div>
            <div className="mt-3 track">
              <span className="track-fill" style={{ width: `${s.percent}%`, background: s.color }} />
            </div>
            <div className="mt-2 tnum text-[12px]" style={{ color: "var(--text-500)" }}>
              {words} / {totalWords} words
            </div>
          </div>
        );
      })}
    </div>
  );
}

function NotesTab({
  notes,
  noteDraft,
  setNoteDraft,
  onAdd,
  onDelete,
}: {
  notes: Note[];
  noteDraft: string;
  setNoteDraft: (v: string) => void;
  onAdd: () => void;
  onDelete: (id: string) => void;
}) {
  return (
    <div className="flex flex-col gap-3">
      <form
        onSubmit={(e: FormEvent) => { e.preventDefault(); onAdd(); }}
        className="flex items-stretch gap-2"
      >
        <input
          value={noteDraft}
          onChange={(e) => setNoteDraft(e.target.value)}
          placeholder="Add a note…"
          className="flex-1 rounded-[8px] border px-3 py-2 text-[14px] outline-none transition-colors focus:border-[rgba(var(--brand-rgb),0.4)]"
          style={{ borderColor: "var(--border)", color: "var(--text-900)", background: "var(--surface)" }}
        />
        <button
          type="submit"
          className="rounded-[8px] px-4 py-2 text-[13px] font-medium transition-opacity hover:opacity-90 disabled:opacity-40"
          style={{ background: "var(--text-900)", color: "#fff" }}
          disabled={!noteDraft.trim()}
        >
          Add
        </button>
      </form>
      {notes.length === 0 && (
        <div className="py-8 text-center text-[13px]" style={{ color: "var(--text-500)" }}>
          No notes yet. Capture insights as you review.
        </div>
      )}
      {notes.map((n) => (
        <div
          key={n.id}
          className="group flex items-start gap-3 rounded-[10px] p-3"
          style={{ border: "1px solid var(--border)" }}
        >
          <PencilLine size={14} className="mt-0.5 shrink-0" style={{ color: "var(--text-400)" }} />
          <div className="min-w-0 flex-1">
            <p className="text-[14px]" style={{ color: "var(--text-900)" }}>{n.text}</p>
            <div className="mt-1 tnum text-[11px]" style={{ color: "var(--text-400)" }}>{timeAgo(n.createdAt)}</div>
          </div>
          <button
            aria-label="Delete note"
            onClick={() => onDelete(n.id)}
            className="opacity-0 transition-opacity group-hover:opacity-100"
            style={{ color: "var(--text-400)" }}
          >
            <Trash2 size={14} />
          </button>
        </div>
      ))}
    </div>
  );
}

function HighlightsTab({
  highlights,
  turns,
  timings,
  onDelete,
  onSeek,
}: {
  highlights: Highlight[];
  turns: Turn[];
  timings: number[];
  onDelete: (id: string) => void;
  onSeek: (t: number) => void;
}) {
  if (highlights.length === 0) {
    return (
      <div className="py-8 text-center text-[13px]" style={{ color: "var(--text-500)" }}>
        No highlights yet. Select text in the transcript and hit "Create Highlight".
      </div>
    );
  }
  return (
    <div className="flex flex-col gap-3">
      {highlights.map((h) => {
        const turn = turns[h.turnIndex];
        const color = turn ? SPEAKER_COLORS[turn.speakerIndex % SPEAKER_COLORS.length] : BRAND;
        return (
          <div
            key={h.id}
            className="group flex items-start gap-3 rounded-[10px] p-3"
            style={{ border: "1px solid var(--border)" }}
          >
            <Star size={14} className="mt-0.5 shrink-0" style={{ color: BRAND }} fill={BRAND} />
            <div className="min-w-0 flex-1">
              <button
                onClick={() => onSeek(timings[h.turnIndex] ?? 0)}
                className="mb-1 inline-flex items-center gap-1.5 tnum text-[12px] transition-colors hover:text-[var(--brand)]"
                style={{ color }}
              >
                <span className="dot" style={{ background: color }} />
                {turn?.speaker ?? "Speaker"}
                <span style={{ color: "var(--text-400)" }}>·</span>
                <span style={{ color: "var(--text-400)" }}>{fmtDuration(timings[h.turnIndex] ?? 0)}</span>
              </button>
              <p className="text-[14px] italic" style={{ color: "var(--text-900)" }}>“{h.text}”</p>
            </div>
            <button
              aria-label="Delete highlight"
              onClick={() => onDelete(h.id)}
              className="opacity-0 transition-opacity group-hover:opacity-100"
              style={{ color: "var(--text-400)" }}
            >
              <Trash2 size={14} />
            </button>
          </div>
        );
      })}
    </div>
  );
}

/* ═════════════════════════════════════════════════════════════════════════
   RIGHT SIDEBAR
   ═════════════════════════════════════════════════════════════════════════ */

function RightSidebar({
  session,
  summary,
  evaluation,
  topics,
  shares,
  onViewSummary,
  onViewAllTopics,
  onAddNote,
  onCreateHighlight,
  onCopyTranscript,
}: {
  session: LibrarySession;
  summary: string;
  evaluation: { overall_score?: number; summary?: string } | null;
  topics: Topic[];
  shares: ShareInfo[];
  onViewSummary: () => void;
  onViewAllTopics: () => void;
  onAddNote: () => void;
  onCreateHighlight: () => void;
  onCopyTranscript: () => void;
}) {
  return (
    <aside
      className="flex min-h-0 flex-col gap-4 overflow-y-auto py-8 pr-8"
      style={{ background: "var(--app-bg)" }}
    >
      <AISummaryCard summary={evaluation?.summary ?? summary} score={evaluation?.overall_score} onViewSummary={onViewSummary} />
      <KeyTopicsCard topics={topics} onViewAllTopics={onViewAllTopics} />
      <SpeakersCard shares={shares} />
      <QuickActionsCard onAddNote={onAddNote} onCreateHighlight={onCreateHighlight} onCopyTranscript={onCopyTranscript} />
    </aside>
  );
}

function CardTitle({ icon, title }: { icon: React.ReactNode; title: string }) {
  return (
    <div className="flex items-center gap-2">
      {icon}
      <span className="text-[15px] font-bold" style={{ color: "var(--text-900)" }}>{title}</span>
    </div>
  );
}

function AISummaryCard({
  summary,
  score,
  onViewSummary,
}: {
  summary: string;
  score?: number;
  onViewSummary: () => void;
}) {
  return (
    <div className="card enter-1 p-5">
      <div className="flex items-center justify-between">
        <CardTitle icon={<SparkleFour size={16} color={PURPLE} />} title="AI Summary" />
        {typeof score === "number" && (
          <span
            className="tnum rounded-full px-2 py-0.5 text-[11px] font-semibold"
            style={{ background: "rgba(139, 92, 246, 0.12)", color: PURPLE }}
          >
            {score.toFixed(1)}/5
          </span>
        )}
      </div>
      <p className="mt-3 text-[13px]" style={{ color: "var(--text-700)", lineHeight: 1.5 }}>
        {summary}
      </p>
      <button
        onClick={onViewSummary}
        className="mt-4 flex h-9 w-full items-center justify-center gap-1.5 rounded-[8px] border text-[13px] font-medium transition-colors hover:bg-[var(--surface-muted)]"
        style={{ borderColor: "var(--border)", color: "var(--text-700)" }}
      >
        <span>View full summary</span>
        <ArrowRight size={13} strokeWidth={2} />
      </button>
    </div>
  );
}

function KeyTopicsCard({
  topics,
  onViewAllTopics,
}: {
  topics: Topic[];
  onViewAllTopics: () => void;
}) {
  return (
    <div className="card enter-2 p-5">
      <CardTitle icon={<Hash size={16} strokeWidth={2.2} style={{ color: BRAND }} />} title="Key Topics" />
      <div className="mt-4 flex flex-col gap-3">
        {topics.length === 0 && (
          <div className="py-2 text-[12px]" style={{ color: "var(--text-500)" }}>
            Topics will appear after transcription.
          </div>
        )}
        {topics.map((t) => (
          <div key={t.label} className="group">
            <div className="mb-2 flex items-center justify-between">
              <span className="text-[13px] font-medium" style={{ color: "var(--text-700)" }}>{t.label}</span>
              <span className="tnum text-[12px] font-semibold tabular-nums" style={{ color: "var(--text-500)" }}>{t.percent}%</span>
            </div>
            <div className="track">
              <span
                className="track-fill block"
                style={{ width: `${t.percent}%`, background: `linear-gradient(90deg, ${BRAND}cc, ${BRAND})` }}
              />
            </div>
          </div>
        ))}
      </div>
      {topics.length > 0 && (
        <button
          onClick={onViewAllTopics}
          className="mt-5 flex h-9 w-full items-center justify-center gap-1.5 rounded-[8px] border text-[13px] font-medium transition-colors hover:bg-[var(--surface-muted)]"
          style={{ borderColor: "var(--border)", color: "var(--text-700)" }}
        >
          <span>View all topics</span>
          <ArrowRight size={13} strokeWidth={2} />
        </button>
      )}
    </div>
  );
}

function SpeakersCard({ shares }: { shares: ShareInfo[] }) {
  return (
    <div className="card enter-3 p-5">
      <CardTitle icon={<SpeakersIcon />} title="Speakers" />
      <div className="mt-4 flex flex-col gap-3">
        {shares.length === 0 && (
          <div className="py-2 text-[12px]" style={{ color: "var(--text-500)" }}>
            No speakers detected yet.
          </div>
        )}
        {shares.map((s) => (
          <div key={s.id}>
            <div className="mb-2 flex items-center justify-between">
              <span className="flex items-center gap-2 text-[13px] font-medium" style={{ color: "var(--text-700)" }}>
                <span className="dot" style={{ background: s.color }} />
                {s.name}
              </span>
              <span className="tnum text-[12px] font-semibold tabular-nums" style={{ color: "var(--text-500)" }}>
                {s.percent}%
              </span>
            </div>
            <div className="track">
              <span
                className="track-fill block"
                style={{ width: `${s.percent}%`, background: `linear-gradient(90deg, ${s.color}bb, ${s.color})` }}
              />
            </div>
          </div>
        ))}
      </div>
    </div>
  );
}

function SpeakersIcon() {
  return (
    <svg width="16" height="16" viewBox="0 0 24 24" fill="none" aria-hidden>
      <circle cx="9" cy="9" r="3" stroke="var(--text-700)" strokeWidth="1.6" />
      <path d="M3 19c0-3.3 2.7-6 6-6s6 2.7 6 6" stroke="var(--text-700)" strokeWidth="1.6" strokeLinecap="round" />
      <circle cx="16.5" cy="8" r="2.5" stroke="var(--text-700)" strokeWidth="1.6" />
      <path d="M15 13.3c.5-.2 1-.3 1.5-.3 2.8 0 5 2.2 5 5" stroke="var(--text-700)" strokeWidth="1.6" strokeLinecap="round" />
    </svg>
  );
}

function QuickActionsCard({
  onAddNote,
  onCreateHighlight,
  onCopyTranscript,
}: {
  onAddNote: () => void;
  onCreateHighlight: () => void;
  onCopyTranscript: () => void;
}) {
  return (
    <div className="card enter-4 p-5">
      <CardTitle
        icon={<Zap size={16} strokeWidth={2} style={{ color: PURPLE }} fill={PURPLE} />}
        title="Quick Actions"
      />
      <div className="mt-4 grid grid-cols-2 gap-2">
        <QuickAction icon={<PencilLine size={14} strokeWidth={1.8} />} label="Add Note" onClick={onAddNote} />
        <QuickAction icon={<Star size={14} strokeWidth={1.8} />} label="Create Highlight" onClick={onCreateHighlight} />
      </div>
      <button
        onClick={onCopyTranscript}
        className="mt-2 flex h-9 w-full items-center justify-center gap-1.5 rounded-[8px] border text-[13px] transition-colors hover:bg-[var(--surface-muted)]"
        style={{ background: "var(--surface)", borderColor: "var(--border)", color: "var(--text-700)" }}
      >
        <Copy size={14} strokeWidth={1.8} />
        <span>Copy Transcript</span>
      </button>
    </div>
  );
}

function QuickAction({
  icon,
  label,
  onClick,
}: {
  icon: React.ReactNode;
  label: string;
  onClick: () => void;
}) {
  return (
    <button
      onClick={onClick}
      className="flex h-9 items-center justify-center gap-1.5 rounded-[8px] border text-[13px] transition-colors hover:bg-[var(--surface-muted)]"
      style={{ background: "var(--surface)", borderColor: "var(--border)", color: "var(--text-700)" }}
    >
      {icon}
      <span>{label}</span>
    </button>
  );
}

/* ═════════════════════════════════════════════════════════════════════════
   OVERLAYS — upload, notes drawer, summary, all topics, expanded transcript
   ═════════════════════════════════════════════════════════════════════════ */

function UploadOverlay({
  state,
  error,
  fileName,
  progress,
  onDismiss,
}: {
  state: "uploading" | "processing" | "done" | "error";
  error: string;
  fileName: string;
  progress: number;
  onDismiss: () => void;
}) {
  return (
    <div className="pointer-events-none fixed inset-0 z-40 flex items-end justify-end p-6">
      <div
        className="pointer-events-auto w-[380px] rounded-[14px] border bg-white p-4 shadow-2xl"
        style={{ borderColor: "var(--border)" }}
      >
        <div className="flex items-start gap-3">
          <div className="mt-0.5">
            {state === "done" ? (
              <Check size={18} className="text-[var(--success)]" />
            ) : state === "error" ? (
              <X size={18} className="text-red-600" />
            ) : (
              <Loader2 size={18} className="animate-spin" style={{ color: BRAND }} />
            )}
          </div>
          <div className="min-w-0 flex-1">
            <div className="text-[13px] font-semibold" style={{ color: "var(--text-900)" }}>
              {state === "uploading" && "Uploading…"}
              {state === "processing" && "Transcribing…"}
              {state === "done" && "Transcription complete"}
              {state === "error" && "Transcription failed"}
            </div>
            <div className="mt-0.5 truncate text-[12px]" style={{ color: "var(--text-500)" }}>
              {fileName || "Audio file"}
            </div>
            {(state === "uploading" || state === "processing") && (
              <div className="mt-2 h-1.5 w-full overflow-hidden rounded-full" style={{ background: "var(--surface-gray)" }}>
                <div
                  className="h-full rounded-full transition-all duration-300"
                  style={{ width: `${progress}%`, background: BRAND }}
                />
              </div>
            )}
            {state === "error" && error && (
              <div className="mt-2 text-[12px] text-red-600">{error}</div>
            )}
          </div>
          {(state === "done" || state === "error") && (
            <button aria-label="Dismiss" onClick={onDismiss} style={{ color: "var(--text-400)" }}>
              <X size={16} />
            </button>
          )}
        </div>
      </div>
    </div>
  );
}

function NotesDrawer({
  noteDraft,
  setNoteDraft,
  onAdd,
  onClose,
}: {
  noteDraft: string;
  setNoteDraft: (v: string) => void;
  onAdd: () => void;
  onClose: () => void;
}) {
  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/30 p-4" onClick={onClose}>
      <div
        className="w-full max-w-[420px] rounded-[14px] bg-white p-5 shadow-2xl"
        style={{ border: "1px solid var(--border)" }}
        onClick={(e) => e.stopPropagation()}
      >
        <div className="mb-3 flex items-center justify-between">
          <h3 className="text-[16px] font-semibold" style={{ color: "var(--text-900)" }}>
            Add a note
          </h3>
          <button onClick={onClose} aria-label="Close" style={{ color: "var(--text-400)" }}>
            <X size={18} />
          </button>
        </div>
        <textarea
          autoFocus
          rows={4}
          value={noteDraft}
          onChange={(e) => setNoteDraft(e.target.value)}
          placeholder="Write a quick thought about this transcript…"
          className="w-full rounded-[10px] border p-3 text-[14px] outline-none transition-colors focus:border-[rgba(var(--brand-rgb),0.4)]"
          style={{ borderColor: "var(--border)", color: "var(--text-900)" }}
        />
        <div className="mt-3 flex items-center justify-end gap-2">
          <button
            onClick={onClose}
            className="rounded-[8px] px-4 py-2 text-[13px] font-medium transition-colors hover:bg-[var(--surface-muted)]"
            style={{ color: "var(--text-700)" }}
          >
            Cancel
          </button>
          <button
            onClick={onAdd}
            disabled={!noteDraft.trim()}
            className="rounded-[8px] px-4 py-2 text-[13px] font-medium transition-opacity hover:opacity-90 disabled:opacity-40"
            style={{ background: "var(--text-900)", color: "#fff" }}
          >
            Save note
          </button>
        </div>
      </div>
    </div>
  );
}

function SummaryModal({
  onClose,
  summary,
  evaluation,
  evaluating,
  onEvaluate,
  isDemo,
}: {
  onClose: () => void;
  summary: string;
  evaluation: {
    overall_score?: number;
    summary?: string;
    categories?: Record<string, { score: number; feedback: string }>;
    recommendations?: string[];
  } | null;
  evaluating: boolean;
  onEvaluate: () => void;
  isDemo: boolean;
}) {
  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/40 p-4" onClick={onClose}>
      <div
        className="w-full max-w-[640px] max-h-[86vh] overflow-hidden rounded-[16px] bg-white shadow-2xl flex flex-col"
        style={{ border: "1px solid var(--border)" }}
        onClick={(e) => e.stopPropagation()}
      >
        <div className="flex items-center justify-between px-6 py-4" style={{ borderBottom: "1px solid var(--border)" }}>
          <div className="flex items-center gap-2">
            <SparkleFour size={18} color={PURPLE} />
            <h3 className="text-[17px] font-bold" style={{ color: "var(--text-900)" }}>
              AI Summary & Evaluation
            </h3>
          </div>
          <button onClick={onClose} aria-label="Close" style={{ color: "var(--text-400)" }}>
            <X size={18} />
          </button>
        </div>

        <div className="flex-1 overflow-y-auto px-6 py-5">
          <h4 className="text-[12px] font-semibold uppercase tracking-wide" style={{ color: "var(--text-500)" }}>
            Summary
          </h4>
          <p className="mt-2 text-[14px] leading-relaxed" style={{ color: "var(--text-700)" }}>
            {summary}
          </p>

          {evaluation?.summary && (
            <>
              <h4 className="mt-5 text-[12px] font-semibold uppercase tracking-wide" style={{ color: "var(--text-500)" }}>
                Key Observations
              </h4>
              <p className="mt-2 text-[13px] leading-relaxed" style={{ color: "var(--text-700)" }}>
                {evaluation.summary.replace(/\*{1,3}([^*]+)\*{1,3}/g, "$1").replace(/_{1,3}([^_]+)_{1,3}/g, "$1")}
              </p>
            </>
          )}

          <div className="mt-5 flex items-center justify-between">
            <h4 className="text-[12px] font-semibold uppercase tracking-wide" style={{ color: "var(--text-500)" }}>
              Evaluation breakdown
            </h4>
            {!evaluation && !evaluating && (
              <button
                onClick={onEvaluate}
                disabled={isDemo}
                className="inline-flex items-center gap-1.5 rounded-[8px] border px-3 py-1.5 text-[12px] font-medium transition-colors hover:bg-[var(--surface-muted)] disabled:opacity-40"
                style={{ borderColor: "var(--border)", color: "var(--text-700)" }}
              >
                <Wand2 size={12} />
                <span>Run evaluation</span>
              </button>
            )}
          </div>

          {evaluating && (
            <div className="mt-3 flex items-center gap-2 text-[13px]" style={{ color: "var(--text-500)" }}>
              <Loader2 size={14} className="animate-spin" />
              <span>Evaluating transcript…</span>
            </div>
          )}

          {!evaluating && !evaluation && (
            <p className="mt-3 text-[13px]" style={{ color: "var(--text-500)" }}>
              {isDemo
                ? "Upload a real transcription to run the detailed evaluation."
                : "Run evaluation to score interaction on four pedagogical criteria."}
            </p>
          )}

          {evaluation?.categories && (
            <div className="mt-3 flex flex-col gap-3">
              {Object.entries(evaluation.categories).map(([key, val]) => (
                <div key={key} className="rounded-[10px] p-4" style={{ border: "1px solid var(--border)", background: "var(--surface-muted)" }}>
                  <div className="flex items-center justify-between">
                    <span className="text-[13px] font-semibold" style={{ color: "var(--text-900)" }}>
                      {key.replace(/_/g, " ").toLowerCase().replace(/^./, (c) => c.toUpperCase())}
                    </span>
                    <span
                      className="tnum rounded-full px-2 py-0.5 text-[11px] font-bold"
                      style={{ background: "rgba(139, 92, 246, 0.12)", color: PURPLE }}
                    >
                      {val.score}/5
                    </span>
                  </div>
                  <p className="mt-2 text-[13px]" style={{ color: "var(--text-700)", lineHeight: 1.5 }}>
                    {val.feedback}
                  </p>
                </div>
              ))}
            </div>
          )}

          {evaluation?.recommendations && evaluation.recommendations.length > 0 && (
            <>
              <h4 className="mt-5 text-[12px] font-semibold uppercase tracking-wide" style={{ color: "var(--text-500)" }}>
                Recommendations
              </h4>
              <ul className="mt-2 flex flex-col gap-2">
                {evaluation.recommendations.map((rec, i) => (
                  <li key={i} className="flex items-start gap-2 text-[13px]" style={{ color: "var(--text-700)", lineHeight: 1.5 }}>
                    <span className="mt-[3px] shrink-0 h-4 w-4 rounded-full flex items-center justify-center text-[9px] font-bold" style={{ background: "rgba(139,92,246,0.12)", color: PURPLE }}>{i + 1}</span>
                    <span>{rec}</span>
                  </li>
                ))}
              </ul>
            </>
          )}
        </div>
      </div>
    </div>
  );
}

function AllTopicsModal({ onClose, topics }: { onClose: () => void; topics: Topic[] }) {
  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/40 p-4" onClick={onClose}>
      <div
        className="w-full max-w-[480px] max-h-[80vh] overflow-hidden rounded-[16px] bg-white shadow-2xl flex flex-col"
        style={{ border: "1px solid var(--border)" }}
        onClick={(e) => e.stopPropagation()}
      >
        <div className="flex items-center justify-between px-6 py-4" style={{ borderBottom: "1px solid var(--border)" }}>
          <div className="flex items-center gap-2">
            <Hash size={18} strokeWidth={2.2} style={{ color: BRAND }} />
            <h3 className="text-[17px] font-bold" style={{ color: "var(--text-900)" }}>All Topics</h3>
          </div>
          <button onClick={onClose} aria-label="Close" style={{ color: "var(--text-400)" }}>
            <X size={18} />
          </button>
        </div>
        <div className="flex-1 overflow-y-auto p-5">
          {topics.length === 0 ? (
            <div className="py-8 text-center text-[13px]" style={{ color: "var(--text-500)" }}>
              Topics will appear after transcription.
            </div>
          ) : (
            <div className="flex flex-col gap-3">
              {topics.map((t) => (
                <div key={t.label}>
                  <div className="mb-1.5 flex items-center justify-between">
                    <span className="text-[13.5px]" style={{ color: "var(--text-700)" }}>{t.label}</span>
                    <span className="tnum text-[13px] font-medium" style={{ color: "var(--text-900)" }}>
                      {t.count} <span style={{ color: "var(--text-400)" }}>mentions</span>
                    </span>
                  </div>
                  <div className="track">
                    <span className="track-fill" style={{ width: `${t.percent}%`, background: BRAND }} />
                  </div>
                </div>
              ))}
            </div>
          )}
        </div>
      </div>
    </div>
  );
}

function ExpandedTranscriptModal({
  onClose,
  turns,
  timings,
  searchQuery,
  onSeek,
  hasBoth,
  transcriptLang,
  setTranscriptLang,
}: {
  onClose: () => void;
  turns: { t: Turn; idx: number }[];
  timings: number[];
  searchQuery: string;
  onSeek: (t: number) => void;
  hasBoth: boolean;
  transcriptLang: "bn" | "en";
  setTranscriptLang: (l: "bn" | "en") => void;
}) {
  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/40 p-4" onClick={onClose}>
      <div
        className="flex h-[90vh] w-full max-w-[960px] flex-col overflow-hidden rounded-[16px] bg-white shadow-2xl"
        style={{ border: "1px solid var(--border)" }}
        onClick={(e) => e.stopPropagation()}
      >
        <div className="flex items-center justify-between px-6 py-4" style={{ borderBottom: "1px solid var(--border)" }}>
          <h3 className="text-[17px] font-bold" style={{ color: "var(--text-900)" }}>Transcript</h3>
          <div className="flex items-center gap-3">
            {hasBoth && (
              <div
                className="flex items-center rounded-lg p-0.5"
                style={{ background: "var(--surface-gray)", gap: 2 }}
              >
                {(["bn", "en"] as const).map((l) => (
                  <button
                    key={l}
                    onClick={() => setTranscriptLang(l)}
                    className="rounded-md px-2.5 py-1 text-[11px] font-semibold transition-colors"
                    style={{
                      background: transcriptLang === l ? "var(--app-bg)" : "transparent",
                      color: transcriptLang === l ? "var(--text-900)" : "var(--text-400)",
                      boxShadow: transcriptLang === l ? "0 1px 3px rgba(0,0,0,.08)" : "none",
                    }}
                  >
                    {l === "bn" ? "বাংলা" : "English"}
                  </button>
                ))}
              </div>
            )}
            <button onClick={onClose} aria-label="Close" style={{ color: "var(--text-400)" }}>
              <X size={18} />
            </button>
          </div>
        </div>
        <div className="flex-1 overflow-y-auto px-8 py-6">
          <TranscriptList turns={turns} timings={timings} currentTime={0} searchQuery={searchQuery} onSeek={onSeek} />
        </div>
      </div>
    </div>
  );
}

/* ═════════════════════════════════════════════════════════════════════════
   TOASTS
   ═════════════════════════════════════════════════════════════════════════ */

function ToastStack({ toasts }: { toasts: Toast[] }) {
  return (
    <div className="pointer-events-none fixed bottom-6 left-1/2 z-50 flex -translate-x-1/2 flex-col items-center gap-2">
      {toasts.map((t) => (
        <div
          key={t.id}
          className="pointer-events-auto flex items-center gap-2 rounded-[10px] border px-4 py-2.5 text-[13px] font-medium shadow-lg"
          style={{
            background:
              t.tone === "err"
                ? "#fef2f2"
                : t.tone === "ok"
                ? "#f0fdf4"
                : "var(--surface)",
            borderColor:
              t.tone === "err"
                ? "#fecaca"
                : t.tone === "ok"
                ? "#bbf7d0"
                : "var(--border)",
            color:
              t.tone === "err" ? "#991b1b" : t.tone === "ok" ? "#166534" : "var(--text-900)",
          }}
        >
          {t.tone === "ok" ? (
            <Check size={14} className="shrink-0" />
          ) : t.tone === "err" ? (
            <X size={14} className="shrink-0" />
          ) : null}
          <span>{t.text}</span>
        </div>
      ))}
    </div>
  );
}
