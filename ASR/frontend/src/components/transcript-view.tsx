'use client';

import { useState, useCallback, useMemo } from 'react';
import { Check, Copy, Download, Loader, Maximize2 } from 'lucide-react';
import Link from 'next/link';
import { cn } from '@/lib/utils';
import { Conversation, ConversationContent, ConversationScrollButton } from '@/components/ai/conversation';
import { Message, MessageContent } from '@/components/ai/message';

interface TranscriptViewProps {
  transcript: {
    bengali: string;
    english: string;
  };
  className?: string;
}

interface Turn {
  id: string;
  speaker: string;
  speakerIndex: number;
  text: string;
}

function wordCount(text: string) {
  return text.trim().split(/\s+/).filter(Boolean).length;
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

const TAB_LABELS = {
  bengali: 'Bangla',
  english: 'English',
} as const;

export function TranscriptView({ transcript, className }: TranscriptViewProps) {
  const [copied, setCopied] = useState(false);
  const [activeTab, setActiveTab] = useState<'bengali' | 'english'>('bengali');
  const [isDownloading, setIsDownloading] = useState(false);

  const currentTranscript = transcript[activeTab];

  const handleExpandClicked = () => {
    if (typeof window !== 'undefined') {
      localStorage.setItem('transcript_detail', JSON.stringify({
        bengali: transcript.bengali,
        english: transcript.english,
      }));
    }
  };

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

  const turns = useMemo(() => parseTurns(currentTranscript), [currentTranscript]);
  const wordTotal = wordCount(currentTranscript);
  const firstSpeakerIndex = turns[0]?.speakerIndex ?? 0;

  return (
    <div className={cn('atelier-panel flex h-full min-h-0 flex-col overflow-hidden rounded-[30px]', className)}>
      <div className="flex flex-wrap items-start justify-between gap-4 border-b border-[rgba(var(--atelier-ink-rgb),0.08)] px-4 py-4 sm:px-5">
        <div className="min-w-0">
          <div className="atelier-kicker">Transcript Output</div>
          <div className="mt-2 flex flex-wrap items-center gap-2">
            <h2 className="text-lg font-semibold text-[var(--atelier-ink)] sm:text-xl">Bilingual Transcript</h2>
            <span className="rounded-full border border-[rgba(var(--atelier-teal-rgb),0.16)] bg-[rgba(var(--atelier-teal-rgb),0.08)] px-3 py-1 text-[11px] font-semibold tracking-[0.12em] text-[rgba(var(--atelier-ink-rgb),0.76)]">
              {wordTotal} words
            </span>
            <span className="rounded-full border border-[rgba(var(--atelier-cobalt-rgb),0.16)] bg-[rgba(var(--atelier-cobalt-rgb),0.08)] px-3 py-1 text-[11px] font-semibold tracking-[0.12em] text-[rgba(var(--atelier-ink-rgb),0.76)]">
              {turns.length} turns
            </span>
          </div>
        </div>

        <div className="flex flex-wrap items-center gap-2">
          <Link
            href={`/transcript-detail?words=${wordTotal}&turns=${turns.length}`}
            onClick={handleExpandClicked}
            className="atelier-ghost-button inline-flex h-10 items-center gap-2 px-3 text-[11px] font-semibold tracking-[0.14em]"
            title="Open fullscreen transcript"
          >
            <Maximize2 size={13} />
            <span>Expand</span>
          </Link>

          <button
            onClick={downloadWord}
            disabled={isDownloading}
            className="atelier-ghost-button inline-flex h-10 items-center gap-2 px-3 text-[11px] font-semibold tracking-[0.14em] disabled:opacity-50"
            title="Download as Word document"
            type="button"
          >
            {isDownloading ? <Loader size={13} className="animate-spin" /> : <Download size={13} />}
            <span>{isDownloading ? 'Saving' : 'Docx'}</span>
          </button>

          <button
            onClick={copy}
            className="atelier-button inline-flex h-10 items-center gap-2 px-3 text-[11px] font-semibold tracking-[0.14em]"
            type="button"
          >
            {copied ? <Check size={13} /> : <Copy size={13} />}
            <span>{copied ? 'Copied' : 'Copy'}</span>
          </button>
        </div>
      </div>

      <div className="flex flex-wrap items-center justify-between gap-3 border-b border-[rgba(var(--atelier-ink-rgb),0.08)] px-4 py-3 sm:px-5">
        <div className="inline-flex items-center gap-2 rounded-full border border-[rgba(var(--atelier-ink-rgb),0.1)] bg-[rgba(255,255,255,0.46)] p-1">
          {(['bengali', 'english'] as const).map((lang) => (
            <button
              key={lang}
              onClick={() => setActiveTab(lang)}
              className={cn(
                'rounded-full px-4 py-2 text-[11px] font-semibold tracking-[0.16em] transition-colors',
                activeTab === lang
                  ? 'bg-[rgba(var(--atelier-terracotta-rgb),0.92)] text-[var(--atelier-paper-strong)]'
                  : 'text-[rgba(var(--atelier-ink-rgb),0.62)] hover:bg-[rgba(255,255,255,0.6)]',
              )}
              type="button"
            >
              {TAB_LABELS[lang]}
            </button>
          ))}
        </div>

        <div className="atelier-kicker">Scrollable transcript only. Page stays fixed.</div>
      </div>

      <div className="relative min-h-0 flex-1 overflow-hidden bg-[linear-gradient(180deg,rgba(255,255,255,0.28),rgba(255,255,255,0.14))]">
        <div className="atelier-wave-grid pointer-events-none absolute inset-0 opacity-35" />
        <div className="pointer-events-none absolute left-4 top-4 h-16 w-20 rounded-[22px] bg-[rgba(var(--atelier-gold-rgb),0.16)]" />
        <div className="pointer-events-none absolute bottom-4 right-4 h-14 w-[72px] rounded-[20px] bg-[rgba(var(--atelier-cobalt-rgb),0.12)]" />

        <Conversation className="absolute inset-0">
          <ConversationContent className="px-4 py-4 sm:px-5 sm:py-5">
            {turns.map((turn) => (
              <Message
                key={turn.id}
                speaker={turn.speaker}
                speakerIndex={turn.speakerIndex}
                align={turn.speakerIndex === firstSpeakerIndex ? 'right' : 'left'}
              >
                <MessageContent speakerIndex={turn.speakerIndex}>
                  {turn.text}
                </MessageContent>
              </Message>
            ))}
          </ConversationContent>
          <ConversationScrollButton className="atelier-scroll-button h-10 w-10 rounded-full shadow-[0_16px_34px_rgba(41,25,18,0.15)]" />
        </Conversation>
      </div>
    </div>
  );
}
