/* "How did the interview go?" — shown on Home and Readiness once a job's
 * interview date has passed (lib/jobOutcomes.ts pendingCheckIn). One tap
 * records the result locally (synced) and, signed in, in prep_outcomes with
 * readiness and practice at the time, so readiness can be checked against
 * real results (lib/communityShare.ts). */

import { useState, type ReactNode } from "react";
import * as api from "../lib/api";
import { useAuth } from "../lib/auth";
import { recordPrepOutcome } from "../lib/communityShare";
import { useDebriefs } from "../lib/debriefStore";
import { formatDay, getInterviewDate, useInterviewDates } from "../lib/interviewDates";
import { OUTCOME_CHOICES, pendingCheckIn, setOutcome, useOutcomes, type JobOutcome } from "../lib/jobOutcomes";
import { displayJobTitle } from "../lib/roles";
import { Link } from "../lib/router";
import { track } from "../lib/track";
import type { JobRow } from "../types";

/** Save an outcome everywhere it belongs. Never throws. */
export async function submitOutcome(job: JobRow, outcome: JobOutcome, date: string, getToken: () => Promise<string | null>): Promise<void> {
  setOutcome(job.id, outcome, date);
  track("outcome_reported", { outcome });
  let readiness: number | null = null;
  let practiced: number | null = null;
  try {
    const tok = await getToken();
    if (tok) {
      const r = await api.getReadinessScores(tok);
      const s = r.status === 200 ? r.body?.scores?.[job.id] : undefined;
      if (s) { readiness = s.score; practiced = s.practiced; }
    }
  } catch {
    /* readiness is optional */
  }
  await recordPrepOutcome({ job, outcome, interviewDate: date, readiness, practiceCount: practiced });
}

const AFTER: Record<JobOutcome, (jobId: string) => ReactNode> = {
  offer: (id) => <>Congratulations! <Link to={"/offers?job=" + encodeURIComponent(id)}>Compare offers</Link> before you answer them.</>,
  next: (id) => <>Nice. <Link to={"/debrief?job=" + encodeURIComponent(id) + "&new=1"}>Log the round and the next date</Link> so your plan rolls forward.</>,
  rejected: (id) => <>Sorry it didn{"’"}t work out. <Link to={"/debrief?job=" + encodeURIComponent(id) + "&new=1"}>Log the questions</Link> while you remember them; the ones that went badly become practice for your next interview.</>,
  waiting: () => <>We{"’"}ll ask again in a few days.</>,
  cancelled: () => <>Got it. Set a new date on the job page if it gets rescheduled.</>,
};

export function OutcomeCheckIn({ jobs }: { jobs: JobRow[] }) {
  const auth = useAuth();
  const [dates] = useInterviewDates();
  const outcomes = useOutcomes();
  const debriefs = useDebriefs();
  const [done, setDone] = useState<{ jobId: string; outcome: JobOutcome } | null>(null);
  const [busy, setBusy] = useState(false);

  if (done) {
    return (
      <section className="card oc" aria-live="polite">
        <p className="oc-done">{AFTER[done.outcome](done.jobId)}</p>
      </section>
    );
  }
  const due = pendingCheckIn(jobs.map((j) => j.id), dates, outcomes, debriefs);
  if (!due) return null;
  const job = jobs.find((j) => j.id === due.jobId);
  if (!job) return null;
  const name = displayJobTitle(job) + (job.company ? " at " + job.company : "");

  const pick = async (o: JobOutcome) => {
    if (busy) return;
    setBusy(true);
    await submitOutcome(job, o, getInterviewDate(job.id) || due.date, auth.getAccessToken);
    setBusy(false);
    setDone({ jobId: job.id, outcome: o });
  };

  return (
    <section className="card oc" aria-labelledby="oc-h">
      <span className="td-eyebrow">Interview on {formatDay(due.date, { weekday: "short", month: "short", day: "numeric" })}</span>
      <h2 id="oc-h">How did it go: {name}?</h2>
      <div className="oc-choices" role="group" aria-label="Interview result">
        {OUTCOME_CHOICES.map((c) => (
          <button key={c.key} type="button" className={"btn oc-btn oc-" + c.key} disabled={busy} onClick={() => pick(c.key)}>{c.label}</button>
        ))}
      </div>
      <p className="small muted">Your answer also helps us check that readiness scores match real results. It{"’"}s never shown to anyone, and you can delete it from Account.</p>
    </section>
  );
}
