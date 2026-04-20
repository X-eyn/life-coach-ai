'use client';

import { useState, useCallback, useEffect, useMemo } from 'react';
import { Loader, RefreshCw, AlertCircle, CheckCircle, ChevronDown, ChevronUp, Download, ExternalLink, Info } from 'lucide-react';
import { cn } from '@/lib/utils';

// ── Types ────────────────────────────────────────────────────────────────────

interface EvaluationScore {
  score: number;
  justification: string;
  key_evidence: string[];
}

interface EvaluationData {
  academic_coaching: EvaluationScore;
  communication: EvaluationScore;
  student_participation: EvaluationScore;
  attitude_of_teacher: EvaluationScore;
  overall_score: number;
  key_observations: string;
  recommendations: string[];
}

interface Turn {
  id: string;
  speaker: string;
  speakerIndex: number;
  text: string;
  wordCount: number;
}

interface EvaluationComponentProps {
  transcript: {
    bengali: string;
    english: string;
  };
  /** Parsed turns for evidence linking */
  turns?: Turn[];
  /** Audio duration for timestamp estimation */
  audioDuration?: number;
  /** Jump to a specific turn in the transcript tab */
  onJumpToTurn?: (turnIndex: number) => void;
}

// ── Constants ────────────────────────────────────────────────────────────────

const CATEGORY_LABELS: Record<string, string> = {
  academic_coaching: 'Academic Coaching',
  communication: 'Communication',
  student_participation: 'Student Participation',
  attitude_of_teacher: 'Attitude of Teacher',
};

const CATEGORIES = ['academic_coaching', 'communication', 'student_participation', 'attitude_of_teacher'] as const;

const SCORE_LABELS: Record<number, string> = {
  5: 'Excellent',
  4: 'Good',
  3: 'Satisfactory',
  2: 'Needs Improvement',
  1: 'Poor',
};

// Score-based colors — green for good, amber for average, coral for needs work
function scoreAccentColor(score: number): string {
  if (score >= 4) return '#059669'; // emerald-600
  if (score >= 3) return '#d97706'; // amber-600
  return '#dc2626'; // red-600
}

function scoreBgClass(score: number): string {
  if (score >= 4) return 'bg-emerald-50 border-emerald-200';
  if (score >= 3) return 'bg-amber-50 border-amber-200';
  return 'bg-red-50 border-red-200';
}

function scorePillClass(score: number): string {
  if (score >= 4) return 'bg-emerald-100 text-emerald-700 border-emerald-200';
  if (score >= 3) return 'bg-amber-100 text-amber-700 border-amber-200';
  return 'bg-red-100 text-red-700 border-red-200';
}

// ── Helpers ──────────────────────────────────────────────────────────────────

function generateTranscriptHash(transcript: { bengali: string; english: string }): string {
  const combined = transcript.bengali + transcript.english;
  let hash = 0;
  for (let i = 0; i < combined.length; i++) {
    const char = combined.charCodeAt(i);
    hash = ((hash << 5) - hash) + char;
    hash = hash & hash;
  }
  return Math.abs(hash).toString(36);
}

function getCachedEvaluation(transcript: { bengali: string; english: string }): EvaluationData | null {
  if (typeof window === 'undefined') return null;
  try {
    const hash = generateTranscriptHash(transcript);
    const cached = localStorage.getItem(`evaluation_${hash}`);
    return cached ? JSON.parse(cached) : null;
  } catch { return null; }
}

function cacheEvaluation(transcript: { bengali: string; english: string }, data: EvaluationData): void {
  if (typeof window === 'undefined') return;
  try {
    const hash = generateTranscriptHash(transcript);
    localStorage.setItem(`evaluation_${hash}`, JSON.stringify(data));
  } catch { /* ignore */ }
}

