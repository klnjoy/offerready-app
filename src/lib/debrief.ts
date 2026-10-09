/* Post-interview debriefs: the shapes plus the PURE logic (no storage, no DOM,
 * no React) so the plan integration can be unit-tested in node.
 *
 * Storage lives in debriefStore.ts (KEYS.debriefs, local only).
 *
 * How a debrief feeds the prep plan:
 *  - debriefReviewTopics(): questions rated "bad" in recent debriefs for a job
 *    become review topics (newest first, de-duplicated, capped). Today passes
 *    them to buildPrepPlan({ debriefTopics }) which schedules spaced reviews.
 *  - nextRoundDate(): the latest debrief with outcome "next" and a future
 *    date is the job's new interview date; the plan re-anchors on it. */

export type RoundType = "recruiter" | "technical" | "system_design" | "behavioral" | "onsite" | "hiring_manager";
export type Rating = "good" | "ok" | "bad";
export type Outcome = "waiting" | "next" | "offer" | "rejected";

export const ROUND_LABELS: Record<RoundType, string> = {
  recruiter: "Recruiter screen",
  technical: "Technical",
  system_design: "System design",
  behavioral: "Behavioral",
  onsite: "Onsite / loop",
  hiring_manager: "Hiring manager",
};

export const OUTCOME_LABELS: Record<Outcome, string> = {
  waiting: "Waiting to hear",
  next: "Next round",
  offer: "Offer",
  rejected: "Rejected",
};

export const FEELINGS = ["Rough", "Shaky", "Okay", "Good", "Great"] as const;

export interface DebriefQuestion {
  id: string;
  text: string;
  rating: Rating | "";
  note: string;
}

export interface Debrief {
  id: string;
  jobId: string;
  /** Interview date "YYYY-MM-DD". */
  date: string;
  round: RoundType;
  interviewers: string;
  questions: DebriefQuestion[];
  /** 1 (rough) … 5 (great); 0 = not set. */
  feeling: number;
  outcome: Outcome;
  /** Next round date "YYYY-MM-DD" when outcome is "next" (may be ""). */
  nextDate: string;
  nextRound?: RoundType | "";
  notes: string;
  /** Company name as the user confirmed it (prefilled from the job). */
  company?: string;
  /** Opt-in: share company, round, month and the questions anonymously
   * (lib/communityShare.ts). Never interviewers or notes. */
  share?: boolean;
  createdAt: string;
  updatedAt: string;
}

export interface DebriefTopic {
  topic: string;
  round: RoundType;
  date: string;
  note?: string;
}

const ISO = /^\d{4}-\d{2}-\d{2}$/;
const toT = (s: string) => Date.UTC(+s.slice(0, 4), +s.slice(5, 7) - 1, +s.slice(8, 10));
const validDay = (s: unknown): s is string => typeof s === "string" && ISO.test(s) && !isNaN(toT(s)) && new Date(toT(s)).toISOString().slice(0, 10) === s;
const diff = (a: string, b: string) => Math.round((toT(b) - toT(a)) / 86400000);

const isRound = (v: unknown): v is RoundType => typeof v === "string" && Object.prototype.hasOwnProperty.call(ROUND_LABELS, v);
const isOutcome = (v: unknown): v is Outcome => typeof v === "string" && Object.prototype.hasOwnProperty.call(OUTCOME_LABELS, v);
const str = (v: unknown, max: number) => (typeof v === "string" ? v.slice(0, max) : "");

/** Make anything read from storage a valid Debrief (or null). */
export function normalizeDebrief(raw: unknown): Debrief | null {
  if (!raw || typeof raw !== "object") return null;
  const r = raw as Record<string, unknown>;
  const id = str(r.id, 64);
  const jobId = str(r.jobId, 128);
  if (!id || !jobId || !validDay(r.date)) return null;
  const questions: DebriefQuestion[] = (Array.isArray(r.questions) ? r.questions : []).slice(0, 40).flatMap((q, i) => {
    if (!q || typeof q !== "object") return [];
    const o = q as Record<string, unknown>;
    const text = str(o.text, 400).trim();
    if (!text) return [];
    const rating = o.rating === "good" || o.rating === "ok" || o.rating === "bad" ? o.rating : "";
    return [{ id: str(o.id, 64) || "q" + i, text, rating, note: str(o.note, 600) }];
  });
  const feeling = Math.max(0, Math.min(5, Math.round(Number(r.feeling) || 0)));
  return {
    id, jobId, date: r.date as string,
    round: isRound(r.round) ? r.round : "technical",
    interviewers: str(r.interviewers, 200),
    questions,
    feeling,
    outcome: isOutcome(r.outcome) ? r.outcome : "waiting",
    nextDate: validDay(r.nextDate) ? (r.nextDate as string) : "",
    nextRound: isRound(r.nextRound) ? r.nextRound : "",
    notes: str(r.notes, 2000),
    company: str(r.company, 80),
    share: r.share === true,
    createdAt: str(r.createdAt, 40),
    updatedAt: str(r.updatedAt, 40),
  };
}

/** A job's debriefs, newest interview first (ties: newest edit first). */
export function debriefsForJob(all: Debrief[], jobId: string): Debrief[] {
  return all.filter((d) => d.jobId === jobId).sort((a, b) => (a.date === b.date ? (b.updatedAt || "").localeCompare(a.updatedAt || "") : b.date.localeCompare(a.date)));
}

