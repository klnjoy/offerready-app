/* Shared local progress store (was window.OfferReadyProgress in
 * content/assets/progress-store.js). Same keys + shapes. */

import { KEYS, readJSON, writeJSON } from "./storage";

const MAX_HISTORY = 100;
const MAX_ACTIVITY = 50;

export type SessionMode = "practice" | "flashcard" | "exam" | "why" | "scenario" | string;

export interface HistoryEntry {
  key?: string;
  when: string;
  mode: SessionMode;
  track: string;
  topic: string;
  score: number;
  n: number;
  total?: number;
  partial?: boolean;
  topics: Record<string, number>;
}

export interface ActivityEntry {
  type: string;
  label: string;
  role: string;
  gaps: string[];
  when: string;
  at: number;
}

type HistoryInput = Partial<HistoryEntry> & { key?: string };

function normalize(s: HistoryInput): HistoryEntry {
  return {
    when: s.when || new Date().toLocaleString(),
    mode: s.mode || "practice",
    track: s.track || "",
    topic: s.topic || "",
    score: typeof s.score === "number" ? s.score : 0,
    n: typeof s.n === "number" ? s.n : 0,
    topics: s.topics || {},
  };
}

export function getHistory(): HistoryEntry[] {
  return readJSON<HistoryEntry[]>(KEYS.history, []);
}

export function getActivity(): ActivityEntry[] {
  return readJSON<ActivityEntry[]>(KEYS.activity, []);
}

/** Record a completed, scored session. */
export function record(s: HistoryInput & { partial?: boolean }): HistoryEntry {
  const rec: HistoryEntry = { ...normalize(s) };
  if (s.partial) rec.partial = true;
  const h = getHistory();
  h.unshift(rec);
  writeJSON(KEYS.history, h.slice(0, MAX_HISTORY));
  return rec;
}

/** Record or update in place by `key` (live/partial multi-step runs). */
export function upsert(s: HistoryInput): HistoryEntry {
  if (!s.key) return record(s);
  const rec: HistoryEntry = {
    key: s.key,
    ...normalize(s),
    total: typeof s.total === "number" ? s.total : 0,
    partial: !!s.partial,
  };
  const h = getHistory().filter((x) => !(x && x.key === rec.key));
  h.unshift(rec);
  writeJSON(KEYS.history, h.slice(0, MAX_HISTORY));
  return rec;
}

/** Log a non-scored activity (e.g. an Analyze run). */
export function logActivity(e: { type?: string; label?: string; role?: string; gaps?: string[]; when?: string }): void {
  const rec: ActivityEntry = {
    type: e.type || "activity",
    label: e.label || "",
    role: e.role || "",
    gaps: Array.isArray(e.gaps) ? e.gaps.slice(0, 8) : [],
    when: e.when || new Date().toLocaleString(),
    at: Date.now(),
  };
  const a = getActivity();
  a.unshift(rec);
  writeJSON(KEYS.activity, a.slice(0, MAX_ACTIVITY));
}

/** Average % per topic across saved sessions (lower = weaker). */
export function weakTopicScores(): Record<string, number> {
  const acc: Record<string, number[]> = {};
  getHistory().forEach((e) => {
    const t = e.topics || {};
    Object.keys(t).forEach((k) => {
      (acc[k] = acc[k] || []).push(Number(t[k]) || 0);
    });
  });
  const out: Record<string, number> = {};
  Object.keys(acc).forEach((k) => {
    out[k] = Math.round(acc[k].reduce((a, b) => a + b, 0) / acc[k].length);
  });
  return out;
}
