/* Readiness forecast: when will this job's score reach the "ready" line (80),
 * and is that before the interview?
 *
 * PURE: no storage, no DOM, no React, no locale. Unit-tested in node.
 *
 * Method (forecastReadiness):
 *  1. Points = readiness snapshots (time, score 0–100), sorted by time. The
 *     current score is the newest point.
 *  2. Window = the points from the 14 days up to the newest one. Fewer than 2
 *     → "locked" ("Practise twice to unlock your forecast").
 *  3. Pace = a recency-weighted least-squares slope (points per day) over the
 *     window; each point's weight halves every 7 days of age. When the window
 *     spans less than one day the slope is (last − first) / 1 day, so two
 *     sessions an hour apart can't project an absurd pace.
 *  4. If the newest point is more than 7 days old, the pace fades (halves per
 *     further week idle): a trend you stopped feeding isn't still happening.
 *  5. Pace is clamped to [−5, +4] points a day. Below +0.1 a day → "stalled".
 *  6. Days to ready = ceil((80 − current) / pace), counted from today; more
 *     than 180 days → "far" (treated like stalled).
 *  7. With an interview date in the future: margin = days to interview − days
 *     to ready. ≥ 0 → "on-track"; < 0 → "late", with the extra daily minutes
 *     that close the gap: minutes scale with the pace needed, from the user's
 *     recent practice time (sessions in the last 14 days × minutes per
 *     session, at least 10 min a day). When stalled, a default rate of
 *     0.1 points per daily minute is used (20 min a day ≈ +2 a day). Rounded
 *     up to 5 minutes; beyond 120 the copy says to focus instead.
 */

export interface ScorePoint {
  /** ISO date/time or epoch ms. */
  at: string | number;
  score: number;
}

export interface ForecastInput {
  points: ScorePoint[];
  /** Today, "YYYY-MM-DD". */
  today: string;
  /** Interview date "YYYY-MM-DD", or empty. */
  interviewDate?: string | null;
  /** The ready line (default 80). */
  target?: number;
  /** Completed practice sessions in the last 14 days (for minutes a day). */
  recentSessions?: number;
  /** Assumed minutes per session (default 15). */
  minutesPerSession?: number;
}

export type ForecastStatus = "locked" | "reached" | "on-track" | "late" | "stalled" | "far";

export interface Forecast {
  status: ForecastStatus;
  current: number;
  target: number;
  /** Points per day after weighting, fading and clamping (1 decimal). */
  pacePerDay: number;
  /** Points in the 14-day window. */
  used: number;
  readyDate?: string;
  daysToReady?: number;
  /** Days from today to the interview (only when it is today or later). */
  daysToInterview?: number;
  /** Interview day − ready day; negative = after the interview. */
  marginDays?: number;
  /** Extra minutes a day that close the gap (late / stalled with a date). */
  extraMinutes?: number;
  headline: string;
  detail: string;
}

export const READY_LINE = 80;
const WINDOW_DAYS = 14;
const HALF_LIFE = 7;
const MAX_PACE = 4;
const MIN_PACE = -5;
const STALL_PACE = 0.1;
const MAX_HORIZON = 180;
const DEFAULT_PTS_PER_MIN = 0.1;
const MAX_EXTRA = 120;
const DAY = 86400000;

const ISO = /^\d{4}-\d{2}-\d{2}$/;
const MONTHS = ["Jan", "Feb", "Mar", "Apr", "May", "Jun", "Jul", "Aug", "Sep", "Oct", "Nov", "Dec"];
const toT = (s: string) => Date.UTC(+s.slice(0, 4), +s.slice(5, 7) - 1, +s.slice(8, 10));
const validDay = (s: unknown): s is string => typeof s === "string" && ISO.test(s) && new Date(toT(s)).toISOString().slice(0, 10) === s;
const addDays = (s: string, n: number) => new Date(toT(s) + n * DAY).toISOString().slice(0, 10);
const diffDays = (a: string, b: string) => Math.round((toT(b) - toT(a)) / DAY);

/** "Oct 19" (locale-free so tests are stable). */
export function shortDay(iso: string): string {
  return validDay(iso) ? MONTHS[+iso.slice(5, 7) - 1] + " " + +iso.slice(8, 10) : "";
}

const plural = (n: number, w: string) => n + " " + w + (n === 1 ? "" : "s");

function parseAt(at: string | number): number {
  if (typeof at === "number") return at;
  const s = String(at || "");
  return ISO.test(s) ? toT(s) : Date.parse(s);
}

/** Recency-weighted least-squares slope (y per x-unit). */
export function weightedSlope(xs: number[], ys: number[], ws: number[]): number {
  let sw = 0, sx = 0, sy = 0;
  for (let i = 0; i < xs.length; i++) { sw += ws[i]; sx += ws[i] * xs[i]; sy += ws[i] * ys[i]; }
  if (!sw) return 0;
  const mx = sx / sw, my = sy / sw;
  let num = 0, den = 0;
  for (let i = 0; i < xs.length; i++) { num += ws[i] * (xs[i] - mx) * (ys[i] - my); den += ws[i] * (xs[i] - mx) ** 2; }
  return den > 1e-9 ? num / den : 0;
}

const roundUp5 = (m: number) => Math.max(5, Math.ceil(m / 5) * 5);

