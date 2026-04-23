"use client";

import React, { useMemo, useRef } from "react";
import { motion, useInView, animate, useMotionValue, useTransform } from "motion/react";
import {
  AreaChart,
  Area,
  BarChart,
  Bar,
  RadialBarChart,
  RadialBar,
  ResponsiveContainer,
  XAxis,
  YAxis,
  Tooltip,
  CartesianGrid,
  Cell,
} from "recharts";
import {
  Mic,
  BookOpen,
  Users,
  Clock,
  TrendingUp,
  Zap,
  Award,
  MessageSquare,
  Plus,
} from "lucide-react";
import type { LibrarySession } from "@/lib/bacbon";
import { parseTurns, fmtDuration } from "@/lib/bacbon";

/* ── helpers ─────────────────────────────────────────────────────────── */

function useCountUp(target: number, duration = 1.4) {
  const ref = useRef<HTMLSpanElement>(null);
  const inView = useInView(ref, { once: true });
  const mv = useMotionValue(0);

  React.useEffect(() => {
    if (!inView) return;
    const controls = animate(mv, target, {
      duration,
      ease: [0.16, 1, 0.3, 1],
      onUpdate: (v) => {
        if (ref.current) ref.current.textContent = String(Math.round(v));
      },
    });
    return controls.stop;
  }, [inView, target, duration, mv]);

  return ref;
}

function formatK(n: number): string {
  if (n >= 1000) return `${(n / 1000).toFixed(1)}k`;
  return String(n);
}

function fmtMins(secs: number): string {
  if (secs < 60) return `${Math.round(secs)}s`;
  const m = Math.floor(secs / 60);
  if (m < 60) return `${m}m`;
  const h = Math.floor(m / 60);
  const rm = m % 60;
  return rm ? `${h}h ${rm}m` : `${h}h`;
}

/* ── colours ─────────────────────────────────────────────────────────── */
const BRAND = "#EA580C";
const TEAL = "#0D9488";
const PURPLE = "#8B5CF6";
const GOLD = "#F59E0B";
const NAVY = "#1F2937";

const CARD_VARIANTS = {
  hidden: { opacity: 0, y: 22 },
  visible: (i: number) => ({
    opacity: 1,
    y: 0,
    transition: { delay: i * 0.07, duration: 0.55, ease: [0.16, 1, 0.3, 1] },
  }),
};

/* ── StatPill ─────────────────────────────────────────────────────────── */
function StatPill({
  icon,
  label,
  value,
  sub,
  color,
  index,
}: {
  icon: React.ReactNode;
  label: string;
  value: number;
  sub: string;
  color: string;
  index: number;
}) {
  const numRef = useCountUp(value);

  return (
    <motion.div
      custom={index}
      variants={CARD_VARIANTS}
      initial="hidden"
      animate="visible"
      className="relative flex flex-col gap-3 overflow-hidden rounded-2xl p-5"
      style={{ background: "var(--surface)", border: "1px solid var(--border)" }}
    >
      {/* soft glow blob */}
      <div
        className="pointer-events-none absolute -right-4 -top-4 h-24 w-24 rounded-full opacity-[0.12] blur-2xl"
        style={{ background: color }}
      />
      <div
        className="flex h-9 w-9 items-center justify-center rounded-xl"
        style={{ background: `${color}18` }}
      >
        <span style={{ color }}>{icon}</span>
      </div>
      <div>
        <p className="text-[28px] font-bold leading-none tnum" style={{ color: "var(--text-900)" }}>
          <span ref={numRef}>0</span>
        </p>
        <p className="mt-0.5 text-[12px]" style={{ color: "var(--text-400)" }}>
          {sub}
        </p>
      </div>
      <p className="text-[13px] font-medium" style={{ color: "var(--text-700)" }}>
        {label}
      </p>
    </motion.div>
  );
}

