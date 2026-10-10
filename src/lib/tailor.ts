/* Resume tailoring helpers: PURE (no storage, no DOM).
 * The resume text itself is never persisted: Check fit hands it over through
 * sessionStorage (read once and removed, see Tailor.tsx) and it otherwise
 * lives only in component state. */

import type { Analysis, GapRow } from "../types";

export const MAX_BULLETS = 12;
export const MAX_RESUME_CHARS = 8000;
export const MAX_BULLET_CHARS = 400;

export interface TailorSuggestion {
  index: number;
  original: string;
  rewritten: string;
  keywords_added: string[];
  why: string;
  needs_fact: boolean;
  fact_question?: string;
}

const BULLET_MARK = /^\s*(?:[-*•▪●–—>]|\d+[.)])\s+/;

/** Lines that read like resume bullets: bullet-marked lines first, else
 * sentence-length lines (≥ 30 chars, not ALL CAPS headings). */
export function extractBullets(text: string, max = MAX_BULLETS): string[] {
  const lines = String(text || "").replace(/\r\n?/g, "\n").split("\n").map((l) => l.trim()).filter(Boolean);
  const marked = lines.filter((l) => BULLET_MARK.test(l)).map((l) => l.replace(BULLET_MARK, "").trim());
  const pool = marked.length >= 2 ? marked : lines.filter((l) => l.length >= 30 && l !== l.toUpperCase());
  const seen = new Set<string>();
  const out: string[] = [];
  for (const l of pool) {
    const v = l.replace(/\s+/g, " ").slice(0, MAX_BULLET_CHARS);
    if (v.length < 12 || seen.has(v.toLowerCase())) continue;
    seen.add(v.toLowerCase());
    out.push(v);
    if (out.length >= max) break;
  }
  return out;
}

/** The pasted textarea → bullets (one per line, markers stripped). */
export function splitBullets(text: string, max = MAX_BULLETS): string[] {
  return String(text || "").replace(/\r\n?/g, "\n").split("\n")
    .map((l) => l.replace(BULLET_MARK, "").replace(/\s+/g, " ").trim())
    .filter((l) => l.length >= 3)
    .slice(0, max)
    .map((l) => l.slice(0, MAX_BULLET_CHARS));
}

const name = (s: unknown) => (typeof s === "string" ? s : s && typeof s === "object" && "name" in s ? String((s as { name: unknown }).name) : "");

/** The job's skills + keywords to cover, most important first, de-duplicated. */
export function jobKeywords(a: Analysis | null | undefined, gap: GapRow | null | undefined, max = 25): string[] {
  const raw = [
    ...((a?.coreSkills || []).map(name)),
    ...((gap?.result?.missingSkills || [])),
    ...((gap?.result?.missingKeywords || [])),
    ...((a?.technologies || [])),
    ...((a?.preferredSkills || []).map(name)),
  ];
  const seen = new Set<string>();
  const out: string[] = [];
  for (const r of raw) {
    const v = String(r || "").replace(/\s+/g, " ").trim();
    if (!v || v.length > 60 || seen.has(v.toLowerCase())) continue;
    seen.add(v.toLowerCase());
    out.push(v);
    if (out.length >= max) break;
  }
  return out;
}

const esc = (s: string) => s.replace(/[.*+?^${}()|[\]\\]/g, "\\$&");

/** Does `text` mention `keyword` (case-insensitive, whole-word-ish)? */
export function mentions(text: string, keyword: string): boolean {
  const k = keyword.trim();
  if (!k) return false;
  const re = new RegExp("(^|[^A-Za-z0-9+#])" + esc(k) + "(?=$|[^A-Za-z0-9+#])", "i");
  return re.test(text);
}

export interface Coverage { covered: string[]; missing: string[]; pct: number }

export function keywordCoverage(keywords: string[], bullets: string[]): Coverage {
  const text = bullets.join("\n");
  const covered = keywords.filter((k) => mentions(text, k));
  const missing = keywords.filter((k) => !covered.includes(k));
  return { covered, missing, pct: keywords.length ? Math.round((covered.length / keywords.length) * 100) : 0 };
}

/** The bullets after the user's accept/reject choices. */
export function finalBullets(originals: string[], suggestions: TailorSuggestion[], accepted: Record<number, boolean>): string[] {
  return originals.map((o, i) => {
    const s = suggestions.find((x) => x.index === i);
    return s && accepted[i] !== false ? s.rewritten : o;
  });
}

/** Text for "Copy all": one bullet per line. */
export function bulletsToText(bullets: string[]): string {
  return bullets.map((b) => "• " + b).join("\n");
}

/** Placeholders the rewrite left for the user to fill, e.g. "[X%]". */
export function hasPlaceholder(s: string): boolean {
  return /\[[^\]]{0,40}\]/.test(String(s || ""));
}

/**
 * Put rewritten bullets back into the full resume text: each line whose
 * bullet text equals an original is replaced, keeping its bullet mark and
 * indentation. Pure. Returns the new text and how many were (not) found.
 */
export function applyToResume(resumeText: string, pairs: { original: string; rewritten: string }[]): { text: string; replaced: number; missed: string[] } {
  const norm = (s: string) => s.replace(BULLET_MARK, "").replace(/\s+/g, " ").trim().toLowerCase();
  const lines = String(resumeText || "").replace(/\r\n?/g, "\n").split("\n");
  const used = new Set<number>();
  let replaced = 0;
  const missed: string[] = [];
  for (const p of pairs) {
    if (!p.rewritten.trim() || p.rewritten.trim() === p.original.trim()) continue;
    const want = p.original.replace(/\s+/g, " ").trim().toLowerCase();
    const i = lines.findIndex((l, k) => !used.has(k) && norm(l) && (norm(l) === want || (want.length >= 40 && norm(l).startsWith(want))));
    if (i < 0) { missed.push(p.original); continue; }
    const lead = (/^\s*(?:[-*•▪●–—>]|\d+[.)])\s+/.exec(lines[i]) || /^\s*/.exec(lines[i]) || [""])[0];
    lines[i] = lead + p.rewritten.replace(/\s+/g, " ").trim();
    used.add(i);
    replaced++;
  }
  return { text: lines.join("\n"), replaced, missed };
}
