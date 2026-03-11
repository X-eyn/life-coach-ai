"use client";

import { useState, useRef, useCallback, DragEvent, ChangeEvent } from "react";
import { FileAudio, Upload, X, AlertTriangle, Sparkles } from "lucide-react";
import { Persona, type PersonaState } from "@/components/persona";
import { Button as StatefulButton } from "@/components/ui/stateful-button";
import { TranscriptView } from "@/components/transcript-view";
import { cn } from "@/lib/utils";

type AppState = "idle" | "uploading" | "processing" | "done" | "error";

function fmtBytes(b: number) {
  if (!b) return "0 B";
  const k = 1024, s = ["B", "KB", "MB", "GB"];
  const i = Math.floor(Math.log(b) / Math.log(k));
  return `${+(b / k ** i).toFixed(1)} ${s[i]}`;
}

const STATUS: Record<AppState, { label: string; color: string }> = {
  idle:       { label: "Ready",         color: "#57576A" },
  uploading:  { label: "Uploading...",  color: "#F97316" },
  processing: { label: "Transcribing...",color: "#F97316" },
  done:       { label: "Done",          color: "#34D399" },
  error:      { label: "Error",         color: "#F87171" },
};

export default function HomePage() {
  const [appState, setAppState]     = useState<AppState>("idle");
  const [file, setFile]             = useState<File | null>(null);
  const [transcript, setTranscript] = useState("");
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
    setFile(f); setTranscript(""); setError(""); setAppState("idle");
  }, []);

  const onChange   = (e: ChangeEvent<HTMLInputElement>) => { acceptFile(e.target.files?.[0] ?? null); e.target.value = ""; };
  const onDrop     = (e: DragEvent<HTMLDivElement>)     => { e.preventDefault(); setDragging(false); acceptFile(e.dataTransfer.files?.[0] ?? null); };
  const onDragOver = (e: DragEvent<HTMLDivElement>)     => { e.preventDefault(); setDragging(true); };
  const clear      = ()                                 => { setFile(null); setTranscript(""); setError(""); setAppState("idle"); };

  const run = async () => {
    if (!file || isWorking) return;
    setError(""); setTranscript(""); setAppState("uploading");
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
      setTranscript(t ?? ""); setAppState("done");
    } catch (err) {
      setError(err instanceof Error ? err.message : "Unexpected error.");
      setAppState("error");
    }
  };

  return (
    <div className="min-h-screen bg-ink text-tx flex flex-col">

      <nav className="flex items-center justify-between px-6 h-14 border-b border-white/[0.04]">
        <span className="font-mono text-[13px] text-tx-3 tracking-[0.12em] uppercase select-none">ASR</span>
        <div className="flex items-center gap-1.5 px-3 h-6 rounded-full border border-white/[0.06] bg-ink-2">
          <Sparkles size={9} className="text-accent" />
          <span className="text-[10px] font-medium text-tx-3 tracking-wide">Gemini 3 Flash</span>
        </div>
      </nav>

      <main className="flex-1 flex flex-col items-center px-5 pt-16 pb-24">
        <div className="w-full max-w-[660px] space-y-3 animate-enter">

          {/* ── Persona stage ── */}
          <div className="relative w-full flex flex-col items-center">
            {/* Ambient glow behind avatar */}
            <div
              className="absolute top-1/2 left-1/2 -translate-x-1/2 -translate-y-1/2 w-72 h-72 rounded-full pointer-events-none transition-opacity duration-700"
              style={{
                background: "radial-gradient(ellipse, rgba(249,115,22,0.13) 0%, transparent 70%)",
                opacity: isWorking ? 1 : 0.3,
                filter: "blur(40px)",
              }}
            />

            {/* Avatar — frameless, seamless */}
            <Persona
              variant="halo"
              state={personaState}
              className="size-64 relative z-10"
            />

            {/* Status chip */}
            <div className="flex items-center justify-center gap-2 mt-4 h-5">
              <span
                className={cn("w-1.5 h-1.5 rounded-full transition-colors duration-300", isWorking && "animate-breath")}
                style={{ background: status.color }}
              />
              <span
                className="text-[11px] font-medium tracking-[0.08em] uppercase transition-colors duration-300"
                style={{ color: status.color }}
              >
                {status.label}
              </span>
            </div>
          </div>

          <input ref={inputRef} type="file" accept=".mp3,.wav,.m4a,.ogg,.flac,.webm,audio/*" onChange={onChange} className="hidden" />

          <div onDrop={onDrop} onDragOver={onDragOver} onDragLeave={() => setDragging(false)}>
            {!file ? (
              <button
                type="button"
                onClick={() => inputRef.current?.click()}
                className={cn(
                  "w-full flex items-center gap-5 px-6 py-5 rounded-xl border transition-all duration-150 group",
                  dragging
                    ? "bg-[rgba(249,115,22,0.05)] border-[rgba(249,115,22,0.3)] shadow-[0_0_20px_rgba(249,115,22,0.08)]"
                    : "bg-ink-2 border-white/[0.055] hover:bg-ink-3 hover:border-white/[0.09]",
                )}
              >
                <Upload
                  size={30}
                  className={cn(
                    "flex-shrink-0 transition-colors",
                    dragging ? "text-accent" : "text-tx-2 group-hover:text-tx",
                  )}
                />
                <span className={cn(
                  "text-[15px] font-medium tracking-wide transition-colors",
                  dragging ? "text-accent" : "text-tx-2 group-hover:text-tx",
                )}>
                  {dragging ? "Release to upload" : "Upload"}
                </span>
              </button>
            ) : (
              <div className="w-full flex items-center gap-4 px-5 py-4 rounded-xl bg-ink-2 border border-white/[0.055]">
                <div className="w-9 h-9 rounded-lg flex items-center justify-center flex-shrink-0 bg-ink-3 border border-[rgba(249,115,22,0.2)]">
                  <FileAudio size={15} className="text-accent" />
                </div>
                <div className="flex-1 min-w-0">
                  <p className="text-[13px] font-medium text-tx truncate">{file.name}</p>
                  <p className="text-[11px] text-tx-3 mt-0.5">{fmtBytes(file.size)}</p>
                </div>
                {!isWorking && (
                  <button onClick={clear} className="w-7 h-7 flex items-center justify-center rounded-lg text-tx-3 hover:text-tx-2 hover:bg-white/[0.04] transition-colors flex-shrink-0">
                    <X size={13} />
                  </button>
                )}
              </div>
            )}
          </div>

          <div className="flex justify-center">
            <StatefulButton
              onClick={run}
              disabled={!file || isWorking}
              className="w-full h-[46px] rounded-xl text-[13px] font-medium tracking-[0.02em]"
            >
              {appState === "done" ? "Transcribe again" : "Transcribe"}
            </StatefulButton>
          </div>

          {appState === "error" && error && (
            <div className="flex items-start gap-3 px-4 py-3 rounded-xl bg-red-500/[0.06] border border-red-500/[0.15] animate-enter">
              <AlertTriangle size={13} className="text-red-400 mt-0.5 flex-shrink-0" />
              <p className="text-[12px] text-red-400 leading-relaxed">{error}</p>
            </div>
          )}

          {transcript && <TranscriptView transcript={transcript} className="mt-2" />}

        </div>
      </main>

      <footer className="py-6 flex items-center justify-center border-t border-white/[0.03]">
        <span className="text-[11px] text-tx-4 font-mono tracking-wide">asr / gemini 3 flash</span>
      </footer>

    </div>
  );
}
