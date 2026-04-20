'use client';

import { useRef, useState, useMemo, useEffect } from 'react';
import { X, Search, MoreHorizontal, Trash2, Pencil, Download } from 'lucide-react';
import { MiniWaveform } from '@/components/ui/mini-waveform';
import { cn } from '@/lib/utils';
import type { MiniWaveformSpeaker } from '@/components/ui/mini-waveform';

// ── Types ─────────────────────────────────────────────────────────────────────

export interface LibrarySession {
  id: string;
  name: string;
  createdAt: number;
  duration: number | null;
  wordCount: number;
  transcript: { bengali: string; english: string };
  waveformPeaks: number[];
  speakers: MiniWaveformSpeaker[];
  languageSplit: { bn: number; en: number };
}

// ── Helpers ───────────────────────────────────────────────────────────────────

function timeAgo(ts: number): string {
  const diff = Date.now() - ts;
  const mins = Math.floor(diff / 60_000);
  const hrs = Math.floor(diff / 3_600_000);
  const days = Math.floor(diff / 86_400_000);
  if (mins < 1) return 'just now';
  if (mins < 60) return `${mins}m ago`;
  if (hrs < 24) return `${hrs}h ago`;
  if (days < 7) return `${days}d ago`;
  return new Date(ts).toLocaleDateString();
}

function fmtDur(s: number | null): string {
  if (!s || isNaN(s)) return '--:--';
  const t = Math.round(s);
  return `${Math.floor(t / 60).toString().padStart(2, '0')}:${(t % 60).toString().padStart(2, '0')}`;
}

function fmtBytes(b: number): string {
  if (!b) return '0 B';
  const sizes = ['B', 'KB', 'MB', 'GB'];
  const lvl = Math.min(Math.floor(Math.log(b) / Math.log(1024)), sizes.length - 1);
  return `${(b / 1024 ** lvl).toFixed(lvl === 0 ? 0 : 1)} ${sizes[lvl]}`;
}

function inferExt(f: File): string {
  return f.name.split('.').pop()?.trim().toUpperCase() ?? f.type.replace('audio/', '').toUpperCase() ?? '—';
}

// ── SessionRow ────────────────────────────────────────────────────────────────

interface SessionRowProps {
  session: LibrarySession;
  isActive: boolean;
  onSelect: () => void;
  onDelete: () => void;
  onRename: (name: string) => void;
}

