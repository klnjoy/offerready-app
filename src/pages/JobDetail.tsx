/* A single saved job restored from the DB: analysis + persisted gap +
 * questions + readiness (was renderJob() in content/assets/jobs.js). */

import { useEffect, useState } from "react";
import { debriefStats, debriefsForJob, statsLine } from "../lib/debrief";
import { useDebriefs } from "../lib/debriefStore";
import { countdownLabel, daysUntil, formatDay, localDay, useInterviewDate } from "../lib/interviewDates";
import { docsUrl } from "../config";
import * as api from "../lib/api";
import { useAuth } from "../lib/auth";
import { setActiveJob, weightedOverall } from "../lib/readiness";
import { displayJobTitle } from "../lib/roles";
import { ExternalLink, Link } from "../lib/router";
import { SignInCard } from "../components/AuthForm";
import { DebriefCard } from "../components/DebriefHistory";
import { Card, Chips, Disclaimer, Loading, Stat, StatGrid } from "../components/ui";
import type { JobDetail } from "../types";

type State = { kind: "loading" } | { kind: "signedout" } | { kind: "error"; msg: string } | { kind: "ready"; data: JobDetail };

// Route params arrive as a string map (see App.tsx ROUTES).
export default function JobDetailPage({ id }: Record<string, string>) {
  const auth = useAuth();
  const [state, setState] = useState<State>({ kind: "loading" });

  useEffect(() => {
    let alive = true;
    setActiveJob(id);
    (async () => {
      if (!auth.ready) return;
      const tok = await auth.getAccessToken();
      if (!tok) { if (alive) setState({ kind: "signedout" }); return; }
      const res = await api.getJob(tok, id);
      if (!alive) return;
      if (res.status === 0) setState({ kind: "error", msg: "Couldn’t reach the server." });
      else if (res.status !== 200 || !res.body?.job) setState({ kind: "error", msg: "Couldn’t open that job." });
      else setState({ kind: "ready", data: { job: res.body.job, gap: res.body.gap || null, questions: res.body.questions || [], progress: res.body.progress || [], practice: res.body.practice || [] } });
    })();
    return () => { alive = false; };
  }, [id, auth.ready, auth.session]); // eslint-disable-line react-hooks/exhaustive-deps

  return (
    <div className="page">
      <Link className="btn btn-ghost" to="/jobs">{"←"} Back to My Jobs</Link>
      {state.kind === "loading" && <Loading>Loading this job{"…"}</Loading>}
      {state.kind === "signedout" && <SignInCard title="Sign in to open this job" />}
      {state.kind === "error" && <Card><p>{state.msg}</p></Card>}
      {state.kind === "ready" && <JobView data={state.data} />}
    </div>
  );
}

function JobView({ data }: { data: JobDetail }) {
  const { job, gap, questions, progress } = data;
  const a = job.analysis || { roleSummary: "" };
  const title = displayJobTitle(job);

  // Same shared formula as the Dashboard, so the number matches.
  const latest = progress[0] || null;
  const practiceAvg = latest ? latest.avg_answer_score || 0 : 0;
  const completion = Math.min(latest?.questions_practiced || 0, 10) * 10;
  const overall = latest && latest.overall_readiness != null ? latest.overall_readiness : gap ? weightedOverall(gap, practiceAvg, completion) : null;
  const gapList = [...(gap?.result?.missingSkills || []), ...(gap?.result?.missingKeywords || [])];

  return (
    <div className="stack">
      <h1>{title}</h1>
      <InterviewDateRow jobId={job.id} />
      {a.roleSummary && <p>{a.roleSummary}</p>}
      <StatGrid>
        {overall != null && <Stat value={overall + "%"} label="Readiness" />}
        {gap && <Stat value={(gap.match_score || 0) + "%"} label="Resume match" />}
        <Stat value={questions.length} label="Questions ready" />
        <Stat value={job.gaps_count || (a.potentialGaps || []).length || 0} label="Gaps" />
      </StatGrid>
      <div className="row wrap">
        <Link className="btn btn-primary" to="/fit">{gap ? "Re-run gap analysis" : "Run gap analysis"}</Link>
        <Link className="btn btn-primary" to="/questions">{questions.length ? "Review / regenerate questions" : "Generate questions"}</Link>
        <Link className="btn btn-ghost" to={"/debrief?job=" + encodeURIComponent(job.id) + "&new=1"}>Log interview</Link>
        <Link className="btn btn-ghost" to="/today">Today{"’"}s plan</Link>
        <Link className="btn btn-ghost" to="/dashboard">Readiness dashboard</Link>
      </div>
      {gapList.length > 0 && (
        <Card>
          <h3>Gaps to close</h3>
          <Chips items={gapList.slice(0, 14)} tone="warn" />
        </Card>
      )}
      {(a.potentialGaps || []).length > 0 && (
        <Card>
          <h3>Priority gaps</h3>
          <ul>{(a.potentialGaps || []).map((g, i) => <li key={i}>{g.requirement}</li>)}</ul>
        </Card>
      )}
      {(a.preparationPlan || []).length > 0 && (
        <Card>
          <h3>Preparation plan</h3>
          {(a.preparationPlan || []).map((p, i) => (
            <div className="model" key={i}>
              <h4>Priority {p.priority} {"—"} {p.title}</h4>
              {p.why && <p>{p.why}</p>}
              {p.resource?.path && <ExternalLink className="res-link" href={docsUrl(p.resource.path)}>{"→"} {p.resource.label}</ExternalLink>}
            </div>
          ))}
        </Card>
      )}
      <DebriefSection jobId={job.id} title={title} company={job.company} />
      <Disclaimer />
    </div>
  );
}

