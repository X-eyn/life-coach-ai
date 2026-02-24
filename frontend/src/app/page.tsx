'use client';

import { useState } from 'react';
import { useSession, useAgent, useSessionContext, useSessionMessages } from '@livekit/components-react';
import { TokenSource } from 'livekit-client';
import { Mic, Loader2, Radio } from 'lucide-react';
import { AgentSessionProvider } from '@/components/agent-session-provider';
import { AgentAudioVisualizerBar } from '@/components/agent-audio-visualizer-bar';
import { AgentChatTranscript } from '@/components/agent-chat-transcript';
import { AgentControlBar } from '@/components/agent-control-bar';
import { StartAudioButton } from '@/components/start-audio-button';

// Token source — calls POST /api/token
const tokenSource = TokenSource.endpoint('/api/token');

// ─────────────────────────────────────────────────────────
// Inner component: only rendered inside an active session
// ─────────────────────────────────────────────────────────
function VoiceAgentUI() {
  const [chatOpen, setChatOpen] = useState(false);
  const session = useSessionContext();
  const { microphoneTrack, state } = useAgent();
  const { messages } = useSessionMessages(session);

  const stateLabel: Record<string, string> = {
    connecting: 'Connecting…',
    initializing: 'Initializing…',
    listening: 'Listening',
    thinking: 'Thinking…',
    speaking: 'Speaking',
    idle: 'Idle',
    disconnected: 'Disconnected',
    'pre-connect-buffering': 'Buffering…',
    failed: 'Error',
  };

  return (
    <div className="flex h-full flex-col">
      {/* ── Header ── */}
      <header className="flex items-center justify-between border-b border-white/8 px-6 py-4">
        <div className="flex items-center gap-3">
          <div className="flex h-8 w-8 items-center justify-center rounded-full bg-primary/15">
            <Radio className="h-4 w-4 text-primary" />
          </div>
          <span className="text-sm font-semibold tracking-wide text-foreground/90">
            Voice Agent
          </span>
        </div>
        <span className="rounded-full border border-white/10 bg-white/5 px-3 py-1 text-xs text-muted-foreground capitalize">
          {stateLabel[state ?? 'disconnected'] ?? state}
        </span>
      </header>

      {/* ── Main area ── */}
      <div className="flex flex-1 flex-col items-center justify-center gap-6 overflow-hidden px-6 py-10">
        {/* Visualizer */}
        <div className="flex flex-col items-center gap-3">
          <AgentAudioVisualizerBar
            size="lg"
            state={state}
            audioTrack={microphoneTrack}
            color="#1FD5F9"
            barCount={7}
          />
          <p className="font-mono text-xs uppercase tracking-widest text-muted-foreground/60">
            {stateLabel[state ?? 'disconnected'] ?? state}
          </p>
        </div>

        {/* Transcript */}
        <div className="w-full max-w-xl flex-1 overflow-hidden rounded-xl border border-white/6 bg-white/[0.03]">
          <AgentChatTranscript
            agentState={state}
            messages={messages}
            className="h-full"
          />
        </div>
      </div>

      {/* ── Controls ── */}
      <div className="flex flex-col items-center gap-3 border-t border-white/8 px-6 py-5">
        <StartAudioButton label="Click to enable audio" variant="outline" size="sm" />
        <AgentControlBar
          variant="livekit"
          isConnected
          isChatOpen={chatOpen}
          onIsChatOpenChange={setChatOpen}
          controls={{ microphone: true, camera: false, screenShare: false, chat: true, leave: true }}
          className="w-full max-w-sm"
        />
      </div>
    </div>
  );
}

// ─────────────────────────────────────────────────────────
// Root page: manages session lifecycle
// ─────────────────────────────────────────────────────────
export default function Page() {
  const session = useSession(tokenSource);
  const isDisconnected = session.connectionState === 'disconnected';
  const isConnecting =
    session.connectionState === 'connecting' ||
    session.connectionState === 'reconnecting';

  return (
    <div className="relative flex h-screen w-screen flex-col overflow-hidden bg-background">
      {/* Radial accent glow */}
      <div
        className="pointer-events-none absolute inset-0 opacity-25"
        style={{
          background:
            'radial-gradient(ellipse 70% 45% at 50% -5%, oklch(0.55 0.18 195 / 0.35), transparent)',
        }}
      />

      {isDisconnected ? (
        /* Landing */
        <div className="relative flex h-full flex-col items-center justify-center gap-10 px-6">
          <div className="flex flex-col items-center gap-6 text-center">
            <div className="flex h-20 w-20 items-center justify-center rounded-full border border-white/10 bg-white/5 shadow-xl shadow-primary/10">
              <Mic className="h-9 w-9 text-primary" />
            </div>
            <div className="space-y-2">
              <h1 className="text-2xl font-semibold tracking-tight text-foreground">
                Voice Agent
              </h1>
              <p className="max-w-sm text-sm leading-relaxed text-muted-foreground">
                Your AI‑powered voice assistant. Ask about room temperatures,
                set preferences, or just have a conversation.
              </p>
            </div>
          </div>

          <button
            onClick={() => session.start()}
            className="group flex items-center gap-2.5 rounded-full border border-primary/30 bg-primary/10 px-8 py-3.5 text-sm font-medium text-primary transition-all duration-200 hover:border-primary/60 hover:bg-primary/20 hover:shadow-lg hover:shadow-primary/15 active:scale-95"
          >
            <Mic className="h-4 w-4 transition-transform duration-200 group-hover:scale-110" />
            Start Conversation
          </button>

          <p className="text-xs text-muted-foreground/40">Microphone access required</p>
        </div>
      ) : isConnecting ? (
        /* Connecting */
        <div className="relative flex h-full flex-col items-center justify-center gap-4 px-6">
          <div className="flex h-16 w-16 items-center justify-center rounded-full border border-primary/20 bg-primary/10">
            <Loader2 className="h-7 w-7 animate-spin text-primary" />
          </div>
          <p className="text-sm font-medium text-muted-foreground">Connecting…</p>
        </div>
      ) : (
        /* Connected */
        <div className="relative flex h-full flex-col">
          <AgentSessionProvider session={session}>
            <VoiceAgentUI />
          </AgentSessionProvider>
        </div>
      )}
    </div>
  );
}

