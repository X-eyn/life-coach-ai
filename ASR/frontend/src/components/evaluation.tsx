'use client';

import { useState, useCallback, useEffect, useMemo } from 'react';
import { Loader, RefreshCw, AlertCircle, CheckCircle } from 'lucide-react';
import { cn } from '@/lib/utils';

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

interface EvaluationComponentProps {
  transcript: {
    bengali: string;
    english: string;
  };
}

const CATEGORY_LABELS = {
  academic_coaching: 'Academic Coaching',
  communication: 'Communication',
  student_participation: 'Student Participation',
  attitude_of_teacher: 'Attitude of Teacher',
};

const CATEGORY_COLORS = {
  academic_coaching: 'bg-rose-500/10 border-rose-500/20',
  communication: 'bg-teal-500/10 border-teal-500/20',
  student_participation: 'bg-amber-500/10 border-amber-500/20',
  attitude_of_teacher: 'bg-blue-500/10 border-blue-500/20',
};

const CATEGORY_ACCENT = {
  academic_coaching: 'text-rose-600',
  communication: 'text-teal-600',
  student_participation: 'text-amber-600',
  attitude_of_teacher: 'text-blue-600',
};

const SCORE_LABELS = {
  5: 'Excellent',
  4: 'Good',
  3: 'Satisfactory',
  2: 'Needs Improvement',
  1: 'Poor',
};

const SCORE_COLORS = {
  5: 'bg-emerald-100 text-emerald-700 border-emerald-200',
  4: 'bg-sky-100 text-sky-700 border-sky-200',
  3: 'bg-amber-100 text-amber-700 border-amber-200',
  2: 'bg-orange-100 text-orange-700 border-orange-200',
  1: 'bg-red-100 text-red-700 border-red-200',
};

function ScoreIndicator({ score }: { score: number }) {
  return (
    <div className="flex items-center gap-2">
      <span className={cn('inline-block px-3 py-1 rounded-full text-xs font-bold border', SCORE_COLORS[score as keyof typeof SCORE_COLORS])}>
        {score}/5
      </span>
      <span className="text-sm font-medium text-[rgba(var(--atelier-ink-rgb),0.7)]">
        {SCORE_LABELS[score as keyof typeof SCORE_LABELS]}
      </span>
    </div>
  );
}

// Generate hash of transcript for cache key
function generateTranscriptHash(transcript: { bengali: string; english: string }): string {
  const combined = transcript.bengali + transcript.english;
  let hash = 0;
  for (let i = 0; i < combined.length; i++) {
    const char = combined.charCodeAt(i);
    hash = ((hash << 5) - hash) + char;
    hash = hash & hash; // Convert to 32bit integer
  }
  return Math.abs(hash).toString(36);
}

// Get cached evaluation from localStorage
function getCachedEvaluation(transcript: { bengali: string; english: string }): EvaluationData | null {
  if (typeof window === 'undefined') return null;
  try {
    const hash = generateTranscriptHash(transcript);
    const cached = localStorage.getItem(`evaluation_${hash}`);
    return cached ? JSON.parse(cached) : null;
  } catch (error) {
    console.error('Failed to load cached evaluation:', error);
    return null;
  }
}

// Save evaluation to localStorage
function cacheEvaluation(transcript: { bengali: string; english: string }, data: EvaluationData): void {
  if (typeof window === 'undefined') return;
  try {
    const hash = generateTranscriptHash(transcript);
    localStorage.setItem(`evaluation_${hash}`, JSON.stringify(data));
  } catch (error) {
    console.error('Failed to cache evaluation:', error);
  }
}

