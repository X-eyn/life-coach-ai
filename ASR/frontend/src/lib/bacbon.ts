/**
 * BacBon — shared helpers for the transcription dashboard.
 *
 * Owns:
 *   • library session persistence (localStorage)
 *   • transcript parsing into speaker turns
 *   • derived displays (time ago, duration, language split, topic extraction)
 *   • per-session notes / highlights storage
 */

export const LIBRARY_KEY = "atelier_library";
export const NOTES_KEY = (sessionId: string) => `bacbon_notes_${sessionId}`;
export const HIGHLIGHTS_KEY = (sessionId: string) => `bacbon_highlights_${sessionId}`;
export const EVAL_KEY = (sessionId: string) => `bacbon_eval_${sessionId}`;

export type Transcript = {
  bengali: string;
  english: string;
};

export type Speaker = {
  id: number;
  wordCount: number;
};

export type LibrarySession = {
  id: string;
  name: string;
  createdAt: number;
  duration: number | null;
  wordCount: number;
  transcript: Transcript;
  waveformPeaks: number[];
  fullWaveformPeaks?: number[];
  fullBarSpeakers?: number[];
  speakers: Speaker[];
  languageSplit: { bn: number; en: number };
  speakerNames?: Record<number, string>;
  evaluationScore?: number | null;
};

export type Turn = {
  id: string;
  speaker: string;
  speakerIndex: number;
  wordCount: number;
  text: string;
};

export type Note = {
  id: string;
  text: string;
  turnIndex?: number;
  createdAt: number;
};

export type Highlight = {
  id: string;
  turnIndex: number;
  text: string;
  createdAt: number;
};

/* ─── Transcript parsing ──────────────────────────────────────────────── */

export function parseTurns(transcript: string): Turn[] {
  if (!transcript) return [];
  const text = transcript.replace(/\r\n/g, "\n");
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
    const t = transcript.trim();
    return [{ id: "0", speaker: "Speaker 1", speakerIndex: 0, text: t, wordCount: countWords(t) }];
  }

  const speakerMap = new Map<string, number>();
  for (const { speaker } of markers) {
    if (!speakerMap.has(speaker)) speakerMap.set(speaker, speakerMap.size);
  }

  const turns: Turn[] = [];
  for (let i = 0; i < markers.length; i++) {
    const { speaker, index: start } = markers[i];
    const end =
      i + 1 < markers.length
        ? markers[i + 1].index - markers[i + 1].fullMatch.length
        : text.length;
    const raw = text.slice(start, end).trim();
    if (!raw) continue;
    turns.push({
      id: `${i}`,
      speaker,
      speakerIndex: speakerMap.get(speaker) ?? 0,
      text: raw,
      wordCount: countWords(raw),
    });
  }
  return turns;
}

export function countWords(text: string): number {
  return text.trim().split(/\s+/).filter(Boolean).length;
}

/* ─── Display helpers ─────────────────────────────────────────────────── */

export function fmtDuration(seconds: number | null | undefined): string {
  if (!seconds || isNaN(seconds)) return "00:00";
  const t = Math.max(0, Math.round(seconds));
  const h = Math.floor(t / 3600);
  const m = Math.floor((t % 3600) / 60);
  const s = t % 60;
  if (h > 0) {
    return `${h}:${m.toString().padStart(2, "0")}:${s.toString().padStart(2, "0")}`;
  }
  return `${m.toString().padStart(2, "0")}:${s.toString().padStart(2, "0")}`;
}

export function timeAgo(ts: number): string {
  const diff = Date.now() - ts;
  const mins = Math.floor(diff / 60_000);
  const hrs = Math.floor(diff / 3_600_000);
  const days = Math.floor(diff / 86_400_000);
  if (mins < 1) return "just now";
  if (mins < 60) return `${mins}m ago`;
  if (hrs < 24) return `${hrs}h ago`;
  if (days < 7) return `${days}d ago`;
  return new Date(ts).toLocaleDateString();
}

export function primaryLanguage(split?: { bn: number; en: number }): string {
  if (!split) return "English";
  if (split.bn >= 60) return "Bengali";
  if (split.en >= 60) return "English";
  return "Bilingual";
}

/* ─── Session storage ─────────────────────────────────────────────────── */

export function loadSessions(): LibrarySession[] {
  if (typeof window === "undefined") return [];
  try {
    const raw = localStorage.getItem(LIBRARY_KEY);
    if (!raw) return [];
    const parsed = JSON.parse(raw) as LibrarySession[];
    return Array.isArray(parsed) ? parsed : [];
  } catch {
    return [];
  }
}

