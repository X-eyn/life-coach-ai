"use client";

import {
  useCallback,
  useEffect,
  useRef,
  type HTMLAttributes,
} from "react";
import { cn } from "@/lib/utils";

type LiveWaveformMode = "scrolling" | "static";
type FrequencyData = Uint8Array<ArrayBuffer>;

export interface LiveWaveformProps extends Omit<HTMLAttributes<HTMLDivElement>, "onError"> {
  active?: boolean;
  processing?: boolean;
  barWidth?: number;
  barHeight?: number;
  barGap?: number;
  barRadius?: number;
  barColor?: string;
  fadeEdges?: boolean;
  fadeWidth?: number;
  height?: string | number;
  sensitivity?: number;
  smoothingTimeConstant?: number;
  fftSize?: number;
  historySize?: number;
  updateRate?: number;
  mode?: LiveWaveformMode;
  onError?: (error: Error) => void;
  onStreamReady?: (stream: MediaStream) => void;
  onStreamEnd?: () => void;
}

const clamp = (value: number, min = 0, max = 1) => Math.min(max, Math.max(min, value));

function drawRoundedRect(
  ctx: CanvasRenderingContext2D,
  x: number,
  y: number,
  width: number,
  height: number,
  radius: number,
) {
  const safeRadius = Math.min(radius, width / 2, height / 2);
  ctx.beginPath();
  ctx.moveTo(x + safeRadius, y);
  ctx.arcTo(x + width, y, x + width, y + height, safeRadius);
  ctx.arcTo(x + width, y + height, x, y + height, safeRadius);
  ctx.arcTo(x, y + height, x, y, safeRadius);
  ctx.arcTo(x, y, x + width, y, safeRadius);
  ctx.closePath();
}

function resolveColor(element: HTMLElement | null, barColor?: string) {
  if (barColor) return barColor;
  if (!element) return "rgb(13, 18, 32)";
  return getComputedStyle(element).color || "rgb(13, 18, 32)";
}

function getBarCount(width: number, barWidth: number, barGap: number, mode: LiveWaveformMode, historySize: number) {
  const maxBars = Math.max(1, Math.floor((width + barGap) / (barWidth + barGap)));
  return mode === "scrolling" ? Math.min(maxBars, historySize) : maxBars;
}

function resampleValues(values: number[], targetCount: number) {
  if (targetCount <= 0) return [];
  if (!values.length) return Array.from({ length: targetCount }, () => 0);
  if (values.length === 1) return Array.from({ length: targetCount }, () => clamp(values[0] ?? 0));

  return Array.from({ length: targetCount }, (_, index) => {
    const position = (index / Math.max(targetCount - 1, 1)) * (values.length - 1);
    const lowerIndex = Math.floor(position);
    const upperIndex = Math.min(values.length - 1, Math.ceil(position));
    const blend = position - lowerIndex;
    const lower = values[lowerIndex] ?? 0;
    const upper = values[upperIndex] ?? 0;
    return clamp(lower + (upper - lower) * blend);
  });
}

function createSymmetricSamples(values: number[], count: number) {
  const half = resampleValues(values, Math.max(1, Math.ceil(count / 2)));
  const center = (count - 1) / 2;

  return Array.from({ length: count }, (_, index) => {
    const mirroredIndex = Math.min(half.length - 1, Math.round(Math.abs(index - center)));
    return half[mirroredIndex] ?? 0;
  });
}

function buildFrequencySamples(data: ArrayLike<number>, count: number, sensitivity: number) {
  if (count <= 0 || !data.length) return Array.from({ length: count }, () => 0);

  const segmentSize = data.length / count;
  return Array.from({ length: count }, (_, index) => {
    const start = Math.floor(index * segmentSize);
    const end = Math.max(start + 1, Math.floor((index + 1) * segmentSize));
    let total = 0;

    for (let cursor = start; cursor < end; cursor += 1) {
      total += data[cursor] ?? 0;
    }

    const average = total / Math.max(end - start, 1) / 255;
    return clamp(Math.pow(average * sensitivity, 0.88));
  });
}

function buildProcessingSamples(count: number, phase: number) {
  return Array.from({ length: count }, (_, index) => {
    const wave =
      Math.sin(phase * 2.4 + index * 0.34) * 0.34 +
      Math.cos(phase * 1.3 + index * 0.16) * 0.16;
    return clamp(0.24 + wave + (index % 5) * 0.015, 0.08, 1);
  });
}

function buildIdleSamples(count: number, phase: number) {
  return Array.from({ length: count }, (_, index) => {
    return clamp(0.07 + Math.abs(Math.sin(phase * 0.45 + index * 0.38)) * 0.07, 0.05, 0.18);
  });
}

function averageLevel(data: ArrayLike<number>, sensitivity: number) {
  if (!data.length) return 0;
  let total = 0;
  for (let index = 0; index < data.length; index += 1) {
    total += data[index] ?? 0;
  }
  return clamp((total / data.length / 255) * sensitivity);
}