/* ── ActivityChart ────────────────────────────────────────────────────── */
function ActivityChart({
  sessions,
  index,
}: {
  sessions: LibrarySession[];
  index: number;
}) {
  const data = useMemo(() => {
    const now = Date.now();
    const days: { day: string; sessions: number; minutes: number }[] = [];
    for (let i = 6; i >= 0; i--) {
      const d = new Date(now - i * 86_400_000);
      const label = d.toLocaleDateString("en", { weekday: "short" });
      const inDay = sessions.filter((s) => {
        const sd = new Date(s.createdAt);
        return (
          sd.getFullYear() === d.getFullYear() &&
          sd.getMonth() === d.getMonth() &&
          sd.getDate() === d.getDate()
        );
      });
      days.push({
        day: label,
        sessions: inDay.length,
        minutes: Math.round(inDay.reduce((a, s) => a + (s.duration ?? 0), 0) / 60),
      });
    }
    return days;
  }, [sessions]);

  return (
    <motion.div
      custom={index}
      variants={CARD_VARIANTS}
      initial="hidden"
      animate="visible"
      className="rounded-2xl p-5"
      style={{ background: "var(--surface)", border: "1px solid var(--border)" }}
    >
      <div className="mb-4 flex items-center justify-between">
        <div>
          <p className="text-[15px] font-semibold" style={{ color: "var(--text-900)" }}>
            Recording Activity
          </p>
          <p className="mt-0.5 text-[12px]" style={{ color: "var(--text-400)" }}>
            Sessions and minutes — last 7 days
          </p>
        </div>
        <div
          className="flex h-8 w-8 items-center justify-center rounded-lg"
          style={{ background: `${TEAL}18` }}
        >
          <TrendingUp size={15} style={{ color: TEAL }} />
        </div>
      </div>
      <ResponsiveContainer width="100%" height={160}>
        <AreaChart data={data} margin={{ top: 4, right: 4, bottom: 0, left: -28 }}>
          <defs>
            <linearGradient id="gradTeal" x1="0" y1="0" x2="0" y2="1">
              <stop offset="0%" stopColor={TEAL} stopOpacity={0.22} />
              <stop offset="100%" stopColor={TEAL} stopOpacity={0} />
            </linearGradient>
            <linearGradient id="gradBrand" x1="0" y1="0" x2="0" y2="1">
              <stop offset="0%" stopColor={BRAND} stopOpacity={0.18} />
              <stop offset="100%" stopColor={BRAND} stopOpacity={0} />
            </linearGradient>
          </defs>
          <CartesianGrid strokeDasharray="3 3" stroke="var(--border)" vertical={false} />
          <XAxis dataKey="day" tick={{ fontSize: 11, fill: "var(--text-400)" }} axisLine={false} tickLine={false} />
          <YAxis tick={{ fontSize: 11, fill: "var(--text-400)" }} axisLine={false} tickLine={false} />
          <Tooltip
            contentStyle={{
              background: "var(--surface)",
              border: "1px solid var(--border)",
              borderRadius: 10,
              fontSize: 12,
            }}
            labelStyle={{ color: "var(--text-900)", fontWeight: 600 }}
            itemStyle={{ color: "var(--text-500)" }}
          />
          <Area type="monotone" dataKey="minutes" stroke={TEAL} strokeWidth={2} fill="url(#gradTeal)" dot={false} name="Minutes" />
          <Area type="monotone" dataKey="sessions" stroke={BRAND} strokeWidth={2} fill="url(#gradBrand)" dot={false} name="Sessions" />
        </AreaChart>
      </ResponsiveContainer>
    </motion.div>
  );
}

