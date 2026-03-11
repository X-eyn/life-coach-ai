'use client';

import { useState, useRef, useCallback, DragEvent, ChangeEvent } from 'react';
import { UploadCloud, FileAudio, X, AlertCircle, CheckCircle2 } from 'lucide-react';
import { WaveVisualizer, type VisualizerState } from '@/components/wave-visualizer';
import { TranscriptView } from '@/components/transcript-view';
import { cn } from '@/lib/utils';

// ─── types ───────────────────────────────────────────────────────────────────

type AppState = 'idle' | 'uploading' | 'processing' | 'done' | 'error';

// ─── helpers ─────────────────────────────────────────────────────────────────

function formatBytes(bytes: number, decimals = 1) {
  if (bytes === 0) return '0 B';
  const k = 1024;
  const sizes = ['B', 'KB', 'MB', 'GB'];
  const i = Math.floor(Math.log(bytes) / Math.log(k));
  return `${parseFloat((bytes / Math.pow(k, i)).toFixed(decimals))} ${sizes[i]}`;
}

// ─── component ───────────────────────────────────────────────────────────────

export default function HomePage() {
  const [appState, setAppState]     = useState<AppState>('idle');
  const [file, setFile]             = useState<File | null>(null);
  const [transcript, setTranscript] = useState<string>('');
  const [error, setError]           = useState<string>('');
  const [dragging, setDragging]     = useState(false);
  const fileInputRef = useRef<HTMLInputElement>(null);

  const vizState: VisualizerState = appState === 'done' ? 'done'
    : appState === 'error'       ? 'error'
    : appState;

  // ── file selection ──────────────────────────────────────────────────────

  const acceptFile = useCallback((incoming: File | null) => {
    if (!incoming) return;
    const allowed = /\.(mp3|wav|m4a|ogg|flac|webm)$/i;
    if (!allowed.test(incoming.name)) {
      setError('Unsupported file type. Please upload mp3, wav, m4a, ogg, flac, or webm.');
      setAppState('error');
      return;
    }
    setFile(incoming);
    setTranscript('');
    setError('');
    setAppState('idle');
  }, []);

  const onInputChange = (e: ChangeEvent<HTMLInputElement>) => {
    acceptFile(e.target.files?.[0] ?? null);
    e.target.value = '';
  };

  const onDrop = (e: DragEvent<HTMLDivElement>) => {
    e.preventDefault();
    setDragging(false);
    acceptFile(e.dataTransfer.files?.[0] ?? null);
  };

  const onDragOver = (e: DragEvent<HTMLDivElement>) => {
    e.preventDefault();
    setDragging(true);
  };

  const clearFile = () => {
    setFile(null);
    setTranscript('');
    setError('');
    setAppState('idle');
  };

  // ── transcribe ──────────────────────────────────────────────────────────

  const transcribe = async () => {
    if (!file || appState === 'uploading' || appState === 'processing') return;

    setError('');
    setTranscript('');
    setAppState('uploading');

    const formData = new FormData();
    formData.append('file', file);

    try {
      // Give the UI a beat to show the "uploading" wave, then flip to "processing"
      const res = await fetch('/api/transcribe', { method: 'POST', body: formData });

      setAppState('processing');

      if (!res.ok) {
        const body = await res.json().catch(() => ({ error: 'Unknown server error' }));
        throw new Error(body.error ?? `HTTP ${res.status}`);
      }

      const data = await res.json();
      setTranscript(data.transcript ?? '');
      setAppState('done');
    } catch (err: unknown) {
      setError(err instanceof Error ? err.message : 'An unexpected error occurred.');
      setAppState('error');
    }
  };

  // ── render ──────────────────────────────────────────────────────────────

  const isWorking = appState === 'uploading' || appState === 'processing';

  return (
    <main className="min-h-screen flex flex-col items-center px-4 py-16 bg-surface-0">

      {/* ── Header ── */}
      <header className="w-full max-w-2xl mb-14 animate-fade-in">
        <div className="flex items-center gap-3 mb-2">
          <span
            className="w-2.5 h-2.5 rounded-full"
            style={{ background: '#FA954C', boxShadow: '0 0 10px #FA954C80' }}
          />
          <span className="text-xs tracking-[0.2em] uppercase text-zinc-500 font-medium">
            Gemini Audio
          </span>
        </div>
        <h1 className="text-3xl font-semibold text-zinc-100 leading-tight">
          ASR Transcriber
        </h1>
        <p className="mt-2 text-sm text-zinc-500 max-w-md">
          Upload an audio recording and get a precise, speaker-labelled transcript powered by Gemini.
        </p>
      </header>

      <div className="w-full max-w-2xl space-y-5">

        {/* ── Drop Zone ── */}
        <div
          role="button"
          tabIndex={0}
          aria-label="Upload audio file"
          onClick={() => !file && fileInputRef.current?.click()}
          onKeyDown={(e) => e.key === 'Enter' && !file && fileInputRef.current?.click()}
          onDrop={onDrop}
          onDragOver={onDragOver}
          onDragLeave={() => setDragging(false)}
          className={cn(
            'relative w-full rounded-2xl border transition-all duration-200 cursor-pointer select-none',
            'flex flex-col items-center justify-center gap-3 p-10',
            dragging
              ? 'border-brand bg-brand/5 shadow-[0_0_30px_rgba(250,149,76,0.12)]'
              : file
              ? 'border-white/[0.1] bg-surface-2 hover:border-white/20 cursor-default'
              : 'border-white/[0.07] bg-surface-2 hover:border-white/15 hover:bg-surface-3',
          )}
        >
          <input
            ref={fileInputRef}
            type="file"
            accept=".mp3,.wav,.m4a,.ogg,.flac,.webm,audio/*"
            onChange={onInputChange}
            className="hidden"
          />

          {!file ? (
            <>
              <div className={cn(
                'w-14 h-14 rounded-full flex items-center justify-center transition-colors',
                'bg-surface-3 border border-white/[0.07]',
                dragging && 'border-brand/50 bg-brand/10',
              )}>
                <UploadCloud
                  size={24}
                  className={cn('text-zinc-500 transition-colors', dragging && 'text-brand')}
                />
              </div>
              <div className="text-center">
                <p className="text-sm font-medium text-zinc-300">
                  {dragging ? 'Drop to upload' : 'Drop your audio file here'}
                </p>
                <p className="text-xs text-zinc-600 mt-0.5">
                  or <span className="text-zinc-400 underline underline-offset-2">click to browse</span>
                  {' '}· mp3, wav, m4a, ogg, flac, webm
                </p>
              </div>
            </>
          ) : (
            <div className="w-full flex items-center gap-4">
              <div className="w-11 h-11 rounded-xl bg-surface-4 border border-white/[0.07] flex items-center justify-center flex-shrink-0">
                <FileAudio size={20} className="text-brand" />
              </div>
              <div className="flex-1 min-w-0">
                <p className="text-sm font-medium text-zinc-200 truncate">{file.name}</p>
                <p className="text-xs text-zinc-500 mt-0.5">{formatBytes(file.size)}</p>
              </div>
              {!isWorking && (
                <button
                  onClick={(e) => { e.stopPropagation(); clearFile(); }}
                  className="w-7 h-7 flex items-center justify-center rounded-lg hover:bg-white/5 text-zinc-500 hover:text-zinc-300 transition-colors flex-shrink-0"
                  aria-label="Remove file"
                >
                  <X size={14} />
                </button>
              )}
            </div>
          )}
        </div>

        {/* ── Wave / Status panel ── */}
        {(isWorking || appState === 'done' || appState === 'error' || file) && (
          <div className="w-full rounded-2xl border border-white/[0.07] bg-surface-2 px-6 py-5 flex flex-col items-center gap-4 animate-fade-in">
            <WaveVisualizer
              state={vizState}
              color="#FA954C"
              lineWidth={2}
              size="xl"
              className="w-full"
            />

            {/* Status chips */}
            {appState === 'done' && (
              <div className="flex items-center gap-2 text-xs text-emerald-400 animate-fade-in">
                <CheckCircle2 size={13} />
                <span>Transcription complete</span>
              </div>
            )}
            {appState === 'error' && (
              <div className="flex items-start gap-2 text-xs text-red-400 animate-fade-in max-w-md text-center">
                <AlertCircle size={13} className="mt-0.5 flex-shrink-0" />
                <span>{error}</span>
              </div>
            )}
          </div>
        )}

        {/* ── Primary action button ── */}
        <button
          onClick={transcribe}
          disabled={!file || isWorking}
          className={cn(
            'w-full h-12 rounded-xl font-medium text-sm tracking-wide transition-all duration-200',
            'focus:outline-none focus-visible:ring-2 focus-visible:ring-brand/60',
            file && !isWorking
              ? 'bg-brand text-white hover:bg-brand-light active:bg-brand-dark shadow-[0_0_24px_rgba(250,149,76,0.25)] hover:shadow-[0_0_30px_rgba(250,149,76,0.4)]'
              : 'bg-surface-3 text-zinc-600 cursor-not-allowed border border-white/[0.05]',
          )}
        >
          {isWorking
            ? appState === 'uploading' ? 'Uploading…' : 'Transcribing…'
            : appState === 'done'
            ? 'Transcribe Again'
            : 'Transcribe'}
        </button>

        {/* ── Transcript ── */}
        {transcript && (
          <TranscriptView transcript={transcript} />
        )}

      </div>

      {/* ── Footer ── */}
      <footer className="mt-20 text-xs text-zinc-700">
        Powered by Gemini · ASR Transcriber
      </footer>
    </main>
  );
}
