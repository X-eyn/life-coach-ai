"use client";

import { cn } from "@/lib/utils";
import type { ComponentProps } from "react";

// Premium speaker palette with warm gold theme
const SPEAKER_PALETTE = [
  { bg: "bg-gold-300/[0.08] border-gold-300/[0.2]", text: "text-gold-50", label: "text-gold-300", dot: "#d4a574" },
  { bg: "bg-violet-400/[0.08] border-violet-400/[0.2]", text: "text-gold-50", label: "text-violet-300", dot: "#a78bfa" },
  { bg: "bg-cyan-400/[0.08] border-cyan-400/[0.2]", text: "text-gold-50", label: "text-cyan-300", dot: "#67e8f9" },
  { bg: "bg-emerald-400/[0.08] border-emerald-400/[0.2]", text: "text-gold-50", label: "text-emerald-300", dot: "#6ee7b7" },
  { bg: "bg-rose-400/[0.08] border-rose-400/[0.2]", text: "text-gold-50", label: "text-rose-300", dot: "#fb7185" },
  { bg: "bg-amber-400/[0.08] border-amber-400/[0.2]", text: "text-gold-50", label: "text-amber-300", dot: "#fcd34d" },
];

export function getSpeakerStyle(index: number) {
  return SPEAKER_PALETTE[index % SPEAKER_PALETTE.length];
}

export interface MessageProps extends ComponentProps<"div"> {
  speaker: string;
  speakerIndex: number;
  align?: "left" | "right";
}

export const Message = ({
  speaker,
  speakerIndex,
  align = "left",
  className,
  children,
  ...props
}: MessageProps) => {
  const style = getSpeakerStyle(speakerIndex);
  const isRight = align === "right";

  return (
    <div
      className={cn(
        "flex flex-col gap-1.5 max-w-[75%] animate-slide-in-right",
        isRight ? "self-end items-end" : "self-start items-start",
        className,
      )}
      {...props}
    >
      <div className={cn("flex items-center gap-2 px-1", isRight && "flex-row-reverse")}>
        <span
          className="inline-block w-2 h-2 rounded-full flex-shrink-0"
          style={{ background: style.dot, boxShadow: `0 0 6px ${style.dot}40` }}
        />
        <span className={cn("text-[10px] font-semibold tracking-widest uppercase select-none", style.label)}>
          {speaker}
        </span>
      </div>
      {children}
    </div>
  );
};

export interface MessageContentProps extends ComponentProps<"div"> {
  speakerIndex: number;
}

export const MessageContent = ({
  speakerIndex,
  className,
  children,
  ...props
}: MessageContentProps) => {
  const style = getSpeakerStyle(speakerIndex);

  return (
    <div
      className={cn(
        "rounded-2xl border px-5 py-3.5 text-sm leading-relaxed font-medium transition-all duration-200 hover:border-opacity-40",
        "glass-sm backdrop-blur-xl",
        style.bg,
        style.text,
        className,
      )}
      {...props}
    >
      {children}
    </div>
  );
};