export function saveSessions(sessions: LibrarySession[]): void {
  try {
    localStorage.setItem(LIBRARY_KEY, JSON.stringify(sessions));
  } catch {
    // Quota exceeded — silently ignore
  }
}

export function upsertSession(
  sessions: LibrarySession[],
  entry: LibrarySession,
  max = 50,
): LibrarySession[] {
  const deduped = sessions.filter((s) => s.id !== entry.id && s.name !== entry.name);
  return [entry, ...deduped].slice(0, max);
}

export function removeSession(sessions: LibrarySession[], id: string): LibrarySession[] {
  return sessions.filter((s) => s.id !== id);
}

export function renameSession(
  sessions: LibrarySession[],
  id: string,
  name: string,
): LibrarySession[] {
  return sessions.map((s) => (s.id === id ? { ...s, name } : s));
}

export function formatSessionName(file: File): string {
  const stem = file.name.replace(/\.[^/.]+$/, "");
  return stem.replace(/[_-]+/g, " ").trim() || file.name;
}

/* ─── Language split ──────────────────────────────────────────────────── */

export function langSplit(bengaliText: string): { bn: number; en: number } {
  const words = bengaliText.trim().split(/\s+/).filter(Boolean);
  if (!words.length) return { bn: 50, en: 50 };
  const bn = words.filter((w) => /[ঀ-৿]/.test(w)).length;
  const pct = Math.round((bn / words.length) * 100);
  return { bn: pct, en: 100 - pct };
}

/* ─── Topic extraction ─────────────────────────────────────────────────
   Unsupervised keyword extraction: rank tokens by frequency, excluding a
   focused English + Bengali stop-word list, then collapse morphological
   variants (simple plural/suffix trim). Returns the top N with a normalised
   "interest" score in [0, 100] relative to the top token.
   ───────────────────────────────────────────────────────────────────── */

const STOP_WORDS = new Set<string>([
  // English — high-frequency tokens that aren't topical
  "the", "a", "an", "and", "or", "but", "if", "so", "to", "of", "in", "on",
  "at", "for", "with", "from", "by", "is", "are", "was", "were", "be", "been",
  "being", "have", "has", "had", "do", "does", "did", "done", "will", "would",
  "should", "could", "can", "may", "might", "must", "shall",
  "i", "you", "he", "she", "it", "we", "they", "me", "him", "her", "us", "them",
  "my", "your", "his", "its", "our", "their", "this", "that", "these", "those",
  "as", "not", "no", "yes", "than", "then", "too", "very", "also", "just",
  "up", "out", "about", "into", "over", "under", "again", "only",
  "really", "well", "quite", "like", "get", "got", "go", "going", "come", "came",
  "say", "said", "tell", "told", "know", "knew", "think", "thought", "take", "took",
  "make", "made", "see", "saw", "want", "wanted", "need", "needed", "work",
  "thing", "things", "way", "ways", "time", "times", "day", "days",
  "one", "two", "some", "any", "all", "both", "each", "few", "more", "most",
  "other", "such", "own", "same", "so", "than", "here", "there", "when", "where",
  "why", "how", "what", "which", "who", "whom",
  // Interview fillers
  "okay", "yeah", "yes", "right", "absolutely", "definitely", "basically",
  "actually", "overall", "great", "wonderful", "hi", "hello", "thanks", "thank",
]);

export type Topic = { label: string; count: number; percent: number };