function SessionRow({ session, isActive, onSelect, onDelete, onRename }: SessionRowProps) {
  const [menuOpen, setMenuOpen] = useState(false);
  const [renaming, setRenaming] = useState(false);
  const [nameVal, setNameVal] = useState(session.name);
  const inputRef = useRef<HTMLInputElement>(null);
  const menuRef = useRef<HTMLDivElement>(null);

  // Sync name if session.name changes from outside
  useEffect(() => { setNameVal(session.name); }, [session.name]);

  // Close ⋯ menu on outside click
  useEffect(() => {
    if (!menuOpen) return;
    const handler = (e: MouseEvent) => {
      if (menuRef.current && !menuRef.current.contains(e.target as Node)) setMenuOpen(false);
    };
    document.addEventListener('mousedown', handler);
    return () => document.removeEventListener('mousedown', handler);
  }, [menuOpen]);

  // Auto-focus rename input
  useEffect(() => {
    if (renaming) setTimeout(() => inputRef.current?.select(), 0);
  }, [renaming]);

  const commitRename = () => {
    const v = nameVal.trim();
    if (v && v !== session.name) onRename(v);
    else setNameVal(session.name);
    setRenaming(false);
  };

  const handleDownload = (e: React.MouseEvent) => {
    e.stopPropagation();
    const text = [
      `# ${session.name}`,
      '',
      '## Bengali Transcript',
      session.transcript.bengali,
      '',
      '## English Translation',
      session.transcript.english,
    ].join('\n');
    const blob = new Blob([text], { type: 'text/plain;charset=utf-8' });
    const url = URL.createObjectURL(blob);
    const a = document.createElement('a');
    a.href = url;
    a.download = `${session.name}.txt`;
    a.click();
    URL.revokeObjectURL(url);
    setMenuOpen(false);
  };

  const speakerLabel =
    session.speakers.length > 1
      ? `${session.speakers.length} speakers`
      : '1 speaker';

  return (
    <div
      className={cn(
        'group relative flex items-center gap-3 rounded-[14px] px-2.5 py-2 transition-colors duration-150',
        isActive
          ? 'bg-[rgba(var(--atelier-terracotta-rgb),0.07)]'
          : 'hover:bg-[rgba(var(--atelier-ink-rgb),0.04)]',
      )}
    >
      {/* Left accent — active session */}
      {isActive && (
        <div className="pointer-events-none absolute inset-y-2 left-0 w-[3px] rounded-r-full bg-[var(--atelier-terracotta)]" />
      )}

      {/* Waveform thumbnail */}
      <MiniWaveform peaks={session.waveformPeaks} speakers={session.speakers} width={48} height={32} />

      {/* Row text — click to load */}
      <button
        type="button"
        className="min-w-0 flex-1 text-left"
        onClick={onSelect}
      >
        {renaming ? (
          <input
            ref={inputRef}
            value={nameVal}
            onChange={(e) => setNameVal(e.target.value)}
            onBlur={commitRename}
            onKeyDown={(e) => {
              if (e.key === 'Enter') commitRename();
              if (e.key === 'Escape') { setNameVal(session.name); setRenaming(false); }
            }}
            onClick={(e) => e.stopPropagation()}
            className="w-full rounded-[6px] border border-[rgba(var(--atelier-ink-rgb),0.18)] bg-white px-1.5 py-0.5 text-[13px] font-semibold text-[var(--atelier-ink)] outline-none focus:border-[var(--atelier-terracotta)]"
          />
        ) : (
          <p className="truncate text-[13px] font-semibold leading-5 text-[var(--atelier-ink)]">
            {session.name}
          </p>
        )}
        <p className="mt-0.5 truncate text-[11px] leading-[1.3] text-[rgba(var(--atelier-ink-rgb),0.42)]">
          {fmtDur(session.duration)} · {speakerLabel} · {timeAgo(session.createdAt)}
        </p>
      </button>

      {/* ⋯ menu trigger — revealed on hover */}
      <div className="relative shrink-0">
        <button
          type="button"
          onClick={(e) => { e.stopPropagation(); setMenuOpen((v) => !v); }}
          className={cn(
            'flex h-7 w-7 items-center justify-center rounded-full transition-all duration-100',
            menuOpen
              ? 'bg-[rgba(var(--atelier-ink-rgb),0.1)] text-[rgba(var(--atelier-ink-rgb),0.7)]'
              : 'text-[rgba(var(--atelier-ink-rgb),0.35)] opacity-0 group-hover:opacity-100 hover:bg-[rgba(var(--atelier-ink-rgb),0.08)]',
          )}
          aria-label="Session actions"
        >
          <MoreHorizontal size={14} strokeWidth={2} />
        </button>

        {menuOpen && (
          <div
            ref={menuRef}
            className="absolute right-0 top-8 z-50 min-w-[140px] overflow-hidden rounded-[12px] border border-[rgba(var(--atelier-ink-rgb),0.1)] bg-white py-1 shadow-[0_8px_32px_rgba(13,18,32,0.13)]"
          >
            <button
              type="button"
              onClick={(e) => { e.stopPropagation(); setRenaming(true); setMenuOpen(false); }}
              className="flex w-full items-center gap-2.5 px-3.5 py-2 text-[12px] text-[rgba(var(--atelier-ink-rgb),0.75)] hover:bg-[rgba(var(--atelier-ink-rgb),0.05)]"
            >
              <Pencil size={12} />
              <span>Rename</span>
            </button>
            <button
              type="button"
              onClick={handleDownload}
              className="flex w-full items-center gap-2.5 px-3.5 py-2 text-[12px] text-[rgba(var(--atelier-ink-rgb),0.75)] hover:bg-[rgba(var(--atelier-ink-rgb),0.05)]"
            >
              <Download size={12} />
              <span>Download</span>
            </button>
            <div className="mx-3 my-0.5 border-t border-[rgba(var(--atelier-ink-rgb),0.07)]" />
            <button
              type="button"
              onClick={(e) => { e.stopPropagation(); onDelete(); setMenuOpen(false); }}
              className="flex w-full items-center gap-2.5 px-3.5 py-2 text-[12px] text-[rgba(207,90,67,0.82)] hover:bg-[rgba(207,90,67,0.06)]"
            >
              <Trash2 size={12} />
              <span>Delete</span>
            </button>
          </div>
        )}
      </div>
    </div>
  );
}

