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
  randomOffset: number;
  randomFreqModulator: number;
  randomSpeedVariation: number;
}

const makeLayers = (): Layer[] => {
  const layers: Layer[] = [];
  const layerCount = 9;
  
  for (let i = 0; i < layerCount; i++) {
    layers.push({
      amplitude: 0.1 + Math.random() * 0.5,
      frequency: 0.5 + Math.random() * 7.5,
      speed: 0.3 + Math.random() * 3.5,
      phase: Math.random() * Math.PI * 2,
      opacity: 0.2 + Math.random() * 0.8,
      fill: i === 0,
      randomOffset: Math.random(),
      randomFreqModulator: Math.random(),
      randomSpeedVariation: Math.random(),
    });
  }
  
  return layers;
};

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
      
      layersRef.current.forEach((layer, layerIndex) => {
        layer.phase += layer.speed * dt;
        
        // Add random variations that change every frame
        const frameRandom = Math.sin(ts * 0.001 + layerIndex * 10.5) * 0.5 + 0.5;
        const ampRandom = Math.sin(ts * 0.0008 + layerIndex * 7.3) * 0.5 + 0.5;
        const freqRandom = Math.sin(ts * 0.0012 + layerIndex * 13.7) * 0.5 + 0.5;
        const phaseJitter = Math.sin(ts * 0.0015 + layerIndex * 5.1) * Math.PI;
        
        // Dramatically vary amplitude
        const baseAmp = mid * 0.78 * layer.amplitude * env;
        const amp = baseAmp * (0.5 + ampRandom * 1.0);
        
        // Vary frequency significantly
        const baseFreq = layer.frequency * (0.6 + freqRandom * 1.8);
        
        const pts: [number, number][] = [];
        
        for (let x = 0; x <= W; x++) {
          // Main wave with jittered phase
          const mainWave = Math.sin((x / W) * baseFreq * Math.PI * 2 + layer.phase + phaseJitter) * amp;
          
          // Add varying harmonics
          const harm1Strength = Math.sin(ts * 0.0006 + x * 0.001 + layerIndex) * 0.3 + 0.2;
          const harmonic1 = Math.sin((x / W) * baseFreq * 0.3 * Math.PI * 2 + layer.phase * 0.5) * amp * harm1Strength;
          
          const harm2Strength = Math.sin(ts * 0.0009 + x * 0.002 + layerIndex * 2) * 0.3 + 0.2;
          const harmonic2 = Math.sin((x / W) * baseFreq * 2.1 * Math.PI * 2 + layer.phase * 1.5) * amp * harm2Strength;
          
          const harm3Strength = Math.sin(ts * 0.0007 + x * 0.003 + layerIndex * 3) * 0.2 + 0.1;
          const harmonic3 = Math.sin((x / W) * baseFreq * 0.7 * Math.PI * 2 + layer.phase * 0.3) * amp * harm3Strength;
          
          // Random noise that varies by position and time
          const randomNoise = (Math.sin(x * Math.PI + ts * 0.002 + layerIndex * 100) * 0.5 + Math.cos(x + ts * 0.003 + layerIndex * 50) * 0.5) * amp * 0.2;
          
          const yValue = mid + mainWave + harmonic1 + harmonic2 + harmonic3 + randomNoise;
          pts.push([x, yValue]);
        }
        
        if (layer.fill) {
          const grad = ctx.createLinearGradient(0, mid - amp * 1.5, 0, H);
          grad.addColorStop(0,   `rgba(${r},${g},${b},${0.2 * env * (0.5 + frameRandom)})`);
          grad.addColorStop(0.5, `rgba(${r},${g},${b},${0.05 * env})`);
          grad.addColorStop(1,   `rgba(${r},${g},${b},0)`);
          ctx.beginPath();
          pts.forEach(([px, py], i) => (i === 0 ? ctx.moveTo(px, py) : ctx.lineTo(px, py)));
          ctx.lineTo(W, H); ctx.lineTo(0, H); ctx.closePath();
          ctx.fillStyle = grad;
          ctx.fill();
        }
        
        ctx.beginPath();
        ctx.lineWidth   = lineWidth * (0.6 + frameRandom * 0.8);
        ctx.strokeStyle = `rgba(${r},${g},${b},${layer.opacity * Math.max(env, 0.12) * (0.7 + ampRandom * 0.6)})`;
        if (layer.fill && isActive) { 
          ctx.shadowColor = color; 
          ctx.shadowBlur = 8 + 24 * env * (0.5 + frameRandom); 
        }
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