export function LiveWaveform({
  active = false,
  processing = false,
  barWidth = 3,
  barHeight = 4,
  barGap = 1,
  barRadius = 1.5,
  barColor,
  fadeEdges = true,
  fadeWidth = 24,
  height = 64,
  sensitivity = 1,
  smoothingTimeConstant = 0.8,
  fftSize = 256,
  historySize = 60,
  updateRate = 30,
  mode = "static",
  onError,
  onStreamReady,
  onStreamEnd,
  className,
  style,
  ...props
}: LiveWaveformProps) {
  const containerRef = useRef<HTMLDivElement>(null);
  const canvasRef = useRef<HTMLCanvasElement>(null);
  const ctxRef = useRef<CanvasRenderingContext2D | null>(null);
  const rafRef = useRef<number>(0);
  const resizeObserverRef = useRef<ResizeObserver | null>(null);
  const audioContextRef = useRef<AudioContext | null>(null);
  const analyserRef = useRef<AnalyserNode | null>(null);
  const sourceRef = useRef<MediaStreamAudioSourceNode | null>(null);
  const streamRef = useRef<MediaStream | null>(null);
  const frequencyDataRef = useRef<FrequencyData | null>(null);
  const historyRef = useRef<number[]>([]);
  const targetSamplesRef = useRef<number[]>([]);
  const renderedSamplesRef = useRef<number[]>([]);
  const lastUpdateRef = useRef<number>(0);

  const stopStream = useCallback(
    (notify = true) => {
      sourceRef.current?.disconnect();
      sourceRef.current = null;

      analyserRef.current?.disconnect();
      analyserRef.current = null;

      const stream = streamRef.current;
      if (stream) {
        stream.getTracks().forEach((track) => track.stop());
        streamRef.current = null;
        if (notify) onStreamEnd?.();
      }

      frequencyDataRef.current = null;
      historyRef.current = [];

      const context = audioContextRef.current;
      audioContextRef.current = null;
      if (context) void context.close().catch(() => undefined);
    },
    [onStreamEnd],
  );

  useEffect(() => {
    const container = containerRef.current;
    const canvas = canvasRef.current;
    if (!container || !canvas) return;

    const resize = () => {
      const dpr = window.devicePixelRatio || 1;
      const width = container.clientWidth;
      const heightPx = container.clientHeight;

      canvas.width = Math.max(1, Math.floor(width * dpr));
      canvas.height = Math.max(1, Math.floor(heightPx * dpr));
      canvas.style.width = `${width}px`;
      canvas.style.height = `${heightPx}px`;

      // Cache the context — getContext() on every RAF frame is wasteful
      ctxRef.current = canvas.getContext("2d");
      if (ctxRef.current) {
        ctxRef.current.setTransform(1, 0, 0, 1, 0, 0);
        ctxRef.current.scale(dpr, dpr);
      }
    };

    resizeObserverRef.current = new ResizeObserver(resize);
    resizeObserverRef.current.observe(container);
    resize();

    return () => {
      resizeObserverRef.current?.disconnect();
      resizeObserverRef.current = null;
    };
  }, []);

  useEffect(() => {
    if (!active) {
      stopStream();
      return;
    }

    let cancelled = false;

    const startStream = async () => {
      try {
        if (!navigator.mediaDevices?.getUserMedia) {
          throw new Error("Microphone access is not supported in this browser.");
        }

        const stream = await navigator.mediaDevices.getUserMedia({ audio: true });
        if (cancelled) {
          stream.getTracks().forEach((track) => track.stop());
          return;
        }

        stopStream(false);

        const AudioContextCtor =
          window.AudioContext ??
          (window as Window & { webkitAudioContext?: typeof AudioContext }).webkitAudioContext;

        if (!AudioContextCtor) {
          throw new Error("Web Audio API is not available in this browser.");
        }

        const context = new AudioContextCtor();
        const analyser = context.createAnalyser();
        analyser.smoothingTimeConstant = clamp(smoothingTimeConstant, 0, 1);
        analyser.fftSize = Math.max(32, fftSize);

        const source = context.createMediaStreamSource(stream);
        source.connect(analyser);

        audioContextRef.current = context;
        analyserRef.current = analyser;
        sourceRef.current = source;
        streamRef.current = stream;
        frequencyDataRef.current = new Uint8Array(new ArrayBuffer(analyser.frequencyBinCount));
        historyRef.current = [];
        renderedSamplesRef.current = [];

        onStreamReady?.(stream);
      } catch (cause) {
        const error = cause instanceof Error ? cause : new Error("Failed to access microphone input.");
        stopStream(false);
        onError?.(error);
      }
    };

    void startStream();

    return () => {
      cancelled = true;
      stopStream();
    };
  }, [active, fftSize, onError, onStreamReady, smoothingTimeConstant, stopStream]);

  useEffect(() => {
    renderedSamplesRef.current = [];
    targetSamplesRef.current = [];
    historyRef.current = [];
    lastUpdateRef.current = 0;
  }, [active, processing, mode, historySize]);

  useEffect(() => {
    const draw = (timestamp: number) => {
      const container = containerRef.current;
      const canvas = canvasRef.current;
      // Use cached context — avoid per-frame getContext() lookup
      const ctx = ctxRef.current ?? canvas?.getContext("2d");

      if (!container || !canvas || !ctx) {
        rafRef.current = requestAnimationFrame(draw);
        return;
      }

      const width = container.clientWidth;
      const heightPx = container.clientHeight;
      const barCount = getBarCount(width, barWidth, barGap, mode, historySize);
      const shouldUpdate = timestamp - lastUpdateRef.current >= updateRate || lastUpdateRef.current === 0;
      const phase = timestamp / 1000;

      // Build new TARGET data on the throttled interval
      if (shouldUpdate) {
        let nextSamples: number[];

        if (active && analyserRef.current && frequencyDataRef.current) {
          analyserRef.current.getByteFrequencyData(frequencyDataRef.current);

          if (mode === "scrolling") {
            const level = averageLevel(frequencyDataRef.current, sensitivity);
            historyRef.current = [...historyRef.current, level].slice(-barCount);
            nextSamples = historyRef.current;
          } else {
            const grouped = buildFrequencySamples(
              frequencyDataRef.current,
              Math.max(1, Math.ceil(barCount / 2)),
              sensitivity,
            );
            nextSamples = createSymmetricSamples(grouped, barCount);
          }
        } else if (processing) {
          if (mode === "scrolling") {
            const level = clamp(
              0.38 + Math.sin(phase * 3.2) * 0.18 + Math.cos(phase * 1.8) * 0.12,
              0.1,
              1,
            );
            historyRef.current = [...historyRef.current, level].slice(-barCount);
            nextSamples = historyRef.current;
          } else {
            nextSamples = buildProcessingSamples(barCount, phase);
          }
        } else {
          if (mode === "scrolling") {
            const level = buildIdleSamples(1, phase)[0] ?? 0;
            historyRef.current = [...historyRef.current, level].slice(-barCount);
            nextSamples = historyRef.current;
          } else {
            nextSamples = buildIdleSamples(barCount, phase);
          }
        }

        // Snap to new length instantly; otherwise update target for smooth tracking
        if (targetSamplesRef.current.length !== nextSamples.length) {
          targetSamplesRef.current = nextSamples.slice();
          renderedSamplesRef.current = nextSamples.slice();
        } else {
          targetSamplesRef.current = nextSamples;
        }

        lastUpdateRef.current = timestamp;
      }

      // Interpolate EVERY frame toward the latest target — this is what makes it silky
      const targets = targetSamplesRef.current;
      const rendered = renderedSamplesRef.current;
      if (targets.length > 0 && rendered.length === targets.length) {
        renderedSamplesRef.current = rendered.map((s, i) =>
          s + ((targets[i] ?? 0) - s) * 0.13,
        );
      } else if (targets.length > 0 && rendered.length !== targets.length) {
        renderedSamplesRef.current = targets.slice();
      }

      const samples = renderedSamplesRef.current;
      const totalWidth = samples.length > 0 ? samples.length * barWidth + (samples.length - 1) * barGap : 0;
      const offsetX = mode === "scrolling"
        ? Math.max(0, width - totalWidth)
        : Math.max(0, (width - totalWidth) / 2);
      const color = resolveColor(container, barColor);

      ctx.clearRect(0, 0, width, heightPx);
      ctx.fillStyle = color;

      samples.forEach((sample, index) => {
        const normalized = clamp(sample);
        const currentHeight = Math.max(barHeight, normalized * Math.max(heightPx - 8, barHeight));
        const x = offsetX + index * (barWidth + barGap);
        const y = (heightPx - currentHeight) / 2;
        drawRoundedRect(ctx, x, y, barWidth, currentHeight, barRadius);
        ctx.globalAlpha = processing ? 0.86 : 0.94;
        ctx.fill();
      });

      ctx.globalAlpha = 1;
      rafRef.current = requestAnimationFrame(draw);
    };

    rafRef.current = requestAnimationFrame(draw);

    return () => cancelAnimationFrame(rafRef.current);
  }, [
    active,
    barColor,
    barGap,
    barHeight,
    barRadius,
    barWidth,
    historySize,
    mode,
    processing,
    sensitivity,
    updateRate,
  ]);

  useEffect(() => {
    return () => stopStream();
  }, [stopStream]);

  const resolvedHeight = typeof height === "number" ? `${height}px` : height;
  const fadeMask = fadeEdges
    ? `linear-gradient(to right, transparent 0, black ${fadeWidth}px, black calc(100% - ${fadeWidth}px), transparent 100%)`
    : undefined;

  return (
    <div
      ref={containerRef}
      className={cn("relative w-full overflow-hidden", className)}
      style={{
        height: resolvedHeight,
        maskImage: fadeMask,
        WebkitMaskImage: fadeMask,
        ...style,
      }}
      {...props}
    >
      <canvas ref={canvasRef} className="absolute inset-0" />
    </div>
  );
}
