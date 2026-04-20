'use client';

import { useEffect, useRef, useState, useCallback, useMemo } from 'react';
import { Play, Pause } from 'lucide-react';
import { cn } from '@/lib/utils';
import { SPEAKER_COLORS, decodeWaveformPeaks } from '@/lib/audio-utils';

// ── Constants ─────────────────────────────────────────────────────────────────

const BAR_W = 3;
const BAR_GAP = 2;
const BAR_R = 2;
const MIN_BAR_H = 3;
const DECODE_BAR_COUNT = 600;

// ── Types ──────────────────────────────────────────────────────────────────────

export interface WaveformTurn {
  speaker: string;
  speakerIndex: number;
  wordCount: number;
}

interface BarData {
  amplitude: number;
  speakerIndex: number;
}

export interface WaveformPlayerProps {
  file?: File | null;
  turns?: WaveformTurn[];
  duration?: number | null;
  className?: string;
  /** Pass a mutable ref — WaveformPlayer will populate `seekRef.current` with a `seekTo` handle. */
  seekRef?: { current: { seekTo: (seconds: number) => void } | null };
}

// ── Helpers ────────────────────────────────────────────────────────────────────

function fmtTime(seconds: number): string {
  if (!seconds || isNaN(seconds) || !isFinite(seconds)) return '0:00';
  const m = Math.floor(seconds / 60);
  const s = Math.floor(seconds % 60);
  return `${m}:${s.toString().padStart(2, '0')}`;
}

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

// decodeAmplitude delegates to the shared decodeWaveformPeaks from audio-utils.
// Kept as a local alias so the rest of the component code is unchanged.
const decodeAmplitude = decodeWaveformPeaks;

function mapToBars(amplitudes: number[], turns: WaveformTurn[]): BarData[] {
  const totalWords = turns.reduce((s, t) => s + t.wordCount, 0) || 1;
  let cum = 0;
  const segs = turns.map((t) => {
    const start = cum / totalWords;
    cum += t.wordCount;
    return { start, end: cum / totalWords, speakerIndex: t.speakerIndex };
  });
  return amplitudes.map((amplitude, i) => {
    const pos = i / amplitudes.length;
    const seg =
      segs.find((s) => pos >= s.start && pos < s.end) ?? segs[segs.length - 1];
    return { amplitude, speakerIndex: seg?.speakerIndex ?? 0 };
  });
}

// ── Component ──────────────────────────────────────────────────────────────────