/* ── SpeakerBalance ───────────────────────────────────────────────────── */
function SpeakerBalance({
  sessions,
  index,
}: {
  sessions: LibrarySession[];
  index: number;
}) {
  const data = useMemo(() => {
    const totals: Record<string, number> = {};
    sessions.forEach((s) => {
      const turns = parseTurns(s.transcript.bengali || s.transcript.english);
      turns.forEach((t) => {
        totals[t.speaker] = (totals[t.speaker] ?? 0) + t.wordCount;
      });
    });
    const entries = Object.entries(totals)
      .sort((a, b) => b[1] - a[1])
      .slice(0, 6);
    const total = entries.reduce((s, [, v]) => s + v, 0) || 1;
    return entries.map(([speaker, words], i) => ({
      speaker: speaker.length > 14 ? speaker.slice(0, 13) + "…" : speaker,
      words,
      pct: Math.round((words / total) * 100),
      fill: [BRAND, TEAL, PURPLE, GOLD, NAVY, "#10B981"][i % 6],
    }));
  }, [sessions]);

  return (
    <motion.div
      custom={index}
      variants={CARD_VARIANTS}
      initial="hidden"
      animate="visible"
      className="rounded-2xl p-5"
      style={{ background: "var(--surface)", border: "1px solid var(--border)" }}
    >
      <div className="mb-4 flex items-center justify-between">
        <div>
          <p className="text-[15px] font-semibold" style={{ color: "var(--text-900)" }}>
            Speaker Word Share
          </p>
          <p className="mt-0.5 text-[12px]" style={{ color: "var(--text-400)" }}>
            Who spoke the most across all sessions
          </p>
        </div>
        <div
          className="flex h-8 w-8 items-center justify-center rounded-lg"
          style={{ background: `${PURPLE}18` }}
        >
          <Users size={15} style={{ color: PURPLE }} />
        </div>
      </div>
      {data.length === 0 ? (
        <p className="py-8 text-center text-[13px]" style={{ color: "var(--text-400)" }}>
          No speaker data yet
        </p>
      ) : (
        <div className="space-y-3">
          {data.map((d) => (
            <div key={d.speaker}>
              <div className="mb-1 flex items-center justify-between">
                <span className="text-[13px] font-medium" style={{ color: "var(--text-700)" }}>
                  {d.speaker}
                </span>
                <span className="tnum text-[12px]" style={{ color: "var(--text-400)" }}>
                  {formatK(d.words)} words · {d.pct}%
                </span>
              </div>
              <div className="h-2 overflow-hidden rounded-full" style={{ background: "var(--surface-gray)" }}>
                <motion.div
                  className="h-full rounded-full"
                  style={{ background: d.fill }}
                  initial={{ width: 0 }}
                  animate={{ width: `${d.pct}%` }}
                  transition={{ duration: 0.9, ease: [0.16, 1, 0.3, 1], delay: index * 0.07 + 0.3 }}
                />
              </div>
            </div>
          ))}
        </div>
      )}
    </motion.div>
  );
}

/* ── LanguageMix ──────────────────────────────────────────────────────── */
function LanguageMix({
  sessions,
  index,
}: {
  sessions: LibrarySession[];
  index: number;
}) {
  const { bn, en } = useMemo(() => {
    if (!sessions.length) return { bn: 50, en: 50 };
    const avg =
      sessions.reduce((s, r) => s + (r.languageSplit?.bn ?? 0), 0) / sessions.length;
    return { bn: Math.round(avg), en: Math.round(100 - avg) };
  }, [sessions]);

  const radialData = [
    { name: "Bengali", value: bn, fill: TEAL },
    { name: "English", value: en, fill: BRAND },
  ];

  return (
    <motion.div
      custom={index}
      variants={CARD_VARIANTS}
      initial="hidden"
      animate="visible"
      className="flex flex-col rounded-2xl p-5"
      style={{ background: "var(--surface)", border: "1px solid var(--border)" }}
    >
      <div className="mb-2 flex items-center justify-between">
        <div>
          <p className="text-[15px] font-semibold" style={{ color: "var(--text-900)" }}>
            Language Mix
          </p>
          <p className="mt-0.5 text-[12px]" style={{ color: "var(--text-400)" }}>
            Average across all sessions
          </p>
        </div>
        <div
          className="flex h-8 w-8 items-center justify-center rounded-lg"
          style={{ background: `${GOLD}18` }}
        >
          <MessageSquare size={15} style={{ color: GOLD }} />
        </div>
      </div>

      <div className="relative flex items-center justify-center">
        <ResponsiveContainer width="100%" height={160}>
          <RadialBarChart
            innerRadius="55%"
            outerRadius="90%"
            data={radialData}
            startAngle={220}
            endAngle={-40}
          >
            <RadialBar dataKey="value" cornerRadius={6} background={{ fill: "var(--surface-gray)" }} />
            <Tooltip
              contentStyle={{
                background: "var(--surface)",
                border: "1px solid var(--border)",
                borderRadius: 10,
                fontSize: 12,
              }}
            />
          </RadialBarChart>
        </ResponsiveContainer>
        {/* centre label */}
        <div className="pointer-events-none absolute flex flex-col items-center">
          <span className="tnum text-[22px] font-bold" style={{ color: "var(--text-900)" }}>
            {bn}%
          </span>
          <span className="text-[11px]" style={{ color: "var(--text-400)" }}>Bengali</span>
        </div>
      </div>

      <div className="mt-2 flex justify-center gap-6">
        {radialData.map((d) => (
          <div key={d.name} className="flex items-center gap-2">
            <span className="h-2.5 w-2.5 rounded-full" style={{ background: d.fill }} />
            <span className="text-[12px]" style={{ color: "var(--text-500)" }}>
              {d.name} <b style={{ color: "var(--text-900)" }}>{d.value}%</b>
            </span>
          </div>
        ))}
      </div>
    </motion.div>
  );
}

