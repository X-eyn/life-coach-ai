'use client';

import { useEffect, useRef, useCallback } from 'react';
import { cn } from '@/lib/utils';

export type VisualizerState = 'idle' | 'uploading' | 'processing' | 'done' | 'error';

interface WaveVisualizerProps {
  state: VisualizerState;
  color?: string;
  lineWidth?: number;
  className?: string;
  size?: 'sm' | 'md' | 'lg' | 'xl';
}

const SIZE_MAP = {
  sm: 120,
  md: 200,
  lg: 280,
  xl: 360,
};

// Multiple layered sine waves for richness
interface WaveLayer {
  amplitude: number;
  frequency: number;
  speed: number;
  phase: number;
  opacity: number;
}

const ACTIVE_LAYERS: WaveLayer[] = [
  { amplitude: 0.32, frequency: 1.4, speed: 1.8, phase: 0,    opacity: 1.0 },
  { amplitude: 0.18, frequency: 2.6, speed: 2.4, phase: 1.1,  opacity: 0.5 },
  { amplitude: 0.10, frequency: 3.8, speed: 3.1, phase: 2.3,  opacity: 0.3 },
];

const IDLE_LAYERS: WaveLayer[] = [
  { amplitude: 0.025, frequency: 1.0, speed: 0.4, phase: 0,   opacity: 0.45 },
];

export function WaveVisualizer({
  state,
  color = '#FA954C',
  lineWidth = 2,
  className,
  size = 'xl',
}: WaveVisualizerProps) {
  const canvasRef = useRef<HTMLCanvasElement>(null);
  const rafRef    = useRef<number>(0);
  const timeRef   = useRef<number>(0);
  // amplitude envelope: 0 = flat, 1 = full
  const envRef    = useRef<number>(0);

  const isActive = state === 'uploading' || state === 'processing';

  const hexToRgb = useCallback((hex: string) => {
    const clean = hex.replace('#', '');
    const bigint = parseInt(clean, 16);
    return {
      r: (bigint >> 16) & 255,
      g: (bigint >> 8)  & 255,
      b: bigint         & 255,
    };
  }, []);

  useEffect(() => {
    const canvas = canvasRef.current;
    if (!canvas) return;
    const ctx = canvas.getContext('2d');
    if (!ctx) return;

    const rgb = hexToRgb(color);

    const draw = (timestamp: number) => {
      const dt = Math.min((timestamp - timeRef.current) / 1000, 0.05);
      timeRef.current = timestamp;

      // Smooth envelope towards target
      const targetEnv = isActive ? 1 : 0;
      const speed = isActive ? 1.6 : 0.8;
      envRef.current += (targetEnv - envRef.current) * speed * dt;

      const W = canvas.width;
      const H = canvas.height;
      const mid = H / 2;

      ctx.clearRect(0, 0, W, H);

      const layers = isActive || envRef.current > 0.01 ? ACTIVE_LAYERS : IDLE_LAYERS;

      layers.forEach((layer) => {
        layer.phase += layer.speed * dt;

        const amp = mid * layer.amplitude * envRef.current;

        // When almost idle, show a barely visible breath line
        const effectiveAmp = amp + mid * 0.018;

        ctx.beginPath();
        ctx.lineWidth = lineWidth;
        ctx.strokeStyle = `rgba(${rgb.r},${rgb.g},${rgb.b},${layer.opacity * (0.15 + 0.85 * envRef.current)})`;
        ctx.shadowColor = color;
        ctx.shadowBlur  = isActive ? 8 * envRef.current : 0;

        const steps = W;
        for (let x = 0; x <= steps; x++) {
          const t = x / W;
          const y = mid + Math.sin(t * layer.frequency * Math.PI * 2 + layer.phase) * effectiveAmp;
          x === 0 ? ctx.moveTo(x, y) : ctx.lineTo(x, y);
        }
        ctx.stroke();
        ctx.shadowBlur = 0;
      });

      // Flat centre reference line (very subtle)
      ctx.beginPath();
      ctx.strokeStyle = `rgba(${rgb.r},${rgb.g},${rgb.b},0.08)`;
      ctx.lineWidth = 1;
      ctx.moveTo(0, mid);
      ctx.lineTo(W, mid);
      ctx.stroke();

      rafRef.current = requestAnimationFrame(draw);
    };

    timeRef.current = performance.now();
    rafRef.current = requestAnimationFrame(draw);

    return () => cancelAnimationFrame(rafRef.current);
  }, [isActive, color, lineWidth, hexToRgb]);

  // Handle HiDPI / canvas sizing
  const canvasSize = SIZE_MAP[size];

  useEffect(() => {
    const canvas = canvasRef.current;
    if (!canvas) return;
    const dpr = window.devicePixelRatio || 1;
    canvas.width  = canvasSize * dpr;
    canvas.height = (canvasSize / 3) * dpr;
    canvas.style.width  = `${canvasSize}px`;
    canvas.style.height = `${canvasSize / 3}px`;
    const ctx = canvas.getContext('2d');
    if (ctx) ctx.scale(dpr, dpr);
  }, [canvasSize]);

  // State label
  const label: Record<VisualizerState, string> = {
    idle:       '',
    uploading:  'Uploading…',
    processing: 'Transcribing…',
    done:       '',
    error:      '',
  };

  return (
    <div className={cn('flex flex-col items-center gap-3', className)}>
      <canvas ref={canvasRef} className="block" />
      {label[state] && (
        <span
          key={state}
          className="text-xs font-medium tracking-widest uppercase animate-pulse2"
          style={{ color }}
        >
          {label[state]}
        </span>
      )}
    </div>
  );
}
