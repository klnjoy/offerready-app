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

/** Bullet symbols as they come out of PDFs and Word: •, ▪, ●, ◦, ‣, and the
 * private-use Symbol/Wingdings glyphs (,  …) that often arrive mid-line. */
const GLYPHS = /\s*[•▪●◦‣⁃∙►➢❖]\s*/g;
/** Contact details and links: never treat these as bullets (and never send them). */
const CONTACT = /@[A-Za-z0-9-]+\.|\(\d{3}\)\s*\d{3}|\b\d{3}[-.\s]\d{3}[-.\s]\d{4}\b|linkedin\.com|github\.com|https?:\/\/|www\./i;
/** Job header lines: "Senior Engineer  Jun 2016 – Jul 2019" and similar. */
const DATE_RANGE = /\b(?:19|20)\d{2}\s*[–—-]\s*(?:(?:19|20)\d{2}|present|current|now)\b/i;
const LABEL_LINE = /^(?:technologies|tools|skills|environment|tech stack|project)\s*:/i;

function isHeading(l: string): boolean {
  const letters = l.replace(/[^A-Za-z]/g, "");
  if (letters.length >= 4 && letters === letters.toUpperCase() && l.length < 80) return true;
  return /:$/.test(l) && l.length < 60;
}

/** True when a line can't be a resume bullet (contact info, headings, dates). */
export function notABullet(l: string): boolean {
  return CONTACT.test(l) || DATE_RANGE.test(l) || LABEL_LINE.test(l) || isHeading(l);
}

/** Long run-on text (a PDF paragraph) → sentence-sized pieces. */
function pieces(l: string): string[] {
  if (l.length <= MAX_BULLET_CHARS) return [l];
  return l.split(/(?<=[.!?;])\s+(?=[A-Z])/).map((x) => x.trim()).filter(Boolean)
    .flatMap((x) => (x.length > MAX_BULLET_CHARS ? [x.slice(0, MAX_BULLET_CHARS).replace(/\s+\S*$/, "")] : [x]));
}

/** Resume text → the lines most likely to be achievement bullets.
 * Bullet-marked lines (including symbols mid-line) win; otherwise
 * sentence-length lines. Contact details, headings and job/date headers are
 * always skipped. */
export function extractBullets(text: string, max = MAX_BULLETS): string[] {
  const norm = String(text || "").replace(/\r\n?/g, "\n").replace(GLYPHS, "\n\u0007");
  const lines = norm.split("\n").map((l) => l.trim()).filter(Boolean);
  const marked = lines.filter((l) => l.startsWith("\u0007") || BULLET_MARK.test(l))
    .map((l) => l.replace(/^\u0007/, "").replace(BULLET_MARK, "").trim());
  const usable = (arr: string[]) => arr.flatMap(pieces).filter((l) => l.length >= 30 && !notABullet(l));
  // "AI • Snowflake • AWS" in a header also uses bullet symbols, so marked
  // lines only win when at least two of them survive the filters.
  const fromMarked = usable(marked);
  const base = fromMarked.length >= 2 ? fromMarked : usable(lines.map((l) => l.replace(/^\u0007/, "")));
  const seen = new Set<string>();
  const out: string[] = [];
  for (const l of base) {
    const v = l.replace(/\s+/g, " ").slice(0, MAX_BULLET_CHARS);
    if (seen.has(v.toLowerCase())) continue;
    seen.add(v.toLowerCase());
    out.push(v);
    if (out.length >= max) break;
  }
  return out;
}

/** The pasted textarea → bullets (one per line, markers stripped). Lines with
 * contact details are dropped so they're never sent. */
export function splitBullets(text: string, max = MAX_BULLETS): string[] {
  return String(text || "").replace(/\r\n?/g, "\n").replace(GLYPHS, "\n").split("\n")
    .map((l) => l.replace(BULLET_MARK, "").replace(/\s+/g, " ").trim())
    .filter((l) => l.length >= 3 && !CONTACT.test(l))
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
  // Match on the words only, so bullet glyphs, line wraps from a PDF and extra
  // spaces between them don't stop a bullet from being found. The match is
  // replaced in place: any bullet marker before it and the text around it
  // (another bullet on the same line, a wrapped next line) are kept.
  let text = String(resumeText || "").replace(/\r\n?/g, "\n");
  let replaced = 0;
  const missed: string[] = [];
  for (const p of pairs) {
    const rewritten = p.rewritten.replace(/\s+/g, " ").trim();
    if (!rewritten || rewritten === p.original.replace(/\s+/g, " ").trim()) continue;
    const words = p.original.match(/[\p{L}\p{N}]+/gu) || [];
    if (words.length < 3) { missed.push(p.original); continue; }
    const re = new RegExp("(?<![\\p{L}\\p{N}])" + words.map(esc).join("[^\\p{L}\\p{N}]+") + "(?![\\p{L}\\p{N}])", "iu");
    const m = re.exec(text);
    if (!m) { missed.push(p.original); continue; }
    let end = m.index + m[0].length;
    // Take the original's closing punctuation along, so it isn't doubled.
    const close = /[.!?;:]$/.exec(p.original.trim());
    if (close && text[end] === close[0]) end++;
    text = text.slice(0, m.index) + rewritten + text.slice(end);
    replaced++;
  }
  return { text, replaced, missed };
}
