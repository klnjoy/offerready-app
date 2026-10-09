/* Day-by-day preparation plan up to the interview date.
 *
 * PURE: no storage, no DOM, no React — so it can be unit-tested in node.
 * The job page (JobDetail.tsx) feeds it the job's state (gaps, practice stats, story coverage)
 * and keeps the per-task checkmarks itself.
 *
 * How the plan is built (buildPrepPlan):
 *  1. Timeline = the days from `start` up to (not including) the interview
 *     date; 14 days when no date is set. The plan is anchored on `start`
 *     (the day the date was set), so mock days don't drift as days pass.
 *  2. Day types: the last day before the interview is a LIGHT day; mock
 *     interviews land at ~50% (text mock) and ~90% (voice mock) of the
 *     timeline; everything else is a WORK day.
 *  3. Day 0 gets the setup the job still needs (fit check, question set);
 *     the first Defend scenario follows on the next work day.
 *  4. Gap skills, weakest first, get one study block per work day (round-
 *     robin when there are more gaps than days), so the weakest gaps come
 *     earliest. Each studied gap gets spaced reviews +2, +5 and +10 days
 *     later (skipped if they would land on or after the light day).
 *  5. Topics answered poorly in practice (lowest scores first) get spaced
 *     reviews at expanding intervals (+0, +3, +7, +14 from a staggered start).
 *  6. Competencies the job needs that have no STAR story get a "write a
 *     story" task, every other work day from day 1 (spread evenly when
 *     the plan is too short for that).
 *  6b. Questions that went badly in a REAL interview (from a debrief,
 *     lib/debrief.ts) get a "revisit" task as early as possible and spaced
 *     reviews +2 and +5 days later. They are placed before gap study so a
 *     short plan to the next round still covers them; with only a light day
 *     left, the first one becomes a light re-read.
 *  7. Every non-light day is topped up to at least 3 tasks with question
 *     drills and flashcards, and capped at 5 (overflow moves to the next
 *     day that has room, never onto the light day).
 */

export type TaskKind = "setup" | "study" | "review" | "drill" | "story" | "defend" | "mock" | "light";
export type DayType = "work" | "mock" | "light";

export interface PlanTask {
  /** Stable id: date + kind + subject (checkmarks are stored against it). */
  id: string;
  kind: TaskKind;
  title: string;
  detail?: string;
  /** In-app route, with params where the screen supports them. */
  to: string;
  minutes: number;
}

export interface PlanDay {
  date: string;
  index: number;
  type: DayType;
  tasks: PlanTask[];
}

export interface PlanInput {
  /** Day the plan is anchored on, "YYYY-MM-DD". */
  start: string;
  /** Interview date "YYYY-MM-DD", or null/"" for the default 14-day plan. */
  interviewDate?: string | null;
  jobId: string;
  /** Gap skills, weakest first. */
  gaps: string[];
  /** Practice topics with an average score (0–100). Lower = weaker. */
  weakTopics?: { topic: string; score: number }[];
  /** Competencies the job needs without a STAR story yet. */
  storyGaps?: string[];
  /** Questions answered badly in real interviews (debriefs), newest first. */
  debriefTopics?: { topic: string; round?: string; date?: string; note?: string }[];
  hasFit?: boolean;
  questionCount?: number;
  hasDefend?: boolean;
  defaultDays?: number;
  maxPerDay?: number;
}

export interface PrepPlan {
  start: string;
  /** The interview date used (the default end when none was set). */
  end: string;
  defaulted: boolean;
  totalDays: number;
  mockDays: number[];
  days: PlanDay[];
}

const MAX_DAYS = 90;
const MIN_PER_DAY = 3;
const WEAK_BELOW = 70;

// ---- date helpers (UTC math on calendar days) ----
const ISO = /^\d{4}-\d{2}-\d{2}$/;
const toT = (s: string) => Date.UTC(+s.slice(0, 4), +s.slice(5, 7) - 1, +s.slice(8, 10));
export const validDay = (s: unknown): s is string => typeof s === "string" && ISO.test(s) && !isNaN(toT(s)) && new Date(toT(s)).toISOString().slice(0, 10) === s;
export const addDays = (s: string, n: number) => new Date(toT(s) + n * 86400000).toISOString().slice(0, 10);
export const diffDays = (a: string, b: string) => Math.round((toT(b) - toT(a)) / 86400000);

const slug = (s: string) => s.toLowerCase().replace(/[^a-z0-9]+/g, "-").replace(/^-|-$/g, "").slice(0, 40) || "x";
const uniq = (xs: string[]) => {
  const seen = new Set<string>();
  const out: string[] = [];
  for (const x of xs) {
    const t = String(x || "").trim();
    if (t && !seen.has(t.toLowerCase())) { seen.add(t.toLowerCase()); out.push(t); }
  }
  return out;
};

