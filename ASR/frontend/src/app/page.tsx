"use client";

import { useState, useRef, useCallback, DragEvent, ChangeEvent } from "react";
import { FileAudio, Upload, X, AlertTriangle, Sparkles } from "lucide-react";
import { Persona, type PersonaState } from "@/components/persona";
import { Button as StatefulButton } from "@/components/ui/stateful-button";
import { TranscriptView } from "@/components/transcript-view";
import { cn } from "@/lib/utils";

type AppState = "idle" | "uploading" | "processing" | "done" | "error";

interface TranscriptData {
  bengali: string;
  english: string;
}

function fmtBytes(b: number) {
  if (!b) return "0 B";
  const k = 1024, s = ["B", "KB", "MB", "GB"];
  const i = Math.floor(Math.log(b) / Math.log(k));
  return `${+(b / k ** i).toFixed(1)} ${s[i]}`;
}

  const STATUS: Record<AppState, { label: string; color: string }> = {
    idle:       { label: "Ready",         color: "#a89068" },
    uploading:  { label: "Uploading...",  color: "#d4a574" },
    processing: { label: "Transcribing...",color: "#d4a574" },
    done:       { label: "Done",          color: "#86c06c" },
    error:      { label: "Error",         color: "#f87171" },
  };

export default function HomePage() {
  const [appState, setAppState]     = useState<AppState>("idle");
  const [file, setFile]             = useState<File | null>(null);
  const [transcript, setTranscript] = useState<TranscriptData | null>(null);
  const [error, setError]           = useState("");
  const [dragging, setDragging]     = useState(false);
  const inputRef = useRef<HTMLInputElement>(null);

  const isWorking = appState === "uploading" || appState === "processing";
  const status = STATUS[appState];

  // Map app state → Rive persona state
  const personaState: PersonaState =
    appState === "uploading"  ? "listening" :
    appState === "processing" ? "speaking"  :
    appState === "error"      ? "asleep"    :
    "thinking";

  const acceptFile = useCallback((f: File | null) => {
    if (!f) return;
    if (!/\.(mp3|wav|m4a|ogg|flac|webm)$/i.test(f.name)) {
      setError("Unsupported format. Use mp3, wav, m4a, ogg, flac, or webm.");
      setAppState("error");
      return;
    }
    setFile(f); setTranscript(null); setError(""); setAppState("idle");
  }, []);

  const onChange   = (e: ChangeEvent<HTMLInputElement>) => { acceptFile(e.target.files?.[0] ?? null); e.target.value = ""; };
  const onDrop     = (e: DragEvent<HTMLDivElement>)     => { e.preventDefault(); setDragging(false); acceptFile(e.dataTransfer.files?.[0] ?? null); };
  const onDragOver = (e: DragEvent<HTMLDivElement>)     => { e.preventDefault(); setDragging(true); };
  const clear      = ()                                 => { setFile(null); setTranscript(null); setError(""); setAppState("idle"); };

  const run = async () => {
    if (!file || isWorking) return;
    setError(""); setTranscript(null); setAppState("uploading");
    const fd = new FormData();
    fd.append("file", file);
    try {
      const res = await fetch("/api/transcribe", { method: "POST", body: fd });
      setAppState("processing");
      if (!res.ok) {
        const j = await res.json().catch(() => ({}));
        throw new Error(j.error ?? `HTTP ${res.status}`);
      }
      const { transcript: t } = await res.json();
      setTranscript(t ?? null); setAppState("done");
    } catch (err) {
      setError(err instanceof Error ? err.message : "Unexpected error.");
      setAppState("error");
    }
  };

  return (
    <div className="min-h-screen bg-charcoal-900 text-gold-50 flex flex-col">

      {/* Premium Navigation */}
      <nav className="flex items-center justify-between px-8 h-16 border-b border-gold-900/[0.2] bg-charcoal-800/[0.6] backdrop-blur-md">
        <div className="flex items-center gap-3">
          <div className="w-2.5 h-2.5 rounded-full bg-gradient-to-br from-gold-300 to-gold-500 shadow-glow"></div>
          <span className="font-mono text-sm font-semibold text-gold-300 tracking-widest">ASR</span>
        </div>
        <div className="flex items-center gap-2 px-4 h-8 rounded-full glass text-xs font-medium">
          <Sparkles size={11} className="text-gold-300" />
          <span className="text-gold-300">Gemini 3 Flash</span>
        </div>
      </nav>

      {/* Main Content - Two Column Layout with Equal Weight */}
      <main className="flex-1 flex items-center justify-center px-6 py-16">
        <div className="w-full max-w-7xl grid grid-cols-1 lg:grid-cols-2 gap-12 items-start">
          
          {/* Left Column: Persona & Upload */}
          <div className="space-y-8 animate-enter">
            
            {/* Persona Stage */}
            <div className="relative w-full flex flex-col items-center justify-center pt-8">
              {/* Premium ambient glow */}
              <div
                className="absolute top-1/2 left-1/2 -translate-x-1/2 -translate-y-1/2 w-96 h-96 rounded-full pointer-events-none transition-all duration-700"
                style={{
                  background: "radial-gradient(circle, rgba(212, 165, 116, 0.08) 0%, rgba(212, 165, 116, 0.02) 40%, transparent 70%)",
                  opacity: isWorking ? 1 : 0.5,
                  filter: "blur(60px)",
                }}
              />
              
              {/* Avatar with premium styling */}
              <div className="relative z-10">
                <Persona
                  variant="halo"
                  state={personaState}
                  className="size-72 drop-shadow-2xl"
                />
                
                {/* Decorative ring around avatar */}
                <div 
                  className="absolute inset-0 rounded-full border border-gold-300/[0.15] pointer-events-none transition-opacity duration-700"
                  style={{ opacity: isWorking ? 0.3 : 0.1 }}
                />
              </div>

              {/* Premium status indicator */}
              <div className="flex items-center justify-center gap-2.5 mt-8">
                <span
                  className={cn(
                    "w-2 h-2 rounded-full transition-all duration-300",
                    isWorking && "animate-glow-pulse"
                  )}
                  style={{ background: status.color }}
                />
                <span
                  className="text-xs font-semibold tracking-widest uppercase transition-colors duration-300"
                  style={{ color: status.color }}
                >
                  {status.label}
                </span>
              </div>
            </div>
          </div>

          {/* Right Column: Upload Zone & Controls */}
          <div className="space-y-6 animate-enter" style={{ animationDelay: '0.1s' }}>
            
            {/* Upload Section Header */}
            <div className="space-y-2">
              <h2 className="text-2xl font-semibold tracking-tight text-gold-50">
                Upload Audio
              </h2>
              <p className="text-sm text-gold-300/70">
                Select an audio file to transcribe using AI
              </p>
            </div>

            <input ref={inputRef} type="file" accept=".mp3,.wav,.m4a,.ogg,.flac,.webm,audio/*" onChange={onChange} className="hidden" />

            {/* File Upload Area */}
            <div onDrop={onDrop} onDragOver={onDragOver} onDragLeave={() => setDragging(false)}>
              {!file ? (
                <button
                  type="button"
                  onClick={() => inputRef.current?.click()}
                  className={cn(
                    "w-full flex flex-col items-center justify-center gap-4 px-8 py-12 rounded-2xl border-2 transition-all duration-200 group cursor-pointer",
                    dragging
                      ? "glass-elevated border-gold-300/50 bg-gold-300/[0.05]"
                      : "glass border-gold-900/[0.3] hover:border-gold-300/30 hover:bg-gold-300/[0.02]",
                  )}
                >
                  <div className={cn(
                    "p-4 rounded-xl transition-all duration-200",
                    dragging
                      ? "bg-gold-300/20"
                      : "bg-gold-300/[0.08] group-hover:bg-gold-300/15",
                  )}>
                    <Upload
                      size={28}
                      className={cn(
                        "transition-colors",
                        dragging ? "text-gold-300" : "text-gold-300/60 group-hover:text-gold-300",
                      )}
                    />
                  </div>
                  <div className="text-center">
                    <p className={cn(
                      "text-base font-semibold transition-colors",
                      dragging ? "text-gold-300" : "text-gold-100 group-hover:text-gold-300",
                    )}>
                      {dragging ? "Release to upload" : "Drop audio file here"}
                    </p>
                    <p className="text-xs text-gold-300/60 mt-1">
                      or click to browse
                    </p>
                  </div>
                </button>
              ) : (
                <div className="w-full flex items-center gap-4 px-6 py-5 rounded-2xl glass-elevated border-gold-300/[0.2] animate-fade-in-scale">
                  <div className="w-12 h-12 rounded-xl flex items-center justify-center flex-shrink-0 bg-gold-300/[0.1] border border-gold-300/[0.2]">
                    <FileAudio size={18} className="text-gold-300" />
                  </div>
                  <div className="flex-1 min-w-0">
                    <p className="text-sm font-semibold text-gold-50 truncate">{file.name}</p>
                    <p className="text-xs text-gold-300/70 mt-0.5">{fmtBytes(file.size)}</p>
                  </div>
                  {!isWorking && (
                    <button 
                      onClick={clear} 
                      className="w-8 h-8 flex items-center justify-center rounded-lg text-gold-300/60 hover:text-gold-300 hover:bg-gold-300/10 transition-colors flex-shrink-0"
                    >
                      <X size={16} />
                    </button>
                  )}
                </div>
              )}
            </div>

            {/* Supported Formats Info */}
            <div className="text-xs text-gold-300/60 flex items-center gap-2">
              <span>Supported: MP3, WAV, M4A, OGG, FLAC, WebM</span>
            </div>

            {/* Transcribe Button */}
            <div className="pt-4">
              <StatefulButton
                onClick={run}
                disabled={!file || isWorking}
                className="w-full h-12 rounded-xl text-sm font-semibold tracking-wide bg-gradient-to-r from-gold-400 to-gold-500 hover:from-gold-300 hover:to-gold-400 text-charcoal-900 shadow-glow disabled:opacity-50 disabled:cursor-not-allowed transition-all duration-200 hover:shadow-glow-lg"
              >
                {appState === "done" ? "Transcribe again" : "Transcribe"}
              </StatefulButton>
            </div>

            {/* Error Display */}
            {appState === "error" && error && (
              <div className="flex items-start gap-3 px-5 py-4 rounded-xl bg-red-500/10 border border-red-500/30 animate-enter">
                <AlertTriangle size={16} className="text-red-400/80 mt-0.5 flex-shrink-0" />
                <p className="text-xs text-red-400/90 leading-relaxed font-medium">{error}</p>
              </div>
            )}
          </div>
        </div>
      </main>

      {/* Transcript Section - Full Width Below */}
      {transcript && (
        <div className="border-t border-gold-900/[0.2] bg-charcoal-800/[0.4] backdrop-blur-sm">
          <div className="max-w-7xl mx-auto px-6 py-12">
            <TranscriptView transcript={transcript} />
          </div>
        </div>
      )}

      {/* Premium Footer */}
      <footer className="py-6 flex items-center justify-center border-t border-gold-900/[0.2] bg-charcoal-800/[0.4] text-xs text-gold-300/60 font-mono tracking-widest">
        asr • powered by gemini 3 flash
      </footer>

    </div>
  );
}
