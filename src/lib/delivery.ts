/* Delivery metrics for spoken answers (voice mock interview). Pure: no DOM,
 * no storage, so it's unit-tested directly and portable to React Native.
 *
 * Inputs come from the speech recognizer: the final transcript, the answer
 * duration, and (when the browser provides them) the silent gaps between
 * recognition results. Speech-to-text has no punctuation, so the filler
 * rules use word context instead of commas. */

export const WPM_TARGET = { min: 120, max: 160 } as const;
export const LONG_PAUSE_MS = 2000;

export interface DeliveryInput {
  transcript: string;
  /** Wall-clock answer time, ms (start → done). */
  durationMs: number;
  /** Silent gaps between recognition results, ms. Omit when unknown. */
  gapsMs?: number[];
  /** Soft target for this answer, seconds (main ≈ 120, follow-up ≈ 60). */
  targetSec?: number;
  behavioral?: boolean;
}

export type LengthBand = "short" | "good" | "long";

export interface DeliveryMetrics {
  words: number;
  durationSec: number;
  /** null when the answer is too short to measure (typed, or < 10 s / 15 words). */
  wpm: number | null;
  fillers: { total: number; per100: number; byWord: Record<string, number> };
  /** null when timing gaps are unavailable. */
  longPauses: number | null;
  longestPauseSec: number | null;
  targetSec: number;
  length: LengthBand;
  /** Share of first-person-singular vs plural, 0–1; null when neither appears. */
  iShare: number | null;
  iCount: number;
  weCount: number;
  behavioral: boolean;
}

export interface Tip {
  tone: "good" | "tip";
  text: string;
}

const round1 = (n: number) => Math.round(n * 10) / 10;

