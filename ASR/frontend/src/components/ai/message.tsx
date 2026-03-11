"use client";

import { cn } from "@/lib/utils";
import type { ComponentProps } from "react";

// Palette for multiple speakers — dark-mode friendly
const SPEAKER_PALETTE = [
  { bg: "bg-accent/10 border-accent/20",        text: "text-tx",   label: "text-accent",       dot: "#F97316" },
  { bg: "bg-violet-500/10 border-violet-500/20", text: "text-tx",   label: "text-violet-400",   dot: "#8B5CF6" },
  { bg: "bg-sky-500/10 border-sky-500/20",       text: "text-tx",   label: "text-sky-400",       dot: "#38BDF8" },
  { bg: "bg-emerald-500/10 border-emerald-500/20", text: "text-tx", label: "text-emerald-400",  dot: "#34D399" },
  { bg: "bg-rose-500/10 border-rose-500/20",     text: "text-tx",   label: "text-rose-400",     dot: "#FB7185" },
  { bg: "bg-amber-500/10 border-amber-500/20",   text: "text-tx",   label: "text-amber-400",    dot: "#FCD34D" },
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
        "flex flex-col gap-1 max-w-[80%]",
        isRight ? "self-end items-end" : "self-start items-start",
        className,
      )}
      {...props}
    >
      <div className={cn("flex items-center gap-1.5 px-1", isRight && "flex-row-reverse")}>
        <span
          className="inline-block w-1.5 h-1.5 rounded-full flex-shrink-0"
          style={{ background: style.dot }}
        />
        <span className={cn("text-[10px] font-medium tracking-wide uppercase select-none", style.label)}>
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
        "rounded-2xl border px-4 py-3 text-[13.5px] leading-relaxed",
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