/** This job's logged interview rounds (local debriefs), newest first. */
function DebriefSection({ jobId, title, company }: { jobId: string; title: string; company?: string }) {
  const all = useDebriefs();
  const list = debriefsForJob(all, jobId);
  const stats = debriefStats(all, jobId, localDay());
  return (
    <section className="stack-sm jd-debriefs" aria-labelledby="jd-deb-h">
      <div className="dto-hist-bar">
        <h3 id="jd-deb-h">Interview rounds</h3>
        <span className="small muted">{list.length ? statsLine(stats) : "None logged yet"}</span>
      </div>
      {list.length === 0 ? (
        <Card>
          <p className="muted">After each interview, log the questions and how they went. Bad answers come back in your plan, and a next round date re-plans up to it.</p>
          <div className="row"><Link className="btn btn-primary btn-small" to={"/debrief?job=" + encodeURIComponent(jobId) + "&new=1"}>Log an interview</Link></div>
        </Card>
      ) : (
        list.slice(0, 4).map((d) => <DebriefCard key={d.id} d={d} job={{ title, company }} compact />)
      )}
      {list.length > 4 && <Link className="small" to={"/debrief?job=" + encodeURIComponent(jobId)}>See all {list.length} rounds</Link>}
    </section>
  );
}

/** Interview date for this job (stored locally; Today plans up to it). */
function InterviewDateRow({ jobId }: { jobId: string }) {
  const [date, setDate] = useInterviewDate(jobId);
  const [editing, setEditing] = useState(false);
  const [val, setVal] = useState(date);
  useEffect(() => { setVal(date); }, [date]);
  const days = daysUntil(date);

  if (editing || !date) {
    return (
      <form className="jd-date" onSubmit={(e) => { e.preventDefault(); if (val) { setDate(val); setEditing(false); } }}>
        <label className="jd-date-label" htmlFor="jd-date-input">Interview date</label>
        <input id="jd-date-input" className="input jd-date-input" type="date" min={localDay()} value={val} onChange={(e) => setVal(e.target.value)} />
        <button type="submit" className="btn btn-primary btn-small" disabled={!val}>Save date</button>
        {date && <button type="button" className="btn btn-ghost btn-small" onClick={() => { setVal(date); setEditing(false); }}>Cancel</button>}
        {!date && <span className="small muted">Set it and Today plans every day up to it.</span>}
      </form>
    );
  }
  return (
    <div className="jd-date">
      <span className={"iv-chip" + (days != null && days >= 0 && days <= 3 ? " iv-chip-soon" : "") + (days != null && days < 0 ? " iv-chip-past" : "")}>
        {days != null && days > 1 ? "Interview in " + days + " days" : days === 1 ? "Interview tomorrow" : countdownLabel(days)}
      </span>
      <span className="small muted">{formatDay(date, { weekday: "long", month: "long", day: "numeric", year: "numeric" })}</span>
      <button type="button" className="link-btn small" onClick={() => setEditing(true)}>Change</button>
      <button type="button" className="link-btn small" onClick={() => setDate(null)}>Clear</button>
    </div>
  );
}
