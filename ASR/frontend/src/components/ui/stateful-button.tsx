"use client";
import { cn } from "@/lib/utils";
import React from "react";
import { motion, useAnimate } from "motion/react";

interface ButtonProps extends React.ButtonHTMLAttributes<HTMLButtonElement> {
  className?: string;
  children: React.ReactNode;
}

export const Button = ({ className, children, ...props }: ButtonProps) => {
  const [scope, animate] = useAnimate();

  const animateLoading = async () => {
    await animate(
      ".loader",
      { width: "20px", scale: 1, display: "block", opacity: 1 },
      { duration: 0.3 },
    );
  };

  const animateSuccess = async () => {
    await animate(
      ".loader",
      { width: "0px", scale: 0, display: "none", opacity: 0 },
      { duration: 0.3 },
    );
    await animate(
      ".check",
      { width: "20px", scale: 1, display: "block", opacity: 1 },
      { duration: 0.3 },
    );
    await animate(
      ".check",
      { width: "0px", scale: 0, display: "none", opacity: 0 },
      { delay: 1.5, duration: 0.3 },
    );
  };

  const handleClick = async (event: React.MouseEvent<HTMLButtonElement>) => {
    await animateLoading();
    await props.onClick?.(event);
    await animateSuccess();
  };

  const {
    onClick,
    onDrag,
    onDragStart,
    onDragEnd,
    onAnimationStart,
    onAnimationEnd,
    ...buttonProps
  } = props;

  return (
    <motion.button
      layout
      layoutId="stateful-button"
      ref={scope}
      className={cn(
        "relative flex min-w-[140px] cursor-pointer items-center justify-center gap-2.5 rounded-xl px-6 py-3 font-semibold text-charcoal-900 transition-all duration-200 disabled:pointer-events-none disabled:opacity-50 disabled:cursor-not-allowed",
        "bg-gradient-to-r from-gold-400 to-gold-500 hover:from-gold-300 hover:to-gold-400 hover:shadow-glow-lg shadow-glow",
        "active:scale-95 focus:outline-none focus-visible:ring-2 focus-visible:ring-gold-300/50 focus-visible:ring-offset-2 focus-visible:ring-offset-charcoal-900",
        className,
      )}
      {...buttonProps}
      onClick={handleClick}
      whileHover={{ scale: 1.02 }}
      whileTap={{ scale: 0.98 }}
    >
      <motion.div layout className="flex items-center gap-2.5">
        <Loader />
        <CheckIcon />
        <motion.span layout className="tracking-wide">{children}</motion.span>
      </motion.div>
    </motion.button>
  );
};

const Loader = () => {
  return (
    <motion.svg
      animate={{ rotate: [0, 360] }}
      initial={{ scale: 0, width: 0, display: "none", opacity: 0 }}
      style={{ scale: 0.5, display: "none", opacity: 0 }}
      transition={{ duration: 1.2, repeat: Infinity, ease: "linear" }}
      xmlns="http://www.w3.org/2000/svg"
      width="22"
      height="22"
      viewBox="0 0 24 24"
      fill="none"
      stroke="currentColor"
      strokeWidth="2.5"
      strokeLinecap="round"
      strokeLinejoin="round"
      className="loader text-charcoal-900"
    >
      <path stroke="none" d="M0 0h24v24H0z" fill="none" />
      <path d="M12 3a9 9 0 1 0 9 9" />
    </motion.svg>
  );
};

const CheckIcon = () => {
  return (
    <motion.svg
      initial={{ scale: 0, width: 0, display: "none", opacity: 0 }}
      style={{ scale: 0.5, display: "none", opacity: 0 }}
      xmlns="http://www.w3.org/2000/svg"
      width="22"
      height="22"
      viewBox="0 0 24 24"
      fill="none"
      stroke="currentColor"
      strokeWidth="2.5"
      strokeLinecap="round"
      strokeLinejoin="round"
      className="check text-charcoal-900"
    >
      <path stroke="none" d="M0 0h24v24H0z" fill="none" />
      <path d="M12 12m-9 0a9 9 0 1 0 18 0a9 9 0 1 0 -18 0" />
      <path d="M9 12l2 2l4 -4" />
    </motion.svg>
  );
};