// ── LibraryPanel ──────────────────────────────────────────────────────────────

interface LibraryPanelProps {
  file: File | null;
  appState: 'idle' | 'uploading' | 'processing' | 'done' | 'error';
  audioPreview: { duration: number | null; sampleRate: number | null };
  isReadingAudio: boolean;
  elapsedSeconds: number;
  error: string;
  activeSessionId: string | null;
  sessions: LibrarySession[];
  onClear: () => void;
  onTranscribeAgain: () => void;
  onSelectSession: (session: LibrarySession) => void;
  onDeleteSession: (id: string) => void;
  onRenameSession: (id: string, name: string) => void;
}

export function LibraryPanel({
  file,
  appState,
  audioPreview,
  isReadingAudio,
  elapsedSeconds,
  error,
  activeSessionId,
  sessions,
  onClear,
  onTranscribeAgain,
  onSelectSession,
  onDeleteSession,
  onRenameSession,
}: LibraryPanelProps) {
  const searchRef = useRef<HTMLInputElement>(null);
  const [searchQuery, setSearchQuery] = useState('');

  // Refresh relative timestamps every 60 seconds
  const [, setTick] = useState(0);
  useEffect(() => {
    const id = setInterval(() => setTick((n) => n + 1), 60_000);
    return () => clearInterval(id);
  }, []);

  const isWorking = appState === 'uploading' || appState === 'processing';
  const hasFile = Boolean(file);
  const showDropzone = !hasFile && !isWorking;

  // Computed transcription progress estimate
  const processingProgress = useMemo(() => {
    if (!audioPreview.duration) return null;
    const est = Math.max(1, Math.round(audioPreview.duration * 0.45));
    return Math.min(99, Math.round((elapsedSeconds / est) * 100));
  }, [elapsedSeconds, audioPreview.duration]);

  // '/' or Cmd+F focuses search when library is visible
  useEffect(() => {
    const handler = (e: KeyboardEvent) => {
      if (sessions.length <= 5) return;
      const target = e.target as Element;
      if (target.tagName === 'INPUT' || target.tagName === 'TEXTAREA') return;
      if (e.key === '/' || (e.metaKey && e.key === 'f')) {
        e.preventDefault();
        searchRef.current?.focus();
      }
    };
    window.addEventListener('keydown', handler);
    return () => window.removeEventListener('keydown', handler);
  }, [sessions.length]);

  const filteredSessions = useMemo(() => {
    if (!searchQuery.trim()) return sessions;
    const q = searchQuery.toLowerCase();
    return sessions.filter((s) => s.name.toLowerCase().includes(q));
  }, [sessions, searchQuery]);

  return (
    <section className="atelier-panel flex min-h-0 flex-col overflow-hidden rounded-[28px]">
      {/* ── NOW ───────────────────────────────────────────────────────────── */}
      <div className="shrink-0 px-4 pt-4 pb-1">
        <div className="atelier-kicker mb-2.5 text-[9px] tracking-[0.12em]">Now</div>

        {showDropzone ? (
          /* No file — compact empty hint; dropzone lives in the middle panel */
          <div className="px-1 py-1">
            <p className="text-[13px] font-medium text-[rgba(var(--atelier-ink-rgb),0.32)]">—</p>
            <p className="mt-0.5 text-[12px] text-[rgba(var(--atelier-ink-rgb),0.38)]">No file loaded</p>
            <p className="mt-2 flex items-center gap-1 text-[10px] text-[rgba(var(--atelier-ink-rgb),0.28)]">
              Drop a file in the centre
              <span aria-hidden>→</span>
            </p>
          </div>

        ) : isWorking ? (
          /* Processing — inline progress */
          <div className="rounded-[18px] border border-[rgba(var(--atelier-ink-rgb),0.07)] bg-[rgba(var(--atelier-ink-rgb),0.018)] px-3.5 py-3">
            <p
              className="truncate text-[13px] font-semibold text-[var(--atelier-ink)]"
              title={file?.name ?? ''}
            >
              {file?.name.replace(/\.[^/.]+$/, '') ?? 'Processing…'}
            </p>
            <div className="mt-2 flex items-center justify-between gap-2">
              <p className="font-mono text-[11px] text-[rgba(var(--atelier-ink-rgb),0.45)]">
                Transcribing
                {processingProgress !== null ? ` · ${processingProgress}%` : '…'}
              </p>
              <button
                type="button"
                onClick={onClear}
                className="shrink-0 text-[11px] text-[rgba(var(--atelier-ink-rgb),0.35)] transition-colors hover:text-[rgba(207,90,67,0.75)] hover:underline underline-offset-2"
              >
                Cancel
              </button>
            </div>
            {/* Thin progress bar */}
            <div className="mt-2.5 h-[3px] w-full overflow-hidden rounded-full bg-[rgba(var(--atelier-ink-rgb),0.08)]">
              <div
                className="h-full rounded-full bg-[var(--atelier-terracotta)] transition-all duration-1000"
                style={{ width: `${processingProgress ?? 0}%` }}
              />
            </div>
          </div>

        ) : (
          /* File loaded / done / error */
          <div className="rounded-[18px] border border-[rgba(var(--atelier-ink-rgb),0.07)] bg-[rgba(var(--atelier-ink-rgb),0.018)] px-3.5 py-3">
            <div className="flex items-start justify-between gap-2">
              <p
                className="min-w-0 truncate text-[13px] font-semibold leading-5 text-[var(--atelier-ink)]"
                title={file?.name ?? ''}
              >
                {file?.name.replace(/\.[^/.]+$/, '') ?? 'Session loaded'}
              </p>
              <button
                type="button"
                onClick={onClear}
                className="mt-0.5 shrink-0 text-[rgba(var(--atelier-ink-rgb),0.28)] transition-colors hover:text-[rgba(var(--atelier-ink-rgb),0.6)]"
                aria-label="Clear"
              >
                <X size={14} strokeWidth={2} />
              </button>
            </div>

            {file && (
              <p className="mt-1 font-mono text-[11px] text-[rgba(var(--atelier-ink-rgb),0.42)]">
                {inferExt(file)}
                {isReadingAudio ? ' · —' : audioPreview.duration ? ` · ${fmtDur(audioPreview.duration)}` : ''}
                {` · ${fmtBytes(file.size)}`}
              </p>
            )}

            {error && (
              <p className="mt-1.5 text-[11px] font-medium text-[rgba(207,90,67,0.85)]">
                {error}
              </p>
            )}

            {appState === 'done' && !error && (
              <div className="mt-3 border-t border-[rgba(var(--atelier-ink-rgb),0.08)] pt-2.5">
                <button
                  type="button"
                  onClick={onTranscribeAgain}
                  className="text-[11px] font-medium text-[rgba(var(--atelier-ink-rgb),0.4)] underline-offset-2 transition-colors hover:text-[rgba(207,90,67,0.78)] hover:underline"
                >
                  Transcribe again →
                </button>
              </div>
            )}
          </div>
        )}
      </div>

      {/* ── Divider ───────────────────────────────────────────────────────── */}
      <div className="mx-4 my-3 border-t border-[rgba(var(--atelier-ink-rgb),0.07)]" />

      {/* ── LIBRARY ───────────────────────────────────────────────────────── */}
      <div className="flex min-h-0 flex-1 flex-col">
        {/* Header row */}
        <div className="shrink-0 flex items-center gap-2 px-4 pb-2.5">
          <span className="atelier-kicker text-[9px] tracking-[0.12em]">Library</span>
          {sessions.length > 0 && (
            <span className="rounded-full bg-[rgba(var(--atelier-ink-rgb),0.08)] px-2 py-0.5 font-mono text-[10px] font-semibold leading-none text-[rgba(var(--atelier-ink-rgb),0.52)]">
              {sessions.length}
            </span>
          )}
        </div>

        {/* Search — visible only when > 5 sessions */}
        {sessions.length > 5 && (
          <div className="shrink-0 px-4 pb-2.5">
            <div className="flex items-center gap-2 rounded-[10px] border border-[rgba(var(--atelier-ink-rgb),0.09)] bg-[rgba(var(--atelier-ink-rgb),0.022)] px-2.5 py-1.5">
              <Search size={12} className="shrink-0 text-[rgba(var(--atelier-ink-rgb),0.35)]" />
              <input
                ref={searchRef}
                type="text"
                placeholder="Search library…"
                value={searchQuery}
                onChange={(e) => setSearchQuery(e.target.value)}
                className="min-w-0 flex-1 bg-transparent text-[12px] text-[var(--atelier-ink)] placeholder:text-[rgba(var(--atelier-ink-rgb),0.35)] outline-none"
              />
              {searchQuery && (
                <button
                  type="button"
                  onClick={() => setSearchQuery('')}
                  className="shrink-0 text-[rgba(var(--atelier-ink-rgb),0.35)] hover:text-[rgba(var(--atelier-ink-rgb),0.6)]"
                >
                  <X size={11} />
                </button>
              )}
            </div>
            {sessions.length > 5 && (
              <p className="mt-1 text-right font-mono text-[9px] text-[rgba(var(--atelier-ink-rgb),0.26)]">
                / or ⌘F to search
              </p>
            )}
          </div>
        )}

        {/* Scrollable list */}
        <div className="min-h-0 flex-1 overflow-y-auto px-2 pb-4">
          {sessions.length === 0 ? (
            /* Empty library state */
            <div className="flex flex-col items-center justify-center gap-3 py-10 text-center">
              <div className="flex h-11 w-11 items-center justify-center rounded-[14px] bg-[rgba(var(--atelier-ink-rgb),0.05)]">
                {/* Simple waveform icon */}
                <svg
                  width="22" height="18" viewBox="0 0 22 18" fill="none"
                  className="text-[rgba(var(--atelier-ink-rgb),0.22)]"
                >
                  <rect x="0" y="7" width="2" height="4" rx="1" fill="currentColor" />
                  <rect x="4" y="4" width="2" height="10" rx="1" fill="currentColor" />
                  <rect x="8" y="1" width="2" height="16" rx="1" fill="currentColor" />
                  <rect x="12" y="4" width="2" height="10" rx="1" fill="currentColor" />
                  <rect x="16" y="6" width="2" height="6" rx="1" fill="currentColor" />
                  <rect x="20" y="7" width="2" height="4" rx="1" fill="currentColor" />
                </svg>
              </div>
              <div>
                <p className="text-[12px] font-medium text-[rgba(var(--atelier-ink-rgb),0.45)]">
                  Your transcripts appear here
                </p>
                <p className="mt-0.5 text-[11px] text-[rgba(var(--atelier-ink-rgb),0.28)]">
                  Complete a transcription to get started
                </p>
              </div>
            </div>
          ) : filteredSessions.length === 0 ? (
            <div className="py-8 text-center text-[12px] text-[rgba(var(--atelier-ink-rgb),0.38)]">
              No results for &ldquo;{searchQuery}&rdquo;
            </div>
          ) : (
            filteredSessions.map((session) => (
              <SessionRow
                key={session.id}
                session={session}
                isActive={session.id === activeSessionId}
                onSelect={() => onSelectSession(session)}
                onDelete={() => onDeleteSession(session.id)}
                onRename={(name) => onRenameSession(session.id, name)}
              />
            ))
          )}
        </div>
      </div>
    </section>
  );
}
