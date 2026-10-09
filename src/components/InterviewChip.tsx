/* "Interview in 12 days" chip, shared by Jobs and Readiness. */
import { countdownLabel, daysUntil, formatDay } from "../lib/interviewDates";

export function InterviewChip({ date }: { date: string }) {
  const days = daysUntil(date);
  if (days == null) return null;
  const label = days > 1 ? "Interview in " + days + " days" : days === 1 ? "Interview tomorrow" : countdownLabel(days);
  return (
    <span className={"iv-chip" + (days >= 0 && days <= 3 ? " iv-chip-soon" : "") + (days < 0 ? " iv-chip-past" : "")} title={formatDay(date, { weekday: "long", month: "long", day: "numeric" })}>
      <svg viewBox="0 0 16 16" width="13" height="13" aria-hidden="true"><rect x="2" y="3" width="12" height="11" rx="2" fill="none" stroke="currentColor" strokeWidth="1.5" /><path d="M2 6.5h12M5.5 1.5v3M10.5 1.5v3" stroke="currentColor" strokeWidth="1.5" strokeLinecap="round" /></svg>
      {label}
    </span>
  );
}