/** A question as a short plan topic ("Design a rate limiter for…"). */
export function topicFromQuestion(text: string, max = 60): string {
  const t = String(text || "").replace(/\s+/g, " ").trim().replace(/[?.!]+$/, "");
  if (t.length <= max) return t;
  return t.slice(0, max - 1).replace(/\s+\S*$/, "") + "…";
}

/**
 * Questions rated "bad" in this job's debriefs from the last `withinDays`
 * days, newest interview first, de-duplicated by topic, at most `max`.
 */
export function debriefReviewTopics(all: Debrief[], jobId: string, today: string, opts: { max?: number; withinDays?: number } = {}): DebriefTopic[] {
  const max = opts.max ?? 4;
  const within = opts.withinDays ?? 60;
  const out: DebriefTopic[] = [];
  const seen = new Set<string>();
  for (const d of debriefsForJob(all, jobId)) {
    if (!validDay(today) || diff(d.date, today) > within || d.date > today) continue;
    for (const q of d.questions) {
      if (q.rating !== "bad") continue;
      const topic = topicFromQuestion(q.text);
      const k = topic.toLowerCase();
      if (!topic || seen.has(k)) continue;
      seen.add(k);
      out.push({ topic, round: d.round, date: d.date, ...(q.note.trim() ? { note: q.note.trim().slice(0, 140) } : {}) });
      if (out.length >= max) return out;
    }
  }
  return out;
}

/**
 * The next interview date implied by the debriefs: the most recent debrief
 * (by interview date) decides. Outcome "next" with a valid date on or after
 * today → that date. Anything else → null (leave the date alone).
 */
export function nextRoundDate(all: Debrief[], jobId: string, today: string): string | null {
  const latest = debriefsForJob(all, jobId)[0];
  if (!latest || latest.outcome !== "next" || !validDay(latest.nextDate)) return null;
  return latest.nextDate >= today ? latest.nextDate : null;
}

/** What a saved debrief should do to the job's interview date. */
export function dateAfterDebrief(d: Debrief, currentDate: string, today: string): { action: "set"; date: string } | { action: "keep" } {
  if (d.outcome === "next" && validDay(d.nextDate) && d.nextDate >= today && d.nextDate !== currentDate) return { action: "set", date: d.nextDate };
  return { action: "keep" };
}

export interface DebriefStats {
  rounds: number;
  latest: Debrief | null;
  /** Days until the next round (0 = today), or null. */
  nextInDays: number | null;
  nextDate: string;
  bad: number;
  good: number;
  questions: number;
}

export function debriefStats(all: Debrief[], jobId: string, today: string): DebriefStats {
  const list = debriefsForJob(all, jobId);
  const nd = nextRoundDate(all, jobId, today);
  const qs = list.flatMap((d) => d.questions);
  return {
    rounds: list.length,
    latest: list[0] || null,
    nextInDays: nd ? diff(today, nd) : null,
    nextDate: nd || "",
    bad: qs.filter((q) => q.rating === "bad").length,
    good: qs.filter((q) => q.rating === "good").length,
    questions: qs.length,
  };
}

/** "2 rounds logged · next round in 4 days" */
export function statsLine(s: DebriefStats): string {
  if (!s.rounds) return "";
  const parts = [s.rounds + (s.rounds === 1 ? " round" : " rounds") + " logged"];
  if (s.nextInDays != null) parts.push(s.nextInDays === 0 ? "next round today" : s.nextInDays === 1 ? "next round tomorrow" : "next round in " + s.nextInDays + " days");
  else if (s.latest) {
    if (s.latest.outcome === "offer") parts.push("offer received");
    else if (s.latest.outcome === "rejected") parts.push("closed");
    else if (s.latest.outcome === "waiting") parts.push("waiting to hear");
    else parts.push("next round, date not set");
  }
  return parts.join(" · ");
}

const cut = (v: string, n: number) => { const t = String(v || "").replace(/\s+/g, " ").trim(); return t.length > n ? t.slice(0, n - 1) + "…" : t; };

/** Prompt for the help API (≤ 800 chars): a short, specific thank-you email. */
export function thankYouPrompt(d: Debrief, job: { title: string; company?: string }): string {
  const good = d.questions.filter((q) => q.rating !== "bad").map((q) => cut(topicFromQuestion(q.text, 50), 50));
  const all = (good.length ? good : d.questions.map((q) => topicFromQuestion(q.text, 50))).slice(0, 3);
  const names = cut(d.interviewers, 80);
  const lines = [
    "Write a short thank-you email (under 140 words) after a job interview. Plain text: a Subject line, then the body. Warm, specific, not gushing. Reference one or two topics we discussed and restate my interest. No placeholders except [Your name]. Don't invent facts.",
    "Role: " + cut(job.title, 70) + (job.company ? " at " + cut(job.company, 50) : ""),
    "Round: " + ROUND_LABELS[d.round] + " on " + d.date,
    names ? "Interviewer(s): " + names : "Interviewer: unknown, use a neutral greeting",
    all.length ? "Topics discussed: " + all.join("; ") : "",
  ].filter(Boolean);
  return lines.join("\n").slice(0, 790);
}

/** Strip the trailing help-bot follow-ups line / markdown from a drafted email. */
export function cleanDraft(text: string): string {
  return String(text || "")
    .replace(/\n?\s*FOLLOW-?UPS\s*:[\s\S]*$/i, "")
    .replace(/<[^>]*>/g, "")
    .replace(/\*\*([^*]+)\*\*/g, "$1")
    .replace(/^#{1,6}\s+/gm, "")
    .trim();
}
