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
  const [activeTab, setActiveTab] = useState<'bengali' | 'english'>('bengali');
  const [isDownloading, setIsDownloading] = useState(false);

  const currentTranscript = transcript[activeTab];

  const copy = useCallback(async () => {
    await navigator.clipboard.writeText(currentTranscript);
    setCopied(true);
    setTimeout(() => setCopied(false), 2000);
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
      const a = document.createElement('a');
      a.href = url;
      a.download = 'transcript.docx';
      document.body.appendChild(a);
      a.click();
      window.URL.revokeObjectURL(url);
      document.body.removeChild(a);
    } catch (err) {
      console.error('Download error:', err);
    } finally {
      setIsDownloading(false);
    }
  }, [transcript]);

  const turns = useMemo(() => parseTurns(currentTranscript), [currentTranscript]);
  const wc = wordCount(currentTranscript);
  const firstSpeakerIndex = turns[0]?.speakerIndex ?? 0;

  return (
    <div className={cn('w-full rounded-2xl overflow-hidden border border-gold-300/[0.2] glass-elevated animate-enter-up', className)}>
      {/* Premium Header */}
      <div className="flex items-center justify-between px-6 h-14 bg-charcoal-800/[0.8] border-b border-gold-300/[0.15]">
        <div className="flex items-center gap-3 flex-1">
          <div className="w-2 h-2 rounded-full bg-gold-400 shadow-glow" />
          <span className="text-xs font-semibold text-gold-300 tracking-widest uppercase">Transcript</span>
          <span className="text-xs text-gold-300/60 font-mono">{wc} words</span>
          <span className="text-xs text-gold-300/60">·</span>
          <span className="text-xs text-gold-300/60 font-mono">{turns.length} turns</span>
        </div>
        <div className="flex items-center gap-2">
          <button
            onClick={downloadWord}
            disabled={isDownloading}
            className={cn(
              'flex items-center gap-1.5 px-3.5 h-8 rounded-lg text-xs font-semibold transition-all duration-150 tracking-wide',
              isDownloading
                ? 'glass-sm bg-blue-400/[0.12] text-blue-300 border-blue-400/30'
                : 'text-gold-300/70 hover:text-gold-300 hover:bg-gold-300/10 border border-gold-300/20',
            )}
            title="Download as Word document"
          >
            {isDownloading ? <Loader size={12} className="animate-spin" /> : <Download size={12} />}
            <span>{isDownloading ? 'Downloading' : 'Word'}</span>
          </button>
          <button
            onClick={copy}
            className={cn(
              'flex items-center gap-1.5 px-3.5 h-8 rounded-lg text-xs font-semibold transition-all duration-150 tracking-wide',
              copied
                ? 'glass-sm bg-emerald-400/[0.12] text-emerald-300 border-emerald-400/30'
                : 'text-gold-300/70 hover:text-gold-300 hover:bg-gold-300/10 border border-gold-300/20',
            )}
          >
            {copied ? <Check size={12} /> : <Copy size={12} />}
            <span>{copied ? 'Copied' : 'Copy'}</span>
          </button>
        </div>
      </div>

      {/* Premium Language Tabs */}
      <div className="flex gap-0 px-6 pt-4 border-b border-gold-300/[0.15] bg-charcoal-800/[0.4]">
        {(['bengali', 'english'] as const).map((lang) => (
          <button
            key={lang}
            onClick={() => setActiveTab(lang)}
            className={cn(
              'px-4 py-3 text-xs font-semibold tracking-widest uppercase transition-all duration-200 border-b-2 relative',
              activeTab === lang
                ? 'text-gold-300 border-gold-400'
                : 'text-gold-300/60 border-transparent hover:text-gold-300',
            )}
          >
            {lang === 'bengali' ? 'Bengali' : 'English'}
            {activeTab === lang && (
              <div className="absolute bottom-0 left-0 right-0 h-0.5 bg-gradient-to-r from-gold-400/40 via-gold-300 to-gold-400/40" />
            )}
          </button>
        ))}
      </div>

      {/* Conversation Bubbles - Premium Container */}
      <div className="relative bg-charcoal-900/[0.5] backdrop-blur-sm" style={{ height: '520px' }}>
        <Conversation className="absolute inset-0">
          <ConversationContent className="px-6 py-6">
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