export function extractTopics(text: string, limit = 5): Topic[] {
  if (!text) return [];
  // Normalise: lowercase, collapse punctuation/whitespace
  const normalised = text
    .toLowerCase()
    .replace(/[^\w\sঀ-৿'-]/g, " ")
    .replace(/\s+/g, " ")
    .trim();

  const tokens = normalised.split(" ");

  // Build bigram candidates alongside unigrams — "mobile app" beats two
  // isolated counts of "mobile" and "app".
  const unigrams = new Map<string, number>();
  const bigrams = new Map<string, number>();

  for (let i = 0; i < tokens.length; i++) {
    const tok = tokens[i];
    if (!tok || tok.length < 3) continue;
    if (STOP_WORDS.has(tok)) continue;
    unigrams.set(tok, (unigrams.get(tok) ?? 0) + 1);

    if (i + 1 < tokens.length) {
      const next = tokens[i + 1];
      if (next && next.length >= 3 && !STOP_WORDS.has(next)) {
        const bg = `${tok} ${next}`;
        bigrams.set(bg, (bigrams.get(bg) ?? 0) + 1);
      }
    }
  }

  // Prefer a bigram over its constituent unigrams when both appear
  const combined = new Map<string, number>();
  for (const [bg, count] of bigrams) {
    if (count >= 2) {
      combined.set(bg, count * 2.2); // weight multi-word topics higher
      const [a, b] = bg.split(" ");
      unigrams.set(a, Math.max(0, (unigrams.get(a) ?? 0) - count));
      unigrams.set(b, Math.max(0, (unigrams.get(b) ?? 0) - count));
    }
  }
  for (const [tok, count] of unigrams) {
    if (count >= 2) combined.set(tok, (combined.get(tok) ?? 0) + count);
  }

  const ranked = [...combined.entries()]
    .sort((a, b) => b[1] - a[1])
    .slice(0, limit);

  if (ranked.length === 0) return [];

  const top = ranked[0][1];
  return ranked.map(([label, count]) => ({
    label: titleCase(label),
    count: Math.round(count),
    percent: Math.max(10, Math.round((count / top) * 100)),
  }));
}

function titleCase(s: string): string {
  return s
    .split(" ")
    .map((w) => w.charAt(0).toUpperCase() + w.slice(1))
    .join(" ");
}

/* ─── Quick summary — a fast heuristic used until /api/evaluate returns ── */

export function quickSummary(transcript: Transcript, turns: Turn[]): string {
  if (!turns.length) return "No transcript content yet.";

  const english = transcript.english || transcript.bengali;
  const sentences = english
    .split(/(?<=[.!?])\s+/)
    .map((s) => s.trim())
    .filter((s) => s.length > 20);

  if (sentences.length === 0) return "Transcript is too short to summarise.";

  const speakerCount = new Set(turns.map((t) => t.speakerIndex)).size;
  const topics = extractTopics(english, 3).map((t) => t.label.toLowerCase());

  const intro =
    speakerCount > 1
      ? `A ${speakerCount}-speaker conversation`
      : `A single-speaker recording`;

  const body = topics.length
    ? ` focused on ${topics.slice(0, 3).join(", ")}.`
    : ".";

  const longestSentence = sentences.reduce((a, b) => (a.length > b.length ? a : b));
  const highlight = longestSentence.length > 180
    ? longestSentence.slice(0, 180) + "…"
    : longestSentence;

  return `${intro}${body} Highlight: "${highlight}"`;
}

/* ─── Per-session notes / highlights ──────────────────────────────────── */

export function loadNotes(sessionId: string): Note[] {
  if (typeof window === "undefined") return [];
  try {
    const raw = localStorage.getItem(NOTES_KEY(sessionId));
    return raw ? (JSON.parse(raw) as Note[]) : [];
  } catch {
    return [];
  }
}

export function saveNotes(sessionId: string, notes: Note[]): void {
  try {
    localStorage.setItem(NOTES_KEY(sessionId), JSON.stringify(notes));
  } catch {}
}

export function loadHighlights(sessionId: string): Highlight[] {
  if (typeof window === "undefined") return [];
  try {
    const raw = localStorage.getItem(HIGHLIGHTS_KEY(sessionId));
    return raw ? (JSON.parse(raw) as Highlight[]) : [];
  } catch {
    return [];
  }
}

export function saveHighlights(sessionId: string, highlights: Highlight[]): void {
  try {
    localStorage.setItem(HIGHLIGHTS_KEY(sessionId), JSON.stringify(highlights));
  } catch {}
}

/* ─── Speaker share calculation ───────────────────────────────────────── */

export function speakerShares(turns: Turn[]): { id: number; name: string; percent: number }[] {
  const counts = new Map<number, { name: string; count: number }>();
  for (const t of turns) {
    const prev = counts.get(t.speakerIndex) ?? { name: t.speaker, count: 0 };
    prev.count += t.wordCount;
    counts.set(t.speakerIndex, prev);
  }
  const total = [...counts.values()].reduce((a, b) => a + b.count, 0) || 1;
  return [...counts.entries()]
    .sort(([a], [b]) => a - b)
    .map(([id, { name, count }]) => ({
      id,
      name: name || `Speaker ${id + 1}`,
      percent: Math.round((count / total) * 100),
    }));
}