/** Mock days at ~50% and ~90% of the timeline (never on the light day). */
export function mockDayIndexes(total: number): number[] {
  if (total < 3) return [];
  const last = total - 1; // light day
  const m1 = Math.round(0.5 * last);
  let m2 = Math.round(0.9 * last);
  if (m2 >= last) m2 = last - 1;
  return m1 >= m2 ? [m2] : [m1, m2];
}

export function buildPrepPlan(input: PlanInput): PrepPlan {
  const start = input.start;
  const maxPer = Math.max(MIN_PER_DAY, input.maxPerDay || 5);
  const dated = validDay(input.interviewDate) && diffDays(start, input.interviewDate) > 0;
  const total = dated ? Math.min(MAX_DAYS, diffDays(start, input.interviewDate as string)) : input.defaultDays || 14;
  const end = dated ? (input.interviewDate as string) : addDays(start, total);
  const job = encodeURIComponent(input.jobId || "");
  const jobQ = job ? "?job=" + job : "";
  const mockDays = mockDayIndexes(total);
  const lightIdx = total >= 2 ? total - 1 : -1;

  const days: PlanDay[] = Array.from({ length: total }, (_, i) => ({
    date: addDays(start, i),
    index: i,
    type: i === lightIdx ? "light" : mockDays.includes(i) ? "mock" : "work",
    tasks: [],
  }));

  const mk = (i: number, kind: TaskKind, subject: string, t: Omit<PlanTask, "id" | "kind">): PlanTask => ({
    id: days[i].date + ":" + kind + ":" + slug(subject),
    kind,
    ...t,
  });

  /** Put a task on day i, or the next day with room (never the light day,
   * unless it is a light task). Returns the day used, or -1 if dropped. */
  const place = (i: number, build: (day: number) => PlanTask, allowLight = false): number => {
    for (let d = Math.max(0, i); d < total; d++) {
      if (days[d].type === "light" && !allowLight) continue;
      if (days[d].tasks.length >= maxPer) continue;
      const t = build(d);
      if (days[d].tasks.some((x) => x.id === t.id)) return d;
      days[d].tasks.push(t);
      return d;
    }
    return -1;
  };

  // A one-day plan: a single light day with a quick warm-up.
  if (total === 1) {
    days[0].type = "light";
  }

  // 1. Setup on day 0.
  if (!input.hasFit) place(0, (d) => mk(d, "setup", "fit", { title: "Add your resume to see your match", detail: "See how your resume matches this job and the gaps to close first.", to: "/fit", minutes: 10 }), true);
  if (!input.questionCount) place(0, (d) => mk(d, "setup", "questions", { title: "Get your interview questions", detail: "Questions written for this job and its gaps.", to: "/questions" + jobQ, minutes: 5 }), true);

  // 2. Mock days.
  mockDays.forEach((m, k) => {
    const voice = k === mockDays.length - 1 && mockDays.length > 1;
    place(m, (d) => mk(d, "mock", voice ? "voice" : "text", voice
      ? { title: "Voice mock interview", detail: "Full run, out loud. The interviewer follows up on what you say.", to: "/interview/voice", minutes: 40 }
      : { title: "Mock interview", detail: "A mixed loop across areas. Answer out loud, then compare with a strong answer.", to: "/simulator", minutes: 35 }));
    place(m, (d) => mk(d, "review", "mock-" + k, { title: "Rewrite your weakest mock answer", detail: "Pick the answer you liked least and tighten it to two minutes.", to: "/practice/bank", minutes: 15 }));
  });

  // 3. Light day (or the single day of a one-day plan).
  const light = lightIdx >= 0 ? lightIdx : total === 1 ? 0 : -1;
  if (light >= 0) {
    const gap0 = uniq(input.gaps)[0];
    place(light, (d) => mk(d, "light", "stories", { title: "Skim your stories", detail: "Re-read your top stories. Say each opening line out loud once.", to: "/stories", minutes: 15 }), true);
    place(light, (d) => mk(d, "light", "gaps", { title: gap0 ? "Light review: " + gap0 : "Light review of your gaps", detail: "Notes only. No new material today.", to: job ? "/jobs/" + job : "/jobs", minutes: 15 }), true);
    place(light, (d) => mk(d, "light", "logistics", { title: "Logistics and rest", detail: "Confirm time, link or address, and who you meet. Then stop and rest.", to: job ? "/jobs/" + job : "/jobs", minutes: 10 }), true);
  }

  const workDays = days.filter((d) => d.type === "work").map((d) => d.index);

  // 4. First Defend scenario on the next work day.
  if (!input.hasDefend && total > 1) {
    const target = workDays.find((i) => i >= 1) ?? 0;
    place(target, (d) => mk(d, "defend", "first", { title: "Trade-off drill: defend one decision", detail: "Make the call, then hold it while the interviewer pushes back.", to: "/defend" + jobQ, minutes: 20 }));
  }

  // 4b. Questions that went badly in a real interview: revisit first.
  const deb = uniq((input.debriefTopics || []).map((t) => t && t.topic)).slice(0, 4);
  const debInfo = new Map((input.debriefTopics || []).filter((t) => t && t.topic).map((t) => [t.topic.trim().toLowerCase(), t]));
  deb.forEach((topic, j) => {
    const info = debInfo.get(topic.toLowerCase());
    const where = info && info.round ? " in your " + info.round.toLowerCase() + (info.date ? " (" + info.date + ")" : "") : " in your last interview";
    const to = job ? "/debrief?job=" + job : "/debrief";
    let placed = 0;
    [0, 2, 5].forEach((off, n) => {
      const r = (j % 2) + off;
      if (r >= total || (lightIdx >= 0 && r >= lightIdx)) return;
      const used = place(r, (d) => mk(d, "review", "debrief-" + topic, n === 0
        ? { title: "Revisit: " + topic, detail: "This went badly" + where + ". Write a stronger answer, then say it out loud in two minutes.", to, minutes: 20 }
        : { title: "Review again: " + topic, detail: "Spaced review of a question that tripped you up. Answer it without notes.", to, minutes: 10 }));
      if (used >= 0) placed++;
    });
    if (!placed && j === 0 && light >= 0) {
      place(light, (d) => mk(d, "light", "debrief-" + topic, { title: "Re-read your answer: " + topic, detail: "It went badly last round. Read your notes once; no new material.", to, minutes: 10 }), true);
    }
  });

  // 5. Gap study, weakest first, with spaced reviews.
  const gaps = uniq(input.gaps).slice(0, 8);
  if (workDays.length) {
    gaps.forEach((g, k) => {
      const at = workDays[k % workDays.length];
      const used = place(at, (d) => mk(d, "study", g, { title: "Study: " + g, detail: "Read the notes, then explain it out loud in two minutes.", to: "/practice?topic=" + encodeURIComponent(g) + (job ? "&job=" + job : ""), minutes: 30 }));
      if (used < 0) return;
      [2, 5, 10].forEach((off) => {
        const r = used + off;
        if (r >= total || (lightIdx >= 0 && r >= lightIdx)) return;
        place(r, (d) => mk(d, "review", g, { title: "Review: " + g, detail: "Spaced review. Answer one question on it without notes.", to: "/practice/bank?topic=" + encodeURIComponent(g), minutes: 10 }));
      });
    });
  }

  // 6. Spaced review of topics answered poorly.
  const weak = (input.weakTopics || []).filter((t) => t.topic && t.score < WEAK_BELOW).sort((a, b) => a.score - b.score).slice(0, 4);
  weak.forEach((t, j) => {
    [0, 3, 7, 14].forEach((off) => {
      const r = (j % 3) + off;
      if (r >= total || (lightIdx >= 0 && r >= lightIdx)) return;
      place(r, (d) => mk(d, "review", "topic-" + t.topic, { title: "Weak area: " + t.topic, detail: "You averaged " + Math.round(t.score) + "% here. Run Weak areas mode in the question bank.", to: "/practice/bank?mode=weak", minutes: 15 }));
    });
  });

  // 7. STAR stories for uncovered competencies.
  const sg = uniq(input.storyGaps || []).slice(0, 6);
  sg.forEach((c, k) => {
    if (!workDays.length) return;
    // Every other work day from day 1 when there is room; otherwise spread
    // evenly so stories never pile up on one day.
    const at = 2 * (sg.length - 1) + 1 < workDays.length
      ? workDays[2 * k + 1]
      : workDays[Math.min(workDays.length - 1, Math.floor(((k + 0.5) * workDays.length) / sg.length))];
    place(at, (d) => mk(d, "story", c, { title: "Write a STAR story: " + c, detail: "Situation, task, what you did, the result and a number.", to: "/stories?competency=" + encodeURIComponent(c), minutes: 20 }));
  });

  // 8. Top up to the daily minimum.
  for (const day of days) {
    if (day.type === "light") continue;
    const fill: [string, Omit<PlanTask, "id" | "kind">][] = [
      ["questions", { title: "Answer 3 questions out loud", detail: "From your job's question set. Time each answer.", to: "/questions" + jobQ, minutes: 15 }],
      ["flashcards", { title: "Flashcards: 10 cards", detail: "Quick recall on your role's topics.", to: "/practice/bank?mode=flashcard", minutes: 10 }],
      ["why", { title: "Trade-off drill", detail: "One more scenario. Keep asking yourself why.", to: "/defend" + jobQ, minutes: 15 }],
    ];
    for (const [s, t] of fill) {
      if (day.tasks.length >= MIN_PER_DAY) break;
      if (!day.tasks.some((x) => x.id === day.date + ":drill:" + s)) day.tasks.push(mk(day.index, "drill", s, t));
    }
  }

  // Order inside a day: setup, mock, study, defend, story, review, drill, light.
  const order: TaskKind[] = ["setup", "mock", "study", "defend", "story", "review", "drill", "light"];
  days.forEach((d) => d.tasks.sort((a, b) => order.indexOf(a.kind) - order.indexOf(b.kind)));

  return { start, end, defaulted: !dated, totalDays: total, mockDays, days };
}