export function EvaluationComponent({ transcript }: EvaluationComponentProps) {
  const [evaluation, setEvaluation] = useState<EvaluationData | null>(null);
  const [isLoading, setIsLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [isInitialized, setIsInitialized] = useState(false);

  // Load cached evaluation on mount
  useEffect(() => {
    if (!isInitialized) {
      const cached = getCachedEvaluation(transcript);
      if (cached) {
        setEvaluation(cached);
      }
      setIsInitialized(true);
    }
  }, [transcript, isInitialized]);

  const runEvaluation = useCallback(async () => {
    setIsLoading(true);
    setError(null);
    try {
      // Combine both transcripts for evaluation
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
      // Cache the evaluation
      cacheEvaluation(transcript, data);
    } catch (err) {
      setError(err instanceof Error ? err.message : 'An error occurred during evaluation');
      console.error('Evaluation error:', err);
    } finally {
      setIsLoading(false);
    }
  }, [transcript]);

  if (!evaluation && !isLoading && !error) {
    return (
      <div className="flex flex-col items-center justify-center h-full py-12">
        <div className="text-center max-w-md">
          <div className="w-16 h-16 rounded-[20px] bg-[rgba(var(--atelier-gold-rgb),0.12)] flex items-center justify-center mx-auto mb-4">
            <span className="text-3xl">🎓</span>
          </div>
          <h3 className="text-lg font-semibold text-[var(--atelier-ink)] mb-2">AI Evaluation</h3>
          <p className="text-sm text-[rgba(var(--atelier-ink-rgb),0.62)] leading-6 mb-6">
            Analyze this transcript using AI to evaluate the quality of teacher-student interaction based on academic coaching, communication, student participation, and teacher attitude.
          </p>
          <button
            onClick={runEvaluation}
            disabled={isLoading}
            className="atelier-button inline-flex items-center gap-2 px-4 py-3 text-sm font-bold disabled:opacity-50"
          >
            {isLoading ? (
              <>
                <Loader size={16} className="animate-spin" />
                Evaluating...
              </>
            ) : (
              <>
                <RefreshCw size={16} />
                Start Evaluation
              </>
            )}
          </button>
        </div>
      </div>
    );
  }

  if (isLoading) {
    return (
      <div className="flex flex-col items-center justify-center h-full py-12">
        <div className="text-center">
          <Loader size={48} className="animate-spin text-[var(--atelier-terracotta)] mx-auto mb-4" />
          <p className="text-sm text-[rgba(var(--atelier-ink-rgb),0.62)]">
            Analyzing transcript with AI...
          </p>
        </div>
      </div>
    );
  }

  if (error) {
    return (
      <div className="flex flex-col items-center justify-center h-full py-12">
        <div className="text-center max-w-md">
          <div className="w-16 h-16 rounded-[20px] bg-red-100 flex items-center justify-center mx-auto mb-4">
            <AlertCircle size={32} className="text-red-600" />
          </div>
          <h3 className="text-lg font-semibold text-red-700 mb-2">Evaluation Error</h3>
          <p className="text-sm text-red-600 leading-6 mb-6">{error}</p>
          <button
            onClick={runEvaluation}
            className="atelier-button inline-flex items-center gap-2 px-4 py-3 text-sm font-bold"
          >
            <RefreshCw size={16} />
            Try Again
          </button>
        </div>
      </div>
    );
  }

  if (!evaluation) return null;

  const categories = ['academic_coaching', 'communication', 'student_participation', 'attitude_of_teacher'] as const;

  return (
    <div className="space-y-6">
      {/* Overall Score */}
      <div className="rounded-[20px] border border-[rgba(var(--atelier-ink-rgb),0.1)] atelier-panel p-6">
        <div className="flex items-end justify-between gap-4">
          <div>
            <div className="atelier-kicker mb-2">Overall Assessment</div>
            <h3 className="text-2xl font-bold text-[var(--atelier-ink)]">
              {evaluation.overall_score.toFixed(1)} / 5.0
            </h3>
          </div>
          <div className="text-right">
            <span className={cn('inline-block px-4 py-2 rounded-lg text-lg font-bold border', SCORE_COLORS[Math.round(evaluation.overall_score) as keyof typeof SCORE_COLORS])}>
              {SCORE_LABELS[Math.round(evaluation.overall_score) as keyof typeof SCORE_LABELS]}
            </span>
          </div>
        </div>
      </div>

      {/* Category Scores */}
      <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
        {categories.map((category) => {
          const categoryData = evaluation[category];
          return (
            <div
              key={category}
              className={cn(
                'rounded-[16px] border-2 p-5 space-y-3',
                CATEGORY_COLORS[category]
              )}
            >
              <div className="flex items-start justify-between gap-3">
                <h4 className={cn('font-bold text-sm', CATEGORY_ACCENT[category])}>
                  {CATEGORY_LABELS[category]}
                </h4>
                <ScoreIndicator score={categoryData.score} />
              </div>
              <p className="text-xs leading-relaxed text-[rgba(var(--atelier-ink-rgb),0.72)]">
                {categoryData.justification}
              </p>
              
              {categoryData.key_evidence && categoryData.key_evidence.length > 0 && (
                <div className="pt-2 border-t border-[rgba(var(--atelier-ink-rgb),0.1)]">
                  <p className="text-xs font-semibold text-[rgba(var(--atelier-ink-rgb),0.6)] mb-2">Key Evidence:</p>
                  <ul className="space-y-1">
                    {categoryData.key_evidence.map((evidence, idx) => (
                      <li key={idx} className="text-xs text-[rgba(var(--atelier-ink-rgb),0.65)] flex gap-2">
                        <span className="flex-shrink-0 mt-0.5">•</span>
                        <span>{evidence}</span>
                      </li>
                    ))}
                  </ul>
                </div>
              )}
            </div>
          );
        })}
      </div>

      {/* Key Observations */}
      <div className="rounded-[20px] border border-[rgba(var(--atelier-ink-rgb),0.1)] atelier-panel p-6">
        <h4 className="font-bold text-sm text-[var(--atelier-ink)] mb-3 flex items-center gap-2">
          <CheckCircle size={16} className="text-[var(--atelier-teal)]" />
          Key Observations
        </h4>
        <p className="text-sm leading-relaxed text-[rgba(var(--atelier-ink-rgb),0.72)]">
          {evaluation.key_observations}
        </p>
      </div>

      {/* Recommendations */}
      {evaluation.recommendations && evaluation.recommendations.length > 0 && (
        <div className="rounded-[20px] border border-[rgba(var(--atelier-ink-rgb),0.1)] atelier-panel p-6">
          <h4 className="font-bold text-sm text-[var(--atelier-ink)] mb-4">Recommendations for Improvement</h4>
          <ul className="space-y-3">
            {evaluation.recommendations.map((rec, idx) => (
              <li key={idx} className="flex gap-3">
                <span className="inline-flex items-center justify-center w-6 h-6 rounded-full bg-[var(--atelier-terracotta)] text-white text-xs font-bold flex-shrink-0">
                  {idx + 1}
                </span>
                <span className="text-sm text-[rgba(var(--atelier-ink-rgb),0.72)] leading-relaxed">
                  {rec}
                </span>
              </li>
            ))}
          </ul>
        </div>
      )}

      {/* Refresh Button */}
      <div className="flex justify-center pt-4">
        <button
          onClick={runEvaluation}
          disabled={isLoading}
          className="atelier-ghost-button inline-flex items-center gap-2 px-4 py-2 text-sm font-semibold disabled:opacity-50"
        >
          <RefreshCw size={14} />
          Re-evaluate
        </button>
      </div>
    </div>
  );
}
