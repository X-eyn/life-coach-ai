'use client';

import { useState, useCallback, useMemo, useRef, useEffect } from 'react';
import { ArrowRight, Check, Copy, Download, Loader, Pencil, Sparkles } from 'lucide-react';
import { motion, AnimatePresence } from 'motion/react';
import { cn } from '@/lib/utils';

const SPRING = { type: 'spring' as const, stiffness: 360, damping: 28 };
const SPRING_FAST = { type: 'spring' as const, stiffness: 500, damping: 32 };

// ── Types & helpers ────────────────────────────────────────────────────────

interface TranscriptViewProps {
  transcript: {
    bengali: string;
    english: string;
  };
  className?: string;
  onExpand?: () => void;
  onExpandToTurn?: (turnIndex: number) => void;
  /** Total audio duration in seconds — used to compute approximate seek position. */
  audioDuration?: number;
  /** Called when the user clicks a timeline segment; arg is approximate seek time in seconds. */
  onJumpToTime?: (seconds: number) => void;
  /**
   * AI-detected speaker names keyed by speakerIndex.
   * `confidence: 'high'` — auto-filled and shown with sparkle confirmation strip.
   * `confidence: 'low'`  — surfaced only as suggestion in rename popover.
   */
  detectedNames?: Map<number, { name: string; confidence: 'high' | 'low' }>;
  /**
   * User-confirmed / user-entered speaker names keyed by speakerIndex.
   * When set, these take priority over `detectedNames`.
   */
  speakerNames?: Record<number, string>;
  /** Called after user confirms or edits detected names. */
  onSpeakerNamesChange?: (names: Record<number, string>) => void;
  /** Cached evaluation score to show mini summary in right panel */
  evaluationScore?: number | null;
}

export interface Turn {
  id: string;
  speaker: string;
  speakerIndex: number;
  wordCount: number;
  text: string;
}

function countWords(text: string) {
  return text.trim().split(/\s+/).filter(Boolean).length;
}

export function parseTurns(transcript: string): Turn[] {
  const text = transcript.replace(/\r\n/g, '\n');
  const regex = /(?:\*\*([^*\n:]+?):\*\*|\[([^\]\n]+?)\]:)\s*/g;

  const markers: { index: number; speaker: string; fullMatch: string }[] = [];
  let match: RegExpExecArray | null;
  while ((match = regex.exec(text)) !== null) {
    markers.push({
      index: match.index + match[0].length,
      speaker: (match[1] || match[2]).trim(),
      fullMatch: match[0],
    });
  }

  if (markers.length === 0) {
    const t = transcript.trim();
    return [{ id: '0', speaker: 'Transcript', speakerIndex: 0, text: t, wordCount: countWords(t) }];
  }

  const speakerMap = new Map<string, number>();
  markers.forEach(({ speaker }) => {
    if (!speakerMap.has(speaker)) speakerMap.set(speaker, speakerMap.size);
  });

  const turns: Turn[] = [];
  for (let i = 0; i < markers.length; i += 1) {
    const { speaker, index: start } = markers[i];
    const end =
      i + 1 < markers.length
        ? markers[i + 1].index - markers[i + 1].fullMatch.length
        : text.length;
    const raw = text.slice(start, end).trim();
    if (!raw) continue;
    turns.push({
      id: `${i}`,
      speaker,
      speakerIndex: speakerMap.get(speaker) ?? 0,
      text: raw,
      wordCount: countWords(raw),
    });
  }
  return turns;
}

function getLangSplit(bengaliText: string): { bangla: number; english: number } {
  const words = bengaliText.trim().split(/\s+/).filter(Boolean);
  if (!words.length) return { bangla: 50, english: 50 };
  const banglaWords = words.filter((w) => /[\u0980-\u09FF]/.test(w)).length;
  const pct = Math.round((banglaWords / words.length) * 100);
  return { bangla: pct, english: 100 - pct };
}

function fmtReadingTime(words: number): string {
  const mins = Math.ceil(words / 238);
  return `~${mins} min read`;
}

// Speaker color palette (matches message.tsx)
const SPEAKER_COLORS = ['#cf5a43', '#1f7e7a', '#3456d6', '#c9900e'];

function speakerColor(index: number) {
  return SPEAKER_COLORS[index % SPEAKER_COLORS.length];
}

// ── Section label ──────────────────────────────────────────────────────────

