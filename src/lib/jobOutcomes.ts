/* "How did it go?" — the result of each job's interview, asked once the
 * interview date has passed. Stored per job in KEYS.jobOutcomes (synced map):
 *   { [jobId]: { outcome, at, snoozeUntil? } }
 * pendingCheckIn() is pure so the selection rules are unit-testable. */

import { useCallback, useEffect, useState } from "react";
import { KEYS, readJSON, writeJSON } from "./storage";
import { dayDiff, isIsoDay, localDay } from "./interviewDates";
import type { Debrief } from "./debrief";

export type JobOutcome = "offer" | "next" | "rejected" | "waiting" | "cancelled";

export interface OutcomeEntry {
  outcome: JobOutcome;
  /** ISO time the user answered. */
  at: string;
  /** "YYYY-MM-DD": ask again from this day ("still waiting"). */
  snoozeUntil?: string;
  /** The interview date this answer was about. */
  forDate?: string;
}

export const OUTCOME_CHOICES: { key: JobOutcome; label: string }[] = [
  { key: "offer", label: "Got an offer" },
  { key: "next", label: "Moved to the next round" },
  { key: "rejected", label: "Didn’t get it" },
  { key: "waiting", label: "Still waiting" },
  { key: "cancelled", label: "It didn’t happen" },
];

const EVT = "offerready:joboutcomes";
/** Ask from the day after the interview, for up to this many days. */
const ASK_WINDOW_DAYS = 45;
const SNOOZE_DAYS = 5;

export function getOutcomes(): Record<string, OutcomeEntry> {
  const m = readJSON<Record<string, OutcomeEntry>>(KEYS.jobOutcomes, {});
  return m && typeof m === "object" && !Array.isArray(m) ? m : {};
}

function addDays(iso: string, n: number): string {
  const d = new Date(Date.UTC(+iso.slice(0, 4), +iso.slice(5, 7) - 1, +iso.slice(8, 10) + n));
  return d.toISOString().slice(0, 10);
}

export function setOutcome(jobId: string, outcome: JobOutcome, forDate?: string, today: string = localDay()): OutcomeEntry {
  const m = getOutcomes();
  const e: OutcomeEntry = { outcome, at: new Date().toISOString() };
  if (forDate && isIsoDay(forDate)) e.forDate = forDate;
  if (outcome === "waiting") e.snoozeUntil = addDays(today, SNOOZE_DAYS);
  m[jobId] = e;
  writeJSON(KEYS.jobOutcomes, m);
  try { window.dispatchEvent(new Event(EVT)); } catch { /* non-DOM */ }
  return e;
}

export function useOutcomes(): Record<string, OutcomeEntry> {
  const [m, setM] = useState<Record<string, OutcomeEntry>>(getOutcomes);
  const on = useCallback(() => setM(getOutcomes()), []);
  useEffect(() => {
    window.addEventListener(EVT, on);
    window.addEventListener("storage", on);
    return () => { window.removeEventListener(EVT, on); window.removeEventListener("storage", on); };
  }, [on]);
  return m;
}

/**
 * The job to ask about now, or null. A job qualifies when its interview date
 * was 1-45 days ago and:
 *  - there is no answer for that date yet, or the answer was "still waiting"
 *    and the snooze is over;
 *  - no debrief for the job already records an offer or rejection on/after it.
 * "Next round" for an older date doesn't block a later date (the date moved).
 * The most recent interview wins.
 */
export function pendingCheckIn(
  jobIds: string[],
  dates: Record<string, string>,
  outcomes: Record<string, OutcomeEntry>,
  debriefs: Pick<Debrief, "jobId" | "date" | "outcome">[],
  today: string = localDay(),
): { jobId: string; date: string; daysAgo: number } | null {
  let best: { jobId: string; date: string; daysAgo: number } | null = null;
  for (const id of jobIds) {
    const date = dates[id];
    if (!isIsoDay(date)) continue;
    const ago = dayDiff(date, today);
    if (ago < 1 || ago > ASK_WINDOW_DAYS) continue;
    const o = outcomes[id];
    if (o && (!o.forDate || o.forDate === date)) {
      if (o.outcome !== "waiting") continue;
      if (o.snoozeUntil && o.snoozeUntil > today) continue;
    }
    if (debriefs.some((d) => d.jobId === id && d.date >= date && (d.outcome === "offer" || d.outcome === "rejected"))) continue;
    if (!best || ago < best.daysAgo) best = { jobId: id, date, daysAgo: ago };
  }
  return best;
}