/* ── SessionLengthChart ───────────────────────────────────────────────── */
function SessionLengthChart({
  sessions,
  index,
}: {
  sessions: LibrarySession[];
  index: number;
}) {
  const data = useMemo(() => {
    return sessions
      .slice(0, 10)
      .reverse()
      .map((s) => ({
        name: s.name.length > 16 ? s.name.slice(0, 15) + "…" : s.name,
        minutes: Math.round((s.duration ?? 0) / 60),
        words: s.wordCount ?? 0,
      }));
  }, [sessions]);

  return (
    <motion.div
      custom={index}
      variants={CARD_VARIANTS}
      initial="hidden"
      animate="visible"
      className="rounded-2xl p-5"
      style={{ background: "var(--surface)", border: "1px solid var(--border)" }}
    >
      <div className="mb-4 flex items-center justify-between">
        <div>
          <p className="text-[15px] font-semibold" style={{ color: "var(--text-900)" }}>
            Session Lengths
          </p>
          <p className="mt-0.5 text-[12px]" style={{ color: "var(--text-400)" }}>
            Duration (min) of your last 10 sessions
          </p>
        </div>
        <div
          className="flex h-8 w-8 items-center justify-center rounded-lg"
          style={{ background: `${BRAND}18` }}
        >
          <Clock size={15} style={{ color: BRAND }} />
        </div>
      </div>
      {data.length === 0 ? (
        <p className="py-8 text-center text-[13px]" style={{ color: "var(--text-400)" }}>
          No sessions yet
        </p>
      ) : (
        <ResponsiveContainer width="100%" height={160}>
          <BarChart data={data} margin={{ top: 4, right: 4, bottom: 20, left: -28 }}>
            <CartesianGrid strokeDasharray="3 3" stroke="var(--border)" vertical={false} />
            <XAxis
              dataKey="name"
              tick={{ fontSize: 10, fill: "var(--text-400)" }}
              axisLine={false}
              tickLine={false}
              angle={-30}
              textAnchor="end"
            />
            <YAxis tick={{ fontSize: 11, fill: "var(--text-400)" }} axisLine={false} tickLine={false} />
            <Tooltip
              contentStyle={{
                background: "var(--surface)",
                border: "1px solid var(--border)",
                borderRadius: 10,
                fontSize: 12,
              }}
              labelStyle={{ color: "var(--text-900)", fontWeight: 600 }}
              itemStyle={{ color: "var(--text-500)" }}
              formatter={(v: number) => [`${v} min`, "Duration"]}
            />
            <Bar dataKey="minutes" radius={[6, 6, 0, 0]}>
              {data.map((_, i) => (
                <Cell key={i} fill={i % 2 === 0 ? BRAND : TEAL} fillOpacity={0.85} />
              ))}
            </Bar>
          </BarChart>
        </ResponsiveContainer>
      )}
    </motion.div>
  );
}

