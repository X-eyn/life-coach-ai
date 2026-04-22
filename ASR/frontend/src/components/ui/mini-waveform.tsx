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
  /** Full-resolution amplitude peaks (600 bars), parallel to fullBarSpeakers. */
  fullPeaks?: number[];
  /** Per-bar speaker index (600 values), computed with the same mapToBars logic as
   *  WaveformPlayer. When provided alongside fullPeaks, the thumbnail is a pixel-exact
   *  scaled-down copy of the main visualizer — same amplitudes, same speaker colors. */
  fullBarSpeakers?: number[];
  speakers: MiniWaveformSpeaker[];
  width?: number;
  height?: number;
}

/**
 * Small canvas waveform thumbnail — same visual language as the main WaveformPlayer,
 * at 48×32px with ~30 amplitude bars colored by speaker proportions.
 */
export function MiniWaveform({ peaks, fullPeaks, fullBarSpeakers, speakers, width = 48, height = 32 }: Props) {
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

    ctx.clearRect(0, 0, width, height);

    // When full 600-bar data is available, downsample to one bar per canvas pixel.
    // Use the same speaker index at the midpoint of each source window so the
    // coloring is a true scaled-down copy of the main WaveformPlayer.
    let renderPeaks: number[];
    let renderSpeakerIndices: number[] | null = null;

    if (fullPeaks && fullPeaks.length > 0) {
      const count = width;
      const ratio = fullPeaks.length / count;
      renderPeaks = Array.from({ length: count }, (_, i) => {
        const start = Math.floor(i * ratio);
        const end = Math.min(Math.floor((i + 1) * ratio), fullPeaks.length);
        let sum = 0;
        for (let j = start; j < end; j++) sum += fullPeaks[j] ?? 0;
        return sum / Math.max(1, end - start);
      });
      if (fullBarSpeakers && fullBarSpeakers.length === fullPeaks.length) {
        renderSpeakerIndices = Array.from({ length: count }, (_, i) => {
          // Use the speaker at the midpoint of this output bar's source window
          const mid = Math.min(Math.round(i * ratio + ratio / 2), fullBarSpeakers.length - 1);
          return fullBarSpeakers[mid] ?? 0;
        });
      }
    } else {
      renderPeaks = peaks;
    }

    if (renderPeaks.length === 0) {
      // Placeholder bars when no peak data exists yet
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

    const count = renderPeaks.length;

    // Build per-bar color array — prefer exact speaker-per-bar mapping when available,
    // fall back to proportional word-count distribution for old sessions.
    const barColors: string[] = [];
    if (renderSpeakerIndices) {
      for (const si of renderSpeakerIndices) {
        barColors.push(SPEAKER_COLORS[si % SPEAKER_COLORS.length] ?? SPEAKER_COLORS[0]);
      }
    } else {
      const totalWords = speakers.reduce((s, sp) => s + sp.wordCount, 0) || 1;
      for (const sp of speakers) {
        const spBars = Math.round((sp.wordCount / totalWords) * count);
        const color = SPEAKER_COLORS[sp.id % SPEAKER_COLORS.length] ?? SPEAKER_COLORS[0];
        for (let j = 0; j < spBars; j++) barColors.push(color);
      }
      while (barColors.length < count) {
        barColors.push(barColors[barColors.length - 1] ?? SPEAKER_COLORS[0]);
      }
    }

    const step = width / count;
    const barW = Math.max(1, step * 0.62);

    for (let i = 0; i < count; i++) {
      const x = i * step;
      const amp = Math.max(0.04, renderPeaks[i] ?? 0.04);
      const bh = Math.max(MIN_H, amp * (height - 4));
      const y = (height - bh) / 2;
      ctx.fillStyle = barColors[i] ?? SPEAKER_COLORS[0];
      ctx.globalAlpha = 0.82;
      rrect(ctx, x, y, barW, bh, BAR_R);
      ctx.fill();
    }
    ctx.globalAlpha = 1;
  }, [peaks, fullPeaks, fullBarSpeakers, speakers, width, height]);

  return (
    <canvas
      ref={canvasRef}
      className="shrink-0 rounded-[6px]"
      style={{ width, height, imageRendering: 'auto' }}
    />
  );
}
