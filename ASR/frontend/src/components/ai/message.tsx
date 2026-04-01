"use client";

import { cn } from "@/lib/utils";
import type { ComponentProps } from "react";

const SPEAKER_PALETTE = [
  {
    bg: "bg-[rgba(255,230,0,0.08)] border-[rgba(255,230,0,0.78)]",
    text: "text-[rgba(255,230,0,0.96)]",
    label: "text-[rgba(255,230,0,0.92)]",
    dot: "#ffe600",
  },
  {
    bg: "bg-[rgba(255,230,0,0.03)] border-[rgba(255,230,0,0.44)]",
    text: "text-[rgba(255,230,0,0.92)]",
    label: "text-[rgba(255,230,0,0.68)]",
    dot: "rgba(255,230,0,0.6)",
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
        "flex max-w-[78%] flex-col gap-2",
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
        <span className={cn("select-none text-[10px] font-semibold tracking-[0.28em]", style.label)}>
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
        "border px-4 py-3 text-sm leading-7 transition-colors duration-150",
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