/* ── TopTopics ────────────────────────────────────────────────────────── */
function TopTopics({
  sessions,
  index,
}: {
  sessions: LibrarySession[];
  index: number;
}) {
  const topics = useMemo(() => {
    const freq: Record<string, number> = {};
    sessions.forEach((s) => {
      const text = (s.transcript.english || s.transcript.bengali || "").toLowerCase();
      text
        .replace(/[^\w\s]/g, " ")
        .split(/\s+/)
        .filter((w) => w.length > 4)
        .forEach((w) => {
          freq[w] = (freq[w] ?? 0) + 1;
        });
    });
    const STOP = new Set([
      "that","this","with","from","have","they","were","their","been","which","about",
      "will","would","could","should","there","these","those","when","what","then","than",
      "more","some","also","just","said","your","into","over","after","before","where",
      "while","through","because","speaker","class","okay","right","good","like","know",
      "ছাত্র","শিক্ষক",
    ]);
    return Object.entries(freq)
      .filter(([w]) => !STOP.has(w) && w.length > 3)
      .sort((a, b) => b[1] - a[1])
      .slice(0, 12);
  }, [sessions]);

  const colors = [BRAND, TEAL, PURPLE, GOLD, NAVY, "#10B981", "#F43F5E", "#06B6D4", "#A78BFA", "#FCD34D", "#34D399", "#FB923C"];

  return (
    <motion.div
      custom={index}
      variants={CARD_VARIANTS}
      initial="hidden"
      animate="visible"
      className="rounded-2xl p-5"
      style={{ background: "var(--surface)", border: "1px solid var(--border)" }}
    >
      <div className="mb-4 flex items-center justify-between">
        <div>
          <p className="text-[15px] font-semibold" style={{ color: "var(--text-900)" }}>
            Recurring Topics
          </p>
          <p className="mt-0.5 text-[12px]" style={{ color: "var(--text-400)" }}>
            Most frequent themes across sessions
          </p>
        </div>
        <div
          className="flex h-8 w-8 items-center justify-center rounded-lg"
          style={{ background: `${PURPLE}18` }}
        >
          <Zap size={15} style={{ color: PURPLE }} />
        </div>
      </div>
      {topics.length === 0 ? (
        <p className="py-8 text-center text-[13px]" style={{ color: "var(--text-400)" }}>
          Upload sessions to see topics
        </p>
      ) : (
        <div className="flex flex-wrap gap-2">
          {topics.map(([word, count], i) => (
            <motion.span
              key={word}
              initial={{ opacity: 0, scale: 0.7 }}
              animate={{ opacity: 1, scale: 1 }}
              transition={{ delay: index * 0.07 + i * 0.04, ease: [0.34, 1.56, 0.64, 1] }}
              className="inline-flex items-center gap-1.5 rounded-full px-3 py-1 text-[12px] font-medium"
              style={{
                background: `${colors[i % colors.length]}14`,
                color: colors[i % colors.length],
                border: `1px solid ${colors[i % colors.length]}28`,
              }}
            >
              {word}
              <span
                className="rounded-full px-1 py-px text-[10px]"
                style={{ background: `${colors[i % colors.length]}28` }}
              >
                {count}
              </span>
            </motion.span>
          ))}
        </div>
      )}
    </motion.div>
  );
}

