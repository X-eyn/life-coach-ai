'use client';

import ReactMarkdown from 'react-markdown';
import remarkGfm from 'remark-gfm';
import { cn } from '@/lib/utils';

interface TranscriptViewProps {
  transcript: string;
  className?: string;
}

export function TranscriptView({ transcript, className }: TranscriptViewProps) {
  return (
    <div
      className={cn(
        'relative w-full rounded-2xl border border-white/[0.07] bg-surface-2 overflow-hidden animate-slide-up',
        className,
      )}
    >
      {/* Header bar */}
      <div className="flex items-center justify-between px-5 py-3 border-b border-white/[0.06] bg-surface-3">
        <div className="flex items-center gap-2">
          <span className="w-2 h-2 rounded-full bg-brand" />
          <span className="text-xs font-medium text-zinc-400 tracking-wide uppercase">
            Transcript
          </span>
        </div>
        <button
          onClick={() => navigator.clipboard.writeText(transcript)}
          className="text-xs text-zinc-500 hover:text-zinc-200 transition-colors px-2 py-0.5 rounded hover:bg-white/5 active:bg-white/10"
        >
          Copy
        </button>
      </div>

      {/* Body */}
      <div className="p-6 max-h-[480px] overflow-y-auto">
        <ReactMarkdown
          remarkPlugins={[remarkGfm]}
          components={{
            p: ({ children }) => (
              <p className="text-[0.92rem] leading-7 text-zinc-200 mb-3 last:mb-0">
                {children}
              </p>
            ),
            strong: ({ children }) => (
              <strong className="font-semibold text-brand">{children}</strong>
            ),
            em: ({ children }) => (
              <em className="italic text-zinc-400">{children}</em>
            ),
            hr: () => <hr className="border-white/10 my-4" />,
          }}
        >
          {transcript}
        </ReactMarkdown>
      </div>
    </div>
  );
}
