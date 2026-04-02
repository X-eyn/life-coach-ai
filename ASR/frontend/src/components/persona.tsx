"use client";

import {
  type RiveParameters,
  useRive,
  useStateMachineInput,
  useViewModel,
  useViewModelInstance,
  useViewModelInstanceColor,
} from "@rive-app/react-webgl2";
import { type FC, type ReactNode, memo, useEffect, useMemo, useRef, useState } from "react";
import { cn } from "@/lib/utils";

export type PersonaState = "idle" | "listening" | "thinking" | "speaking" | "asleep";

interface PersonaProps {
  state: PersonaState;
  onLoad?: RiveParameters["onLoad"];
  onLoadError?: RiveParameters["onLoadError"];
  onReady?: () => void;
  onPause?: RiveParameters["onPause"];
  onPlay?: RiveParameters["onPlay"];
  onStop?: RiveParameters["onStop"];
  className?: string;
  variant?: keyof typeof sources;
}

const stateMachine = "default";

const sources = {
  obsidian: {
    source: "https://ejiidnob33g9ap1r.public.blob.vercel-storage.com/obsidian-2.0.riv",
    dynamicColor: true,
    hasModel: true,
  },
  mana: {
    source: "https://ejiidnob33g9ap1r.public.blob.vercel-storage.com/mana-2.0.riv",
    dynamicColor: false,
    hasModel: true,
  },
  opal: {
    source: "https://ejiidnob33g9ap1r.public.blob.vercel-storage.com/orb-1.2.riv",
    dynamicColor: false,
    hasModel: false,
  },
  halo: {
    source: "https://ejiidnob33g9ap1r.public.blob.vercel-storage.com/halo-2.0.riv",
    dynamicColor: true,
    hasModel: true,
  },
  glint: {
    source: "https://ejiidnob33g9ap1r.public.blob.vercel-storage.com/glint-2.0.riv",
    dynamicColor: true,
    hasModel: true,
  },
  command: {
    source: "https://ejiidnob33g9ap1r.public.blob.vercel-storage.com/command-2.0.riv",
    dynamicColor: true,
    hasModel: true,
  },
} as const;

export const PERSONA_VARIANTS = Object.keys(sources) as (keyof typeof sources)[];

const getCurrentTheme = (): "light" | "dark" => {
  if (typeof window !== "undefined") {
    if (document.documentElement.classList.contains("light")) return "light";
    if (document.documentElement.classList.contains("dark")) return "dark";
    if (window.matchMedia?.("(prefers-color-scheme: dark)").matches) return "dark";
  }
  return "light";
};

const useTheme = (enabled: boolean) => {
  const [theme, setTheme] = useState<"light" | "dark">(getCurrentTheme);
  useEffect(() => {
    if (!enabled) return;
    const observer = new MutationObserver(() => setTheme(getCurrentTheme()));
    observer.observe(document.documentElement, { attributes: true, attributeFilter: ["class"] });
    let mql: MediaQueryList | null = null;
    const handleChange = () => setTheme(getCurrentTheme());
    if (window.matchMedia) {
      mql = window.matchMedia("(prefers-color-scheme: dark)");
      mql.addEventListener("change", handleChange);
    }
    return () => {
      observer.disconnect();
      mql?.removeEventListener("change", handleChange);
    };
  }, [enabled]);
  return theme;
};

interface PersonaWithModelProps {
  rive: ReturnType<typeof useRive>["rive"];
  source: (typeof sources)[keyof typeof sources];
  children: ReactNode;
}

const PersonaWithModel = memo(({ rive, source, children }: PersonaWithModelProps) => {
  const theme = useTheme(source.dynamicColor);
  const viewModel = useViewModel(rive, { useDefault: true });
  const viewModelInstance = useViewModelInstance(viewModel, { rive, useDefault: true });
  const viewModelInstanceColor = useViewModelInstanceColor("color", viewModelInstance);

  useEffect(() => {
    if (!(viewModelInstanceColor && source.dynamicColor)) return;
    const [r, g, b] = theme === "dark" ? [255, 255, 255] : [0, 0, 0];
    viewModelInstanceColor.setRgb(r, g, b);
  }, [viewModelInstanceColor, theme, source.dynamicColor]);

  return <>{children}</>;
});
PersonaWithModel.displayName = "PersonaWithModel";

const PersonaWithoutModel = memo(({ children }: { children: ReactNode }) => <>{children}</>);
PersonaWithoutModel.displayName = "PersonaWithoutModel";

export const Persona: FC<PersonaProps> = memo(
  ({
    variant = "glint",
    state = "idle",
    onLoad,
    onLoadError,
    onReady,
    onPause,
    onPlay,
    onStop,
    className,
  }) => {
    const source = sources[variant];
    if (!source) throw new Error(`Invalid variant: ${variant}`);

    const callbacksRef = useRef({ onLoad, onLoadError, onReady, onPause, onPlay, onStop });
    callbacksRef.current = { onLoad, onLoadError, onReady, onPause, onPlay, onStop };

    const stableCallbacks = useMemo(
      () => ({
        onLoad: ((e) => callbacksRef.current.onLoad?.(e)) as RiveParameters["onLoad"],
        onLoadError: ((e) => callbacksRef.current.onLoadError?.(e)) as RiveParameters["onLoadError"],
        onReady: () => callbacksRef.current.onReady?.(),
        onPause: ((e) => callbacksRef.current.onPause?.(e)) as RiveParameters["onPause"],
        onPlay: ((e) => callbacksRef.current.onPlay?.(e)) as RiveParameters["onPlay"],
        onStop: ((e) => callbacksRef.current.onStop?.(e)) as RiveParameters["onStop"],
      }),
      [],
    );

    const { rive, RiveComponent } = useRive({
      src: source.source,
      stateMachines: stateMachine,
      autoplay: true,
      onLoad: stableCallbacks.onLoad,
      onLoadError: stableCallbacks.onLoadError,
      onRiveReady: stableCallbacks.onReady,
      onPause: stableCallbacks.onPause,
      onPlay: stableCallbacks.onPlay,
      onStop: stableCallbacks.onStop,
    });

    const listeningInput = useStateMachineInput(rive, stateMachine, "listening");
    const thinkingInput  = useStateMachineInput(rive, stateMachine, "thinking");
    const speakingInput  = useStateMachineInput(rive, stateMachine, "speaking");
    const asleepInput    = useStateMachineInput(rive, stateMachine, "asleep");

    useEffect(() => {
      if (listeningInput) listeningInput.value = state === "listening";
      if (thinkingInput)  thinkingInput.value  = state === "thinking";
      if (speakingInput)  speakingInput.value  = state === "speaking";
      if (asleepInput)    asleepInput.value    = state === "asleep";
    }, [state, listeningInput, thinkingInput, speakingInput, asleepInput]);

    const Component = source.hasModel ? PersonaWithModel : PersonaWithoutModel;

    return (
      <Component rive={rive} source={source}>
        <RiveComponent className={cn("size-16 shrink-0", className)} />
      </Component>
    );
  },
);
Persona.displayName = "Persona";
