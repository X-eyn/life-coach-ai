'use client';

import { useSearchParams } from 'next/navigation';
import { useState, useMemo, useEffect } from 'react';
import Link from 'next/link';
import { X, Copy, Download, Play, SkipBack, SkipForward, Volume2 } from 'lucide-react';

interface Turn {
  id: string;
  speaker: string;
  speakerIndex: number;
  text: string;
}

function parseTurns(transcript: string): Turn[] {
  const text = transcript.replace(/\r\n/g, '\n');
  const regex = /(?:\*\*([^*\n:]+?):\*\*|\[([^\]\n]+?)\]:)\s*/g;

  const markers: { index: number; speaker: string; fullMatch: string }[] = [];
  let match: RegExpExecArray | null;
  while ((match = regex.exec(text)) !== null) {
    markers.push({
      index: match.index + match[0].length,
      speaker: (match[1] || match[2]).trim(),
      fullMatch: match[0],
    });
  }

  if (markers.length === 0) {
    return [{ id: '0', speaker: 'Transcript', speakerIndex: 0, text: transcript.trim() }];
  }

  const speakerMap = new Map<string, number>();
  markers.forEach(({ speaker }) => {
    if (!speakerMap.has(speaker)) speakerMap.set(speaker, speakerMap.size);
  });

  const turns: Turn[] = [];
  for (let index = 0; index < markers.length; index += 1) {
    const { speaker, index: start } = markers[index];
    const end = index + 1 < markers.length ? markers[index + 1].index - markers[index + 1].fullMatch.length : text.length;
    const raw = text.slice(start, end).trim();
    if (!raw) continue;
    turns.push({
      id: `${index}`,
      speaker,
      speakerIndex: speakerMap.get(speaker) ?? 0,
      text: raw,
    });
  }

  return turns;
}

const SPEAKER_COLORS = {
  0: { dot: 'bg-rose-500', name: 'Speaker 1' },
  1: { dot: 'bg-teal-500', name: 'Speaker 2' },
  2: { dot: 'bg-amber-500', name: 'Speaker 3' },
  3: { dot: 'bg-blue-500', name: 'Speaker 4' },
};

import { Suspense } from 'react';

export default function TranscriptDetailPageWrapper() {
  return (
    <Suspense fallback={<div className="flex h-screen items-center justify-center"><p>Loading...</p></div>}>
      <TranscriptDetailPage />
    </Suspense>
  );
}

