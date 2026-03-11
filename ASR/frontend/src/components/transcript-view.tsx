'use client';

import { useState, useCallback } from 'react';
import ReactMarkdown from 'react-markdown';
import remarkGfm from 'remark-gfm';
import { Check, Copy } from 'lucide-react';
import { cn } from '@/lib/utils';

interface TranscriptViewProps {
  transcript: string;
  className?: string;
}

function wordCount(text: string) {
  return text.trim().split(/\s+/).filter(Boolean).length;
}

export function TranscriptView({ transcript, className }: TranscriptViewProps) {
  const [copied, setCopied] = useState(false);

  const copy = useCallback(async () => {
    await navigator.clipboard.writeText(transcript);
    setCopied(true);
    setTimeout(() => setCopied(false), 2000);
  }, [transcript]);

  const wc = wordCount(transcript);

  return (
    <div className={cn('w-full rounded-2xl overflow-hidden border border-white/[0.055] animate-enter-up', className)}>
      <div className="flex items-center justify-between px-5 h-11 bg-ink-2 border-b border-white/[0.045]">
        <div className="flex items-center gap-2.5">
          <div className="w-1.5 h-1.5 rounded-full bg-accent" style={{ boxShadow: '0 0 6px #F97316' }} />
          <span className="text-[11px] font-medium text-tx-3 tracking-[0.12em] uppercase select-none">Transcript</span>
          <span className="text-[11px] text-tx-4 font-mono select-none">{wc} words</span>
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
      <div className="bg-ink-1 px-7 py-7 max-h-[520px] overflow-y-auto">
        <ReactMarkdown
          remarkPlugins={[remarkGfm]}
          components={{
            p: ({ children }) => (
              <p className="text-[14px] leading-[1.85] text-tx-2 mb-4 last:mb-0">{children}</p>
            ),
            strong: ({ children }) => (
              <strong className="font-semibold" style={{ color: '#F97316' }}>{children}</strong>
            ),
            em: ({ children }) => (
              <em className="italic text-tx-3">{children}</em>
            ),
            hr: () => <hr className="border-white/[0.06] my-5" />,
            code: ({ children }) => (
              <code className="font-mono text-[13px] text-tx-2 bg-ink-3 px-1.5 py-0.5 rounded">{children}</code>
            ),
          }}
        >
          {transcript}
        </ReactMarkdown>
      </div>
    </div>
  );
}
