/**
 * Vocative name extraction.
 *
 * Scans transcript turns for high-confidence signals that someone is being
 * directly addressed by name. When Speaker A says "Dikkhita, please read…"
 * and Speaker B (Dikkhita) responds next, we attribute the name to Speaker B.
 *
 * Rules:
 *   - A vocative is a name/title followed by a comma (or comma-then-space)
 *     at the start of a turn, or preceding an imperative / direct question.
 *   - Generic titles (sir, ma'am, bhai, didi, apa, etc.) are used as-is —
 *     the user can rename later.
 *   - A name must appear 2+ times attributed to the same speaker for
 *     "high" confidence. Once → "low" (surfaced as suggestion, not auto-filled).
 *   - If the same name points to different speakers, confidence is "low" for both.
 */

export interface DetectedName {
  name: string;
  confidence: 'high' | 'low';
}

interface MinimalTurn {
  speaker: string;
  speakerIndex: number;
  text: string;
}

// Patterns that match a vocative at the start of an utterance or anywhere
// before a comma:
//   "Habib, can you..." | "Sir, please..." | "Dikkhi bhai, ..." | "হাবিব,"
const VOCATIVE_RE =
  /^([A-Za-z\u0980-\u09FF][A-Za-z\u0980-\u09FF\s]{0,24}?)(?:\s+(?:bhai|didi|apa|dada|madam|sir|ma'am|mam))?[,،]/u;

// Titles that are meaningful labels even though they're not proper names
const TITLE_WORDS = new Set([
  'sir', "sir,", 'madam', "ma'am", 'mam', 'teacher', 'bhai', 'didi', 'apa',
  'dada', 'mama', 'chacha', 'uncle', 'aunty', 'auntie',
]);

function isMeaningfulToken(token: string): boolean {
  const t = token.trim().toLowerCase();
  return t.length >= 2 && !/^\d+$/.test(t);
}

/**
 * Given an array of transcript turns (parsed by parseTurns), return a map
 * from speakerIndex → detected name + confidence.
 *
 * The caller is responsible for deciding what to show based on confidence.
 */
export function extractVocativeNames(
  turns: MinimalTurn[],
): Map<number, DetectedName> {
  // Step 1: find all vocative tokens in each turn and attribute them to the
  // *next* speaker (the one being addressed).
  const attributions: Map<number, string[]> = new Map();

  for (let i = 0; i < turns.length - 1; i++) {
    const turn = turns[i];
    const nextTurn = turns[i + 1];
    if (nextTurn.speakerIndex === turn.speakerIndex) continue; // same speaker, skip

    const match = VOCATIVE_RE.exec(turn.text.trim());
    if (!match) continue;

    const candidate = match[1].trim();
    if (!isMeaningfulToken(candidate)) continue;

    const list = attributions.get(nextTurn.speakerIndex) ?? [];
    list.push(candidate.toLowerCase());
    attributions.set(nextTurn.speakerIndex, list);
  }

  // Step 2: for each speaker, pick the most frequent candidate name
  const result = new Map<number, DetectedName>();

  for (const [speakerIndex, candidates] of attributions) {
    const freq = new Map<string, number>();
    for (const c of candidates) freq.set(c, (freq.get(c) ?? 0) + 1);

    // Sort by frequency, then length (prefer longer / more specific)
    const sorted = [...freq.entries()].sort(
      ([, a], [, b]) => b - a || b.toString().length - a.toString().length,
    );

    const [topName, topCount] = sorted[0];

    // Titlecase the name
    const display = topName
      .split(/\s+/)
      .map((w) => {
        if (TITLE_WORDS.has(w)) return w.charAt(0).toUpperCase() + w.slice(1);
        return w.charAt(0).toUpperCase() + w.slice(1);
      })
      .join(' ');

    result.set(speakerIndex, {
      name: display,
      confidence: topCount >= 2 ? 'high' : 'low',
    });
  }

  // Step 3: if the same name maps to two different speakers, demote both
  const nameToSpeakers = new Map<string, number[]>();
  for (const [idx, { name }] of result) {
    const key = name.toLowerCase();
    const list = nameToSpeakers.get(key) ?? [];
    list.push(idx);
    nameToSpeakers.set(key, list);
  }
  for (const [, speakers] of nameToSpeakers) {
    if (speakers.length > 1) {
      for (const idx of speakers) {
        const entry = result.get(idx)!;
        result.set(idx, { ...entry, confidence: 'low' });
      }
    }
  }

  return result;
}
