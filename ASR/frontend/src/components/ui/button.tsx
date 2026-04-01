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
          "inline-flex items-center justify-center font-semibold transition-all duration-200 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-[rgba(255,230,0,0.5)] disabled:pointer-events-none disabled:opacity-50",
          variant === "default" && "border border-[rgba(255,230,0,0.92)] bg-[var(--signal)] text-[var(--abyss)] hover:bg-transparent hover:text-[var(--signal)]",
          variant === "outline" && "border border-[rgba(255,230,0,0.72)] bg-[rgba(255,230,0,0.04)] text-[var(--signal)] hover:bg-[var(--signal)] hover:text-[var(--abyss)]",
          variant === "ghost" && "text-[var(--signal)] hover:bg-[rgba(255,230,0,0.08)]",
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
