'use client';

import { useEffect, useRef, useCallback } from 'react';
import { cn } from '@/lib/utils';

export type VisualizerState = 'idle' | 'uploading' | 'processing' | 'done' | 'error';

interface WaveVisualizerProps {
  state: VisualizerState;
  color?: string;
  lineWidth?: number;
  className?: string;
}

interface Layer {
  amplitude: number;
  frequency: number;
  speed: number;
  phase: number;
  opacity: number;
  fill: boolean;
}

const makeLayers = (): Layer[] => [
  { amplitude: 0.42, frequency: 1.6, speed: 0.90, phase: 0.0, opacity: 1.00, fill: true  },
  { amplitude: 0.22, frequency: 3.1, speed: 1.55, phase: 1.8, opacity: 0.40, fill: false },
  { amplitude: 0.13, frequency: 5.4, speed: 2.30, phase: 3.2, opacity: 0.18, fill: false },
];

export function WaveVisualizer({
  state,
  color = '#d4a574',
  lineWidth = 2,
  className,
}: WaveVisualizerProps) {
  const containerRef = useRef<HTMLDivElement>(null);
  const canvasRef    = useRef<HTMLCanvasElement>(null);
  const rafRef       = useRef<number>(0);
  const timeRef      = useRef<number>(0);
  const envRef       = useRef<number>(0.08);
  const layersRef    = useRef<Layer[]>(makeLayers());

  const isActive = state === 'uploading' || state === 'processing';

  const hexToRgb = useCallback((hex: string) => {
    const n = parseInt(hex.replace('#', ''), 16);
    return { r: (n >> 16) & 255, g: (n >> 8) & 255, b: n & 255 };
  }, []);

  useEffect(() => {
    const container = containerRef.current;
    const canvas    = canvasRef.current;
    if (!container || !canvas) return;
    const resize = () => {
      const dpr = window.devicePixelRatio || 1;
      const w   = container.clientWidth;
      const h   = container.clientHeight;
      canvas.width  = w * dpr;
      canvas.height = h * dpr;
      canvas.style.width  = `${w}px`;
      canvas.style.height = `${h}px`;
      const ctx = canvas.getContext('2d');
      if (ctx) { ctx.setTransform(1, 0, 0, 1, 0, 0); ctx.scale(dpr, dpr); }
    };
    const ro = new ResizeObserver(resize);
    ro.observe(container);
    resize();
    return () => ro.disconnect();
  }, []);

  useEffect(() => {
    const canvas = canvasRef.current;
    if (!canvas) return;
    const ctx = canvas.getContext('2d');
    if (!ctx) return;
    const { r, g, b } = hexToRgb(color);

    const draw = (ts: number) => {
      const dt = Math.min((ts - timeRef.current) / 1000, 0.05);
      timeRef.current = ts;
      const targetEnv = isActive ? 1 : 0.12;
      envRef.current += (targetEnv - envRef.current) * (isActive ? 1.8 : 0.7) * dt;
      const env = envRef.current;
      const dpr = window.devicePixelRatio || 1;
      const W   = canvas.width  / dpr;
      const H   = canvas.height / dpr;
      const mid = H / 2;
      ctx.clearRect(0, 0, W, H);
      layersRef.current.forEach((layer) => {
        layer.phase += layer.speed * dt;
        const amp = mid * 0.78 * layer.amplitude * env;
        const pts: [number, number][] = [];
        for (let x = 0; x <= W; x++) {
          pts.push([x, mid + Math.sin((x / W) * layer.frequency * Math.PI * 2 + layer.phase) * amp]);
        }
        if (layer.fill) {
          const grad = ctx.createLinearGradient(0, mid - amp, 0, H);
          grad.addColorStop(0,   `rgba(${r},${g},${b},${0.18 * env})`);
          grad.addColorStop(0.6, `rgba(${r},${g},${b},${0.04 * env})`);
          grad.addColorStop(1,   `rgba(${r},${g},${b},0)`);
          ctx.beginPath();
          pts.forEach(([px, py], i) => (i === 0 ? ctx.moveTo(px, py) : ctx.lineTo(px, py)));
          ctx.lineTo(W, H); ctx.lineTo(0, H); ctx.closePath();
          ctx.fillStyle = grad;
          ctx.fill();
        }
        ctx.beginPath();
        ctx.lineWidth   = lineWidth;
        ctx.strokeStyle = `rgba(${r},${g},${b},${layer.opacity * Math.max(env, 0.12)})`;
        if (layer.fill && isActive) { ctx.shadowColor = color; ctx.shadowBlur = 18 * env; }
        pts.forEach(([px, py], i) => (i === 0 ? ctx.moveTo(px, py) : ctx.lineTo(px, py)));
        ctx.stroke();
        ctx.shadowBlur = 0;
      });
      rafRef.current = requestAnimationFrame(draw);
    };
    timeRef.current = performance.now();
    rafRef.current  = requestAnimationFrame(draw);
    return () => cancelAnimationFrame(rafRef.current);
  }, [isActive, color, lineWidth, hexToRgb]);

  return (
    <div ref={containerRef} className={cn('relative w-full h-full', className)}>
      <canvas ref={canvasRef} className="absolute inset-0" />
    </div>
  );
}
