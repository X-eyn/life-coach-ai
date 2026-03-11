'use client';

import { useState, useCallback, useMemo } from 'react';
import { Check, Copy } from 'lucide-react';
import { cn } from '@/lib/utils';
import { Conversation, ConversationContent, ConversationScrollButton } from '@/components/ai/conversation';
import { Message, MessageContent } from '@/components/ai/message';

interface TranscriptViewProps {
  transcript: string;
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

/**
 * Parses a speaker-diarized markdown transcript into turn objects.
 * Handles: **Speaker:** text  and  [Speaker]: text
 */
function parseTurns(transcript: string): Turn[] {
  const text = transcript.replace(/\r\n/g, '\n');
  const regex = /(?:\*\*([^*\n:]+?):\*\*|\[([^\]\n]+?)\]:)\s*/g;

  const markers: { index: number; speaker: string; fullMatch: string }[] = [];
  let m: RegExpExecArray | null;
  while ((m = regex.exec(text)) !== null) {
    markers.push({ index: m.index + m[0].length, speaker: (m[1] || m[2]).trim(), fullMatch: m[0] });
  }

  if (markers.length === 0) {
    return [{ id: '0', speaker: 'Transcript', speakerIndex: 0, text: transcript.trim() }];
  }

  const speakerMap = new Map<string, number>();
  markers.forEach(({ speaker }) => {
    if (!speakerMap.has(speaker)) speakerMap.set(speaker, speakerMap.size);
  });

  const turns: Turn[] = [];
  for (let i = 0; i < markers.length; i++) {
    const { index, speaker } = markers[i];
    const end = i + 1 < markers.length ? markers[i + 1].index - markers[i + 1].fullMatch.length : text.length;
    const raw = text.slice(index, end).trim();
    if (!raw) continue;
    turns.push({ id: `${i}`, speaker, speakerIndex: speakerMap.get(speaker) ?? 0, text: raw });
  }

  return turns;
}

export function TranscriptView({ transcript, className }: TranscriptViewProps) {
  const [copied, setCopied] = useState(false);

  const copy = useCallback(async () => {
    await navigator.clipboard.writeText(transcript);
    setCopied(true);
    setTimeout(() => setCopied(false), 2000);
  }, [transcript]);

  const turns = useMemo(() => parseTurns(transcript), [transcript]);
  const wc = wordCount(transcript);
  const firstSpeakerIndex = turns[0]?.speakerIndex ?? 0;

  return (
    <div className={cn('w-full rounded-2xl overflow-hidden border border-white/[0.055] animate-enter-up', className)}>
      {/* Header */}
      <div className="flex items-center justify-between px-5 h-11 bg-ink-2 border-b border-white/[0.045]">
        <div className="flex items-center gap-2.5">
          <div className="w-1.5 h-1.5 rounded-full bg-accent" style={{ boxShadow: '0 0 6px #F97316' }} />
          <span className="text-[11px] font-medium text-tx-3 tracking-[0.12em] uppercase select-none">Transcript</span>
          <span className="text-[11px] text-tx-4 font-mono select-none">{wc} words</span>
          <span className="text-[11px] text-tx-4 select-none">·</span>
          <span className="text-[11px] text-tx-4 font-mono select-none">{turns.length} turns</span>
        </div>
        <button
          onClick={copy}
          className={cn(
            'flex items-center gap-1.5 px-3 h-7 rounded-lg text-[11px] font-medium transition-all duration-150',
            copied
              ? 'bg-emerald-500/10 text-emerald-400 border border-emerald-500/20'
              : 'text-tx-3 hover:text-tx-DEFAULT hover:bg-white/[0.04] border border-transparent',
          )}
        >
          {copied ? <Check size={11} /> : <Copy size={11} />}
          {copied ? 'Copied' : 'Copy'}
        </button>
      </div>

      {/* Conversation bubbles */}
      <div className="relative bg-ink-1" style={{ height: '520px' }}>
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
          <ConversationScrollButton />
        </Conversation>
      </div>
    </div>
  );
}