/* ── WPM & Engagement Score ───────────────────────────────────────────── */
function EngagementScore({
  sessions,
  index,
}: {
  sessions: LibrarySession[];
  index: number;
}) {
  const { avgWpm, turnDensity, evalAvg, longestSession } = useMemo(() => {
    if (!sessions.length)
      return { avgWpm: 0, turnDensity: 0, evalAvg: 0, longestSession: 0 };

    const wpmList: number[] = [];
    const densityList: number[] = [];

    sessions.forEach((s) => {
      const mins = (s.duration ?? 0) / 60 || 1;
      const words = s.wordCount ?? 0;
      wpmList.push(Math.round(words / mins));
      const turns = parseTurns(s.transcript.bengali || s.transcript.english).length;
      densityList.push(turns / mins);
    });

    const avg = (arr: number[]) => Math.round(arr.reduce((a, b) => a + b, 0) / arr.length);

    const evalScores = sessions
      .filter((s) => typeof s.evaluationScore === "number")
      .map((s) => s.evaluationScore as number);

    return {
      avgWpm: avg(wpmList),
      turnDensity: Math.round(avg(densityList) * 10) / 10,
      evalAvg: evalScores.length ? Math.round(evalScores.reduce((a, b) => a + b, 0) / evalScores.length) : 0,
      longestSession: Math.max(...sessions.map((s) => s.duration ?? 0)),
    };
  }, [sessions]);

  const items = [
    { label: "Avg words/min", value: avgWpm, color: TEAL, max: 200 },
    { label: "Turns/min", value: turnDensity, color: PURPLE, max: 10 },
    { label: "Avg eval score", value: evalAvg, color: GOLD, max: 100 },
  ];

  return (
    <motion.div
      custom={index}
      variants={CARD_VARIANTS}
      initial="hidden"
      animate="visible"
      className="rounded-2xl p-5"
      style={{ background: "var(--surface)", border: "1px solid var(--border)" }}
    >
      <div className="mb-4 flex items-center justify-between">
        <div>
          <p className="text-[15px] font-semibold" style={{ color: "var(--text-900)" }}>
            Engagement Metrics
          </p>
          <p className="mt-0.5 text-[12px]" style={{ color: "var(--text-400)" }}>
            Pace, interaction density & evaluation scores
          </p>
        </div>
        <div
          className="flex h-8 w-8 items-center justify-center rounded-lg"
          style={{ background: `${GOLD}18` }}
        >
          <Award size={15} style={{ color: GOLD }} />
        </div>
      </div>

      <div className="space-y-4">
        {items.map((item) => {
          const pct = Math.min(100, item.value === 0 ? 0 : Math.round((item.value / item.max) * 100));
          return (
            <div key={item.label}>
              <div className="mb-1.5 flex items-center justify-between">
                <span className="text-[13px]" style={{ color: "var(--text-700)" }}>
                  {item.label}
                </span>
                <span className="tnum text-[13px] font-semibold" style={{ color: "var(--text-900)" }}>
                  {item.value || "—"}
                </span>
              </div>
              <div className="h-2.5 overflow-hidden rounded-full" style={{ background: "var(--surface-gray)" }}>
                <motion.div
                  className="h-full rounded-full"
                  style={{ background: `linear-gradient(90deg, ${item.color}99, ${item.color})` }}
                  initial={{ width: 0 }}
                  animate={{ width: `${pct}%` }}
                  transition={{ duration: 1, ease: [0.16, 1, 0.3, 1], delay: index * 0.07 + 0.4 }}
                />
              </div>
            </div>
          );
        })}

        <div
          className="mt-2 flex items-center justify-between rounded-xl px-3 py-2.5"
          style={{ background: "var(--surface-gray)" }}
        >
          <span className="text-[12px]" style={{ color: "var(--text-500)" }}>Longest session</span>
          <span className="tnum text-[13px] font-semibold" style={{ color: "var(--text-900)" }}>
            {fmtMins(longestSession)}
          </span>
        </div>
      </div>
    </motion.div>
  );
}

/* ── RecentSessionList ────────────────────────────────────────────────── */
function RecentSessionList({
  sessions,
  onSelect,
  index,
}: {
  sessions: LibrarySession[];
  onSelect: (id: string) => void;
  index: number;
}) {
  const recent = sessions.slice(0, 5);

  return (
    <motion.div
      custom={index}
      variants={CARD_VARIANTS}
      initial="hidden"
      animate="visible"
      className="rounded-2xl p-5"
      style={{ background: "var(--surface)", border: "1px solid var(--border)" }}
    >
      <div className="mb-4 flex items-center justify-between">
        <div>
          <p className="text-[15px] font-semibold" style={{ color: "var(--text-900)" }}>
            Recent Sessions
          </p>
          <p className="mt-0.5 text-[12px]" style={{ color: "var(--text-400)" }}>
            Jump back in
          </p>
        </div>
        <div
          className="flex h-8 w-8 items-center justify-center rounded-lg"
          style={{ background: `${BRAND}18` }}
        >
          <Mic size={15} style={{ color: BRAND }} />
        </div>
      </div>
      {recent.length === 0 ? (
        <p className="py-6 text-center text-[13px]" style={{ color: "var(--text-400)" }}>
          No sessions yet
        </p>
      ) : (
        <div className="space-y-1">
          {recent.map((s, i) => (
            <motion.button
              key={s.id}
              onClick={() => onSelect(s.id)}
              initial={{ opacity: 0, x: -12 }}
              animate={{ opacity: 1, x: 0 }}
              transition={{ delay: index * 0.07 + i * 0.06, ease: [0.16, 1, 0.3, 1] }}
              className="flex w-full items-center gap-3 rounded-xl px-3 py-2.5 text-left transition-colors hover:bg-[var(--surface-gray)]"
            >
              <div
                className="flex h-8 w-8 shrink-0 items-center justify-center rounded-lg text-[11px] font-bold"
                style={{
                  background: [BRAND, TEAL, PURPLE, GOLD, NAVY][i % 5] + "18",
                  color: [BRAND, TEAL, PURPLE, GOLD, NAVY][i % 5],
                }}
              >
                {(i + 1).toString().padStart(2, "0")}
              </div>
              <div className="min-w-0 flex-1">
                <p className="truncate text-[13px] font-medium" style={{ color: "var(--text-900)" }}>
                  {s.name}
                </p>
                <p className="text-[11px]" style={{ color: "var(--text-400)" }}>
                  {fmtDuration(s.duration ?? 0)} · {(s.wordCount ?? 0).toLocaleString()} words
                </p>
              </div>
            </motion.button>
          ))}
        </div>
      )}
    </motion.div>
  );
}

