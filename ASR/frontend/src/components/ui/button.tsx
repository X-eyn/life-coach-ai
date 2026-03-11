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
          "inline-flex items-center justify-center font-medium transition-colors focus-visible:outline-none disabled:pointer-events-none disabled:opacity-50",
          variant === "default" && "bg-accent text-white hover:brightness-110",
          variant === "outline" && "border border-white/[0.1] bg-ink-2 text-tx-2 hover:bg-ink-3 hover:text-tx",
          variant === "ghost" && "text-tx-3 hover:bg-white/[0.04] hover:text-tx-2",
          size === "default" && "h-9 rounded-lg px-4 py-2 text-sm",
          size === "sm" && "h-7 rounded-md px-3 text-xs",
          size === "icon" && "h-8 w-8 rounded-full",
          className,
        )}
        {...props}
      />
    );
  },
);
Button.displayName = "Button";
