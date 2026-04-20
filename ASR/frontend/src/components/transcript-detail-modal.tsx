'use client';

import { useState, useMemo, useEffect, useCallback, useRef } from 'react';
import { X, Copy, Download, Loader } from 'lucide-react';
import { cn } from '@/lib/utils';
import { EvaluationComponent } from './evaluation';
import { MediaPlayer } from './media-player';

interface TranscriptDetailModalProps {
  isOpen: boolean;
  onClose: () => void;
  transcript: {
    bengali: string;
    english: string;
  };
  audioUrl?: string;
  initialTurnIndex?: number;
}

interface Turn {
  id: string;
  speaker: string;
  speakerIndex: number;
  text: string;
}

function parseTurns(transcript: string): Turn[] {
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
    return [{ id: '0', speaker: 'Transcript', speakerIndex: 0, text: transcript.trim() }];
  }

  const speakerMap = new Map<string, number>();
  markers.forEach(({ speaker }) => {
    if (!speakerMap.has(speaker)) speakerMap.set(speaker, speakerMap.size);
  });

  const turns: Turn[] = [];
  for (let index = 0; index < markers.length; index += 1) {
    const { speaker, index: start } = markers[index];
    const end = index + 1 < markers.length ? markers[index + 1].index - markers[index + 1].fullMatch.length : text.length;
    const raw = text.slice(start, end).trim();
    if (!raw) continue;
    turns.push({
      id: `${index}`,
      speaker,
      speakerIndex: speakerMap.get(speaker) ?? 0,
      text: raw,
    });
  }

  return turns;
}

const SPEAKER_COLORS = {
  0: { dot: 'bg-[var(--atelier-terracotta)]', name: 'Speaker 1' },
  1: { dot: 'bg-[var(--atelier-teal)]', name: 'Speaker 2' },
  2: { dot: 'bg-[var(--atelier-gold)]', name: 'Speaker 3' },
  3: { dot: 'bg-[var(--atelier-cobalt)]', name: 'Speaker 4' },
};

const TAB_LABELS = {
  bengali: 'Bangla',
  english: 'English',
} as const;

function wordCount(text: string) {
  return text.trim().split(/\s+/).filter(Boolean).length;
}

