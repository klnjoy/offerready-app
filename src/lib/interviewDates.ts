/* Interview date per job (local only): KEYS.interviewDates = { [jobId]: "YYYY-MM-DD" }.
 * Screens subscribe with useInterviewDate(); a window event keeps every
 * mounted control (Today, My jobs, Job detail) in sync. */

import { useCallback, useEffect, useState } from "react";
import { KEYS, readJSON, writeJSON } from "./storage";

const EVT = "offerready:interviewdates";
const ISO_DAY = /^\d{4}-\d{2}-\d{2}$/;

/** Local calendar day as "YYYY-MM-DD". */
export function localDay(d: Date = new Date()): string {
  const p = (n: number) => String(n).padStart(2, "0");
  return d.getFullYear() + "-" + p(d.getMonth() + 1) + "-" + p(d.getDate());
}

export function isIsoDay(s: unknown): s is string {
  if (typeof s !== "string" || !ISO_DAY.test(s)) return false;
  const t = Date.UTC(+s.slice(0, 4), +s.slice(5, 7) - 1, +s.slice(8, 10));
  return !isNaN(t) && new Date(t).toISOString().slice(0, 10) === s;
}

/** Whole days from a to b ("YYYY-MM-DD"), b - a. */
export function dayDiff(a: string, b: string): number {
  const t = (s: string) => Date.UTC(+s.slice(0, 4), +s.slice(5, 7) - 1, +s.slice(8, 10));
  return Math.round((t(b) - t(a)) / 86400000);
}

export function getInterviewDates(): Record<string, string> {
  const m = readJSON<Record<string, string>>(KEYS.interviewDates, {});
  return m && typeof m === "object" ? m : {};
}

export function getInterviewDate(jobId: string): string {
  const v = jobId ? getInterviewDates()[jobId] : "";
  return isIsoDay(v) ? v : "";
}

export function setInterviewDate(jobId: string, iso: string | null): void {
  if (!jobId) return;
  const m = getInterviewDates();
  if (iso && isIsoDay(iso)) m[jobId] = iso;
  else delete m[jobId];
  writeJSON(KEYS.interviewDates, m);
  try { window.dispatchEvent(new Event(EVT)); } catch { /* non-DOM */ }
}

/** Days until the interview from today (0 = today, negative = passed), or null. */
export function daysUntil(iso: string, today: string = localDay()): number | null {
  return isIsoDay(iso) ? dayDiff(today, iso) : null;
}

/** "9 days to go" / "Tomorrow" / "Today" / "3 days ago". */
export function countdownLabel(days: number | null): string {
  if (days == null) return "";
  if (days === 0) return "Interview today";
  if (days === 1) return "Tomorrow";
  if (days > 1) return days + " days to go";
  return days === -1 ? "Yesterday" : -days + " days ago";
}

export function formatDay(iso: string, opts: Intl.DateTimeFormatOptions = { weekday: "short", month: "short", day: "numeric" }): string {
  if (!isIsoDay(iso)) return "";
  const d = new Date(+iso.slice(0, 4), +iso.slice(5, 7) - 1, +iso.slice(8, 10));
  return d.toLocaleDateString(undefined, opts);
}

/** Live interview-date map + setter. */
export function useInterviewDates(): [Record<string, string>, (jobId: string, iso: string | null) => void] {
  const [map, setMap] = useState<Record<string, string>>(getInterviewDates);
  useEffect(() => {
    const on = () => setMap(getInterviewDates());
    window.addEventListener(EVT, on);
    window.addEventListener("storage", on);
    return () => {
      window.removeEventListener(EVT, on);
      window.removeEventListener("storage", on);
    };
  }, []);
  const set = useCallback((jobId: string, iso: string | null) => setInterviewDate(jobId, iso), []);
  return [map, set];
}

export function useInterviewDate(jobId: string): [string, (iso: string | null) => void] {
  const [map, set] = useInterviewDates();
  const v = jobId && isIsoDay(map[jobId]) ? map[jobId] : "";
  return [v, useCallback((iso: string | null) => set(jobId, iso), [jobId, set])];
}
