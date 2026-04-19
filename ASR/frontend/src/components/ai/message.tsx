"use client";

import { cn } from "@/lib/utils";
import { useState, useCallback, useRef } from "react";
import { Check, Copy, Play } from "lucide-react";
import type { ComponentProps, ReactNode } from "react";

const SPEAKER_PALETTE = [
  {
    bg: "bg-[rgba(var(--atelier-terracotta-rgb),0.11)]",
    border: "border-[rgba(var(--atelier-terracotta-rgb),0.2)]",
    leftBorder: "var(--atelier-terracotta)",
    text: "text-[rgba(var(--atelier-ink-rgb),0.88)]",
    label: "text-[rgba(var(--atelier-terracotta-rgb),0.88)]",
    dot: "#cf5a43",
  },
  {
    bg: "bg-[rgba(var(--atelier-teal-rgb),0.1)]",
    border: "border-[rgba(var(--atelier-teal-rgb),0.2)]",
    leftBorder: "var(--atelier-teal)",
    text: "text-[rgba(var(--atelier-ink-rgb),0.88)]",
    label: "text-[rgba(var(--atelier-teal-rgb),0.85)]",
    dot: "#1f7e7a",
  },
  {
    bg: "bg-[rgba(var(--atelier-cobalt-rgb),0.09)]",
    border: "border-[rgba(var(--atelier-cobalt-rgb),0.2)]",
    leftBorder: "var(--atelier-cobalt)",
    text: "text-[rgba(var(--atelier-ink-rgb),0.88)]",
    label: "text-[rgba(var(--atelier-cobalt-rgb),0.82)]",
    dot: "#3456d6",
  },
  {
    bg: "bg-[rgba(var(--atelier-gold-rgb),0.15)]",
    border: "border-[rgba(var(--atelier-gold-rgb),0.26)]",
    leftBorder: "#c9900e",
    text: "text-[rgba(var(--atelier-ink-rgb),0.9)]",
    label: "text-[rgba(var(--atelier-ink-rgb),0.62)]",
    dot: "#c9900e",
  },
];

export function getSpeakerStyle(index: number) {
  return SPEAKER_PALETTE[index % SPEAKER_PALETTE.length];
}

export interface MessageProps extends ComponentProps<"div"> {
  speaker: string;
  speakerIndex: number;
}

export const Message = ({
  speaker: _speaker,
  speakerIndex: _speakerIndex,
  className,
  children,
  ...props
}: MessageProps) => (
  <div className={cn("w-full", className)} {...props}>
    {children}
  </div>
);

export interface MessageContentProps {
  speakerIndex: number;
  speaker?: string;
  searchQuery?: string;
  className?: string;
  children: ReactNode;
}

export const MessageContent = ({
  speakerIndex,
  speaker,
  searchQuery: _searchQuery,
  className,
  children,
}: MessageContentProps) => {
  const style = getSpeakerStyle(speakerIndex);
  const [hovering, setHovering] = useState(false);
  const [copied, setCopied] = useState(false);
  const contentRef = useRef<HTMLDivElement>(null);

  const copyTurn = useCallback(() => {
    const text = contentRef.current?.innerText ?? "";
    navigator.clipboard.writeText(text).then(() => {
      setCopied(true);
      setTimeout(() => setCopied(false), 1400);
    });
  }, []);

  return (
    <div
      className={cn(
        "group relative w-full rounded-[18px] border transition-shadow duration-150",
        "shadow-[0_2px_12px_rgba(41,25,18,0.04)] hover:shadow-[0_4px_20px_rgba(41,25,18,0.08)]",
        style.bg,
        style.border,
        className,
      )}
      style={{ borderLeftWidth: "3px", borderLeftColor: style.leftBorder }}
      onMouseEnter={() => setHovering(true)}
      onMouseLeave={() => setHovering(false)}
    >
      {/* Bubble header: speaker identity */}
      <div className="flex items-center gap-2 px-5 pb-2 pt-4">
        <span
          className="inline-block h-2 w-2 shrink-0 rounded-full"
          style={{ background: style.dot, boxShadow: `0 0 6px ${style.dot}55` }}
        />
        <span className={cn("select-none text-[11px] font-medium", style.label)}>
          {speaker ?? `Speaker ${speakerIndex + 1}`}
        </span>
      </div>

      {/* Text content */}
      <div ref={contentRef} className={cn("not-italic px-5 pb-4 text-sm leading-[1.7]", style.text)}>
        {children}
      </div>

      {/* Hover actions — ghost style, fade in on hover (desktop); always accessible */}
      <div
        className={cn(
          "flex items-center gap-0.5 px-4 pb-3 transition-opacity duration-150",
          hovering ? "opacity-100" : "pointer-events-none opacity-0",
        )}
      >
        <button
          type="button"
          onClick={copyTurn}
          className="inline-flex items-center gap-1.5 rounded-full px-2.5 py-1 text-[11px] text-[rgba(var(--atelier-ink-rgb),0.46)] transition-colors hover:text-[rgba(var(--atelier-ink-rgb),0.8)]"
        >
          {copied ? <Check size={11} /> : <Copy size={11} />}
          {copied ? "Copied" : "Copy turn"}
        </button>
        <span className="text-[rgba(var(--atelier-ink-rgb),0.18)] text-[11px]">·</span>
        <button
          type="button"
          className="inline-flex items-center gap-1.5 rounded-full px-2.5 py-1 text-[11px] text-[rgba(var(--atelier-ink-rgb),0.46)] transition-colors hover:text-[rgba(var(--atelier-ink-rgb),0.8)]"
        >
          <Play size={11} />
          Play from here
        </button>
      </div>
    </div>
  );
};
