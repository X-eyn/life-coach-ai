'use client';

import { type ReceivedMessage, type AgentState, useChat } from '@livekit/components-react';
import { AnimatePresence, motion } from 'motion/react';
import { useEffect, useRef, useState, useCallback } from 'react';
import { AgentChatIndicator } from '@/components/agent-chat-indicator';

// ── Smooth spring preset ─────────────────────────────────
const MSG_SPRING = { type: 'spring', stiffness: 320, damping: 32, mass: 0.7 } as const;

// ── Single message bubble ────────────────────────────────
function ChatMessage({ msg, index }: { msg: ReceivedMessage; index: number }) {
  const isUser = msg.from?.isLocal ?? false;

  const time = new Date(msg.timestamp).toLocaleTimeString(
    typeof navigator !== 'undefined' ? navigator.language : 'en-US',
    { hour: '2-digit', minute: '2-digit' }
  );

  return (
    <motion.div
      layout
      initial={{ opacity: 0, y: 10, scale: 0.98 }}
      animate={{ opacity: 1, y: 0, scale: 1 }}
      exit={{ opacity: 0, scale: 0.96 }}
      transition={{ ...MSG_SPRING, delay: Math.min(index * 0.025, 0.12) }}
      className={`flex w-full flex-col gap-1 ${isUser ? 'items-end' : 'items-start'}`}
    >
      {/* Bubble */}
      <div
        className={`
          max-w-[88%] rounded-2xl px-4 py-2.5 text-[13px] leading-relaxed
          ${isUser
            ? 'rounded-br-sm bg-primary/[0.13] text-foreground/85 ring-1 ring-primary/20'
            : 'rounded-bl-sm bg-white/[0.04] text-foreground/75 ring-1 ring-white/[0.07]'
          }
        `}
      >
        {msg.message}
      </div>

      {/* Timestamp */}
      <motion.span
        initial={{ opacity: 0 }}
        animate={{ opacity: 1 }}
        transition={{ delay: 0.18 }}
        className="px-1 text-[9px] tracking-wide text-muted-foreground/25"
      >
        {time}
      </motion.span>
    </motion.div>
  );
}

// ── Zero-state illustration ──────────────────────────────
function EmptyState() {
  return (
    <motion.div
      initial={{ opacity: 0 }}
      animate={{ opacity: 1 }}
      transition={{ duration: 0.6 }}
      className="flex h-full flex-col items-center justify-center gap-3 px-6"
    >
      <div className="flex h-10 w-10 items-center justify-center rounded-full border border-white/8 bg-white/[0.03]">
        {/* Chat bubble icon */}
        <svg width="16" height="16" viewBox="0 0 16 16" fill="none" className="text-muted-foreground/25">
          <path
            d="M14 2H2a1 1 0 0 0-1 1v8a1 1 0 0 0 1 1h2v2l3-2h7a1 1 0 0 0 1-1V3a1 1 0 0 0-1-1Z"
            stroke="currentColor"
            strokeWidth="1.2"
            strokeLinejoin="round"
          />
        </svg>
      </div>
      <p className="text-center text-[10px] leading-relaxed text-muted-foreground/25">
        Conversation will<br />appear here
      </p>
    </motion.div>
  );
}