/** Try to find a turn that best matches an evidence string */
function findEvidenceTurn(evidence: string, turns: Turn[]): number | null {
  if (!turns.length) return null;
  const lower = evidence.toLowerCase();
  // Exact substring match
  for (let i = 0; i < turns.length; i++) {
    if (turns[i].text.toLowerCase().includes(lower.slice(0, 40))) return i;
  }
  // Fuzzy: find the turn with most word overlap
  const evidenceWords = new Set(lower.split(/\s+/).filter((w) => w.length > 3));
  if (evidenceWords.size === 0) return null;
  let bestIdx = -1;
  let bestScore = 0;
  for (let i = 0; i < turns.length; i++) {
    const turnWords = turns[i].text.toLowerCase().split(/\s+/);
    let score = 0;
    for (const w of turnWords) { if (evidenceWords.has(w)) score++; }
    if (score > bestScore) { bestScore = score; bestIdx = i; }
  }
  return bestScore >= 2 ? bestIdx : null;
}

// ── Component ────────────────────────────────────────────────────────────────

export function EvaluationComponent({ transcript, turns, audioDuration, onJumpToTurn }: EvaluationComponentProps) {
  const [evaluation, setEvaluation] = useState<EvaluationData | null>(null);
  const [isLoading, setIsLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [isInitialized, setIsInitialized] = useState(false);
  const [expandedCategories, setExpandedCategories] = useState<Set<string>>(new Set());
  const [showRubricFor, setShowRubricFor] = useState<string | null>(null);

  useEffect(() => {
    if (!isInitialized) {
      const cached = getCachedEvaluation(transcript);
      if (cached) setEvaluation(cached);
      setIsInitialized(true);
    }
  }, [transcript, isInitialized]);

  const runEvaluation = useCallback(async () => {
    setIsLoading(true);
    setError(null);
    try {
      const combinedTranscript = `BENGALI:\n${transcript.bengali}\n\nENGLISH:\n${transcript.english}`;
      const response = await fetch('/api/evaluate', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ transcript: combinedTranscript }),
      });
      if (!response.ok) {
        const err = await response.json();
        throw new Error(err.error || 'Evaluation failed');
      }
      const data = await response.json();
      setEvaluation(data);
      cacheEvaluation(transcript, data);
    } catch (err) {
      setError(err instanceof Error ? err.message : 'An error occurred during evaluation');
    } finally {
      setIsLoading(false);
    }
  }, [transcript]);

  const toggleCategory = useCallback((cat: string) => {
    setExpandedCategories((prev) => {
      const next = new Set(prev);
      if (next.has(cat)) next.delete(cat); else next.add(cat);
      return next;
    });
  }, []);

  // ── Empty / Loading / Error states ──────────────────────────────────────

  if (!evaluation && !isLoading && !error) {
    return (
      <div className="flex flex-col items-center justify-center py-16">
        <div className="text-center max-w-md">
          <div className="w-16 h-16 rounded-[20px] bg-[rgba(var(--atelier-gold-rgb),0.12)] flex items-center justify-center mx-auto mb-4">
            <span className="text-3xl">🎓</span>
          </div>
          <h3 className="text-lg font-semibold text-[var(--atelier-ink)] mb-2">AI Teaching Evaluation</h3>
          <p className="text-sm text-[rgba(var(--atelier-ink-rgb),0.55)] leading-6 mb-6">
            Analyze this session to evaluate teaching quality across academic coaching, communication, student participation, and teacher attitude.
          </p>
          <button onClick={runEvaluation} disabled={isLoading}
            className="atelier-button inline-flex items-center gap-2 px-5 py-3 text-sm font-bold disabled:opacity-50">
            <RefreshCw size={16} /> Start Evaluation
          </button>
        </div>
      </div>
    );
  }

  if (isLoading) {
    return (
      <div className="flex flex-col items-center justify-center py-16">
        <Loader size={40} className="animate-spin text-[var(--atelier-terracotta)] mb-4" />
        <p className="text-sm text-[rgba(var(--atelier-ink-rgb),0.55)]">Analyzing transcript with AI...</p>
      </div>
    );
  }

  if (error) {
    return (
      <div className="flex flex-col items-center justify-center py-16">
        <div className="text-center max-w-md">
          <AlertCircle size={40} className="text-red-500 mx-auto mb-4" />
          <h3 className="text-lg font-semibold text-red-700 mb-2">Evaluation Error</h3>
          <p className="text-sm text-red-600 leading-6 mb-6">{error}</p>
          <button onClick={runEvaluation} className="atelier-button inline-flex items-center gap-2 px-4 py-3 text-sm font-bold">
            <RefreshCw size={16} /> Try Again
          </button>
        </div>
      </div>
    );
  }

  if (!evaluation) return null;

  const overallRounded = Math.round(evaluation.overall_score);

  // ── Main evaluation render ──────────────────────────────────────────────

  return (
    <div className="space-y-8">
      {/* ── 1. Overall Assessment Card ────────────────────────────────── */}
      <div className="rounded-[20px] border border-[rgba(var(--atelier-ink-rgb),0.1)] bg-[rgba(255,255,255,0.6)] p-6">
        <div className="mb-1 font-mono text-[10px] font-medium uppercase tracking-[0.14em] text-[rgba(var(--atelier-ink-rgb),0.44)]">
          Overall Assessment
        </div>
        <div className="flex items-start gap-8">
          {/* Big score */}
          <div className="shrink-0 text-center">
            <div className="text-4xl font-bold text-[var(--atelier-ink)]">
              {evaluation.overall_score.toFixed(1)}
            </div>
            <div className="text-[13px] text-[rgba(var(--atelier-ink-rgb),0.45)]">/5.0</div>
            <div className={cn('mt-2 inline-block rounded-lg border px-3 py-1 text-[12px] font-bold', scorePillClass(overallRounded))}>
              {SCORE_LABELS[overallRounded] || 'N/A'}
            </div>
          </div>

          {/* Horizontal bar breakdown */}
          <div className="flex-1 space-y-2.5">
            {CATEGORIES.map((cat) => {
              const score = evaluation[cat].score;
              return (
                <div key={cat} className="flex items-center gap-3">
                  <span className="w-32 shrink-0 truncate text-[12px] font-medium text-[rgba(var(--atelier-ink-rgb),0.65)]">
                    {CATEGORY_LABELS[cat]}
                  </span>
                  <div className="flex-1">
                    <div className="h-3 overflow-hidden rounded-full bg-[rgba(var(--atelier-ink-rgb),0.06)]">
                      <div
                        className="h-full rounded-full transition-all duration-500"
                        style={{ width: `${(score / 5) * 100}%`, background: scoreAccentColor(score) }}
                      />
                    </div>
                  </div>
                  <span className="w-8 text-right text-[12px] font-bold tabular-nums" style={{ color: scoreAccentColor(score) }}>
                    {score}/5
                  </span>
                </div>
              );
            })}
          </div>
        </div>
      </div>

      {/* ── 2. Category Detail Sections ───────────────────────────────── */}
      <div className="space-y-3">
        {CATEGORIES.map((category) => {
          const data = evaluation[category];
          const isExpanded = expandedCategories.has(category);
          const showingRubric = showRubricFor === category;

          return (
            <div
              key={category}
              className="rounded-[16px] border border-[rgba(var(--atelier-ink-rgb),0.08)] bg-[rgba(255,255,255,0.5)] overflow-hidden"
            >
              {/* Card header — always visible */}
              <button
                type="button"
                onClick={() => toggleCategory(category)}
                className="flex w-full items-center gap-3 px-5 py-4 text-left transition-colors hover:bg-[rgba(var(--atelier-ink-rgb),0.02)]"
              >
                {/* Score bar accent */}
                <div className="h-8 w-1 shrink-0 rounded-full" style={{ background: scoreAccentColor(data.score) }} />
                <div className="min-w-0 flex-1">
                  <div className="text-[13px] font-semibold text-[var(--atelier-ink)]">{CATEGORY_LABELS[category]}</div>
                  <p className="mt-0.5 line-clamp-1 text-[11px] text-[rgba(var(--atelier-ink-rgb),0.5)]">
                    {data.justification.slice(0, 120)}{data.justification.length > 120 ? '...' : ''}
                  </p>
                </div>
                <span className={cn('shrink-0 rounded-full border px-2.5 py-0.5 text-[11px] font-bold', scorePillClass(data.score))}>
                  {data.score}/5
                </span>
                {isExpanded ? <ChevronUp size={16} className="shrink-0 text-[rgba(var(--atelier-ink-rgb),0.3)]" /> : <ChevronDown size={16} className="shrink-0 text-[rgba(var(--atelier-ink-rgb),0.3)]" />}
              </button>

              {/* Expanded content */}
              {isExpanded && (
                <div className="border-t border-[rgba(var(--atelier-ink-rgb),0.06)] px-5 py-4 space-y-4">
                  {/* Justification */}
                  <p className="text-[13px] leading-relaxed text-[rgba(var(--atelier-ink-rgb),0.72)]">
                    {data.justification}
                  </p>

                  {/* Key Evidence — clickable links to transcript */}
                  {data.key_evidence && data.key_evidence.length > 0 && (
                    <div>
                      <div className="mb-2 text-[11px] font-semibold uppercase tracking-[0.08em] text-[rgba(var(--atelier-ink-rgb),0.45)]">
                        Key Evidence
                      </div>
                      <ul className="space-y-1.5">
                        {data.key_evidence.map((evidence, idx) => {
                          const turnIdx = turns ? findEvidenceTurn(evidence, turns) : null;
                          return (
                            <li key={idx} className="flex gap-2 text-[12px] leading-relaxed text-[rgba(var(--atelier-ink-rgb),0.65)]">
                              <span className="mt-0.5 shrink-0 text-[rgba(var(--atelier-ink-rgb),0.3)]">•</span>
                              <span className="flex-1">{evidence}</span>
                              {turnIdx !== null && onJumpToTurn && (
                                <button
                                  onClick={() => onJumpToTurn(turnIdx)}
                                  className="shrink-0 inline-flex items-center gap-1 rounded-md bg-[rgba(var(--atelier-terracotta-rgb),0.08)] px-1.5 py-0.5 text-[10px] font-medium text-[var(--atelier-terracotta)] transition-colors hover:bg-[rgba(var(--atelier-terracotta-rgb),0.15)]"
                                  title="Jump to this moment in the transcript"
                                >
                                  <ExternalLink size={9} />
                                  View
                                </button>
                              )}
                            </li>
                          );
                        })}
                      </ul>
                    </div>
                  )}

                  {/* How was this scored? */}
                  <div>
                    <button
                      type="button"
                      onClick={() => setShowRubricFor(showingRubric ? null : category)}
                      className="inline-flex items-center gap-1 text-[11px] font-medium text-[rgba(var(--atelier-ink-rgb),0.4)] transition-colors hover:text-[rgba(var(--atelier-ink-rgb),0.65)]"
                    >
                      <Info size={11} />
                      {showingRubric ? 'Hide scoring criteria' : 'How was this scored?'}
                    </button>
                    {showingRubric && (
                      <div className="mt-2 rounded-[10px] border border-[rgba(var(--atelier-ink-rgb),0.06)] bg-[rgba(var(--atelier-ink-rgb),0.02)] p-3">
                        <div className="space-y-1.5 text-[11px] text-[rgba(var(--atelier-ink-rgb),0.55)]">
                          <div><span className="font-semibold text-emerald-600">5 Excellent:</span> Consistently demonstrates outstanding practice with evidence of impact</div>
                          <div><span className="font-semibold text-emerald-600">4 Good:</span> Regularly demonstrates effective practice with clear evidence</div>
                          <div><span className="font-semibold text-amber-600">3 Satisfactory:</span> Demonstrates adequate practice with some evidence</div>
                          <div><span className="font-semibold text-orange-600">2 Needs Improvement:</span> Inconsistent practice with limited evidence</div>
                          <div><span className="font-semibold text-red-600">1 Poor:</span> Rarely demonstrates expected practice</div>
                        </div>
                      </div>
                    )}
                  </div>
                </div>
              )}
            </div>
          );
        })}
      </div>

      {/* ── 3. Key Observations ───────────────────────────────────────── */}
      <div className="rounded-[16px] border border-[rgba(var(--atelier-ink-rgb),0.08)] bg-[rgba(255,255,255,0.5)] p-5">
        <h4 className="mb-3 flex items-center gap-2 text-[13px] font-bold text-[var(--atelier-ink)]">
          <CheckCircle size={15} className="text-[var(--atelier-teal)]" />
          Key Observations
        </h4>
        <p className="text-[13px] leading-relaxed text-[rgba(var(--atelier-ink-rgb),0.72)]">
          {evaluation.key_observations}
        </p>
      </div>

      {/* ── 4. Recommendations — Action Cards ─────────────────────────── */}
      {evaluation.recommendations && evaluation.recommendations.length > 0 && (
        <div>
          <h4 className="mb-3 text-[13px] font-bold text-[var(--atelier-ink)]">Recommendations for Improvement</h4>
          <div className="space-y-2.5">
            {evaluation.recommendations.map((rec, idx) => {
              // Infer which category this recommendation relates to
              const lowerRec = rec.toLowerCase();
              const relatedCat = CATEGORIES.find((c) => {
                const label = CATEGORY_LABELS[c].toLowerCase();
                return lowerRec.includes(label) || lowerRec.includes(label.split(' ')[0]);
              });
              // Infer priority from score of related category
              const priority = relatedCat && evaluation[relatedCat].score <= 2 ? 'high'
                : relatedCat && evaluation[relatedCat].score <= 3 ? 'medium' : 'low';
              const priorityColors = {
                high: 'bg-red-50 text-red-600 border-red-200',
                medium: 'bg-amber-50 text-amber-600 border-amber-200',
                low: 'bg-emerald-50 text-emerald-600 border-emerald-200',
              };

              return (
                <div
                  key={idx}
                  className="flex items-start gap-3 rounded-[14px] border border-[rgba(var(--atelier-ink-rgb),0.08)] bg-[rgba(255,255,255,0.5)] p-4"
                >
                  <span className="mt-0.5 flex h-6 w-6 shrink-0 items-center justify-center rounded-full bg-[var(--atelier-ink)] text-[10px] font-bold text-white">
                    {idx + 1}
                  </span>
                  <div className="min-w-0 flex-1">
                    <p className="text-[13px] leading-relaxed text-[rgba(var(--atelier-ink-rgb),0.75)]">{rec}</p>
                    <div className="mt-2 flex flex-wrap items-center gap-2">
                      <span className={cn('rounded-full border px-2 py-0.5 text-[9px] font-semibold uppercase tracking-wider', priorityColors[priority])}>
                        {priority} priority
                      </span>
                      {relatedCat && (
                        <span className="rounded-full bg-[rgba(var(--atelier-ink-rgb),0.05)] px-2 py-0.5 text-[9px] font-medium text-[rgba(var(--atelier-ink-rgb),0.5)]">
                          {CATEGORY_LABELS[relatedCat]}
                        </span>
                      )}
                    </div>
                  </div>
                </div>
              );
            })}
          </div>
        </div>
      )}

      {/* ── 5. Action Row ─────────────────────────────────────────────── */}
      <div className="flex flex-wrap items-center justify-center gap-3 pt-4">
        <button
          onClick={runEvaluation}
          disabled={isLoading}
          className="atelier-ghost-button inline-flex items-center gap-2 px-4 py-2 text-[12px] font-semibold disabled:opacity-50"
        >
          <RefreshCw size={13} />
          Re-evaluate
        </button>
        <button
          onClick={() => {
            // Export evaluation as text (PDF generation would need a library)
            if (!evaluation) return;
            const text = [
              `Teaching Evaluation Report`,
              `Overall Score: ${evaluation.overall_score.toFixed(1)}/5.0 (${SCORE_LABELS[overallRounded]})`,
              '',
              ...CATEGORIES.map((c) => `${CATEGORY_LABELS[c]}: ${evaluation[c].score}/5\n${evaluation[c].justification}\nEvidence: ${evaluation[c].key_evidence.join('; ')}`),
              '',
              `Key Observations: ${evaluation.key_observations}`,
              '',
              `Recommendations:\n${evaluation.recommendations.map((r, i) => `${i + 1}. ${r}`).join('\n')}`,
            ].join('\n\n');
            const blob = new Blob([text], { type: 'text/plain' });
            const url = URL.createObjectURL(blob);
            const a = document.createElement('a');
            a.href = url; a.download = 'evaluation-report.txt'; a.click();
            URL.revokeObjectURL(url);
          }}
          className="atelier-ghost-button inline-flex items-center gap-2 px-4 py-2 text-[12px] font-semibold"
        >
          <Download size={13} />
          Export Report
        </button>
      </div>
    </div>
  );
}