/** Lowercase word tokens; keeps apostrophes inside words ("i'm", "we've"). */
export function tokenize(text: string): string[] {
  return String(text || "")
    .toLowerCase()
    .replace(/[’‘]/g, "'")
    .split(/[^a-z0-9']+/)
    .map((w) => w.replace(/^'+|'+$/g, ""))
    .filter(Boolean);
}

// "like" is a filler unless it's a verb or comparison ("I like", "looks like").
const LIKE_NOT_FILLER_BEFORE = new Set([
  "i", "we", "you", "they", "he", "she", "would", "i'd", "we'd", "you'd", "they'd", "don't", "didn't", "doesn't",
  "look", "looks", "looked", "looking", "feel", "feels", "felt", "seem", "seems", "seemed", "sound", "sounds", "sounded",
  "something", "anything", "nothing", "things", "stuff", "more", "less", "much", "exactly", "just", "really", "also", "not", "is", "was", "be",
]);
// "kind of / sort of" is a filler unless it qualifies a noun ("what kind of index").
const KIND_NOT_FILLER_BEFORE = new Set([
  "what", "which", "this", "that", "the", "a", "any", "some", "same", "different", "every", "each", "one", "another", "other", "these", "those", "right", "wrong", "new",
]);

/** Filler counts per phrase. */
export function countFillers(text: string): Record<string, number> {
  const w = tokenize(text);
  const out: Record<string, number> = {};
  const add = (k: string) => { out[k] = (out[k] || 0) + 1; };
  for (let i = 0; i < w.length; i++) {
    const t = w[i];
    const prev = i > 0 ? w[i - 1] : "";
    const next = w[i + 1] || "";
    if (/^u+m+$|^u+h+m*$|^e+r+m+$|^h+m+$/.test(t)) { add(t.startsWith("u") && t.includes("h") ? "uh" : "um"); continue; }
    if (t === "basically" || t === "actually") { add(t); continue; }
    if (t === "like") {
      if (!LIKE_NOT_FILLER_BEFORE.has(prev)) add("like");
      continue;
    }
    if (t === "you" && next === "know") {
      const after = w[i + 2] || "";
      if (!["do", "did", "if", "don't", "would", "might", "may"].includes(prev) && !["what", "how", "why", "when", "that", "whether", "the"].includes(after)) add("you know");
      i++;
      continue;
    }
    if ((t === "kind" || t === "sort") && next === "of") {
      if (!KIND_NOT_FILLER_BEFORE.has(prev)) add(t + " of");
      i++;
      continue;
    }
  }
  return out;
}

const I_WORDS = new Set(["i", "i'm", "i've", "i'd", "i'll", "me", "my", "myself", "mine"]);
const WE_WORDS = new Set(["we", "we're", "we've", "we'd", "we'll", "us", "our", "ours", "ourselves"]);

export function pronounCounts(text: string): { i: number; we: number } {
  let i = 0;
  let we = 0;
  for (const t of tokenize(text)) {
    if (I_WORDS.has(t)) i++;
    else if (WE_WORDS.has(t)) we++;
  }
  return { i, we };
}

export function lengthBand(durationSec: number, targetSec: number): LengthBand {
  if (durationSec < targetSec * 0.35) return "short";
  if (durationSec > targetSec * 1.3) return "long";
  return "good";
}

export function computeDelivery(input: DeliveryInput): DeliveryMetrics {
  const words = tokenize(input.transcript).length;
  const durationSec = Math.max(0, (Number(input.durationMs) || 0) / 1000);
  const targetSec = input.targetSec && input.targetSec > 0 ? input.targetSec : 120;
  const wpm = durationSec >= 10 && words >= 15 ? Math.round(words / (durationSec / 60)) : null;
  const byWord = countFillers(input.transcript);
  const total = Object.values(byWord).reduce((a, b) => a + b, 0);
  const gaps = Array.isArray(input.gapsMs) ? input.gapsMs.filter((g) => typeof g === "number" && isFinite(g) && g >= 0) : null;
  const long = gaps ? gaps.filter((g) => g >= LONG_PAUSE_MS) : null;
  const { i, we } = pronounCounts(input.transcript);
  return {
    words,
    durationSec: Math.round(durationSec),
    wpm,
    fillers: { total, per100: words ? round1((total / words) * 100) : 0, byWord },
    longPauses: long ? long.length : null,
    longestPauseSec: gaps && gaps.length ? round1(Math.max(...gaps) / 1000) : null,
    targetSec,
    length: lengthBand(durationSec, targetSec),
    iShare: i + we ? round1(i / (i + we)) : null,
    iCount: i,
    weCount: we,
    behavioral: !!input.behavioral,
  };
}

/** Gentle, specific guidance for one answer. At most 4 tips, good news first. */
export function deliveryTips(m: DeliveryMetrics): Tip[] {
  const tips: Tip[] = [];
  if (m.wpm !== null) {
    if (m.wpm < WPM_TARGET.min - 10) tips.push({ tone: "tip", text: `About ${m.wpm} words a minute: a little slow. Aim for ${WPM_TARGET.min}–${WPM_TARGET.max}; shorter sentences help keep momentum.` });
    else if (m.wpm > WPM_TARGET.max + 15) tips.push({ tone: "tip", text: `About ${m.wpm} words a minute: on the fast side. Pause after each key point so it lands.` });
    else tips.push({ tone: "good", text: `Comfortable pace (${m.wpm} wpm).` });
  }
  if (m.words >= 20) {
    if (m.fillers.per100 >= 4) {
      const top = Object.entries(m.fillers.byWord).sort((a, b) => b[1] - a[1])[0];
      tips.push({ tone: "tip", text: `${m.fillers.total} filler words (${m.fillers.per100} per 100${top ? `, mostly “${top[0]}”` : ""}). A silent pause sounds more confident than a filler.` });
    } else if (m.fillers.total <= 1) tips.push({ tone: "good", text: "Very few filler words." });
  }
  if (m.longPauses) tips.push({ tone: "tip", text: `${m.longPauses} long pause${m.longPauses === 1 ? "" : "s"}${m.longestPauseSec ? ` (longest ${m.longestPauseSec}s)` : ""}. It's fine to say “let me think for a second” out loud.` });
  if (m.length === "short" && m.words > 0) tips.push({ tone: "tip", text: `Short for this question (${m.durationSec}s vs a ~${m.targetSec}s target). Add a concrete example and the result.` });
  else if (m.length === "long") tips.push({ tone: "tip", text: `Long (${m.durationSec}s vs a ~${m.targetSec}s target). Lead with the headline, then offer to go deeper.` });
  if (m.behavioral && m.iShare !== null && m.iCount + m.weCount >= 4) {
    if (m.iShare < 0.4) tips.push({ tone: "tip", text: `Mostly “we” (${m.weCount}) vs “I” (${m.iCount}). Interviewers grade your part: say what you did.` });
    else tips.push({ tone: "good", text: "Clear about your own role (“I” vs “we”)." });
  }
  const good = tips.filter((t) => t.tone === "good");
  const fix = tips.filter((t) => t.tone === "tip");
  return [...good.slice(0, 1), ...fix].slice(0, 4);
}

export interface DeliverySummary {
  answers: number;
  avgWpm: number | null;
  fillersPer100: number;
  fillerTotal: number;
  longPauses: number | null;
  iShare: number | null;
  onTarget: number;
}

/** Session roll-up (word-weighted filler rate, mean of measurable wpm). */
export function summarizeDelivery(list: DeliveryMetrics[]): DeliverySummary {
  const wpms = list.map((m) => m.wpm).filter((x): x is number => x !== null);
  const words = list.reduce((a, m) => a + m.words, 0);
  const fillers = list.reduce((a, m) => a + m.fillers.total, 0);
  const pauses = list.map((m) => m.longPauses).filter((x): x is number => x !== null);
  const beh = list.filter((m) => m.behavioral);
  const iC = beh.reduce((a, m) => a + m.iCount, 0);
  const weC = beh.reduce((a, m) => a + m.weCount, 0);
  return {
    answers: list.length,
    avgWpm: wpms.length ? Math.round(wpms.reduce((a, b) => a + b, 0) / wpms.length) : null,
    fillersPer100: words ? round1((fillers / words) * 100) : 0,
    fillerTotal: fillers,
    longPauses: pauses.length ? pauses.reduce((a, b) => a + b, 0) : null,
    iShare: iC + weC ? round1(iC / (iC + weC)) : null,
    onTarget: list.filter((m) => m.length === "good").length,
  };
}