function SectionLabel({ children }: { children: React.ReactNode }) {
  return (
    <div className="mb-2.5 text-[10px] font-semibold uppercase tracking-[0.1em] text-[rgba(var(--atelier-ink-rgb),0.38)]">
      {children}
    </div>
  );
}

// ── RenamableLabel — click-to-rename speaker name inline ─────────────────────

interface RenamableLabelProps {
  name: string;
  speakerIndex: number;
  renamingIndex: number | null;
  renameVal: string;
  renameInputRef: React.RefObject<HTMLInputElement | null>;
  detectedNames?: Map<number, { name: string; confidence: 'high' | 'low' }>;
  speakerNames?: Record<number, string>;
  onStartRename: (idx: number, current: string) => void;
  onCommit: (idx: number) => void;
  onCancel: () => void;
  onChange: (v: string) => void;
}

function RenamableLabel({
  name, speakerIndex, renamingIndex, renameVal, renameInputRef,
  detectedNames, speakerNames,
  onStartRename, onCommit, onCancel, onChange,
}: RenamableLabelProps) {
  const isRenaming = renamingIndex === speakerIndex;
  const isAIDetected = !!speakerNames?.[speakerIndex] === false &&
    detectedNames?.get(speakerIndex)?.confidence === 'high';

  if (isRenaming) {
    return (
      <input
        ref={renameInputRef as React.RefObject<HTMLInputElement>}
        value={renameVal}
        onChange={(e) => onChange(e.target.value)}
        onBlur={() => onCommit(speakerIndex)}
        onKeyDown={(e) => {
          if (e.key === 'Enter') onCommit(speakerIndex);
          if (e.key === 'Escape') onCancel();
        }}
        className="w-28 rounded-[5px] border border-[rgba(var(--atelier-terracotta-rgb),0.4)] bg-white px-1 py-0 text-[11px] text-[var(--atelier-ink)] outline-none"
      />
    );
  }

  return (
    <button
      type="button"
      title="Click to rename"
      onClick={() => onStartRename(speakerIndex, name)}
      className="group flex items-center gap-1 text-[11px] text-[rgba(var(--atelier-ink-rgb),0.52)] transition-colors hover:text-[rgba(var(--atelier-ink-rgb),0.78)]"
    >
      {isAIDetected && (
        <Sparkles size={9} className="shrink-0 text-[var(--atelier-teal)] opacity-70" />
      )}
      {name}
      <Pencil size={9} className="shrink-0 opacity-0 transition-opacity group-hover:opacity-50" />
    </button>
  );
}

// ── Component ──────────────────────────────────────────────────────────────

