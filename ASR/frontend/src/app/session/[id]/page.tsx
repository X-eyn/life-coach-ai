'use client';

import { useEffect, useState, useMemo, useCallback, useRef } from 'react';
import { useParams, useRouter } from 'next/navigation';
import { ArrowLeft, Copy, Download, Loader, Check, Search, X, RefreshCw, ChevronDown, ChevronUp, Play, Pause, Volume2 } from 'lucide-react';
import { cn } from '@/lib/utils';
import { EvaluationComponent } from '@/components/evaluation';
import { InsightsTab } from '@/components/insights-tab';

// ── Types ────────────────────────────────────────────────────────────────────

interface TranscriptData {
  bengali: string;
  english: string;
}

interface LibrarySession {
  id: string;
  name: string;
  createdAt: number;
  duration: number | null;
  wordCount: number;
  transcript: TranscriptData;
  waveformPeaks: number[];
  speakers: { id: number; wordCount: number }[];
  languageSplit: { bn: number; en: number };
  speakerNames?: Record<number, string>;
  evaluationScore?: number | null;
}

interface Turn {
  id: string;
  speaker: string;
  speakerIndex: number;
  text: string;
  wordCount: number;
}

type ActiveTab = 'transcript' | 'evaluation' | 'insights';
type LanguageMode = 'bengali' | 'both' | 'english';

// ── Constants ────────────────────────────────────────────────────────────────

const LIBRARY_STORAGE_KEY = 'atelier_library';
const SPEAKER_COLORS = ['#cf5a43', '#1f7e7a', '#3456d6', '#c9900e'];
const WORDS_COLLAPSE_THRESHOLD = 200;

// ── Helpers ──────────────────────────────────────────────────────────────────

function parseTurns(transcript: string): Turn[] {
  const text = transcript.replace(/\r\n/g, '\n');
  const regex = /(?:\*\*([^*\n:]+?):\*\*|\[([^\]\n]+?)\]:)\s*/g;
  const markers: { index: number; speaker: string; fullMatch: string }[] = [];
  let match: RegExpExecArray | null;
  while ((match = regex.exec(text)) !== null) {
    markers.push({ index: match.index + match[0].length, speaker: (match[1] || match[2]).trim(), fullMatch: match[0] });
  }
  if (markers.length === 0) {
    const t = transcript.trim();
    return [{ id: '0', speaker: 'Transcript', speakerIndex: 0, text: t, wordCount: countWords(t) }];
  }
  const speakerMap = new Map<string, number>();
  markers.forEach(({ speaker }) => { if (!speakerMap.has(speaker)) speakerMap.set(speaker, speakerMap.size); });
  const turns: Turn[] = [];
  for (let i = 0; i < markers.length; i++) {
    const { speaker, index: start } = markers[i];
    const end = i + 1 < markers.length ? markers[i + 1].index - markers[i + 1].fullMatch.length : text.length;
    const raw = text.slice(start, end).trim();
    if (!raw) continue;
    turns.push({ id: `${i}`, speaker, speakerIndex: speakerMap.get(speaker) ?? 0, text: raw, wordCount: countWords(raw) });
  }
  return turns;
}

function countWords(text: string): number {
  return text.trim().split(/\s+/).filter(Boolean).length;
}

function speakerColor(index: number): string {
  return SPEAKER_COLORS[index % SPEAKER_COLORS.length];
}

function fmtTime(seconds: number): string {
  if (!seconds || isNaN(seconds) || !isFinite(seconds)) return '0:00';
  const m = Math.floor(seconds / 60);
  const s = Math.floor(seconds % 60);
  return `${m}:${s.toString().padStart(2, '0')}`;
}

function fmtDuration(seconds: number | null): string {
  if (!seconds || isNaN(seconds)) return '--:--';
  const total = Math.round(seconds);
  return `${Math.floor(total / 60).toString().padStart(2, '0')}:${(total % 60).toString().padStart(2, '0')}`;
}

function estimateTurnTimestamp(turns: Turn[], turnIndex: number, totalDuration: number): number {
  const totalWords = turns.reduce((s, t) => s + t.wordCount, 0) || 1;
  const cumWords = turns.slice(0, turnIndex).reduce((s, t) => s + t.wordCount, 0);
  return (cumWords / totalWords) * totalDuration;
}

function estimateTurnDuration(turn: Turn, totalWords: number, totalDuration: number): number {
  return (turn.wordCount / Math.max(1, totalWords)) * totalDuration;
}

