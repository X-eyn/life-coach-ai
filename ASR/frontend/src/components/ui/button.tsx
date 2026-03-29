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
          "inline-flex items-center justify-center font-semibold transition-all duration-200 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-gold-300/50 disabled:pointer-events-none disabled:opacity-50",
          variant === "default" && "bg-gradient-to-r from-gold-400 to-gold-500 text-charcoal-900 hover:from-gold-300 hover:to-gold-400 hover:shadow-glow shadow-glow",
          variant === "outline" && "border border-gold-300/[0.3] bg-charcoal-800/[0.5] text-gold-300 hover:bg-charcoal-700 hover:text-gold-200 hover:border-gold-300/50 glass-sm",
          variant === "ghost" && "text-gold-300/70 hover:bg-gold-300/10 hover:text-gold-300 transition-colors",
          size === "default" && "h-10 rounded-lg px-4 py-2.5 text-sm",
          size === "sm" && "h-8 rounded-md px-3 text-xs",
          size === "icon" && "h-8 w-8 rounded-full",
          className,
        )}
        {...props}
      />
    );
  },
);
Button.displayName = "Button";
