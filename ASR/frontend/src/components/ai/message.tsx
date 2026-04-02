"use client";

import { cn } from "@/lib/utils";
import type { ComponentProps } from "react";

const SPEAKER_PALETTE = [
  {
    bg: "bg-[rgba(var(--atelier-terracotta-rgb),0.1)] border-[rgba(var(--atelier-terracotta-rgb),0.28)]",
    text: "text-[rgba(var(--atelier-ink-rgb),0.88)]",
    label: "text-[rgba(var(--atelier-terracotta-rgb),0.92)]",
    dot: "#cf5a43",
  },
  {
    bg: "bg-[rgba(var(--atelier-teal-rgb),0.1)] border-[rgba(var(--atelier-teal-rgb),0.26)]",
    text: "text-[rgba(var(--atelier-ink-rgb),0.88)]",
    label: "text-[rgba(var(--atelier-teal-rgb),0.92)]",
    dot: "#1f7e7a",
  },
  {
    bg: "bg-[rgba(var(--atelier-cobalt-rgb),0.08)] border-[rgba(var(--atelier-cobalt-rgb),0.24)]",
    text: "text-[rgba(var(--atelier-ink-rgb),0.88)]",
    label: "text-[rgba(var(--atelier-cobalt-rgb),0.88)]",
    dot: "#3456d6",
  },
  {
    bg: "bg-[rgba(var(--atelier-gold-rgb),0.16)] border-[rgba(var(--atelier-gold-rgb),0.3)]",
    text: "text-[rgba(var(--atelier-ink-rgb),0.9)]",
    label: "text-[rgba(var(--atelier-ink-rgb),0.74)]",
    dot: "#f0b35a",
  },
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
        "flex max-w-[90%] flex-col gap-2 md:max-w-[78%]",
        isRight ? "self-end items-end" : "self-start items-start",
        className,
      )}
      {...props}
    >
      <div className={cn("flex items-center gap-2 px-1", isRight && "flex-row-reverse")}>
        <span
          className="inline-block h-2 w-2 shrink-0 rounded-full"
          style={{ background: style.dot, boxShadow: `0 0 8px ${style.dot}` }}
        />
        <span className={cn("atelier-kicker select-none text-[10px] font-semibold", style.label)}>
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
        "rounded-[24px] border px-4 py-4 text-sm leading-7 shadow-[0_16px_40px_rgba(41,25,18,0.06)] transition-colors duration-150",
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