// ── Session Workspace Page ───────────────────────────────────────────────────

export default function SessionPage() {
  const params = useParams();
  const router = useRouter();
  const sessionId = params.id as string;

  const [session, setSession] = useState<LibrarySession | null>(null);
  const [sessionName, setSessionName] = useState('');
  const [isEditingName, setIsEditingName] = useState(false);
  const [activeTab, setActiveTab] = useState<ActiveTab>('transcript');
  const [languageMode, setLanguageMode] = useState<LanguageMode>('bengali');
  const [searchQuery, setSearchQuery] = useState('');
  const [searchActive, setSearchActive] = useState(false);
  const [speakerFilter, setSpeakerFilter] = useState<number | null>(null);
  const [showTimestamps, setShowTimestamps] = useState(true);
  const [copied, setCopied] = useState(false);
  const [isDownloading, setIsDownloading] = useState(false);
  const [expandedTurns, setExpandedTurns] = useState<Set<string>>(new Set());

  // Audio state
  const [isPlaying, setIsPlaying] = useState(false);
  const [currentTime, setCurrentTime] = useState(0);
  const [audioDuration, setAudioDuration] = useState(0);
  const [volume, setVolume] = useState(1);
  const audioRef = useRef<HTMLAudioElement>(null);
  const audioUrlRef = useRef<string | null>(null);
  const contentRef = useRef<HTMLDivElement>(null);
  const nameInputRef = useRef<HTMLInputElement>(null);
  const searchInputRef = useRef<HTMLInputElement>(null);

  // ── Load session from localStorage ──────────────────────────────────────

  useEffect(() => {
    try {
      const stored = localStorage.getItem(LIBRARY_STORAGE_KEY);
      if (!stored) { router.push('/'); return; }
      const sessions: LibrarySession[] = JSON.parse(stored);
      const found = sessions.find((s) => s.id === sessionId);
      if (!found) { router.push('/'); return; }
      setSession(found);
      setSessionName(found.name);
      setAudioDuration(found.duration ?? 0);
    } catch {
      router.push('/');
    }
  }, [sessionId, router]);

  // ── Load audio from sessionStorage (set by main page before navigation) ──

  useEffect(() => {
    if (!session) return;
    // Try to get audio blob URL from sessionStorage
    const audioData = sessionStorage.getItem(`session_audio_${sessionId}`);
    if (audioData) {
      audioUrlRef.current = audioData;
      if (audioRef.current) {
        audioRef.current.src = audioData;
      }
    }
    return () => {
      // Don't revoke — the URL might be reused on back navigation
    };
  }, [session, sessionId]);

  // ── Derived data ────────────────────────────────────────────────────────

  const bengaliTurns = useMemo(() => session ? parseTurns(session.transcript.bengali) : [], [session]);
  const englishTurns = useMemo(() => session ? parseTurns(session.transcript.english) : [], [session]);

  const turns = languageMode === 'english' ? englishTurns : bengaliTurns;
  const totalWords = useMemo(() => {
    if (!session) return 0;
    return countWords(session.transcript.bengali) + countWords(session.transcript.english);
  }, [session]);

  const totalTurnWords = useMemo(() => turns.reduce((s, t) => s + t.wordCount, 0) || 1, [turns]);

  const speakerStats = useMemo(() => {
    const map = new Map<string, { speakerIndex: number; words: number }>();
    for (const turn of bengaliTurns) {
      const existing = map.get(turn.speaker);
      if (existing) existing.words += turn.wordCount;
      else map.set(turn.speaker, { speakerIndex: turn.speakerIndex, words: turn.wordCount });
    }
    return Array.from(map.entries()).map(([speaker, { speakerIndex, words }]) => ({
      speaker: session?.speakerNames?.[speakerIndex] || speaker,
      rawSpeaker: speaker,
      speakerIndex,
      words,
    }));
  }, [bengaliTurns, session]);

  const uniqueSpeakers = useMemo(() => {
    const seen = new Map<number, string>();
    for (const t of bengaliTurns) {
      if (!seen.has(t.speakerIndex)) {
        seen.set(t.speakerIndex, session?.speakerNames?.[t.speakerIndex] || t.speaker);
      }
    }
    return Array.from(seen.entries()).map(([idx, name]) => ({ idx, name }));
  }, [bengaliTurns, session]);

  // Search matches
  const searchMatches = useMemo(() => {
    if (!searchQuery.trim()) return new Set<string>();
    const q = searchQuery.toLowerCase();
    return new Set(turns.filter((t) => t.text.toLowerCase().includes(q)).map((t) => t.id));
  }, [turns, searchQuery]);

  // Filtered turns
  const filteredTurns = useMemo(() => {
    let result = turns;
    if (speakerFilter !== null) result = result.filter((t) => t.speakerIndex === speakerFilter);
    if (searchQuery.trim()) result = result.filter((t) => searchMatches.has(t.id));
    return result;
  }, [turns, speakerFilter, searchQuery, searchMatches]);

  // Active turn based on playback
  const activeTurnIndex = useMemo(() => {
    if (!isPlaying && currentTime === 0) return -1;
    if (!audioDuration) return -1;
    const progress = currentTime / audioDuration;
    let cumWords = 0;
    for (let i = 0; i < turns.length; i++) {
      cumWords += turns[i].wordCount;
      if (progress <= cumWords / totalTurnWords) return i;
    }
    return turns.length - 1;
  }, [currentTime, audioDuration, turns, totalTurnWords, isPlaying]);

  // ── Audio controls ──────────────────────────────────────────────────────

  const togglePlay = useCallback(() => {
    const audio = audioRef.current;
    if (!audio || !audio.src) return;
    if (isPlaying) audio.pause();
    else audio.play().catch(() => {});
  }, [isPlaying]);

  const seekTo = useCallback((seconds: number) => {
    const audio = audioRef.current;
    if (!audio) return;
    const t = Math.max(0, Math.min(audioDuration, seconds));
    audio.currentTime = t;
    setCurrentTime(t);
  }, [audioDuration]);

  const handleJumpToTurn = useCallback((turnIndex: number) => {
    if (!audioDuration) return;
    const time = estimateTurnTimestamp(turns, turnIndex, audioDuration);
    seekTo(time);
    if (!isPlaying && audioRef.current?.src) {
      audioRef.current.play().catch(() => {});
    }
  }, [turns, audioDuration, seekTo, isPlaying]);

  // ── Actions ─────────────────────────────────────────────────────────────

  const handleCopy = useCallback(async () => {
    if (!session) return;
    const text = languageMode === 'english'
      ? session.transcript.english
      : languageMode === 'bengali'
        ? session.transcript.bengali
        : `${session.transcript.bengali}\n\n---\n\n${session.transcript.english}`;
    await navigator.clipboard.writeText(text);
    setCopied(true);
    setTimeout(() => setCopied(false), 1800);
  }, [session, languageMode]);

  const handleDownload = useCallback(async () => {
    if (!session) return;
    setIsDownloading(true);
    try {
      const response = await fetch('/api/download-word', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ bengali: session.transcript.bengali, english: session.transcript.english }),
      });
      if (!response.ok) throw new Error('Download failed');
      const blob = await response.blob();
      const url = window.URL.createObjectURL(blob);
      const anchor = document.createElement('a');
      anchor.href = url;
      anchor.download = `${sessionName || 'transcript'}.docx`;
      document.body.appendChild(anchor);
      anchor.click();
      window.URL.revokeObjectURL(url);
      document.body.removeChild(anchor);
    } catch (error) {
      console.error('Download error:', error);
    } finally {
      setIsDownloading(false);
    }
  }, [session, sessionName]);

  const commitNameEdit = useCallback(() => {
    const v = sessionName.trim();
    if (v && session) {
      try {
        const stored = localStorage.getItem(LIBRARY_STORAGE_KEY);
        if (stored) {
          const sessions: LibrarySession[] = JSON.parse(stored);
          const updated = sessions.map((s) => s.id === session.id ? { ...s, name: v } : s);
          localStorage.setItem(LIBRARY_STORAGE_KEY, JSON.stringify(updated));
        }
      } catch { /* ignore */ }
    }
    setIsEditingName(false);
  }, [sessionName, session]);

  // Keyboard: Cmd+F for search, Escape to close search
  useEffect(() => {
    const handler = (e: KeyboardEvent) => {
      if ((e.metaKey || e.ctrlKey) && e.key === 'f' && activeTab === 'transcript') {
        e.preventDefault();
        setSearchActive(true);
        setTimeout(() => searchInputRef.current?.focus(), 50);
      }
      if (e.key === 'Escape' && searchActive) {
        setSearchActive(false);
        setSearchQuery('');
      }
    };
    window.addEventListener('keydown', handler);
    return () => window.removeEventListener('keydown', handler);
  }, [activeTab, searchActive]);

  // Auto-scroll to active turn during playback
  useEffect(() => {
    if (activeTurnIndex < 0 || activeTab !== 'transcript') return;
    const el = contentRef.current?.querySelector(`[data-turn-index="${activeTurnIndex}"]`);
    if (el) el.scrollIntoView({ block: 'nearest', behavior: 'smooth' });
  }, [activeTurnIndex, activeTab]);

  // ── Render ──────────────────────────────────────────────────────────────

  if (!session) {
    return (
      <div className="flex h-screen items-center justify-center bg-[var(--atelier-paper)]">
        <Loader size={32} className="animate-spin text-[var(--atelier-terracotta)]" />
      </div>
    );
  }

  const duration = session.duration ?? 0;

  return (
    <div className="flex h-screen flex-col bg-[var(--atelier-paper)]">
      {/* ── Persistent Header ──────────────────────────────────────────── */}
      <header className="shrink-0 border-b border-[rgba(var(--atelier-ink-rgb),0.08)] bg-[rgba(255,255,255,0.6)] backdrop-blur-sm">
        <div className="mx-auto max-w-6xl px-6 py-4">
          <div className="flex items-start justify-between gap-4">
            <div className="min-w-0 flex-1">
              <div className="mb-1 font-mono text-[10px] font-medium uppercase tracking-[0.14em] text-[rgba(var(--atelier-ink-rgb),0.44)]">
                Session
              </div>
              {isEditingName ? (
                <input
                  ref={nameInputRef}
                  value={sessionName}
                  onChange={(e) => setSessionName(e.target.value)}
                  onBlur={commitNameEdit}
                  onKeyDown={(e) => {
                    if (e.key === 'Enter') commitNameEdit();
                    if (e.key === 'Escape') { setSessionName(session.name); setIsEditingName(false); }
                  }}
                  className="w-full max-w-md border-b-2 border-[var(--atelier-terracotta)] bg-transparent text-xl font-semibold text-[var(--atelier-ink)] outline-none"
                  autoFocus
                />
              ) : (
                <h1
                  className="cursor-pointer text-xl font-semibold text-[var(--atelier-ink)] hover:text-[var(--atelier-terracotta)] transition-colors"
                  onClick={() => { setIsEditingName(true); setTimeout(() => nameInputRef.current?.select(), 50); }}
                  title="Click to edit session name"
                >
                  {sessionName}
                </h1>
              )}
              <div className="mt-1.5 flex flex-wrap items-center gap-2">
                {[
                  `${totalWords.toLocaleString()} words`,
                  `${bengaliTurns.length} turns`,
                  fmtDuration(duration),
                  `${uniqueSpeakers.length} speaker${uniqueSpeakers.length !== 1 ? 's' : ''}`,
                ].map((stat) => (
                  <span key={stat} className="text-[12px] text-[rgba(var(--atelier-ink-rgb),0.5)]">
                    {stat}
                  </span>
                )).reduce<React.ReactNode[]>((acc, el, i) => {
                  if (i > 0) acc.push(<span key={`dot-${i}`} className="text-[rgba(var(--atelier-ink-rgb),0.2)]">·</span>);
                  acc.push(el);
                  return acc;
                }, [])}
              </div>
            </div>

            <div className="flex shrink-0 items-center gap-2">
              <button
                onClick={handleCopy}
                className="atelier-ghost-button inline-flex h-9 items-center gap-2 px-3 text-[11px] font-semibold tracking-[0.08em]"
              >
                {copied ? <Check size={13} /> : <Copy size={13} />}
                <span>{copied ? 'Copied' : 'Copy'}</span>
              </button>
              <button
                onClick={handleDownload}
                disabled={isDownloading}
                className="atelier-ghost-button inline-flex h-9 items-center gap-2 px-3 text-[11px] font-semibold tracking-[0.08em] disabled:opacity-50"
              >
                {isDownloading ? <Loader size={13} className="animate-spin" /> : <Download size={13} />}
                <span>{isDownloading ? 'Saving' : 'Download'}</span>
              </button>
              <button
                onClick={() => router.push('/')}
                className="atelier-ghost-button inline-flex h-9 items-center gap-2 px-3 text-[11px] font-semibold tracking-[0.08em]"
                title="Back to library"
              >
                <ArrowLeft size={13} />
                <span>Back</span>
              </button>
            </div>
          </div>
        </div>
      </header>

      {/* ── Tab Row ────────────────────────────────────────────────────── */}
      <nav className="shrink-0 border-b border-[rgba(var(--atelier-ink-rgb),0.08)] bg-[rgba(255,255,255,0.4)]">
        <div className="mx-auto max-w-6xl px-6">
          <div className="flex items-center gap-8">
            {(['transcript', 'evaluation', 'insights'] as const).map((tab) => (
              <button
                key={tab}
                onClick={() => setActiveTab(tab)}
                className={cn(
                  'relative py-3 text-[13px] font-bold tracking-[0.12em] uppercase transition-colors',
                  activeTab === tab
                    ? 'text-[var(--atelier-ink)]'
                    : 'text-[rgba(var(--atelier-ink-rgb),0.38)] hover:text-[rgba(var(--atelier-ink-rgb),0.6)]',
                )}
              >
                {tab === 'transcript' ? 'Transcript' : tab === 'evaluation' ? 'Evaluation' : 'Insights'}
                {activeTab === tab && (
                  <div className="absolute bottom-0 left-0 right-0 h-[2px] rounded-full bg-[var(--atelier-terracotta)]" />
                )}
              </button>
            ))}
          </div>
        </div>
      </nav>

      {/* ── Content Area ───────────────────────────────────────────────── */}
      <div ref={contentRef} className="min-h-0 flex-1 overflow-y-auto">
        {activeTab === 'transcript' && (
          <TranscriptTabContent
            session={session}
            turns={turns}
            bengaliTurns={bengaliTurns}
            englishTurns={englishTurns}
            filteredTurns={filteredTurns}
            languageMode={languageMode}
            setLanguageMode={setLanguageMode}
            searchActive={searchActive}
            setSearchActive={setSearchActive}
            searchQuery={searchQuery}
            setSearchQuery={setSearchQuery}
            searchInputRef={searchInputRef}
            searchMatches={searchMatches}
            speakerFilter={speakerFilter}
            setSpeakerFilter={setSpeakerFilter}
            showTimestamps={showTimestamps}
            setShowTimestamps={setShowTimestamps}
            uniqueSpeakers={uniqueSpeakers}
            activeTurnIndex={activeTurnIndex}
            audioDuration={audioDuration}
            totalTurnWords={totalTurnWords}
            expandedTurns={expandedTurns}
            setExpandedTurns={setExpandedTurns}
            onJumpToTurn={handleJumpToTurn}
          />
        )}
        {activeTab === 'evaluation' && (
          <div className="mx-auto max-w-4xl px-6 py-8">
            <EvaluationComponent
              transcript={session.transcript}
              turns={bengaliTurns}
              audioDuration={audioDuration}
              onJumpToTurn={(turnIndex: number) => {
                setActiveTab('transcript');
                setTimeout(() => handleJumpToTurn(turnIndex), 100);
              }}
            />
          </div>
        )}
        {activeTab === 'insights' && (
          <div className="mx-auto max-w-4xl px-6 py-8">
            <InsightsTab
              transcript={session.transcript}
              turns={bengaliTurns}
              duration={duration}
              speakerNames={session.speakerNames}
            />
          </div>
        )}
      </div>

      {/* ── Persistent Player ──────────────────────────────────────────── */}
      <div className="shrink-0 border-t border-[rgba(var(--atelier-ink-rgb),0.1)] bg-[rgba(255,255,255,0.7)] backdrop-blur-sm">
        <div className="mx-auto flex max-w-6xl items-center gap-4 px-6 py-3">
          <audio
            ref={audioRef}
            onTimeUpdate={() => {
              if (audioRef.current) setCurrentTime(audioRef.current.currentTime);
            }}
            onLoadedMetadata={() => {
              if (audioRef.current) setAudioDuration(audioRef.current.duration);
            }}
            onEnded={() => setIsPlaying(false)}
            onPlay={() => setIsPlaying(true)}
            onPause={() => setIsPlaying(false)}
          />

          <button
            onClick={togglePlay}
            disabled={!audioUrlRef.current}
            className={cn(
              'flex h-9 w-9 shrink-0 items-center justify-center rounded-full transition-all',
              'bg-[var(--atelier-ink)] text-[var(--atelier-paper)]',
              'hover:opacity-80 disabled:cursor-not-allowed disabled:opacity-30',
            )}
            aria-label={isPlaying ? 'Pause' : 'Play'}
          >
            {isPlaying ? (
              <Pause size={14} fill="currentColor" strokeWidth={0} />
            ) : (
              <Play size={14} fill="currentColor" strokeWidth={0} className="translate-x-px" />
            )}
          </button>

          <span className="w-10 text-right text-[11px] font-medium tabular-nums text-[rgba(var(--atelier-ink-rgb),0.45)]">
            {fmtTime(currentTime)}
          </span>

          <div className="flex-1">
            <input
              type="range"
              min="0"
              max={audioDuration || 0}
              step="0.1"
              value={currentTime}
              onChange={(e) => {
                const t = parseFloat(e.target.value);
                setCurrentTime(t);
                if (audioRef.current) audioRef.current.currentTime = t;
              }}
              disabled={!audioUrlRef.current}
              className="session-seek-bar w-full"
              style={{ '--seek-pct': `${audioDuration ? (currentTime / audioDuration) * 100 : 0}%` } as React.CSSProperties}
            />
          </div>

          <span className="w-10 text-[11px] font-medium tabular-nums text-[rgba(var(--atelier-ink-rgb),0.45)]">
            {fmtTime(audioDuration)}
          </span>

          <div className="flex items-center gap-2 border-l border-[rgba(var(--atelier-ink-rgb),0.06)] pl-3">
            <Volume2 size={14} className="text-[rgba(var(--atelier-ink-rgb),0.35)]" />
            <input
              type="range"
              min="0" max="1" step="0.05"
              value={volume}
              onChange={(e) => {
                const v = parseFloat(e.target.value);
                setVolume(v);
                if (audioRef.current) audioRef.current.volume = v;
              }}
              className="session-volume-bar w-16"
              style={{ '--vol-pct': `${volume * 100}%` } as React.CSSProperties}
            />
          </div>
        </div>
      </div>
    </div>
  );
}

