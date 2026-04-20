'use client';

import { useMemo } from 'react';
import { cn } from '@/lib/utils';

// ── Types ────────────────────────────────────────────────────────────────────

interface Turn {
  id: string;
  speaker: string;
  speakerIndex: number;
  text: string;
  wordCount: number;
}

interface InsightsTabProps {
  transcript: { bengali: string; english: string };
  turns: Turn[];
  duration: number;
  speakerNames?: Record<number, string>;
}

const SPEAKER_COLORS = ['#cf5a43', '#1f7e7a', '#3456d6', '#c9900e'];

function speakerColor(index: number): string {
  return SPEAKER_COLORS[index % SPEAKER_COLORS.length];
}

function fmtTime(seconds: number): string {
  if (!seconds || isNaN(seconds)) return '0:00';
  const m = Math.floor(seconds / 60);
  const s = Math.floor(seconds % 60);
  return `${m}:${s.toString().padStart(2, '0')}`;
}

// ── Component ────────────────────────────────────────────────────────────────

export function InsightsTab({ transcript, turns, duration, speakerNames }: InsightsTabProps) {
  // Speaker analytics
  const speakerAnalytics = useMemo(() => {
    const map = new Map<number, { speaker: string; words: number; turns: number; avgWordsPerTurn: number }>();
    for (const turn of turns) {
      const existing = map.get(turn.speakerIndex);
      if (existing) {
        existing.words += turn.wordCount;
        existing.turns += 1;
      } else {
        map.set(turn.speakerIndex, {
          speaker: speakerNames?.[turn.speakerIndex] || turn.speaker,
          words: turn.wordCount,
          turns: 1,
          avgWordsPerTurn: 0,
        });
      }
    }
    const totalWords = turns.reduce((s, t) => s + t.wordCount, 0) || 1;
    return Array.from(map.entries()).map(([idx, data]) => ({
      idx,
      ...data,
      avgWordsPerTurn: Math.round(data.words / data.turns),
      pct: Math.round((data.words / totalWords) * 100),
      estimatedTime: duration ? (data.words / totalWords) * duration : 0,
    }));
  }, [turns, duration, speakerNames]);

  // Pacing analysis
  const pacing = useMemo(() => {
    const totalWords = turns.reduce((s, t) => s + t.wordCount, 0);
    const wpm = duration > 0 ? Math.round((totalWords / duration) * 60) : 0;

    // Per-speaker WPM
    const speakerWpm = speakerAnalytics.map((s) => ({
      ...s,
      wpm: s.estimatedTime > 0 ? Math.round((s.words / s.estimatedTime) * 60) : 0,
    }));

    // Find longest turn (monologue)
    let longestTurn = turns[0];
    for (const t of turns) {
      if (t.wordCount > (longestTurn?.wordCount ?? 0)) longestTurn = t;
    }

    // Turn density: turns per minute
    const turnsPerMin = duration > 0 ? (turns.length / (duration / 60)).toFixed(1) : '—';

    return { wpm, speakerWpm, longestTurn, turnsPerMin };
  }, [turns, duration, speakerAnalytics]);

  // Language switching analysis
  const languageAnalysis = useMemo(() => {
    const bengaliWords = transcript.bengali.trim().split(/\s+/).filter(Boolean);
    const totalBengaliTokens = bengaliWords.length;
    const banglaTokens = bengaliWords.filter((w) => /[\u0980-\u09FF]/.test(w)).length;
    const englishTokens = totalBengaliTokens - banglaTokens;

    return {
      totalTokens: totalBengaliTokens,
      banglaTokens,
      englishTokens,
      banglaPct: totalBengaliTokens ? Math.round((banglaTokens / totalBengaliTokens) * 100) : 0,
      englishPct: totalBengaliTokens ? Math.round((englishTokens / totalBengaliTokens) * 100) : 0,
    };
  }, [transcript]);

  // Engagement proxy: turn density over time (split into quarters)
  const engagementCurve = useMemo(() => {
    if (turns.length < 4) return [];
    const quarters = 4;
    const turnsPerQ = Math.ceil(turns.length / quarters);
    const segments: { label: string; turns: number; words: number; avgWords: number }[] = [];
    for (let q = 0; q < quarters; q++) {
      const slice = turns.slice(q * turnsPerQ, (q + 1) * turnsPerQ);
      const words = slice.reduce((s, t) => s + t.wordCount, 0);
      segments.push({
        label: `Q${q + 1}`,
        turns: slice.length,
        words,
        avgWords: slice.length ? Math.round(words / slice.length) : 0,
      });
    }
    return segments;
  }, [turns]);

  if (turns.length === 0) {
    return (
      <div className="py-16 text-center text-[13px] text-[rgba(var(--atelier-ink-rgb),0.4)]">
        No transcript data available for analysis.
      </div>
    );
  }

  return (
    <div className="space-y-8">
      {/* ── Speaker Analytics ──────────────────────────────────────── */}
      <section>
        <h3 className="mb-4 text-[13px] font-bold uppercase tracking-[0.12em] text-[rgba(var(--atelier-ink-rgb),0.55)]">
          Speaker Analytics
        </h3>
        <div className="rounded-[20px] border border-[rgba(var(--atelier-ink-rgb),0.08)] bg-[rgba(255,255,255,0.5)] p-5">
          {/* Talk-time bars */}
          <div className="mb-4">
            <div className="mb-2 text-[11px] font-medium text-[rgba(var(--atelier-ink-rgb),0.4)]">
              Talk-time distribution
            </div>
            <div className="flex h-6 w-full overflow-hidden rounded-full">
              {speakerAnalytics.map((s) => (
                <div
                  key={s.idx}
                  className="relative flex items-center justify-center transition-all"
                  style={{ width: `${s.pct}%`, background: speakerColor(s.idx), opacity: 0.85 }}
                  title={`${s.speaker}: ${s.pct}%`}
                >
                  {s.pct >= 15 && (
                    <span className="select-none text-[10px] font-bold text-white/90">{s.pct}%</span>
                  )}
                </div>
              ))}
            </div>
          </div>

          {/* Speaker cards */}
          <div className="grid gap-3 sm:grid-cols-2">
            {speakerAnalytics.map((s) => (
              <div key={s.idx} className="flex items-start gap-3 rounded-[12px] border border-[rgba(var(--atelier-ink-rgb),0.06)] bg-[rgba(255,255,255,0.5)] p-3">
                <span className="mt-0.5 h-3 w-3 shrink-0 rounded-full" style={{ background: speakerColor(s.idx) }} />
                <div className="min-w-0 flex-1">
                  <div className="text-[13px] font-semibold text-[var(--atelier-ink)]">{s.speaker}</div>
                  <div className="mt-1 flex flex-wrap gap-x-3 gap-y-1 text-[11px] text-[rgba(var(--atelier-ink-rgb),0.5)]">
                    <span>{s.words} words</span>
                    <span>{s.turns} turns</span>
                    <span>~{s.avgWordsPerTurn} words/turn</span>
                    {s.estimatedTime > 0 && <span>~{fmtTime(s.estimatedTime)}</span>}
                  </div>
                </div>
              </div>
            ))}
          </div>
        </div>
      </section>

      {/* ── Pacing ─────────────────────────────────────────────────── */}
      <section>
        <h3 className="mb-4 text-[13px] font-bold uppercase tracking-[0.12em] text-[rgba(var(--atelier-ink-rgb),0.55)]">
          Pacing
        </h3>
        <div className="grid gap-3 sm:grid-cols-3">
          <div className="rounded-[16px] border border-[rgba(var(--atelier-ink-rgb),0.08)] bg-[rgba(255,255,255,0.5)] p-4 text-center">
            <div className="text-2xl font-bold text-[var(--atelier-ink)]">{pacing.wpm}</div>
            <div className="mt-1 text-[11px] text-[rgba(var(--atelier-ink-rgb),0.45)]">words/minute (overall)</div>
          </div>
          <div className="rounded-[16px] border border-[rgba(var(--atelier-ink-rgb),0.08)] bg-[rgba(255,255,255,0.5)] p-4 text-center">
            <div className="text-2xl font-bold text-[var(--atelier-ink)]">{pacing.turnsPerMin}</div>
            <div className="mt-1 text-[11px] text-[rgba(var(--atelier-ink-rgb),0.45)]">turns/minute</div>
          </div>
          <div className="rounded-[16px] border border-[rgba(var(--atelier-ink-rgb),0.08)] bg-[rgba(255,255,255,0.5)] p-4 text-center">
            <div className="text-2xl font-bold text-[var(--atelier-ink)]">{pacing.longestTurn?.wordCount ?? 0}</div>
            <div className="mt-1 text-[11px] text-[rgba(var(--atelier-ink-rgb),0.45)]">longest turn (words)</div>
          </div>
        </div>

        {/* Per-speaker WPM */}
        <div className="mt-3 rounded-[16px] border border-[rgba(var(--atelier-ink-rgb),0.08)] bg-[rgba(255,255,255,0.5)] p-4">
          <div className="mb-3 text-[11px] font-medium text-[rgba(var(--atelier-ink-rgb),0.4)]">
            Speaking pace by speaker
          </div>
          <div className="space-y-2">
            {pacing.speakerWpm.map((s) => (
              <div key={s.idx} className="flex items-center gap-3">
                <span className="h-2 w-2 shrink-0 rounded-full" style={{ background: speakerColor(s.idx) }} />
                <span className="w-24 truncate text-[12px] text-[rgba(var(--atelier-ink-rgb),0.65)]">{s.speaker}</span>
                <div className="flex-1">
                  <div className="h-2 overflow-hidden rounded-full bg-[rgba(var(--atelier-ink-rgb),0.06)]">
                    <div
                      className="h-full rounded-full transition-all"
                      style={{
                        width: `${Math.min(100, (s.wpm / Math.max(...pacing.speakerWpm.map((x) => x.wpm), 1)) * 100)}%`,
                        background: speakerColor(s.idx),
                        opacity: 0.7,
                      }}
                    />
                  </div>
                </div>
                <span className="w-14 text-right text-[11px] font-medium tabular-nums text-[rgba(var(--atelier-ink-rgb),0.55)]">
                  {s.wpm} wpm
                </span>
              </div>
            ))}
          </div>
        </div>
      </section>

      {/* ── Language Analysis ──────────────────────────────────────── */}
      <section>
        <h3 className="mb-4 text-[13px] font-bold uppercase tracking-[0.12em] text-[rgba(var(--atelier-ink-rgb),0.55)]">
          Language Distribution
        </h3>
        <div className="rounded-[16px] border border-[rgba(var(--atelier-ink-rgb),0.08)] bg-[rgba(255,255,255,0.5)] p-4">
          <div className="mb-3 flex h-5 w-full overflow-hidden rounded-full">
            {languageAnalysis.banglaPct > 0 && (
              <div
                className="relative flex items-center justify-center"
                style={{ width: `${languageAnalysis.banglaPct}%`, background: '#3d6b68', opacity: 0.85 }}
              >
                {languageAnalysis.banglaPct >= 15 && (
                  <span className="text-[10px] font-bold text-white/90">{languageAnalysis.banglaPct}%</span>
                )}
              </div>
            )}
            {languageAnalysis.englishPct > 0 && (
              <div
                className="relative flex items-center justify-center"
                style={{ width: `${languageAnalysis.englishPct}%`, background: '#9baab4', opacity: 0.85 }}
              >
                {languageAnalysis.englishPct >= 15 && (
                  <span className="text-[10px] font-bold text-[rgba(13,18,32,0.65)]">{languageAnalysis.englishPct}%</span>
                )}
              </div>
            )}
          </div>
          <div className="flex gap-4">
            <div className="flex items-center gap-1.5">
              <span className="h-2 w-2 rounded-full" style={{ background: '#3d6b68' }} />
              <span className="text-[11px] text-[rgba(var(--atelier-ink-rgb),0.55)]">Bangla ({languageAnalysis.banglaTokens} words)</span>
            </div>
            <div className="flex items-center gap-1.5">
              <span className="h-2 w-2 rounded-full" style={{ background: '#9baab4' }} />
              <span className="text-[11px] text-[rgba(var(--atelier-ink-rgb),0.55)]">English ({languageAnalysis.englishTokens} words)</span>
            </div>
          </div>
        </div>
      </section>

      {/* ── Engagement Curve ───────────────────────────────────────── */}
      {engagementCurve.length > 0 && (
        <section>
          <h3 className="mb-4 text-[13px] font-bold uppercase tracking-[0.12em] text-[rgba(var(--atelier-ink-rgb),0.55)]">
            Engagement Over Time
          </h3>
          <div className="rounded-[16px] border border-[rgba(var(--atelier-ink-rgb),0.08)] bg-[rgba(255,255,255,0.5)] p-4">
            <div className="mb-3 text-[11px] text-[rgba(var(--atelier-ink-rgb),0.4)]">
              Turn density and word count by session quarter
            </div>
            <div className="grid grid-cols-4 gap-2">
              {engagementCurve.map((seg) => {
                const maxTurns = Math.max(...engagementCurve.map((s) => s.turns));
                const heightPct = maxTurns ? (seg.turns / maxTurns) * 100 : 0;
                return (
                  <div key={seg.label} className="flex flex-col items-center gap-1.5">
                    <div className="flex h-16 w-full items-end justify-center">
                      <div
                        className="w-full max-w-[40px] rounded-t-md bg-[rgba(var(--atelier-terracotta-rgb),0.5)] transition-all"
                        style={{ height: `${Math.max(8, heightPct)}%` }}
                      />
                    </div>
                    <div className="text-center">
                      <div className="text-[11px] font-semibold text-[rgba(var(--atelier-ink-rgb),0.6)]">{seg.label}</div>
                      <div className="text-[10px] text-[rgba(var(--atelier-ink-rgb),0.35)]">{seg.turns} turns · {seg.words} words</div>
                    </div>
                  </div>
                );
              })}
            </div>
          </div>
        </section>
      )}

      {/* ── More Coming Soon ───────────────────────────────────────── */}
      <div className="rounded-[16px] border border-dashed border-[rgba(var(--atelier-ink-rgb),0.12)] p-8 text-center">
        <p className="text-[13px] font-medium text-[rgba(var(--atelier-ink-rgb),0.4)]">
          More insights coming soon
        </p>
        <p className="mt-1 text-[11px] text-[rgba(var(--atelier-ink-rgb),0.28)]">
          Topic extraction · Code-switching analysis · Comparison with past sessions
        </p>
      </div>
    </div>
  );
}
