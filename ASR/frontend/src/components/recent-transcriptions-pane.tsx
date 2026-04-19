"use client";

import { cn } from "@/lib/utils";
import { Clock, X, Trash2, History } from "lucide-react";

export interface RecentTranscription {
  id: string;
  fileName: string;
  timestamp: number;
  transcript: { bengali: string; english: string };
  duration: number | null;
  wordCount: number;
}

interface RecentTranscriptionsPaneProps {
  isOpen: boolean;
  onClose: () => void;
  transcriptions: RecentTranscription[];
  onSelect: (t: RecentTranscription) => void;
  onDelete: (id: string) => void;
}

function timeAgo(timestamp: number): string {
  const diff = Date.now() - timestamp;
  const minutes = Math.floor(diff / 60_000);
  const hours = Math.floor(diff / 3_600_000);
  const days = Math.floor(diff / 86_400_000);

  if (minutes < 1) return "Just now";
  if (minutes < 60) return `${minutes}m ago`;
  if (hours < 24) return `${hours}h ago`;
  if (days < 7) return `${days}d ago`;
  return new Date(timestamp).toLocaleDateString();
}

function fmtDuration(seconds: number | null): string {
  if (!seconds || Number.isNaN(seconds)) return "";
  const total = Math.max(0, Math.round(seconds));
  const mins = Math.floor(total / 60);
  const secs = total % 60;
  return `${mins.toString().padStart(2, "0")}:${secs.toString().padStart(2, "0")}`;
}

export function RecentTranscriptionsPane({
  isOpen,
  onClose,
  transcriptions,
  onSelect,
  onDelete,
}: RecentTranscriptionsPaneProps) {
  return (
    <div
      className={cn(
        "absolute inset-y-0 left-0 z-30 flex w-[268px] flex-col",
        "transition-transform duration-[340ms] ease-[cubic-bezier(0.16,1,0.3,1)]",
        "rounded-[28px] border border-[rgba(var(--atelier-ink-rgb),0.13)]",
        "bg-[linear-gradient(180deg,rgba(255,255,255,0.93),rgba(255,255,255,0.82))]",
        "shadow-[0_8px_48px_rgba(13,18,32,0.13)] backdrop-blur-[12px]",
        isOpen ? "translate-x-0" : "-translate-x-[110%]",
      )}
      style={{ willChange: "transform" }}
    >
      {/* Header */}
      <div className="flex shrink-0 items-center justify-between border-b border-[rgba(var(--atelier-ink-rgb),0.08)] px-4 py-3.5">
        <div className="flex items-center gap-2">
          <div className="flex h-7 w-7 items-center justify-center rounded-[9px] bg-[rgba(var(--atelier-terracotta-rgb),0.1)]">
            <History size={14} className="text-[var(--atelier-terracotta)]" />
          </div>
          <div>
            <div className="atelier-kicker text-[9px]">History</div>
            <h3 className="-mt-0.5 text-sm font-semibold text-[var(--atelier-ink)]">Recent Sessions</h3>
          </div>
        </div>
        <button
          type="button"
          onClick={onClose}
          className="flex h-7 w-7 items-center justify-center rounded-full bg-[rgba(var(--atelier-ink-rgb),0.06)] text-[rgba(var(--atelier-ink-rgb),0.45)] transition-colors hover:bg-[rgba(var(--atelier-ink-rgb),0.1)] hover:text-[rgba(var(--atelier-ink-rgb),0.7)]"
        >
          <X size={14} />
        </button>
      </div>

      {/* Count row */}
      {transcriptions.length > 0 && (
        <div className="shrink-0 border-b border-[rgba(var(--atelier-ink-rgb),0.06)] px-4 py-2">
          <span className="text-[11px] text-[rgba(var(--atelier-ink-rgb),0.42)]">
            {transcriptions.length} saved session{transcriptions.length !== 1 ? "s" : ""}
          </span>
        </div>
      )}

      {/* Scrollable list */}
      <div className="min-h-0 flex-1 overflow-y-auto p-2">
        {transcriptions.length === 0 ? (
          <div className="flex flex-col items-center justify-center gap-3 py-14 text-center">
            <div className="flex h-12 w-12 items-center justify-center rounded-[16px] bg-[rgba(var(--atelier-ink-rgb),0.05)]">
              <Clock size={22} className="text-[rgba(var(--atelier-ink-rgb),0.22)]" />
            </div>
            <div>
              <p className="text-[13px] font-medium text-[rgba(var(--atelier-ink-rgb),0.45)]">No sessions yet</p>
              <p className="mt-0.5 text-[11px] text-[rgba(var(--atelier-ink-rgb),0.3)]">
                Transcribed sessions appear here
              </p>
            </div>
          </div>
        ) : (
          <div className="space-y-0.5">
            {transcriptions.map((t) => (
              <div key={t.id} className="group relative">
                <button
                  type="button"
                  className="w-full rounded-[16px] px-3 py-2.5 text-left transition-[background-color,transform] duration-150 hover:bg-[rgba(var(--atelier-ink-rgb),0.04)] active:scale-[0.985] active:bg-[rgba(var(--atelier-ink-rgb),0.07)]"
                  onClick={() => onSelect(t)}
                >
                  {/* File name + time */}
                  <div className="flex items-start justify-between gap-2 pr-5">
                    <span className="line-clamp-1 flex-1 text-[13px] font-semibold leading-5 text-[var(--atelier-ink)]">
                      {t.fileName}
                    </span>
                    <span className="mt-0.5 shrink-0 text-[10px] leading-4 text-[rgba(var(--atelier-ink-rgb),0.38)]">
                      {timeAgo(t.timestamp)}
                    </span>
                  </div>

                  {/* Badges */}
                  <div className="mt-1.5 flex flex-wrap gap-1">
                    <span className="rounded-full bg-[rgba(var(--atelier-teal-rgb),0.1)] px-2 py-0.5 text-[10px] font-medium text-[var(--atelier-teal)]">
                      {t.wordCount.toLocaleString()} words
                    </span>
                    {t.duration && (
                      <span className="rounded-full bg-[rgba(var(--atelier-cobalt-rgb),0.08)] px-2 py-0.5 text-[10px] font-medium text-[var(--atelier-cobalt)]">
                        {fmtDuration(t.duration)}
                      </span>
                    )}
                  </div>

                  {/* Snippet */}
                  {t.transcript.english && (
                    <p className="mt-1.5 line-clamp-2 text-[11px] leading-[1.45] text-[rgba(var(--atelier-ink-rgb),0.46)]">
                      {t.transcript.english.substring(0, 90)}
                      {t.transcript.english.length > 90 ? "…" : ""}
                    </p>
                  )}
                </button>

                {/* Delete button — revealed on hover */}
                <button
                  type="button"
                  className="absolute right-2 top-2 hidden h-6 w-6 items-center justify-center rounded-full bg-[rgba(var(--atelier-terracotta-rgb),0.08)] text-[var(--atelier-terracotta)] transition-colors hover:bg-[rgba(var(--atelier-terracotta-rgb),0.16)] group-hover:flex"
                  onClick={(e) => {
                    e.stopPropagation();
                    onDelete(t.id);
                  }}
                  aria-label={`Delete ${t.fileName}`}
                >
                  <Trash2 size={11} />
                </button>

                {/* Separator */}
                <div className="mx-3 h-px bg-[rgba(var(--atelier-ink-rgb),0.05)] last:hidden" />
              </div>
            ))}
          </div>
        )}
      </div>
    </div>
  );
}