/** Unfinished tasks from days before `today` worth carrying over (no setup
 * that is now done, no stale mocks/light tasks). */
export function carryOver(plan: PrepPlan, today: string, done: Record<string, string>, max = 3): PlanTask[] {
  const out: PlanTask[] = [];
  for (const d of plan.days) {
    if (d.date >= today) break;
    for (const t of d.tasks) {
      if (done[t.id] || t.kind === "light" || t.kind === "drill" || t.kind === "mock") continue;
      out.push(t);
    }
  }
  return out.slice(-max);
}

/** Consecutive days (ending today, or yesterday if nothing yet today) with at
 * least one completed task. */
export function streakDays(doneDays: string[], today: string): number {
  const set = new Set(doneDays);
  let d = set.has(today) ? today : addDays(today, -1);
  let n = 0;
  while (set.has(d)) { n++; d = addDays(d, -1); }
  return n;
}

/** Completions since Monday of the current week. */
export function doneThisWeek(doneDays: string[], today: string): number {
  const dow = (new Date(toT(today)).getUTCDay() + 6) % 7; // Mon = 0
  const monday = addDays(today, -dow);
  return doneDays.filter((d) => d >= monday && d <= today).length;
}

// ---- calendar export ----
const icsText = (s: string) => s.replace(/\\/g, "\\\\").replace(/;/g, "\\;").replace(/,/g, "\\,").replace(/\r?\n/g, "\\n");
/** Fold lines longer than 75 octets (approximate by chars). */
const fold = (line: string) => {
  const parts: string[] = [];
  let rest = line;
  while (rest.length > 74) { parts.push(rest.slice(0, 74)); rest = " " + rest.slice(74); }
  parts.push(rest);
  return parts.join("\r\n");
};
const icsDate = (s: string) => s.replace(/-/g, "");