/* ══ MAIN DashboardView ════════════════════════════════════════════════ */
export default function DashboardView({
  sessions,
  onUpload,
  onSelectSession,
}: {
  sessions: LibrarySession[];
  onUpload: () => void;
  onSelectSession: (id: string) => void;
}) {
  const totalSessions = sessions.length;
  const totalWords = sessions.reduce((s, r) => s + (r.wordCount ?? 0), 0);
  const totalSeconds = sessions.reduce((s, r) => s + (r.duration ?? 0), 0);
  const uniqueSpeakers = useMemo(() => {
    const names = new Set<string>();
    sessions.forEach((s) => {
      parseTurns(s.transcript.bengali || s.transcript.english).forEach((t) =>
        names.add(t.speaker),
      );
    });
    return names.size;
  }, [sessions]);

  return (
    <div className="flex min-h-0 flex-1 flex-col overflow-y-auto px-8 py-8">
      {/* Header */}
      <motion.div
        initial={{ opacity: 0, y: -16 }}
        animate={{ opacity: 1, y: 0 }}
        transition={{ duration: 0.5, ease: [0.16, 1, 0.3, 1] }}
        className="mb-6 flex items-end justify-between"
      >
        <div>
          <h1 className="text-[24px] font-bold tracking-tight" style={{ color: "var(--text-900)" }}>
            Dashboard
          </h1>
          <p className="mt-0.5 text-[13px]" style={{ color: "var(--text-400)" }}>
            {totalSessions === 0
              ? "Upload your first session to see insights"
              : `Insights across ${totalSessions} session${totalSessions !== 1 ? "s" : ""}`}
          </p>
        </div>
        <motion.button
          whileHover={{ scale: 1.03 }}
          whileTap={{ scale: 0.97 }}
          onClick={onUpload}
          className="inline-flex items-center gap-2 rounded-xl px-4 py-2.5 text-[13px] font-semibold text-white transition-colors"
          style={{ background: BRAND }}
        >
          <Plus size={15} strokeWidth={2.2} />
          New Session
        </motion.button>
      </motion.div>

      {/* KPI row */}
      <div className="mb-5 grid grid-cols-2 gap-4 sm:grid-cols-4">
        <StatPill
          index={0}
          icon={<Mic size={18} />}
          label="Total sessions"
          value={totalSessions}
          sub="all time"
          color={BRAND}
        />
        <StatPill
          index={1}
          icon={<BookOpen size={18} />}
          label="Words transcribed"
          value={totalWords}
          sub="across all sessions"
          color={TEAL}
        />
        <StatPill
          index={2}
          icon={<Clock size={18} />}
          label="Minutes recorded"
          value={Math.round(totalSeconds / 60)}
          sub="total audio"
          color={PURPLE}
        />
        <StatPill
          index={3}
          icon={<Users size={18} />}
          label="Unique speakers"
          value={uniqueSpeakers}
          sub="identified"
          color={GOLD}
        />
      </div>

      {/* Charts grid */}
      <div className="grid grid-cols-1 gap-5 md:grid-cols-2 xl:grid-cols-3">
        {/* row 1 */}
        <div className="md:col-span-2">
          <ActivityChart sessions={sessions} index={4} />
        </div>
        <LanguageMix sessions={sessions} index={5} />

        {/* row 2 */}
        <SpeakerBalance sessions={sessions} index={6} />
        <SessionLengthChart sessions={sessions} index={7} />
        <EngagementScore sessions={sessions} index={8} />

        {/* row 3 – full width */}
        <div className="md:col-span-2">
          <TopTopics sessions={sessions} index={9} />
        </div>
        <RecentSessionList sessions={sessions} onSelect={onSelectSession} index={10} />
      </div>
    </div>
  );
}