export function forecastReadiness(input: ForecastInput): Forecast {
  const target = input.target ?? READY_LINE;
  const today = input.today;
  const t0 = toT(today);
  const pts = (input.points || [])
    .map((p) => ({ t: parseAt(p.at), y: Math.max(0, Math.min(100, Number(p.score))) }))
    .filter((p) => isFinite(p.t) && isFinite(p.y))
    .sort((a, b) => a.t - b.t);

  const current = pts.length ? Math.round(pts[pts.length - 1].y) : 0;
  const dti = validDay(input.interviewDate) ? diffDays(today, input.interviewDate) : null;
  const interviewAhead = dti != null && dti >= 0 ? dti : undefined;
  const base = { current, target, pacePerDay: 0, used: 0, daysToInterview: interviewAhead };

  if (current >= target) {
    return {
      ...base, status: "reached", used: pts.length,
      headline: "You’re over the ready line",
      detail: interviewAhead != null && interviewAhead > 0
        ? "Keep it warm until your interview: a short session every day or two holds the score."
        : "Keep it warm with a short session every day or two.",
    };
  }

  const lastT = pts.length ? pts[pts.length - 1].t : t0;
  const win = pts.filter((p) => p.t >= lastT - WINDOW_DAYS * DAY);
  if (win.length < 2) {
    return {
      ...base, status: "locked", used: win.length,
      headline: "Practise twice to unlock your forecast",
      detail: win.length === 1
        ? "One more practice session gives us a trend, and we’ll tell you when you’ll reach " + target + "."
        : "After two practice sessions we can tell when you’ll reach " + target + ", the ready line.",
    };
  }

  // 3. Weighted slope, in points per day.
  const xs = win.map((p) => (p.t - lastT) / DAY);
  const ys = win.map((p) => p.y);
  const ws = xs.map((x) => Math.pow(0.5, -x / HALF_LIFE));
  const span = xs[xs.length - 1] - xs[0];
  let pace = span < 1 ? (ys[ys.length - 1] - ys[0]) / 1 : weightedSlope(xs, ys, ws);
  // 4. Fade when idle for more than a week.
  const idle = (t0 - lastT) / DAY;
  if (idle > 7) pace *= Math.pow(0.5, (idle - 7) / 7);
  // 5. Clamp.
  pace = Math.max(MIN_PACE, Math.min(MAX_PACE, pace));
  const pacePerDay = Math.round(pace * 10) / 10;
  const gap = target - current;
  const minutesNow = Math.max(10, ((input.recentSessions || 0) * (input.minutesPerSession || 15)) / WINDOW_DAYS);
  const withUsed = { ...base, pacePerDay, used: win.length };

  const extraFor = (days: number, curPace: number) => {
    const need = gap / Math.max(1, days);
    const m = curPace >= STALL_PACE ? minutesNow * (need / curPace - 1) : need / DEFAULT_PTS_PER_MIN;
    return roundUp5(m);
  };
  const extraLine = (m: number) => m > MAX_EXTRA
    ? "That gap is too big to close with time alone. Focus on the top three things below."
    : "Add about " + m + " min a day to close the gap.";

  // 5b/6. Stalled or too slow to project.
  const daysToReady = pace >= STALL_PACE ? Math.ceil(gap / pace) : Infinity;
  if (!isFinite(daysToReady) || daysToReady > MAX_HORIZON) {
    const status: ForecastStatus = isFinite(daysToReady) ? "far" : "stalled";
    const headline = status === "far"
      ? "At your current pace, " + target + " is more than 6 months away"
      : pace < -STALL_PACE ? "Your score has slipped lately" : "Your score hasn’t moved lately";
    if (interviewAhead != null && interviewAhead > 0) {
      const extraMinutes = extraFor(interviewAhead, pace);
      return { ...withUsed, status, extraMinutes, headline, detail: "To reach " + target + " before your interview: " + extraLine(extraMinutes).replace(/^Add/, "add") };
    }
    return { ...withUsed, status, headline, detail: "A short session most days gets it moving again. About 20 min a day adds roughly 2 points a day." };
  }

  const readyDate = addDays(today, daysToReady);
  const when = shortDay(readyDate);
  const proj = { ...withUsed, readyDate, daysToReady };

  if (interviewAhead == null || interviewAhead === 0) {
    const lead = "At your current pace you’ll be ready by " + when;
    return {
      ...proj, status: "on-track",
      headline: lead + " (in " + plural(daysToReady, "day") + ")",
      detail: interviewAhead === 0 ? "Your interview is today. Skim your notes and rest; the trend is for the next round."
        : dti != null && dti < 0 ? "Your interview date has passed. Set the next round’s date to compare."
        : "Set your interview date to see whether that’s in time.",
    };
  }

  const marginDays = interviewAhead - daysToReady;
  if (marginDays >= 0) {
    return {
      ...proj, status: "on-track", marginDays,
      headline: "At your current pace you’ll be ready by " + when + ", " + (marginDays === 0 ? "the day of your interview" : plural(marginDays, "day") + " before your interview"),
      detail: marginDays === 0 ? "No room to spare. One extra session this week gives you a buffer." : "Keep this rhythm. Your interview is in " + plural(interviewAhead, "day") + ".",
    };
  }
  const extraMinutes = extraFor(interviewAhead, pace);
  return {
    ...proj, status: "late", marginDays, extraMinutes,
    headline: "At your current pace you’ll be ready by " + when + ", " + plural(-marginDays, "day") + " after your interview",
    detail: extraLine(extraMinutes),
  };
}
