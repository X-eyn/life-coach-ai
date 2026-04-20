'use client';

import { useEffect, useRef } from 'react';
import { SPEAKER_COLORS } from '@/lib/audio-utils';

const BAR_R = 1.5;
const MIN_H = 2;

function rrect(
  ctx: CanvasRenderingContext2D,
  x: number, y: number, w: number, h: number, r: number,
) {
  const sr = Math.min(r, w / 2, h / 2);
  ctx.beginPath();
  ctx.moveTo(x + sr, y);
  ctx.arcTo(x + w, y, x + w, y + h, sr);
  ctx.arcTo(x + w, y + h, x, y + h, sr);
  ctx.arcTo(x, y + h, x, y, sr);
  ctx.arcTo(x, y, x + w, y, sr);
  ctx.closePath();
}

export interface MiniWaveformSpeaker {
  id: number;
  wordCount: number;
}

interface Props {
  peaks: number[];
  speakers: MiniWaveformSpeaker[];
  width?: number;
  height?: number;
}

/**
 * Small canvas waveform thumbnail — same visual language as the main WaveformPlayer,
 * at 48×32px with ~30 amplitude bars colored by speaker proportions.
 */
export function MiniWaveform({ peaks, speakers, width = 48, height = 32 }: Props) {
  const canvasRef = useRef<HTMLCanvasElement>(null);

  useEffect(() => {
    const canvas = canvasRef.current;
    if (!canvas) return;

    const dpr = window.devicePixelRatio || 1;
    canvas.width = width * dpr;
    canvas.height = height * dpr;
    const ctx = canvas.getContext('2d');
    if (!ctx) return;
    ctx.scale(dpr, dpr);

    // Clear
    ctx.clearRect(0, 0, width, height);

    if (peaks.length === 0) {
      // Placeholder bars when no peaks yet
      const step = width / 20;
      const bw = Math.max(1, step * 0.62);
      ctx.fillStyle = SPEAKER_COLORS[0];
      ctx.globalAlpha = 0.15;
      for (let i = 0; i < 20; i++) {
        const amp = 0.1 + Math.abs(Math.sin(i * 0.5)) * 0.25;
        const bh = Math.max(MIN_H, amp * (height - 4));
        rrect(ctx, i * step, (height - bh) / 2, bw, bh, BAR_R);
        ctx.fill();
      }
      ctx.globalAlpha = 1;
      return;
    }

    const count = peaks.length;
    const totalWords = speakers.reduce((s, sp) => s + sp.wordCount, 0) || 1;

    // Map each bar to a speaker color by proportional word distribution
    const barColors: string[] = [];
    for (const sp of speakers) {
      const spBars = Math.round((sp.wordCount / totalWords) * count);
      const color = SPEAKER_COLORS[sp.id % SPEAKER_COLORS.length] ?? SPEAKER_COLORS[0];
      for (let j = 0; j < spBars; j++) barColors.push(color);
    }
    while (barColors.length < count) {
      barColors.push(barColors[barColors.length - 1] ?? SPEAKER_COLORS[0]);
    }

    const step = width / count;
    const barW = Math.max(1, step * 0.62);

    for (let i = 0; i < count; i++) {
      const x = i * step;
      const amp = Math.max(0.04, peaks[i] ?? 0.04);
      const bh = Math.max(MIN_H, amp * (height - 4));
      const y = (height - bh) / 2;
      ctx.fillStyle = barColors[i] ?? SPEAKER_COLORS[0];
      ctx.globalAlpha = 0.82;
      rrect(ctx, x, y, barW, bh, BAR_R);
      ctx.fill();
    }
    ctx.globalAlpha = 1;
  }, [peaks, speakers, width, height]);

  return (
    <canvas
      ref={canvasRef}
      className="shrink-0 rounded-[6px]"
      style={{ width, height, imageRendering: 'auto' }}
    />
  );
}
