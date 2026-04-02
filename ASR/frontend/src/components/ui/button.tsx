"use client";

import * as React from "react";
import { cn } from "@/lib/utils";

export interface ButtonProps extends React.ButtonHTMLAttributes<HTMLButtonElement> {
  variant?: "default" | "outline" | "ghost";
  size?: "default" | "sm" | "icon";
}

export const Button = React.forwardRef<HTMLButtonElement, ButtonProps>(
  ({ className, variant = "default", size = "default", ...props }, ref) => {
    return (
      <button
        ref={ref}
        className={cn(
          "inline-flex items-center justify-center rounded-[16px] font-semibold transition-all duration-200 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-[rgba(var(--atelier-cobalt-rgb),0.28)] disabled:pointer-events-none disabled:opacity-50",
          variant === "default" && "border border-[rgba(var(--atelier-ink-rgb),0.12)] bg-[var(--atelier-ink)] text-[var(--atelier-paper-strong)] hover:bg-[rgba(var(--atelier-ink-rgb),0.92)]",
          variant === "outline" && "border border-[rgba(var(--atelier-ink-rgb),0.12)] bg-[rgba(255,255,255,0.82)] text-[var(--atelier-ink)] hover:bg-[rgba(var(--atelier-terracotta-rgb),0.12)]",
          variant === "ghost" && "text-[rgba(var(--atelier-ink-rgb),0.8)] hover:bg-[rgba(255,255,255,0.52)]",
          size === "default" && "h-10 px-4 py-2.5 text-sm",
          size === "sm" && "h-8 px-3 text-xs",
          size === "icon" && "h-8 w-8",
          className,
        )}
        {...props}
      />
    );
  },
);
Button.displayName = "Button";