export function TranscriptView({
  transcript, className, onExpand, onExpandToTurn,
  audioDuration, onJumpToTime,
  detectedNames, speakerNames, onSpeakerNamesChange,
  evaluationScore,
}: TranscriptViewProps) {
  const [copied, setCopied] = useState(false);
  const [isDownloading, setIsDownloading] = useState(false);
  // Which speaker is being renamed (speakerIndex), null = none
  const [renamingIndex, setRenamingIndex] = useState<number | null>(null);
  const [renameVal, setRenameVal] = useState('');
  const renameInputRef = useRef<HTMLInputElement>(null);
  // Whether the AI-detected name confirmation strip has been dismissed
  const [detectionDismissed, setDetectionDismissed] = useState(false);

  // Auto-focus the rename input when it appears
  useEffect(() => {
    if (renamingIndex !== null) setTimeout(() => renameInputRef.current?.select(), 0);
  }, [renamingIndex]);

  /** Returns the resolved display name for a speaker index. */
  const resolveName = useCallback((speakerIndex: number, fallback: string): string => {
    if (speakerNames?.[speakerIndex]) return speakerNames[speakerIndex];
    const detected = detectedNames?.get(speakerIndex);
    if (detected?.confidence === 'high') return detected.name;
    return fallback;
  }, [speakerNames, detectedNames]);

  const commitRename = useCallback((speakerIndex: number) => {
    const v = renameVal.trim();
    if (v) onSpeakerNamesChange?.({ ...speakerNames, [speakerIndex]: v });
    setRenamingIndex(null);
  }, [renameVal, speakerNames, onSpeakerNamesChange]);

  const confirmDetectedNames = useCallback(() => {
    if (!detectedNames) return;
    const confirmed: Record<number, string> = { ...speakerNames };
    for (const [idx, { confidence, name }] of detectedNames) {
      if (confidence === 'high' && !confirmed[idx]) confirmed[idx] = name;
    }
    onSpeakerNamesChange?.(confirmed);
    setDetectionDismissed(true);
  }, [detectedNames, speakerNames, onSpeakerNamesChange]);

  // High-confidence unconfirmed detections that should show the strip
  const pendingHighConfidence = useMemo(() => {
    if (detectionDismissed || !detectedNames) return [];
    return [...detectedNames.entries()]
      .filter(([idx, { confidence }]) => confidence === 'high' && !speakerNames?.[idx])
      .map(([idx, d]) => ({ idx, name: d.name }));
  }, [detectedNames, speakerNames, detectionDismissed]);

  // ── Derived data ──────────────────────────────────────────────────────

  const turns = useMemo(() => parseTurns(transcript.bengali), [transcript.bengali]);

  const totalWords = useMemo(
    () => countWords(transcript.bengali) + countWords(transcript.english),
    [transcript],
  );

  const langSplit = useMemo(() => getLangSplit(transcript.bengali), [transcript.bengali]);

  const speakerStats = useMemo(() => {
    const map = new Map<string, { speakerIndex: number; words: number }>();
    for (const turn of turns) {
      const existing = map.get(turn.speaker);
      if (existing) {
        existing.words += turn.wordCount;
      } else {
        map.set(turn.speaker, { speakerIndex: turn.speakerIndex, words: turn.wordCount });
      }
    }
    const total = turns.reduce((s, t) => s + t.wordCount, 0) || 1;
    return Array.from(map.entries()).map(([speaker, { speakerIndex, words }]) => ({
      speaker: resolveName(speakerIndex, speaker),
      rawSpeaker: speaker,
      speakerIndex,
      words,
      pct: Math.round((words / total) * 100),
    }));
  }, [turns, resolveName]);

  const totalTurnWords = useMemo(
    () => turns.reduce((s, t) => s + t.wordCount, 0) || 1,
    [turns],
  );

  // Key moments: only shown for multi-turn transcripts.
  // Longest turn + final turn (2 items, deduplicated)
  const keyMoments = useMemo(() => {
    // Single-turn → no comparison possible, hide the section
    if (turns.length <= 1) return [];
    const result: { idx: number; label: string; turn: Turn }[] = [];

    let longestIdx = 0;
    for (let i = 1; i < turns.length; i++) {
      if (turns[i].wordCount > turns[longestIdx].wordCount) longestIdx = i;
    }
    result.push({ idx: longestIdx, label: 'Longest turn', turn: turns[longestIdx] });

    const lastIdx = turns.length - 1;
    if (lastIdx !== longestIdx) {
      result.push({ idx: lastIdx, label: 'Final turn', turn: turns[lastIdx] });
    }

    return result.sort((a, b) => a.idx - b.idx);
  }, [turns]);

  const durationMins = useMemo(() => Math.ceil(totalWords / 238), [totalWords]);

  // ── Actions ───────────────────────────────────────────────────────────

  const copy = useCallback(async () => {
    await navigator.clipboard.writeText(
      `${transcript.bengali}\n\n---\n\n${transcript.english}`,
    );
    setCopied(true);
    setTimeout(() => setCopied(false), 1800);
  }, [transcript]);

  const downloadWord = useCallback(async () => {
    setIsDownloading(true);
    try {
      const response = await fetch('/api/download-word', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ bengali: transcript.bengali, english: transcript.english }),
      });
      if (!response.ok) throw new Error('Download failed');
      const blob = await response.blob();
      const url = window.URL.createObjectURL(blob);
      const anchor = document.createElement('a');
      anchor.href = url;
      anchor.download = 'transcript.docx';
      document.body.appendChild(anchor);
      anchor.click();
      window.URL.revokeObjectURL(url);
      document.body.removeChild(anchor);
    } catch (error) {
      console.error('Download error:', error);
    } finally {
      setIsDownloading(false);
    }
  }, [transcript]);

  const handleTimelineClick = useCallback(
    (turnIndex: number) => {
      // Seek the waveform player to the turn's approximate audio position
      if (onJumpToTime && audioDuration) {
        const cumulativeWords = turns.slice(0, turnIndex).reduce((s, t) => s + t.wordCount, 0);
        const approxTime = (cumulativeWords / Math.max(1, totalTurnWords)) * audioDuration;
        onJumpToTime(approxTime);
      }
      if (onExpandToTurn) {
        onExpandToTurn(turnIndex);
      } else {
        onExpand?.();
      }
    },
    [onExpandToTurn, onExpand, onJumpToTime, audioDuration, turns, totalTurnWords],
  );

  // ── Render ────────────────────────────────────────────────────────────

  return (
    <div
      className={cn(
        'atelier-transcript-panel flex h-full min-h-0 flex-col overflow-hidden rounded-[30px]',
        className,
      )}
    >
      {/* ── Header ──────────────────────────────────────────────────── */}
      <div className="flex items-end justify-between gap-3 px-5 pb-2 pt-5">
        <div className="min-w-0 flex-1">
          <div className="mb-1 text-[10px] font-medium uppercase tracking-[0.12em] text-[rgba(var(--atelier-ink-rgb),0.44)]">
            Transcript
          </div>
          <h2 className="text-lg font-semibold leading-tight text-[var(--atelier-ink)] sm:text-xl">
            Session Overview
          </h2>
        </div>

        {/* Ghost icon buttons — no border, no bg */}
        <div className="flex items-center gap-0.5">
          <motion.button
            onClick={copy}
            className="inline-flex h-8 w-8 items-center justify-center rounded-lg text-[rgba(var(--atelier-ink-rgb),0.38)] transition-colors hover:text-[var(--atelier-ink)]"
            title="Copy full transcript"
            type="button"
            whileTap={{ scale: 0.88 }}
            transition={SPRING_FAST}
          >
            {copied ? <Check size={15} /> : <Copy size={15} />}
          </motion.button>
          <motion.button
            onClick={downloadWord}
            disabled={isDownloading}
            className="inline-flex h-8 w-8 items-center justify-center rounded-lg text-[rgba(var(--atelier-ink-rgb),0.38)] transition-colors hover:text-[var(--atelier-ink)] disabled:opacity-40"
            title="Download as Word document"
            type="button"
            whileTap={{ scale: 0.88 }}
            transition={SPRING_FAST}
          >
            {isDownloading ? <Loader size={15} className="animate-spin" /> : <Download size={15} />}
          </motion.button>
        </div>
      </div>

      {/* ── Stats chips + speaker names row ─────────────────────────── */}
      <div className="atelier-section-1 flex items-center justify-between gap-3 px-5 pb-4">
        <div className="flex flex-wrap items-center gap-1.5">
          {[
            `${totalWords.toLocaleString()} words`,
            `${turns.length} ${turns.length === 1 ? 'turn' : 'turns'}`,
            fmtReadingTime(totalWords),
          ].map((label) => (
            <span
              key={label}
              className="rounded-[7px] bg-[rgba(var(--atelier-ink-rgb),0.055)] px-2.5 py-1 text-[11px] font-medium text-[rgba(var(--atelier-ink-rgb),0.62)]"
            >
              {label}
            </span>
          ))}
        </div>
        {/* Colored speaker dots + names */}
        <div className="flex shrink-0 items-center gap-3">
          {speakerStats.map((s) => (
            <div key={s.speaker} className="flex items-center gap-1.5">
              <span
                className="inline-block h-2 w-2 shrink-0 rounded-full"
                style={{ background: speakerColor(s.speakerIndex) }}
              />
              <span className="text-[12px] font-medium text-[rgba(var(--atelier-ink-rgb),0.65)]">
                {s.speaker}
              </span>
            </div>
          ))}
        </div>
      </div>

      {/* ── AI name detection confirmation strip ──────────────────── */}
      <AnimatePresence>
        {pendingHighConfidence.length > 0 && (
          <motion.div
            className="mx-5 mb-2 flex items-center gap-2 rounded-[10px] border border-[rgba(var(--atelier-teal-rgb),0.2)] bg-[rgba(var(--atelier-teal-rgb),0.06)] px-3 py-2"
            initial={{ opacity: 0, y: -6, height: 0 }}
            animate={{ opacity: 1, y: 0, height: 'auto' }}
            exit={{ opacity: 0, y: -6, height: 0 }}
            transition={SPRING}
          >
            <Sparkles size={11} className="shrink-0 text-[var(--atelier-teal)]" />
            <p className="min-w-0 flex-1 text-[11px] text-[rgba(var(--atelier-ink-rgb),0.65)]">
              Detected: {pendingHighConfidence.map((p) => p.name).join(', ')}
            </p>
            <motion.button type="button" onClick={confirmDetectedNames}
              className="shrink-0 rounded-[6px] bg-[var(--atelier-teal)] px-2 py-0.5 text-[10px] font-semibold text-white transition-opacity hover:opacity-80"
              whileTap={{ scale: 0.94 }} transition={SPRING_FAST}>
              Confirm
            </motion.button>
            <motion.button type="button" onClick={() => setDetectionDismissed(true)}
              className="shrink-0 text-[10px] text-[rgba(var(--atelier-ink-rgb),0.38)] transition-colors hover:text-[rgba(var(--atelier-ink-rgb),0.65)]"
              whileTap={{ scale: 0.94 }} transition={SPRING_FAST}>
              Dismiss
            </motion.button>
          </motion.div>
        )}
      </AnimatePresence>

      <div className="mx-5 border-t border-[rgba(var(--atelier-ink-rgb),0.07)]" />

      {/* ── Main insights — no scroll ───────────────────────────────── */}
      <div className="flex min-h-0 flex-1 flex-col gap-4 overflow-hidden px-5 py-4">

        {/* Side-by-side: Speaker distribution | Language split */}
        <div className="atelier-section-2 grid grid-cols-2 gap-4">

          {/* Speaker distribution */}
          <div>
            <SectionLabel>Speakers</SectionLabel>
            {speakerStats.length === 1 ? (
              /* Single speaker — collapse bar into inline text + rename */
              <div className="flex items-center gap-2">
                <span className="h-2.5 w-2.5 shrink-0 rounded-full"
                  style={{ background: speakerColor(speakerStats[0].speakerIndex), opacity: 0.85 }} />
                <RenamableLabel
                  name={speakerStats[0].speaker} speakerIndex={speakerStats[0].speakerIndex}
                  renamingIndex={renamingIndex} renameVal={renameVal} renameInputRef={renameInputRef}
                  detectedNames={detectedNames} speakerNames={speakerNames}
                  onStartRename={(idx, cur) => { setRenamingIndex(idx); setRenameVal(cur); }}
                  onCommit={commitRename} onCancel={() => setRenamingIndex(null)} onChange={setRenameVal}
                />
              </div>
            ) : (
              /* Multi-speaker — full distribution bar */
              <>
                <div className="flex h-5 w-full overflow-hidden rounded-full">
                  {speakerStats.map((s, idx) => (
                    <motion.div
                      key={s.speakerIndex}
                      style={{ background: speakerColor(s.speakerIndex), opacity: 0.85 }}
                      className="relative flex items-center justify-center overflow-hidden"
                      initial={{ width: 0 }}
                      animate={{ width: `${s.pct}%` }}
                      transition={{ ...SPRING, delay: idx * 0.06 }}
                      title={`${s.speaker}: ${s.pct}%`}
                    >
                      {s.pct >= 18 && (
                        <span className="select-none text-[10px] font-bold text-white/90">{s.pct}%</span>
                      )}
                    </motion.div>
                  ))}
                </div>
                <div className="mt-2 flex flex-wrap gap-x-3 gap-y-1">
                  {speakerStats.map((s) => (
                    <div key={s.speakerIndex} className="flex items-center gap-1">
                      <span className="inline-block h-1.5 w-1.5 shrink-0 rounded-full"
                        style={{ background: speakerColor(s.speakerIndex) }} />
                      <RenamableLabel
                        name={s.speaker} speakerIndex={s.speakerIndex}
                        renamingIndex={renamingIndex} renameVal={renameVal} renameInputRef={renameInputRef}
                        detectedNames={detectedNames} speakerNames={speakerNames}
                        onStartRename={(idx, cur) => { setRenamingIndex(idx); setRenameVal(cur); }}
                        onCommit={commitRename} onCancel={() => setRenamingIndex(null)} onChange={setRenameVal}
                      />
                      {s.pct < 18 && (
                        <span className="text-[11px] font-semibold text-[rgba(var(--atelier-ink-rgb),0.72)]">{s.pct}%</span>
                      )}
                    </div>
                  ))}
                </div>
              </>
            )}
          </div>

          {/* Language split */}
          <div>
            <SectionLabel>Language</SectionLabel>
            {(langSplit.bangla === 0 || langSplit.english === 0) ? (
              /* Single language — collapse bar into inline text */
              <div className="flex items-center gap-2">
                <span className="h-2.5 w-2.5 shrink-0 rounded-full"
                  style={{ background: langSplit.bangla > 0 ? '#3d6b68' : '#9baab4', opacity: 0.88 }} />
                <span className="text-[12px] text-[rgba(var(--atelier-ink-rgb),0.62)]">
                  {langSplit.bangla > 0 ? 'Bangla' : 'English'}
                </span>
              </div>
            ) : (
              /* Bilingual — full distribution bar */
              <>
                <div className="flex h-5 w-full overflow-hidden rounded-full">
                  {langSplit.bangla > 0 && (
                    <motion.div
                      style={{ minWidth: '10px', background: '#3d6b68', opacity: 0.88 }}
                      className="relative flex items-center justify-center shrink-0 overflow-hidden"
                      initial={{ width: 0 }}
                      animate={{ width: `${langSplit.bangla}%` }}
                      transition={SPRING}
                    >
                      {langSplit.bangla >= 18 && (
                        <span className="select-none text-[10px] font-bold text-white/90">{langSplit.bangla}%</span>
                      )}
                    </motion.div>
                  )}
                  {langSplit.english > 0 && (
                    <motion.div
                      style={{ minWidth: '10px', background: '#9baab4', opacity: 0.90 }}
                      className="relative flex items-center justify-center shrink-0 overflow-hidden"
                      initial={{ width: 0 }}
                      animate={{ width: `${langSplit.english}%` }}
                      transition={{ ...SPRING, delay: 0.06 }}
                    >
                      {langSplit.english >= 18 && (
                        <span className="select-none text-[10px] font-bold" style={{ color: 'rgba(13,18,32,0.65)' }}>{langSplit.english}%</span>
                      )}
                    </motion.div>
                  )}
                </div>
                <div className="mt-2 flex gap-3">
                  {langSplit.bangla > 0 && (
                    <div className="flex items-center gap-1">
                      <span className="inline-block h-1.5 w-1.5 shrink-0 rounded-full" style={{ background: '#3d6b68' }} />
                      <span className="text-[11px] text-[rgba(var(--atelier-ink-rgb),0.52)]">Bangla</span>
                    </div>
                  )}
                  {langSplit.english > 0 && (
                    <div className="flex items-center gap-1">
                      <span className="inline-block h-1.5 w-1.5 shrink-0 rounded-full" style={{ background: '#9baab4' }} />
                      <span className="text-[11px] text-[rgba(var(--atelier-ink-rgb),0.52)]">English</span>
                    </div>
                  )}
                </div>
              </>
            )}
          </div>
        </div>

        {/* Turn timeline */}
        <div className="atelier-section-3">
          <SectionLabel>Conversation</SectionLabel>
          <div className="flex h-7 w-full gap-[2px] overflow-hidden rounded-[8px]">
            {turns.map((turn, i) => (
              <button
                key={turn.id}
                type="button"
                onClick={() => handleTimelineClick(i)}
                style={{
                  width: `${Math.max((turn.wordCount / totalTurnWords) * 100, 0.4)}%`,
                  background: speakerColor(turn.speakerIndex),
                  opacity: 0.70,
                }}
                title={`${turn.speaker} · ${turn.wordCount} words\n"${turn.text.slice(0, 80)}${turn.text.length > 80 ? '…' : ''}"`}
                className="h-full cursor-pointer transition-opacity hover:opacity-100 focus:outline-none focus-visible:ring-1 focus-visible:ring-white/60"
                aria-label={`Jump to turn by ${turn.speaker}`}
              />
            ))}
          </div>
          <div className="mt-1.5 flex items-center justify-between">
            <p className="text-[11px] text-[rgba(var(--atelier-ink-rgb),0.34)]">
              {turns.length} turns · click any bar to jump
            </p>
            <div className="flex items-center gap-1 text-[10px] text-[rgba(var(--atelier-ink-rgb),0.22)]">
              <span>0:00</span>
              <span className="mx-1 select-none">·····</span>
              <span>~{durationMins}:00</span>
            </div>
          </div>
        </div>

        {/* Key moments — exactly 2 cards (Longest + Final), no scroll */}
        {keyMoments.length > 0 && (
          <div className="atelier-section-4 shrink-0">
            <SectionLabel>Key moments</SectionLabel>
            <div className="flex flex-col gap-1.5">
              {keyMoments.map(({ idx, label, turn }) => (
                <motion.button
                  key={idx}
                  type="button"
                  onClick={() => handleTimelineClick(idx)}
                  className="group flex w-full items-start gap-2 rounded-[10px] border border-[rgba(var(--atelier-ink-rgb),0.07)] bg-[rgba(255,255,255,0.38)] px-2.5 py-2 text-left transition-colors hover:bg-[rgba(255,255,255,0.65)]"
                  whileHover={{ y: -1, boxShadow: '0 4px 16px rgba(13,18,32,0.07)' }}
                  whileTap={{ scale: 0.98 }}
                  transition={SPRING}
                >
                  <span
                    className="mt-[3px] h-2 w-2 shrink-0 rounded-full"
                    style={{ background: speakerColor(turn.speakerIndex) }}
                  />
                  <div className="min-w-0 flex-1">
                    <div className="flex items-baseline gap-1.5">
                      <span className="text-[10px] font-semibold uppercase tracking-[0.08em] text-[rgba(var(--atelier-ink-rgb),0.36)]">
                        {label}
                      </span>
                      <span className="text-[10px] text-[rgba(var(--atelier-ink-rgb),0.28)]">&middot; by</span>
                      <span className="text-[11px] font-medium text-[rgba(var(--atelier-ink-rgb),0.55)]">{turn.speaker}</span>
                    </div>
                    <p className="mt-0.5 line-clamp-2 text-[12px] leading-[1.4] text-[rgba(var(--atelier-ink-rgb),0.65)]">
                      {turn.text}
                    </p>
                  </div>
                  <span className="mt-0.5 shrink-0 text-[rgba(var(--atelier-ink-rgb),0.22)] transition-transform duration-150 group-hover:translate-x-0.5 group-hover:text-[rgba(var(--atelier-ink-rgb),0.5)]">
                    →
                  </span>
                </motion.button>
              ))}
            </div>
          </div>
        )}
      </div>

      {/* ── Mini Evaluation Score ─────────────────────────────────────── */}
      {evaluationScore != null && (
        <div className="atelier-section-5 shrink-0 mx-5 mb-2">
          <SectionLabel>Evaluation</SectionLabel>
          <motion.button
            type="button"
            onClick={onExpand}
            className="flex w-full items-center gap-3 rounded-[12px] border border-[rgba(var(--atelier-ink-rgb),0.07)] bg-[rgba(255,255,255,0.4)] px-3 py-2.5 text-left transition-colors hover:bg-[rgba(255,255,255,0.65)]"
            whileHover={{ y: -1 }}
            whileTap={{ scale: 0.985 }}
            transition={SPRING}
          >
            <span
              className={cn(
                'flex h-8 w-8 items-center justify-center rounded-[8px] text-[13px] font-bold',
                evaluationScore >= 4 ? 'bg-emerald-100 text-emerald-700'
                  : evaluationScore >= 3 ? 'bg-amber-100 text-amber-700'
                  : 'bg-red-100 text-red-700'
              )}
            >
              {evaluationScore.toFixed(1)}
            </span>
            <div className="min-w-0 flex-1">
              <span className="text-[12px] font-medium text-[rgba(var(--atelier-ink-rgb),0.65)]">
                {evaluationScore >= 4 ? 'Good' : evaluationScore >= 3 ? 'Satisfactory' : 'Needs Improvement'}
              </span>
              <span className="block text-[10px] text-[rgba(var(--atelier-ink-rgb),0.35)]">
                AI teaching quality score
              </span>
            </div>
            <ArrowRight size={13} className="shrink-0 text-[rgba(var(--atelier-ink-rgb),0.25)]" />
          </motion.button>
        </div>
      )}

      {/* ── Read CTA ──────────────────────────────────────────────────── */}
      <div className="atelier-section-6 border-t border-[rgba(var(--atelier-ink-rgb),0.07)] p-4">
        <motion.button
          type="button"
          onClick={onExpand}
          className="flex w-full items-center justify-center gap-2 rounded-[16px] bg-[var(--atelier-ink)] px-5 py-3.5 text-[13px] font-semibold text-[var(--atelier-paper-strong)] shadow-[0_8px_24px_rgba(13,18,32,0.16)]"
          whileHover={{ y: -2, boxShadow: '0 12px 30px rgba(13,18,32,0.22)' }}
          whileTap={{ scale: 0.97, y: 0 }}
          transition={SPRING}
        >
          Read full transcript
          <ArrowRight size={14} strokeWidth={2.2} />
        </motion.button>
      </div>
    </div>
  );
}