// ── Transcript Tab Content ───────────────────────────────────────────────────

interface TranscriptTabProps {
  session: LibrarySession;
  turns: Turn[];
  bengaliTurns: Turn[];
  englishTurns: Turn[];
  filteredTurns: Turn[];
  languageMode: LanguageMode;
  setLanguageMode: (m: LanguageMode) => void;
  searchActive: boolean;
  setSearchActive: (v: boolean) => void;
  searchQuery: string;
  setSearchQuery: (q: string) => void;
  searchInputRef: React.RefObject<HTMLInputElement | null>;
  searchMatches: Set<string>;
  speakerFilter: number | null;
  setSpeakerFilter: (f: number | null) => void;
  showTimestamps: boolean;
  setShowTimestamps: (v: boolean) => void;
  uniqueSpeakers: { idx: number; name: string }[];
  activeTurnIndex: number;
  audioDuration: number;
  totalTurnWords: number;
  expandedTurns: Set<string>;
  setExpandedTurns: React.Dispatch<React.SetStateAction<Set<string>>>;
  onJumpToTurn: (index: number) => void;
}

function TranscriptTabContent({
  session, turns, bengaliTurns, englishTurns, filteredTurns,
  languageMode, setLanguageMode,
  searchActive, setSearchActive, searchQuery, setSearchQuery, searchInputRef, searchMatches,
  speakerFilter, setSpeakerFilter,
  showTimestamps, setShowTimestamps,
  uniqueSpeakers, activeTurnIndex, audioDuration, totalTurnWords,
  expandedTurns, setExpandedTurns,
  onJumpToTurn,
}: TranscriptTabProps) {
  const highlightText = useCallback((text: string, query: string) => {
    if (!query.trim()) return text;
    const regex = new RegExp(`(${query.replace(/[.*+?^${}()|[\]\\]/g, '\\$&')})`, 'gi');
    const parts = text.split(regex);
    return parts.map((part, i) =>
      regex.test(part)
        ? <mark key={i} className="rounded-sm bg-[rgba(var(--atelier-gold-rgb),0.35)] px-0.5">{part}</mark>
        : part,
    );
  }, []);

  return (
    <div className="mx-auto max-w-4xl px-6 py-6">
      {/* ── Toolbar ──────────────────────────────────────────────────── */}
      <div className="mb-6 flex flex-wrap items-center gap-3">
        {/* Language toggle */}
        <div className="inline-flex items-center gap-1 rounded-full border border-[rgba(var(--atelier-ink-rgb),0.1)] bg-[rgba(255,255,255,0.5)] p-1">
          {(['bengali', 'both', 'english'] as const).map((mode) => (
            <button
              key={mode}
              onClick={() => setLanguageMode(mode)}
              className={cn(
                'rounded-full px-3 py-1.5 text-[11px] font-semibold tracking-[0.1em] transition-colors',
                languageMode === mode
                  ? 'bg-[rgba(var(--atelier-terracotta-rgb),0.9)] text-white'
                  : 'text-[rgba(var(--atelier-ink-rgb),0.55)] hover:bg-[rgba(255,255,255,0.6)]',
              )}
            >
              {mode === 'bengali' ? 'Bangla' : mode === 'both' ? 'Both' : 'English'}
            </button>
          ))}
        </div>

        {/* Search */}
        {searchActive ? (
          <div className="flex items-center gap-2 rounded-full border border-[rgba(var(--atelier-ink-rgb),0.12)] bg-white px-3 py-1.5">
            <Search size={12} className="text-[rgba(var(--atelier-ink-rgb),0.4)]" />
            <input
              ref={searchInputRef}
              value={searchQuery}
              onChange={(e) => setSearchQuery(e.target.value)}
              placeholder="Search transcript..."
              className="min-w-[140px] bg-transparent text-[12px] text-[var(--atelier-ink)] outline-none placeholder:text-[rgba(var(--atelier-ink-rgb),0.35)]"
              autoFocus
            />
            {searchQuery && (
              <span className="text-[10px] text-[rgba(var(--atelier-ink-rgb),0.4)]">
                {searchMatches.size} match{searchMatches.size !== 1 ? 'es' : ''}
              </span>
            )}
            <button onClick={() => { setSearchActive(false); setSearchQuery(''); }} className="text-[rgba(var(--atelier-ink-rgb),0.35)] hover:text-[rgba(var(--atelier-ink-rgb),0.7)]">
              <X size={12} />
            </button>
          </div>
        ) : (
          <button
            onClick={() => { setSearchActive(true); setTimeout(() => searchInputRef.current?.focus(), 50); }}
            className="inline-flex items-center gap-1.5 rounded-full border border-[rgba(var(--atelier-ink-rgb),0.08)] bg-[rgba(255,255,255,0.4)] px-3 py-1.5 text-[11px] text-[rgba(var(--atelier-ink-rgb),0.45)] transition-colors hover:border-[rgba(var(--atelier-ink-rgb),0.15)] hover:text-[rgba(var(--atelier-ink-rgb),0.65)]"
          >
            <Search size={11} />
            <span>Search</span>
            <kbd className="ml-1 rounded border border-[rgba(var(--atelier-ink-rgb),0.1)] bg-[rgba(var(--atelier-ink-rgb),0.04)] px-1 py-0.5 text-[9px] font-mono">⌘F</kbd>
          </button>
        )}

        {/* Speaker filter pills */}
        <div className="flex items-center gap-1.5">
          {uniqueSpeakers.map((s) => (
            <button
              key={s.idx}
              onClick={() => setSpeakerFilter(speakerFilter === s.idx ? null : s.idx)}
              className={cn(
                'inline-flex items-center gap-1.5 rounded-full px-2.5 py-1 text-[11px] font-medium transition-all',
                speakerFilter === s.idx
                  ? 'border border-[rgba(var(--atelier-ink-rgb),0.2)] bg-[rgba(var(--atelier-ink-rgb),0.08)] text-[var(--atelier-ink)]'
                  : 'border border-transparent text-[rgba(var(--atelier-ink-rgb),0.45)] hover:bg-[rgba(var(--atelier-ink-rgb),0.04)]',
              )}
            >
              <span className="h-2 w-2 rounded-full" style={{ background: speakerColor(s.idx) }} />
              {s.name}
            </button>
          ))}
          {speakerFilter !== null && (
            <button onClick={() => setSpeakerFilter(null)} className="text-[10px] text-[rgba(var(--atelier-ink-rgb),0.4)] underline hover:text-[rgba(var(--atelier-ink-rgb),0.65)]">
              Show all
            </button>
          )}
        </div>

        {/* Timestamp toggle */}
        <button
          onClick={() => setShowTimestamps(!showTimestamps)}
          className={cn(
            'ml-auto rounded-full px-2.5 py-1 text-[10px] font-medium transition-colors',
            showTimestamps
              ? 'bg-[rgba(var(--atelier-ink-rgb),0.06)] text-[rgba(var(--atelier-ink-rgb),0.55)]'
              : 'text-[rgba(var(--atelier-ink-rgb),0.3)] hover:text-[rgba(var(--atelier-ink-rgb),0.5)]',
          )}
        >
          {showTimestamps ? 'Hide' : 'Show'} timestamps
        </button>
      </div>

      {/* ── Turns ────────────────────────────────────────────────────── */}
      <div className="space-y-1">
        {filteredTurns.map((turn, i) => {
          const originalIndex = turns.findIndex((t) => t.id === turn.id);
          const timestamp = audioDuration ? estimateTurnTimestamp(turns, originalIndex, audioDuration) : 0;
          const turnDuration = audioDuration ? estimateTurnDuration(turn, totalTurnWords, audioDuration) : 0;
          const isActive = originalIndex === activeTurnIndex;
          const isLong = turn.wordCount > WORDS_COLLAPSE_THRESHOLD;
          const isExpanded = expandedTurns.has(turn.id);
          const speakerName = session.speakerNames?.[turn.speakerIndex] || turn.speaker;

          // For "both" mode, find corresponding english turn
          const englishTurn = languageMode === 'both' ? englishTurns[originalIndex] : null;

          return (
            <div
              key={turn.id}
              data-turn-index={originalIndex}
              className={cn(
                'group relative rounded-[12px] py-3 pl-4 pr-3 transition-colors duration-300',
                isActive && 'bg-[rgba(var(--atelier-terracotta-rgb),0.06)]',
              )}
              style={{ borderLeft: `3px solid ${speakerColor(turn.speakerIndex)}` }}
            >
              {/* Turn header */}
              <div className="mb-1.5 flex items-center gap-2">
                <span className="text-[12px] font-semibold text-[var(--atelier-ink)]">{speakerName}</span>
                {showTimestamps && audioDuration > 0 && (
                  <>
                    <span className="text-[11px] text-[rgba(var(--atelier-ink-rgb),0.3)]">·</span>
                    <button
                      onClick={() => onJumpToTurn(originalIndex)}
                      className="text-[11px] font-medium tabular-nums text-[rgba(var(--atelier-ink-rgb),0.4)] transition-colors hover:text-[var(--atelier-terracotta)]"
                      title="Jump to this moment"
                    >
                      {fmtTime(timestamp)}
                    </button>
                    <span className="text-[11px] text-[rgba(var(--atelier-ink-rgb),0.3)]">·</span>
                    <span className="text-[10px] text-[rgba(var(--atelier-ink-rgb),0.3)]">{Math.round(turnDuration)}s</span>
                  </>
                )}
              </div>

              {/* Turn text */}
              <div className="text-[13px] leading-relaxed text-[rgba(var(--atelier-ink-rgb),0.78)]">
                {isLong && !isExpanded ? (
                  <>
                    {highlightText(turn.text.slice(0, 800) + '...', searchQuery)}
                    <button
                      onClick={() => setExpandedTurns((prev) => new Set(prev).add(turn.id))}
                      className="ml-1 text-[12px] font-medium text-[var(--atelier-terracotta)] hover:underline"
                    >
                      Read more →
                    </button>
                  </>
                ) : (
                  highlightText(turn.text, searchQuery)
                )}
                {isLong && isExpanded && (
                  <button
                    onClick={() => setExpandedTurns((prev) => { const next = new Set(prev); next.delete(turn.id); return next; })}
                    className="ml-1 text-[12px] font-medium text-[rgba(var(--atelier-ink-rgb),0.4)] hover:underline"
                  >
                    Show less
                  </button>
                )}
              </div>

              {/* English translation in "both" mode */}
              {languageMode === 'both' && englishTurn && (
                <div className="mt-2 border-l-2 border-[rgba(var(--atelier-ink-rgb),0.08)] pl-3">
                  <p className="text-[12px] leading-relaxed text-[rgba(var(--atelier-ink-rgb),0.52)]">
                    {highlightText(englishTurn.text, searchQuery)}
                  </p>
                </div>
              )}

              {/* Hover actions */}
              <div className="absolute right-2 top-2 flex items-center gap-1 opacity-0 transition-opacity group-hover:opacity-100">
                <button
                  onClick={async () => { await navigator.clipboard.writeText(turn.text); }}
                  className="rounded-md bg-white/80 p-1 text-[rgba(var(--atelier-ink-rgb),0.4)] shadow-sm transition-colors hover:text-[var(--atelier-ink)]"
                  title="Copy turn"
                >
                  <Copy size={11} />
                </button>
              </div>
            </div>
          );
        })}
      </div>

      {filteredTurns.length === 0 && (
        <div className="py-12 text-center text-[13px] text-[rgba(var(--atelier-ink-rgb),0.4)]">
          {searchQuery ? `No matches for "${searchQuery}"` : 'No turns match the current filter'}
        </div>
      )}
    </div>
  );
}