/** The plan as an iCalendar file: one all-day event per remaining day, plus
 * the interview itself when a date is set. */
export function planToIcs(plan: PrepPlan, o: { jobTitle: string; fromDate?: string; now?: Date; baseUrl?: string }): string {
  const stamp = (o.now || new Date()).toISOString().replace(/[-:]/g, "").replace(/\.\d+Z$/, "Z");
  const from = o.fromDate || plan.start;
  const lines = ["BEGIN:VCALENDAR", "VERSION:2.0", "PRODID:-//OfferReady//Prep plan//EN", "CALSCALE:GREGORIAN", "METHOD:PUBLISH", "X-WR-CALNAME:" + icsText("OfferReady: " + o.jobTitle)];
  const ev = (uid: string, date: string, summary: string, desc: string) => {
    lines.push("BEGIN:VEVENT", "UID:" + uid + "@offerready", "DTSTAMP:" + stamp, "DTSTART;VALUE=DATE:" + icsDate(date), "DTEND;VALUE=DATE:" + icsDate(addDays(date, 1)), "SUMMARY:" + icsText(summary), "DESCRIPTION:" + icsText(desc), "TRANSP:TRANSPARENT", "END:VEVENT");
  };
  for (const d of plan.days) {
    if (d.date < from || !d.tasks.length) continue;
    const label = d.type === "mock" ? "Mock interview day" : d.type === "light" ? "Light day" : d.tasks[0].title;
    const desc = d.tasks.map((t) => "- " + t.title + " (" + t.minutes + " min)" + (o.baseUrl ? " " + o.baseUrl.replace(/\/$/, "") + t.to : "")).join("\n");
    ev(plan.start + "-" + d.date, d.date, "Prep day " + (d.index + 1) + ": " + label, desc);
  }
  if (!plan.defaulted) ev(plan.start + "-interview", plan.end, "Interview: " + o.jobTitle, "Good luck. You prepared for this.");
  lines.push("END:VCALENDAR");
  return lines.map(fold).join("\r\n") + "\r\n";
}