function TranscriptDetailPage() {
  const searchParams = useSearchParams();
  const wordsParam = searchParams.get('words') || '0';
  const turnsParam = searchParams.get('turns') || '0';

  const [activeTab, setActiveTab] = useState<'bengali' | 'english'>('bengali');
  const [playbackProgress, setPlaybackProgress] = useState(33);
  const [transcriptData, setTranscriptData] = useState<{ bengali: string; english: string } | null>(null);
  const [isLoading, setIsLoading] = useState(true);

  // Load transcript from localStorage
  useEffect(() => {
    if (typeof window !== 'undefined') {
      const stored = localStorage.getItem('transcript_detail');
      if (stored) {
        try {
          setTranscriptData(JSON.parse(stored));
        } catch (error) {
          console.error('Failed to parse transcript data:', error);
        }
      }
      setIsLoading(false);
    }
  }, []);

  // Compute turns - this hook is always called in the same order
  const currentTranscript = transcriptData ? (activeTab === 'bengali' ? transcriptData.bengali : transcriptData.english) : '';
  const turns = useMemo(() => {
    if (!transcriptData) return [];
    return parseTurns(currentTranscript);
  }, [currentTranscript, transcriptData]);

  // Extract unique speakers info
  const speakersInfo = useMemo(() => {
    return Array.from(
      new Map(turns.map((turn) => [turn.speakerIndex, turn.speaker])).entries()
    ).map(([index, speaker]) => ({
      index,
      name: speaker,
      color: SPEAKER_COLORS[index as keyof typeof SPEAKER_COLORS] || SPEAKER_COLORS[0],
    }));
  }, [turns]);

  if (isLoading || !transcriptData) {
    return (
      <div className="min-h-screen bg-gradient-to-br from-rose-50 via-white to-slate-50 flex items-center justify-center">
        <div className="text-center">
          <div className="w-12 h-12 border-4 border-rose-200 border-t-rose-500 rounded-full animate-spin mx-auto mb-4"></div>
          <p className="text-slate-600">Loading transcript...</p>
        </div>
      </div>
    );
  }

  return (
    <div className="min-h-screen bg-gradient-to-br from-rose-50 via-white to-slate-50">
      {/* Header */}
      <header className="fixed top-0 w-full z-50 bg-white/80 backdrop-blur-xl border-b border-rose-100/50 flex justify-between items-center px-8 h-16">
        <div className="flex items-center gap-8">
          <h1 className="font-bold text-lg tracking-tight text-rose-600">Editorial Transcript</h1>
        </div>
        <div className="flex items-center gap-4">
          <button className="p-2 text-slate-600 hover:text-rose-600 transition-colors rounded-lg hover:bg-rose-50">
            <Copy size={20} />
          </button>
          <button className="p-2 text-slate-600 hover:text-rose-600 transition-colors rounded-lg hover:bg-rose-50">
            <Download size={20} />
          </button>
          <Link
            href="/"
            className="p-2 text-slate-600 hover:text-rose-600 transition-colors rounded-lg hover:bg-rose-50"
          >
            <X size={20} />
          </Link>
        </div>
      </header>

      {/* Breadcrumbs */}
      <div className="pt-20 px-8 md:px-12 max-w-6xl mx-auto">
        <div className="flex items-center gap-2 text-sm text-slate-600 mb-8 font-medium">
          <span>Session</span>
          <span className="text-slate-400">›</span>
          <span className="text-rose-600">Transcript</span>
        </div>

        {/* Main Card */}
        <div className="bg-white/70 backdrop-blur border border-white/40 rounded-3xl overflow-hidden shadow-lg">
          {/* Card Header */}
          <div className="p-8 md:p-10 border-b border-rose-50/50 bg-white/40">
            <h2 className="font-bold text-4xl md:text-5xl tracking-tight text-slate-900 mb-6">
              Bilingual Transcript
            </h2>
            <div className="flex flex-wrap items-center gap-4">
              <div className="flex items-center gap-2 px-4 py-2 bg-slate-100/50 rounded-full text-sm font-medium text-slate-700">
                <span>📋</span>
                {wordsParam} words
              </div>
              <div className="flex items-center gap-2 px-4 py-2 bg-slate-100/50 rounded-full text-sm font-medium text-slate-700">
                <span>🔄</span>
                {turnsParam} turns
              </div>
              <div className="px-4 py-2 bg-green-100 text-green-700 rounded-full text-xs font-bold uppercase tracking-wider">
                Finalized
              </div>
            </div>
          </div>

          {/* Tab Toggle */}
          <div className="px-8 py-4 bg-slate-50/50 border-b border-rose-50/50 flex justify-between items-center">
            <div className="flex bg-white p-1 rounded-xl border border-slate-200">
              {(['bengali', 'english'] as const).map((lang) => (
                <button
                  key={lang}
                  onClick={() => setActiveTab(lang)}
                  className={`px-6 py-2 rounded-lg text-sm font-bold transition-all ${
                    activeTab === lang
                      ? 'bg-rose-500 text-white shadow-md'
                      : 'text-slate-700 hover:text-rose-600'
                  }`}
                >
                  {lang === 'bengali' ? 'Bangla' : 'English'}
                </button>
              ))}
            </div>
            <div className="text-xs font-medium text-slate-600 flex items-center gap-3">
              {speakersInfo.map((speaker) => (
                <div key={speaker.index} className="flex items-center gap-1.5">
                  <span className={`w-2 h-2 rounded-full ${speaker.color.dot}`}></span>
                  <span>{speaker.name}</span>
                </div>
              ))}
            </div>
          </div>

          {/* Transcript Content */}
          <div className="p-8 md:p-12 max-h-96 overflow-y-auto custom-scrollbar bg-white/20">
            <div className="space-y-8">
              {turns.map((turn, index) => {
                const speakerColor = SPEAKER_COLORS[turn.speakerIndex as keyof typeof SPEAKER_COLORS] || SPEAKER_COLORS[0];
                return (
                  <div key={turn.id} className="group">
                    <div className="flex items-center gap-3 mb-3">
                      <span className={`w-2 h-2 rounded-full ${speakerColor.dot}`}></span>
                      <span className="font-bold text-slate-900 tracking-wide">{turn.speaker}</span>
                      <span className="text-xs font-medium text-slate-500 ml-auto">
                        {String(Math.floor(index * 0.5)).padStart(2, '0')}:{String((index * 15) % 60).padStart(2, '0')}
                      </span>
                    </div>
                    <p className="text-base leading-relaxed text-slate-700 max-w-3xl">
                      {turn.text}
                    </p>
                  </div>
                );
              })}
            </div>
          </div>

          {/* Playback Controls */}
          <div className="px-8 py-6 bg-slate-100/50 border-t border-rose-50/50 flex items-center justify-between gap-6">
            <div className="flex items-center gap-3">
              <button className="w-10 h-10 rounded-full bg-white flex items-center justify-center shadow-sm hover:shadow-md transition-shadow">
                <SkipBack size={18} className="text-slate-600" />
              </button>
              <button className="w-12 h-12 rounded-full bg-rose-500 text-white flex items-center justify-center shadow-md hover:shadow-lg active:scale-95 transition-all">
                <Play size={20} className="ml-0.5" />
              </button>
              <button className="w-10 h-10 rounded-full bg-white flex items-center justify-center shadow-sm hover:shadow-md transition-shadow">
                <SkipForward size={18} className="text-slate-600" />
              </button>
            </div>

            <div className="flex-1 max-w-md">
              <div
                className="h-1 w-full bg-slate-300 rounded-full relative cursor-pointer hover:h-1.5 transition-all"
                onClick={(e) => {
                  const rect = e.currentTarget.getBoundingClientRect();
                  const percent = ((e.clientX - rect.left) / rect.width) * 100;
                  setPlaybackProgress(percent);
                }}
              >
                <div
                  className="absolute h-full bg-rose-500 rounded-full transition-all"
                  style={{ width: `${playbackProgress}%` }}
                ></div>
                <div
                  className="absolute h-3 w-3 bg-rose-500 rounded-full top-1/2 -translate-y-1/2 -translate-x-1.5 ring-4 ring-rose-100 shadow-md"
                  style={{ left: `${playbackProgress}%` }}
                ></div>
              </div>
            </div>

            <div className="flex items-center gap-3">
              <button className="text-slate-600 hover:text-rose-600 transition-colors">
                <Volume2 size={20} />
              </button>
              <span className="text-xs font-bold text-slate-600 font-mono">
                {Math.floor((playbackProgress / 100) * 12)}:{String(Math.floor((playbackProgress / 100) * 45)).padStart(2, '0')} / 12:45
              </span>
            </div>
          </div>
        </div>

        {/* Insights Section */}
        <div className="mt-12 grid grid-cols-1 md:grid-cols-3 gap-6 pb-12">
          <div className="md:col-span-2 bg-rose-50 rounded-2xl p-8 border border-rose-100/50">
            <h3 className="font-bold text-2xl text-rose-900 mb-4">AI Summary</h3>
            <p className="text-rose-800/70 leading-relaxed mb-6">
              This session focused on constructive dialogue between the participants regarding various topics. Key discussion points included experiences, perspectives, and recommendations.
            </p>
            <div className="flex gap-2">
              <span className="px-3 py-1 bg-white/50 text-rose-700 rounded-lg text-xs font-bold">Discussion</span>
              <span className="px-3 py-1 bg-white/50 text-rose-700 rounded-lg text-xs font-bold">Insights</span>
            </div>
          </div>

          <div className="bg-slate-900 rounded-2xl p-8 text-white flex flex-col">
            <div className="w-12 h-12 bg-white/10 rounded-2xl flex items-center justify-center mb-6">
              <span className="text-rose-400 text-2xl">✨</span>
            </div>
            <h3 className="font-bold text-xl mb-2">Key Topics</h3>
            <p className="text-slate-400 text-sm leading-relaxed mb-6 flex-1">
              {turns.length} distinct conversation turns identified.
            </p>
            <button className="w-full py-3 bg-rose-500 rounded-xl font-bold text-sm hover:bg-rose-600 transition-colors">
              View Details
            </button>
          </div>
        </div>
      </div>

      <style jsx>{`
        .custom-scrollbar::-webkit-scrollbar {
          width: 4px;
        }
        .custom-scrollbar::-webkit-scrollbar-track {
          background: transparent;
        }
        .custom-scrollbar::-webkit-scrollbar-thumb {
          background: #ddc0be;
          border-radius: 10px;
        }
      `}</style>
    </div>
  );
}