export function TranscriptDetailModal({ isOpen, onClose, transcript, audioUrl, initialTurnIndex }: TranscriptDetailModalProps) {
  const [activeLanguageTab, setActiveLanguageTab] = useState<'bengali' | 'english'>('bengali');
  const [activeMainTab, setActiveMainTab] = useState<'main' | 'evaluations'>('main');
  const [copied, setCopied] = useState(false);
  const [isDownloading, setIsDownloading] = useState(false);
  const [currentPlayTime, setCurrentPlayTime] = useState(0);
  const [modalDuration, setModalDuration] = useState(0);
  // visible drives the CSS transition — starts false so the enter animation plays from opacity-0
  const [visible, setVisible] = useState(false);
  const raf1Ref = useRef<number>(0);
  const raf2Ref = useRef<number>(0);
  const contentRef = useRef<HTMLDivElement>(null);

  // Double-RAF trick: ensure the hidden initial state is painted before we transition to visible.
  // A single useEffect without rAF can fire before the first paint, skipping the animation.
  useEffect(() => {
    if (!isOpen) return;
    raf1Ref.current = requestAnimationFrame(() => {
      raf2Ref.current = requestAnimationFrame(() => setVisible(true));
    });
    return () => {
      cancelAnimationFrame(raf1Ref.current);
      cancelAnimationFrame(raf2Ref.current);
    };
  }, [isOpen]);

  const handleClose = useCallback(() => {
    setVisible(false);
    // 280ms matches the CSS transition duration — let the exit animation finish first
    setTimeout(onClose, 280);
  }, [onClose]);

  const currentTranscript = transcript[activeLanguageTab];
  const turns = useMemo(() => parseTurns(currentTranscript), [currentTranscript]);
  const wordTotal = wordCount(currentTranscript);

  // Map playback position to the active turn via word-count proportions
  const activeTurnIndex = useMemo(() => {
    if (!currentPlayTime || !modalDuration || activeMainTab !== 'main') return -1;
    const progress = currentPlayTime / modalDuration;
    let cumWords = 0;
    const total = turns.reduce((s, t) => s + wordCount(t.text), 0) || 1;
    for (let i = 0; i < turns.length; i++) {
      cumWords += wordCount(turns[i].text);
      if (progress <= cumWords / total) return i;
    }
    return turns.length - 1;
  }, [currentPlayTime, modalDuration, turns, activeMainTab]);

  // Scroll to a specific turn after the modal opens
  useEffect(() => {
    if (!visible || initialTurnIndex == null) return;
    const timer = setTimeout(() => {
      const el = contentRef.current?.querySelector(`[data-turn-index="${initialTurnIndex}"]`);
      if (el) el.scrollIntoView({ block: 'start', behavior: 'smooth' });
    }, 50);
    return () => clearTimeout(timer);
  }, [visible, initialTurnIndex]);

  // Auto-scroll to the active turn as audio plays (nearest = only scrolls if off-screen)
  useEffect(() => {
    if (activeTurnIndex < 0) return;
    const el = contentRef.current?.querySelector(`[data-turn-index="${activeTurnIndex}"]`);
    if (el) el.scrollIntoView({ block: 'nearest', behavior: 'smooth' });
  }, [activeTurnIndex]);

  const copy = useCallback(async () => {
    await navigator.clipboard.writeText(currentTranscript);
    setCopied(true);
    setTimeout(() => setCopied(false), 1800);
  }, [currentTranscript]);

  const downloadWord = useCallback(async () => {
    setIsDownloading(true);
    try {
      const response = await fetch('/api/download-word', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          bengali: transcript.bengali,
          english: transcript.english,
        }),
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

  if (!isOpen) return null;

  return (
    <>
      {/* Backdrop — only opacity transitions; never animate backdrop-filter */}
      <div
        className={cn(
          'fixed inset-0 z-40 bg-[rgba(13,18,32,0.38)] backdrop-blur-[5px]',
          'transition-opacity duration-[280ms] ease-out',
          visible ? 'opacity-100' : 'opacity-0',
        )}
        onClick={handleClose}
      />

      {/* Modal */}
      <div
        className={cn(
          'fixed inset-0 z-50 flex items-center justify-center p-4',
          // Only animate the two GPU-composited properties — not "all"
          'transition-[opacity,transform] duration-[300ms] ease-[cubic-bezier(0.16,1,0.3,1)]',
          visible ? 'opacity-100 translate-y-0 scale-100' : 'opacity-0 translate-y-3 scale-[0.97] pointer-events-none',
        )}
        style={{ willChange: 'transform, opacity' }}
      >
        <div className="w-full max-w-4xl max-h-[90vh] rounded-[32px] atelier-panel shadow-2xl flex flex-col overflow-hidden">
          {/* Header with Close Button */}
          <div className="flex items-start justify-between gap-4 border-b border-[rgba(var(--atelier-ink-rgb),0.08)] px-6 py-5 flex-shrink-0">
            <div className="flex-1">
              <div className="atelier-kicker">Transcript Output</div>
              <div className="flex items-center gap-3 mt-2 flex-wrap">
                <h2 className="text-lg font-semibold text-[var(--atelier-ink)] sm:text-xl">Bilingual Transcript</h2>
                <div className="flex flex-wrap items-center gap-2">
                  <span className="rounded-full border border-[rgba(var(--atelier-teal-rgb),0.16)] bg-[rgba(var(--atelier-teal-rgb),0.08)] px-3 py-1 text-[10px] font-semibold tracking-[0.12em] text-[rgba(var(--atelier-ink-rgb),0.76)]">
                    {wordTotal} words
                  </span>
                  <span className="rounded-full border border-[rgba(var(--atelier-cobalt-rgb),0.16)] bg-[rgba(var(--atelier-cobalt-rgb),0.08)] px-3 py-1 text-[10px] font-semibold tracking-[0.12em] text-[rgba(var(--atelier-ink-rgb),0.76)]">
                    {turns.length} turns
                  </span>
                </div>
              </div>
            </div>
            <button
              onClick={handleClose}
              className="flex-shrink-0 p-2 hover:bg-[rgba(var(--atelier-terracotta-rgb),0.1)] rounded-lg transition-colors text-[var(--atelier-ink)] hover:text-[var(--atelier-terracotta)]"
              aria-label="Close transcript"
            >
              <X size={24} />
            </button>
          </div>

          {/* Tabs and Controls */}
          <div className="flex flex-col gap-6 border-b border-[rgba(var(--atelier-ink-rgb),0.08)] px-6 py-5 flex-shrink-0">
            {/* Main Tabs - More Prominent */}
            <div className="flex items-center gap-8">
              {(['main', 'evaluations'] as const).map((tab) => (
                <button
                  key={tab}
                  onClick={() => setActiveMainTab(tab)}
                  className={cn(
                    'relative pb-3 text-sm font-bold tracking-[0.16em] uppercase transition-colors duration-200',
                    activeMainTab === tab
                      ? 'text-[var(--atelier-ink)]'
                      : 'text-[rgba(var(--atelier-ink-rgb),0.4)] hover:text-[rgba(var(--atelier-ink-rgb),0.6)]'
                  )}
                  type="button"
                >
                  {tab === 'main' ? 'Main' : 'Evaluations'}
                  {activeMainTab === tab && (
                    <div className="absolute bottom-0 left-0 right-0 h-[3px] bg-[var(--atelier-terracotta)] rounded-full" />
                  )}
                </button>
              ))}
            </div>

            {/* Language Tabs and Controls - Only show on Main tab */}
            {activeMainTab === 'main' && (
              <div className="flex flex-wrap items-center justify-between gap-4">
                <div className="inline-flex items-center gap-2 rounded-full border border-[rgba(var(--atelier-ink-rgb),0.1)] bg-[rgba(255,255,255,0.46)] p-1">
                  {(['bengali', 'english'] as const).map((lang) => (
                    <button
                      key={lang}
                      onClick={() => setActiveLanguageTab(lang)}
                      className={cn(
                        'rounded-full px-4 py-2 text-[11px] font-semibold tracking-[0.16em] transition-colors',
                        activeLanguageTab === lang
                          ? 'bg-[rgba(var(--atelier-terracotta-rgb),0.92)] text-[var(--atelier-paper-strong)]'
                          : 'text-[rgba(var(--atelier-ink-rgb),0.62)] hover:bg-[rgba(255,255,255,0.6)]'
                      )}
                      type="button"
                    >
                      {TAB_LABELS[lang]}
                    </button>
                  ))}
                </div>

                <div className="flex flex-wrap items-center gap-2">
                  <button
                    onClick={downloadWord}
                    disabled={isDownloading}
                    className="atelier-ghost-button inline-flex h-9 items-center gap-2 px-3 text-[11px] font-semibold tracking-[0.14em] disabled:opacity-50"
                    title="Download as Word document"
                    type="button"
                  >
                    {isDownloading ? <Loader size={13} className="animate-spin" /> : <Download size={13} />}
                    <span>{isDownloading ? 'Saving' : 'Docx'}</span>
                  </button>

                  <button
                    onClick={copy}
                    className="atelier-button inline-flex h-9 items-center gap-2 px-3 text-[11px] font-semibold tracking-[0.14em]"
                    type="button"
                  >
                    <Copy size={13} />
                    <span>{copied ? 'Copied!' : 'Copy'}</span>
                  </button>
                </div>
              </div>
            )}
          </div>

          {/* Transcript Content */}
          <div ref={contentRef} className="flex-1 min-h-0 overflow-y-auto px-6 py-6">
            {activeMainTab === 'main' ? (
              <div className="space-y-6">
                {turns.length > 0 ? (
                  turns.map((turn, index) => {
                    const speakerColor = SPEAKER_COLORS[turn.speakerIndex as keyof typeof SPEAKER_COLORS] || SPEAKER_COLORS[0];
                    return (
                      <div key={turn.id} data-turn-index={index} className={cn('group rounded-[12px] -mx-2 px-2 py-1.5 transition-colors duration-500', index === activeTurnIndex ? 'bg-[rgba(207,90,67,0.07)]' : '')}>
                        <div className="flex items-baseline gap-3 mb-2">
                          <div
                            className={cn('w-2 h-2 rounded-full flex-shrink-0 mt-1', speakerColor.dot)}
                          />
                          <span className="font-semibold text-[var(--atelier-ink)] text-sm">
                            {turn.speaker}
                          </span>
                        </div>
                        <p className="text-sm leading-relaxed text-[rgba(var(--atelier-ink-rgb),0.78)] ml-5">
                          {turn.text}
                        </p>
                      </div>
                    );
                  })
                ) : (
                  <div className="text-center py-8 text-[rgba(var(--atelier-ink-rgb),0.5)]">
                    No transcript content available
                  </div>
                )}
              </div>
            ) : (
              <EvaluationComponent transcript={transcript} />
            )}
          </div>

          {/* Media Player */}
          <MediaPlayer
            audioUrl={audioUrl}
            onTimeUpdate={(t, dur) => { setCurrentPlayTime(t); setModalDuration(dur); }}
          />
        </div>
      </div>
    </>
  );
}
