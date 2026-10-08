/* Per-job plan anchor + task checkmarks (local only, KEYS.prepPlan).
 * { [jobId]: { start: "YYYY-MM-DD", forDate: "YYYY-MM-DD" | "", done: { [taskId]: "YYYY-MM-DD" } } } */

import { KEYS, readJSON, writeJSON } from "./storage";
import { addDays, diffDays } from "./prepPlan";

export interface JobPlanState {
  start: string;
  forDate: string;
  done: Record<string, string>;
}

type All = Record<string, JobPlanState>;

const readAll = (): All => {
  const v = readJSON<All>(KEYS.prepPlan, {});
  return v && typeof v === "object" ? v : {};
};

/** The plan anchor for a job, re-anchored on today when the interview date
 * changed, the anchor is in the future, or a default 14-day plan ran out. */
export function ensurePlanState(jobId: string, interviewDate: string, today: string): JobPlanState {
  const all = readAll();
  const cur = all[jobId];
  const stale = !cur || !cur.start || cur.forDate !== interviewDate || cur.start > today
    || (!interviewDate && diffDays(cur.start, today) >= 14);
  if (!stale) return { ...cur, done: cur.done || {} };
  const next: JobPlanState = { start: today, forDate: interviewDate, done: cur?.done || {} };
  all[jobId] = next;
  writeJSON(KEYS.prepPlan, all);
  return next;
}

export function setTaskDone(jobId: string, taskId: string, done: boolean, today: string): JobPlanState | null {
  const all = readAll();
  const cur = all[jobId];
  if (!cur) return null;
  const d = { ...(cur.done || {}) };
  if (done) d[taskId] = today;
  else delete d[taskId];
  // Keep the map small: forget checkmarks older than 120 days.
  const cutoff = addDays(today, -120);
  for (const k of Object.keys(d)) if (d[k] < cutoff) delete d[k];
  all[jobId] = { ...cur, done: d };
  writeJSON(KEYS.prepPlan, all);
  return all[jobId];
}

/** Every completion day across all jobs (one entry per completed task). */
export function allDoneDays(): string[] {
  const all = readAll();
  return Object.values(all).flatMap((s) => Object.values((s && s.done) || {}));
}
