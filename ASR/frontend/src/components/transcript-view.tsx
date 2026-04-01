'use client';

import { useState, useCallback, useMemo } from 'react';
import { Check, Copy, Download, Loader } from 'lucide-react';
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

export function TranscriptView({ transcript, className }: TranscriptViewProps) {
  const [copied, setCopied] = useState(false);
  const [activeTab, setActiveTab] = useState<'bengali' | 'english'>('bengali');
  const [isDownloading, setIsDownloading] = useState(false);

  const currentTranscript = transcript[activeTab];

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
    <div className={cn('flex h-full min-h-0 flex-col overflow-hidden', className)}>
      <div className="flex h-16 items-center justify-between border-b border-[rgba(255,230,0,0.72)] px-5">
        <div className="flex min-w-0 items-center gap-3 text-xs tracking-[0.22em] text-[rgba(255,230,0,0.76)]">
          <span className="font-semibold text-[rgba(255,230,0,0.96)]">TRANSCRIPT</span>
          <span>{wordTotal} WORDS</span>
          <span>{turns.length} TURNS</span>
        </div>

        <div className="flex items-center gap-2">
          <button
            onClick={downloadWord}
            disabled={isDownloading}
            className="ink-button inline-flex h-10 items-center gap-2 px-3 text-[10px] font-semibold tracking-[0.24em] disabled:opacity-35"
            title="Download as Word document"
            type="button"
          >
            {isDownloading ? <Loader size={12} className="animate-spin" /> : <Download size={12} />}
            <span>{isDownloading ? 'SAVING' : 'DOCX'}</span>
          </button>

          <button
            onClick={copy}
            className="ink-button inline-flex h-10 items-center gap-2 px-3 text-[10px] font-semibold tracking-[0.24em]"
            type="button"
          >
            {copied ? <Check size={12} /> : <Copy size={12} />}
            <span>{copied ? 'COPIED' : 'COPY'}</span>
          </button>
        </div>
      </div>

      <div className="flex items-center gap-2 border-b border-[rgba(255,230,0,0.72)] px-5 py-3">
        {(['bengali', 'english'] as const).map((lang) => (
          <button
            key={lang}
            onClick={() => setActiveTab(lang)}
            className={cn(
              'ink-button h-10 px-4 text-[10px] font-semibold tracking-[0.26em]',
              activeTab === lang && 'bg-[var(--signal)] text-[var(--abyss)]',
            )}
            type="button"
          >
            {lang === 'bengali' ? 'BENGALI' : 'ENGLISH'}
          </button>
        ))}
      </div>

      <div className="relative min-h-0 flex-1 overflow-hidden">
        <Conversation className="absolute inset-0">
          <ConversationContent className="px-5 py-5">
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
          <ConversationScrollButton className="ink-button h-10 w-10 rounded-none border-[rgba(255,230,0,0.72)] bg-[var(--abyss)] text-[var(--signal)] hover:bg-[var(--signal)] hover:text-[var(--abyss)]" />
        </Conversation>
      </div>
    </div>
  );
}