// ── Main ChatPanel ───────────────────────────────────────
export function ChatPanel({
  messages = [],
  agentState,
}: {
  messages?: ReceivedMessage[];
  agentState?: AgentState;
}) {
  const { send, isSending } = useChat();
  const [draft, setDraft] = useState('');
  const bottomRef = useRef<HTMLDivElement>(null);
  const inputRef = useRef<HTMLTextAreaElement>(null);

  // Auto-scroll to bottom on new messages
  useEffect(() => {
    bottomRef.current?.scrollIntoView({ behavior: 'smooth' });
  }, [messages.length, agentState]);

  const handleSend = useCallback(async () => {
    const text = draft.trim();
    if (!text || isSending) return;
    setDraft('');
    await send(text);
  }, [draft, isSending, send]);

  // Submit on Enter (Shift+Enter = newline)
  const handleKeyDown = useCallback(
    (e: React.KeyboardEvent<HTMLTextAreaElement>) => {
      if (e.key === 'Enter' && !e.shiftKey) {
        e.preventDefault();
        handleSend();
      }
    },
    [handleSend]
  );

  // Auto-resize textarea up to ~4 lines
  const handleChange = useCallback((e: React.ChangeEvent<HTMLTextAreaElement>) => {
    setDraft(e.target.value);
    e.target.style.height = 'auto';
    e.target.style.height = `${Math.min(e.target.scrollHeight, 96)}px`;
  }, []);

  const isEmpty = messages.length === 0 && agentState !== 'thinking';
  const canSend = draft.trim().length > 0 && !isSending;

  return (
    <aside className="flex h-full w-64 shrink-0 flex-col border-r border-white/8 bg-white/[0.015]">
      {/* Header */}
      <div className="border-b border-white/8 px-4 py-3">
        <div className="flex items-center justify-between">
          <p className="text-[9px] font-bold uppercase tracking-[0.14em] text-muted-foreground/40">
            Transcript
          </p>
          {messages.length > 0 && (
            <motion.span
              key={messages.length}
              initial={{ scale: 0.7, opacity: 0 }}
              animate={{ scale: 1, opacity: 1 }}
              transition={MSG_SPRING}
              className="flex h-4 min-w-4 items-center justify-center rounded-full bg-primary/15 px-1.5 text-[8px] font-semibold tabular-nums text-primary/70"
            >
              {messages.length}
            </motion.span>
          )}
        </div>
      </div>

      {/* Message list */}
      <div className="flex flex-1 flex-col overflow-y-auto overflow-x-hidden px-3 py-3 [scrollbar-width:none] [&::-webkit-scrollbar]:hidden">
        <AnimatePresence initial={false}>
          {isEmpty ? (
            <EmptyState key="empty" />
          ) : (
            <motion.div
              key="messages"
              className="flex flex-col gap-4"
              initial={{ opacity: 0 }}
              animate={{ opacity: 1 }}
              transition={{ duration: 0.25 }}
            >
              {messages.map((msg, i) => (
                <ChatMessage key={msg.id} msg={msg} index={i} />
              ))}

              {/* Thinking indicator */}
              <AnimatePresence>
                {agentState === 'thinking' && (
                  <motion.div
                    key="thinking"
                    initial={{ opacity: 0, y: 6 }}
                    animate={{ opacity: 1, y: 0 }}
                    exit={{ opacity: 0, y: 4 }}
                    transition={MSG_SPRING}
                    className="flex items-start"
                  >
                    <div className="rounded-2xl rounded-bl-sm bg-white/[0.04] px-4 py-2.5 ring-1 ring-white/[0.07]">
                      <AgentChatIndicator size="sm" />
                    </div>
                  </motion.div>
                )}
              </AnimatePresence>

              <div ref={bottomRef} />
            </motion.div>
          )}
        </AnimatePresence>
      </div>

      {/* ── Text input ── */}
      <div className="border-t border-white/8 p-3">
        <div className="flex items-end gap-2 rounded-xl border border-white/8 bg-white/[0.04] px-3 py-2 transition-colors duration-150 focus-within:border-primary/30 focus-within:bg-white/[0.06]">
          <textarea
            ref={inputRef}
            rows={1}
            value={draft}
            onChange={handleChange}
            onKeyDown={handleKeyDown}
            placeholder="Type a message…"
            disabled={isSending}
            className="flex-1 resize-none bg-transparent text-[12px] leading-relaxed text-foreground/80 placeholder:text-muted-foreground/25 focus:outline-none disabled:opacity-40 [scrollbar-width:none] [&::-webkit-scrollbar]:hidden"
            style={{ height: '20px' }}
          />
          {/* Send button */}
          <motion.button
            type="button"
            onClick={handleSend}
            disabled={!canSend}
            animate={{ opacity: canSend ? 1 : 0.25, scale: canSend ? 1 : 0.92 }}
            transition={{ duration: 0.15 }}
            whileTap={canSend ? { scale: 0.88 } : {}}
            className="mb-[1px] flex h-6 w-6 shrink-0 items-center justify-center rounded-lg bg-primary/80 text-background transition-colors hover:bg-primary disabled:pointer-events-none"
            aria-label="Send"
          >
            {isSending ? (
              <motion.span
                animate={{ rotate: 360 }}
                transition={{ repeat: Infinity, duration: 0.7, ease: 'linear' }}
                className="block h-3 w-3 rounded-full border border-background/60 border-t-transparent"
              />
            ) : (
              <svg width="10" height="10" viewBox="0 0 10 10" fill="none">
                <path d="M1 9L9 1M9 1H3M9 1V7" stroke="currentColor" strokeWidth="1.5" strokeLinecap="round" strokeLinejoin="round"/>
              </svg>
            )}
          </motion.button>
        </div>
        <p className="mt-1.5 px-1 text-[9px] text-muted-foreground/20">
          Enter to send · Shift+Enter for newline
        </p>
      </div>
    </aside>
  );
}