export function WaveformPlayer({ file, turns = [], duration, className, seekRef }: WaveformPlayerProps) {
  const containerRef = useRef<HTMLDivElement>(null);
  const canvasRef = useRef<HTMLCanvasElement>(null);
  const audioRef = useRef<HTMLAudioElement | null>(null);
  const audioUrlRef = useRef<string | null>(null);
  const rafRef = useRef<number>(0);
  const isDirtyRef = useRef(true);

  // Refs for lock-free drawing (avoid stale closures in the RAF loop)
  const barsRef = useRef<BarData[]>([]);
  const turnsRef = useRef<WaveformTurn[]>(turns);
  const currentTimeRef = useRef(0);
  const durationRef = useRef(duration ?? 0);
  const canvasSizeRef = useRef({ w: 0, h: 0 });

  // React state — only for UI labels, not the hot draw path
  const [bars, setBars] = useState<BarData[]>([]);
  const [isDecoding, setIsDecoding] = useState(false);
  const [isPlaying, setIsPlaying] = useState(false);
  const [currentTime, setCurrentTime] = useState(0);
  const [audioDuration, setAudioDuration] = useState(duration ?? 0);
  const [hoverInfo, setHoverInfo] = useState<{ x: number; time: number; speakerIndex: number } | null>(null);

  // Keep refs in sync
  useEffect(() => { barsRef.current = bars; isDirtyRef.current = true; }, [bars]);
  useEffect(() => { turnsRef.current = turns; isDirtyRef.current = true; }, [turns]);
  useEffect(() => { currentTimeRef.current = currentTime; isDirtyRef.current = true; }, [currentTime]);
  useEffect(() => { durationRef.current = audioDuration; isDirtyRef.current = true; }, [audioDuration]);

  // ── Decode audio amplitude ────────────────────────────────────────────────

  useEffect(() => {
    if (!file) {
      setBars([]);
      barsRef.current = [];
      isDirtyRef.current = true;
      return;
    }
    setIsDecoding(true);
    decodeAmplitude(file, DECODE_BAR_COUNT)
      .then((amps) => {
        const barData =
          turns.length > 0
            ? mapToBars(amps, turns)
            : amps.map((a) => ({ amplitude: a, speakerIndex: 0 }));
        setBars(barData);
      })
      .finally(() => setIsDecoding(false));
  // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [file]);

  // Re-map colors when turns change (after decode)
  useEffect(() => {
    if (barsRef.current.length === 0 || turns.length === 0) return;
    const totalWords = turns.reduce((s, t) => s + t.wordCount, 0) || 1;
    let cum = 0;
    const segs = turns.map((t) => {
      const start = cum / totalWords;
      cum += t.wordCount;
      return { start, end: cum / totalWords, speakerIndex: t.speakerIndex };
    });
    setBars((prev) =>
      prev.map((bar, i) => {
        const pos = i / prev.length;
        const seg = segs.find((s) => pos >= s.start && pos < s.end) ?? segs[segs.length - 1];
        return { ...bar, speakerIndex: seg?.speakerIndex ?? 0 };
      }),
    );
  // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [turns]);

  // ── Audio element ─────────────────────────────────────────────────────────

  useEffect(() => {
    audioRef.current?.pause();
    audioRef.current = null;
    if (audioUrlRef.current) {
      URL.revokeObjectURL(audioUrlRef.current);
      audioUrlRef.current = null;
    }
    setIsPlaying(false);
    setCurrentTime(0);
    currentTimeRef.current = 0;

    if (!file) return;

    const url = URL.createObjectURL(file);
    audioUrlRef.current = url;
    const audio = new Audio(url);
    audioRef.current = audio;

    const onTime = () => {
      currentTimeRef.current = audio.currentTime;
      setCurrentTime(audio.currentTime);
      isDirtyRef.current = true;
    };
    const onMeta = () => {
      setAudioDuration(audio.duration);
      durationRef.current = audio.duration;
    };
    const onEnded = () => setIsPlaying(false);
    const onPlay = () => setIsPlaying(true);
    const onPause = () => setIsPlaying(false);

    audio.addEventListener('timeupdate', onTime);
    audio.addEventListener('loadedmetadata', onMeta);
    audio.addEventListener('ended', onEnded);
    audio.addEventListener('play', onPlay);
    audio.addEventListener('pause', onPause);

    return () => {
      audio.pause();
      audio.removeEventListener('timeupdate', onTime);
      audio.removeEventListener('loadedmetadata', onMeta);
      audio.removeEventListener('ended', onEnded);
      audio.removeEventListener('play', onPlay);
      audio.removeEventListener('pause', onPause);
      URL.revokeObjectURL(url);
    };
  }, [file]);

  // Sync duration from props when no file is present
  useEffect(() => {
    if (!file && duration) {
      setAudioDuration(duration);
      durationRef.current = duration;
    }
  }, [file, duration]);

  // ── Canvas resize ─────────────────────────────────────────────────────────

  useEffect(() => {
    const container = containerRef.current;
    const canvas = canvasRef.current;
    if (!container || !canvas) return;

    const ro = new ResizeObserver(() => {
      const dpr = window.devicePixelRatio || 1;
      const w = container.clientWidth;
      const h = container.clientHeight;
      canvas.width = Math.max(1, Math.round(w * dpr));
      canvas.height = Math.max(1, Math.round(h * dpr));
      canvas.style.width = `${w}px`;
      canvas.style.height = `${h}px`;
      canvasSizeRef.current = { w, h };
      isDirtyRef.current = true;
    });
    ro.observe(container);
    return () => ro.disconnect();
  }, []);

  // ── Draw ───────────────────────────────────────────────────────────────────

  const drawFrame = useCallback(() => {
    const canvas = canvasRef.current;
    if (!canvas) return;
    const ctx = canvas.getContext('2d');
    if (!ctx) return;

    const dpr = window.devicePixelRatio || 1;
    const { w: W, h: H } = canvasSizeRef.current;
    if (!W || !H) return;

    ctx.setTransform(dpr, 0, 0, dpr, 0, 0);
    ctx.clearRect(0, 0, W, H);

    const bars = barsRef.current;
    const turns = turnsRef.current;
    const dur = durationRef.current;
    const time = currentTimeRef.current;
    const progress = dur > 0 ? time / dur : 0;
    const playheadX = progress * W;

    if (bars.length === 0) {
      // Idle placeholder — uniform bars scaled to canvas width
      const idleCount = 120;
      const idleStep = W / idleCount;
      const idleBarW = Math.max(1, idleStep * 0.68);
      ctx.fillStyle = 'rgba(207, 90, 67, 0.16)';
      for (let i = 0; i < idleCount; i++) {
        const amp = 0.08 + Math.abs(Math.sin(i * 0.35 + 1.2)) * 0.13;
        const bh = Math.max(MIN_BAR_H, amp * H);
        const x = i * idleStep;
        const y = (H - bh) / 2;
        rrect(ctx, x, y, idleBarW, bh, BAR_R);
        ctx.fill();
      }
      return;
    }

    // Scale all decoded bars to fill the full canvas width proportionally.
    // This ensures the waveform spans the entire surface regardless of count.
    const step = W / bars.length;
    const barW = Math.max(1, step * 0.68);

    // Draw bars — full saturation; played portion slightly brighter
    bars.forEach((bar, i) => {
      const x = i * step;
      const amp = Math.max(0.04, bar.amplitude);
      const bh = Math.max(MIN_BAR_H, amp * (H - 8));
      const y = (H - bh) / 2;
      const color = SPEAKER_COLORS[bar.speakerIndex % SPEAKER_COLORS.length] ?? SPEAKER_COLORS[0];
      ctx.fillStyle = color;
      ctx.globalAlpha = x + barW < playheadX ? 0.95 : 0.82;
      rrect(ctx, x, y, barW, bh, BAR_R);
      ctx.fill();
    });
    ctx.globalAlpha = 1;

    // Turn boundary tick marks — positions scaled to full canvas width
    if (turns.length > 1) {
      const totalWords = turns.reduce((s, t) => s + t.wordCount, 0) || 1;
      let cum = 0;
      for (let i = 0; i < turns.length - 1; i++) {
        cum += turns[i].wordCount;
        const mx = (cum / totalWords) * W;
        ctx.strokeStyle = 'rgba(13,18,32,0.14)';
        ctx.lineWidth = 1;
        ctx.beginPath();
        ctx.moveTo(mx + 0.5, H * 0.12);
        ctx.lineTo(mx + 0.5, H * 0.88);
        ctx.stroke();
      }
    }

    // Playhead — gradient glow + crisp line; px = progress * W (full-width)
    if (progress > 0.001 && progress < 0.999) {
      const px = playheadX;
      const grad = ctx.createLinearGradient(px - 10, 0, px + 10, 0);
      grad.addColorStop(0, 'rgba(255,255,255,0)');
      grad.addColorStop(0.5, 'rgba(255,255,255,0.85)');
      grad.addColorStop(1, 'rgba(255,255,255,0)');
      ctx.fillStyle = grad;
      ctx.fillRect(px - 10, 0, 20, H);
      ctx.fillStyle = 'rgba(255,255,255,0.9)';
      ctx.fillRect(px - 0.75, 2, 1.5, H - 4);
    }
  }, []);

  // RAF loop — only repaints when isDirty
  useEffect(() => {
    const loop = () => {
      if (isDirtyRef.current) {
        drawFrame();
        isDirtyRef.current = false;
      }
      rafRef.current = requestAnimationFrame(loop);
    };
    rafRef.current = requestAnimationFrame(loop);
    return () => cancelAnimationFrame(rafRef.current);
  }, [drawFrame]);

  // Smooth playhead during playback via interval
  useEffect(() => {
    if (!isPlaying) return;
    const id = setInterval(() => {
      if (audioRef.current) {
        const t = audioRef.current.currentTime;
        currentTimeRef.current = t;
        setCurrentTime(t);
        isDirtyRef.current = true;
      }
    }, 25);
    return () => clearInterval(id);
  }, [isPlaying]);

  // ── Interaction ────────────────────────────────────────────────────────────

  const togglePlay = useCallback(() => {
    const audio = audioRef.current;
    if (!audio) return;
    if (isPlaying) audio.pause();
    else audio.play().catch(() => {});
  }, [isPlaying]);

  const handleClick = useCallback((e: React.MouseEvent<HTMLDivElement>) => {
    const audio = audioRef.current;
    if (!audio || durationRef.current <= 0) return;
    const rect = e.currentTarget.getBoundingClientRect();
    const pct = (e.clientX - rect.left) / rect.width;
    const newTime = Math.max(0, Math.min(durationRef.current, pct * durationRef.current));
    audio.currentTime = newTime;
    currentTimeRef.current = newTime;
    setCurrentTime(newTime);
    isDirtyRef.current = true;
  }, []);

  const handleMouseMove = useCallback(
    (e: React.MouseEvent<HTMLDivElement>) => {
      const rect = e.currentTarget.getBoundingClientRect();
      const x = e.clientX - rect.left;
      const pct = Math.max(0, Math.min(1, x / rect.width));
      const time = pct * (durationRef.current || 0);
      const barIndex = Math.floor(pct * barsRef.current.length);
      const bar =
        barsRef.current[Math.max(0, Math.min(barsRef.current.length - 1, barIndex))];
      setHoverInfo({ x, time, speakerIndex: bar?.speakerIndex ?? 0 });
    },
    [],
  );

  // Keyboard shortcuts — space / ← →
  useEffect(() => {
    const handler = (e: KeyboardEvent) => {
      const audio = audioRef.current;
      if (!audio) return;
      if (
        e.target instanceof HTMLInputElement ||
        e.target instanceof HTMLTextAreaElement
      )
        return;
      if (e.code === 'Space') {
        e.preventDefault();
        if (isPlaying) audio.pause();
        else audio.play().catch(() => {});
      } else if (e.code === 'ArrowLeft') {
        e.preventDefault();
        const t = Math.max(0, audio.currentTime - 5);
        audio.currentTime = t;
        currentTimeRef.current = t;
        setCurrentTime(t);
        isDirtyRef.current = true;
      } else if (e.code === 'ArrowRight') {
        e.preventDefault();
        const t = Math.min(durationRef.current, audio.currentTime + 5);
        audio.currentTime = t;
        currentTimeRef.current = t;
        setCurrentTime(t);
        isDirtyRef.current = true;
      }
    };
    window.addEventListener('keydown', handler);
    return () => window.removeEventListener('keydown', handler);
  }, [isPlaying]);

  // Expose seekTo via seekRef prop so the parent can seek without forwardRef
  useEffect(() => {
    if (!seekRef) return;
    seekRef.current = {
      seekTo(seconds: number) {
        const audio = audioRef.current;
        if (!audio) return;
        const t = Math.max(0, Math.min(durationRef.current, seconds));
        audio.currentTime = t;
        currentTimeRef.current = t;
        setCurrentTime(t);
        isDirtyRef.current = true;
      },
    };
    return () => { if (seekRef) seekRef.current = null; };
  }, [seekRef]);

  // Silence zone detection — label long quiet stretches (≥30 s) in the waveform
  const silenceZones = useMemo(() => {
    if (!bars.length || !audioDuration || audioDuration < 60) return [];
    const THRESHOLD = 0.08;       // amplitude below this counts as silence
    const MIN_SILENCE_SEC = 30;   // minimum run length to show a label
    const secPerBar = audioDuration / bars.length;
    const zones: { startPct: number; endPct: number; durationSec: number }[] = [];
    let silenceStart = -1;
    for (let i = 0; i <= bars.length; i++) {
      const isSilent = i < bars.length && bars[i].amplitude < THRESHOLD;
      if (isSilent && silenceStart === -1) {
        silenceStart = i;
      } else if (!isSilent && silenceStart !== -1) {
        const durationSec = (i - silenceStart) * secPerBar;
        if (durationSec >= MIN_SILENCE_SEC) {
          zones.push({ startPct: silenceStart / bars.length, endPct: i / bars.length, durationSec });
        }
        silenceStart = -1;
      }
    }
    return zones;
  }, [bars, audioDuration]);

  // ── Derived display values ─────────────────────────────────────────────────

  // Unique speakers for the legend
  const speakerLegend = (() => {
    const map = new Map<number, string>();
    for (const t of turns) {
      if (!map.has(t.speakerIndex)) map.set(t.speakerIndex, t.speaker);
    }
    return [...map.entries()].map(([idx, speaker]) => ({ idx, speaker }));
  })();

  // Merged consecutive same-speaker segments for the color strip
  const colorStrip = (() => {
    if (turns.length === 0) return [];
    const merged: { speakerIndex: number; words: number }[] = [];
    for (const t of turns) {
      const last = merged[merged.length - 1];
      if (last && last.speakerIndex === t.speakerIndex) {
        last.words += t.wordCount;
      } else {
        merged.push({ speakerIndex: t.speakerIndex, words: t.wordCount });
      }
    }
    const total = merged.reduce((s, m) => s + m.words, 0) || 1;
    return merged.map((m) => ({ ...m, pct: (m.words / total) * 100 }));
  })();

  const hoveredSpeaker =
    hoverInfo !== null
      ? turns.find((t) => t.speakerIndex === hoverInfo.speakerIndex)?.speaker ?? null
      : null;

  // ── Render ─────────────────────────────────────────────────────────────────

  return (
    <div className={cn('flex flex-col gap-2', className)}>

      {/* Speaker legend */}
      {speakerLegend.length > 1 && (
        <div className="flex items-center gap-3 px-0.5">
          {speakerLegend.map(({ idx, speaker }) => (
            <div key={idx} className="flex items-center gap-1.5">
              <span
                className="h-2 w-2 shrink-0 rounded-full"
                style={{ background: SPEAKER_COLORS[idx % SPEAKER_COLORS.length] }}
              />
              <span className="text-[11px] font-medium text-[rgba(var(--atelier-ink-rgb),0.6)]">
                {speaker}
              </span>
            </div>
          ))}
        </div>
      )}

      {/* Speaker color distribution strip — only for multi-speaker audio */}
      {colorStrip.length > 1 && (
        <div className="flex h-[2px] w-full overflow-hidden rounded-full gap-[1px] opacity-50">
          {colorStrip.map((seg, i) => (
            <div
              key={i}
              className="h-full rounded-[2px]"
              style={{
                width: `${seg.pct}%`,
                background: SPEAKER_COLORS[seg.speakerIndex % SPEAKER_COLORS.length],
                opacity: 0.55,
              }}
            />
          ))}
        </div>
      )}

      {/* Waveform canvas */}
      <div
        ref={containerRef}
        className="relative h-[100px] cursor-pointer select-none overflow-hidden rounded-[12px] bg-[rgba(var(--atelier-ink-rgb),0.025)]"
        onClick={handleClick}
        onMouseMove={handleMouseMove}
        onMouseLeave={() => setHoverInfo(null)}
        role="slider"
        aria-label="Audio timeline"
        aria-valuenow={Math.round(currentTime)}
        aria-valuemin={0}
        aria-valuemax={Math.round(audioDuration)}
        tabIndex={0}
      >
        <canvas ref={canvasRef} className="absolute inset-0" />

        {/* Hover guide line — thin vertical rule at the cursor position */}
        {hoverInfo !== null && (
          <div
            className="pointer-events-none absolute inset-y-0 w-px bg-[rgba(var(--atelier-ink-rgb),0.18)]"
            style={{ left: hoverInfo.x }}
          />
        )}

        {/* Hover tooltip — anchored inside the top of the waveform */}
        {hoverInfo !== null && (
          <div
            className="pointer-events-none absolute top-2 z-10 -translate-x-1/2 rounded-[8px] border border-[rgba(var(--atelier-ink-rgb),0.1)] bg-[rgba(255,255,255,0.92)] px-2 py-1 shadow-sm backdrop-blur-sm"
            style={{ left: Math.max(28, Math.min(hoverInfo.x, (canvasSizeRef.current.w || 200) - 28)) }}
          >
            <span className="text-[11px] font-semibold tabular-nums text-[var(--atelier-ink)]">
              {fmtTime(hoverInfo.time)}
            </span>
            {hoveredSpeaker && (
              <span className="ml-1.5 text-[11px] text-[rgba(var(--atelier-ink-rgb),0.55)]">
                {hoveredSpeaker}
              </span>
            )}
          </div>
        )}

        {/* Decoding spinner */}
        {isDecoding && (
          <div className="absolute inset-0 flex items-center justify-center bg-[rgba(244,234,215,0.4)]">
            <div className="h-5 w-5 animate-spin rounded-full border-2 border-[rgba(207,90,67,0.25)] border-t-[rgb(207,90,67)]" />
          </div>
        )}

        {/* Silence zone labels — appear at the bottom of the quiet region */}
        {silenceZones.map((zone, idx) => {
          const centerPct = ((zone.startPct + zone.endPct) / 2) * 100;
          const label = zone.durationSec >= 60
            ? `~${Math.round(zone.durationSec / 60)} min silence`
            : `~${Math.round(zone.durationSec)}s silence`;
          return (
            <div
              key={idx}
              className="pointer-events-none absolute bottom-1.5 -translate-x-1/2 whitespace-nowrap rounded-[4px] bg-[rgba(255,255,255,0.72)] px-1.5 py-[2px] text-[9px] font-medium text-[rgba(var(--atelier-ink-rgb),0.38)] backdrop-blur-sm"
              style={{ left: `${centerPct}%` }}
            >
              {label}
            </div>
          );
        })}
      </div>

      {/* Transport controls */}
      <div className="flex items-center gap-2.5">
        <span className="w-9 text-right text-[11px] font-medium tabular-nums text-[rgba(var(--atelier-ink-rgb),0.45)]">
          {fmtTime(currentTime)}
        </span>

        <button
          type="button"
          onClick={togglePlay}
          disabled={!file}
          className={cn(
            'flex h-8 shrink-0 items-center justify-center gap-1.5 rounded-[10px] px-3 transition-opacity',
            'bg-[var(--atelier-ink)] text-[var(--atelier-paper)]',
            'hover:opacity-80',
            'disabled:cursor-not-allowed disabled:opacity-35',
          )}
          aria-label={isPlaying ? 'Pause' : 'Play'}
        >
          {isPlaying ? (
            <Pause size={11} fill="currentColor" strokeWidth={0} />
          ) : (
            <Play size={11} fill="currentColor" strokeWidth={0} className="translate-x-px" />
          )}
          <span className="text-[11px] font-semibold tracking-wide">
            {isPlaying ? 'Pause' : 'Play'}
          </span>
        </button>

        <span className="w-9 text-[11px] font-medium tabular-nums text-[rgba(var(--atelier-ink-rgb),0.45)]">
          {fmtTime(audioDuration)}
        </span>

        <div className="ml-auto font-mono text-[9px] tracking-wider text-[rgba(var(--atelier-ink-rgb),0.28)]">
          SPACE · ←/→
        </div>
      </div>
    </div>
  );
}
