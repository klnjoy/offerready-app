/* The job page: the workspace for one job (was Today + Check fit + the old
 * job detail). Three tabs, kept in ?tab= so links can open one directly:
 *
 *   Overview (default)  countdown + date, ONE "Do this next", readiness,
 *                       resume match with its top gaps (each links to
 *                       Practice on that topic), today's tasks from the
 *                       day-by-day plan (lib/prepPlan.ts), and the job itself.
 *   Resume (?tab=resume) fit details, the saved resume, re-check, Tailor.
 *   After the interview (?tab=after) debriefs and offers. */

import { useEffect, useMemo, useState, type ReactNode } from "react";
import { docsUrl } from "../config";
import * as api from "../lib/api";
import { useAuth } from "../lib/auth";
import { ROUND_LABELS, debriefReviewTopics, debriefStats, debriefsForJob, statsLine } from "../lib/debrief";
import { useDebriefs } from "../lib/debriefStore";
import { countdownLabel, daysUntil, formatDay, localDay, useInterviewDate } from "../lib/interviewDates";
import { allDoneDays, ensurePlanState, setTaskDone, type JobPlanState } from "../lib/planProgress";
import { usePlan, invalidatePlan } from "../lib/plans";
import { buildPrepPlan, carryOver, doneThisWeek, planToIcs, streakDays, type PlanTask, type PrepPlan } from "../lib/prepPlan";
import { getHistory, weakTopicScores } from "../lib/progressStore";
import { band, setActiveJob, weightedOverall } from "../lib/readiness";
import { displayJobTitle, roleGuideFor } from "../lib/roles";
import { ExternalLink, Link, useNavigate, useSearchParams } from "../lib/router";
import { useSavedResume } from "../lib/savedResume";
import { loadStories, neededCompetencies, storyGaps } from "../lib/stories";
import { useJobs } from "../lib/useJobs";
import { KEYS, onDataChanged } from "../lib/storage";
import { SignInCard } from "../components/AuthForm";
import { DebriefCard } from "../components/DebriefHistory";
import { FitDetails, gapRowToResult, resultToGapRow, topGaps } from "../components/FitSummary";
import { RESUME_PRIVACY, ResumeField } from "../components/ResumeField";
import { Card, Chips, Disclaimer, Loading, Muted } from "../components/ui";
import type { JobDetail, JobRow } from "../types";

type Tab = "overview" | "resume" | "after";
const TABS: { key: Tab; label: string }[] = [
  { key: "overview", label: "Overview" },
  { key: "resume", label: "Resume" },
  { key: "after", label: "After the interview" },
];

type State = { kind: "loading" } | { kind: "signedout" } | { kind: "error"; msg: string } | { kind: "ready"; data: JobDetail };

const enc = encodeURIComponent;
const jobPath = (id: string, tab?: Tab) => "/jobs/" + enc(id) + (tab && tab !== "overview" ? "?tab=" + tab : "");

/** Plan tasks link to old routes in places; send them somewhere in this job. */
function resolveTo(to: string, jobId: string): string {
  if (to === "/fit") return jobPath(jobId, "resume");
  if (to === "/today") return jobPath(jobId);
  return to;
}

// Route params arrive as a string map (see App.tsx ROUTES).
export default function JobDetailPage({ id }: Record<string, string>) {
  const auth = useAuth();
  const jobs = useJobs();
  const params = useSearchParams();
  const navigate = useNavigate();
  const [state, setState] = useState<State>({ kind: "loading" });
  const t = params.get("tab");
  const tab: Tab = t === "resume" || t === "after" ? t : "overview";
  const added = params.get("added") === "1";

  useEffect(() => {
    let alive = true;
    setActiveJob(id);
    setState({ kind: "loading" });
    (async () => {
      if (!auth.ready) return;
      const tok = await auth.getAccessToken();
      if (!tok) { if (alive) setState({ kind: "signedout" }); return; }
      const res = await api.getJob(tok, id);
      if (!alive) return;
      if (res.status === 0) setState({ kind: "error", msg: "Couldn’t reach the server." });
      else if (res.status !== 200 || !res.body?.job) setState({ kind: "error", msg: "Couldn’t open that job. It may have been deleted." });
      else setState({ kind: "ready", data: { job: res.body.job, gap: res.body.gap || null, questions: res.body.questions || [], progress: res.body.progress || [], practice: res.body.practice || [] } });
    })();
    return () => { alive = false; };
  }, [id, auth.ready, auth.session]); // eslint-disable-line react-hooks/exhaustive-deps

  const row = jobs.jobs.find((j) => j.id === id);
  const data = state.kind === "ready" ? state.data : null;
  const setData = (fn: (d: JobDetail) => JobDetail) => setState((s) => (s.kind === "ready" ? { kind: "ready", data: fn(s.data) } : s));

  return (
    <div className="page jw">
      <JobHead id={id} title={displayJobTitle(data?.job || row)} job={data?.job || row} jobs={jobs.jobs} tab={tab}
        onSwitch={(nid) => { setActiveJob(nid); navigate(jobPath(nid, tab)); }} />
      {state.kind === "loading" && <Loading>Loading this job{"…"}</Loading>}
      {state.kind === "signedout" && <SignInCard title="Sign in to open this job" />}
      {state.kind === "error" && <Card><p>{state.msg}</p><div className="row"><Link className="btn" to="/jobs">See all jobs</Link></div></Card>}
      {data && (
        <>
          {added && (
            <div className="jw-added" role="status">
              <span className="jw-added-mark" aria-hidden="true">{"✓"}</span>
              <span>
                <strong>Job added.</strong>{" "}
                {data.gap ? "Your resume matches " + (data.gap.match_score || 0) + "%. Your plan is ready below." : "Your plan is ready below. Add your resume to see how you match."}
              </span>
              <button type="button" className="link-btn small" onClick={() => navigate(jobPath(id, tab), { replace: true })}>Dismiss</button>
            </div>
          )}
          <nav className="jw-tabs" aria-label="Job sections">
            {TABS.map((x) => (
              <Link key={x.key} to={jobPath(id, x.key)} className={"jw-tab" + (tab === x.key ? " on" : "")} aria-current={tab === x.key ? "page" : undefined}>{x.label}</Link>
            ))}
          </nav>
          {tab === "overview" && <Overview data={data} />}
          {tab === "resume" && <ResumeTab data={data} onGap={(g) => setData((d) => ({ ...d, gap: g }))} />}
          {tab === "after" && <AfterTab jobId={id} title={displayJobTitle(data.job)} company={data.job.company} />}
          <Disclaimer />
        </>
      )}
    </div>
  );
}

function JobHead({ id, title, job, jobs, tab, onSwitch }: { id: string; title: string; job?: JobRow; jobs: JobRow[]; tab: Tab; onSwitch(id: string): void }) {
  const meta = [job?.company, job?.seniority].filter(Boolean).join(" · ");
  return (
    <header className="jw-head">
      <Link className="back-link" to="/jobs">{"←"} All jobs</Link>
      <div className="jw-head-row">
        <div className="jw-head-titles">
          <p className="td-job-label">Preparing for</p>
          <h1>{title}</h1>
          {meta && <p className="muted">{meta}</p>}
        </div>
        {jobs.length > 1 && (
          <label className="jw-switch">
            <span className="small muted">Switch job</span>
            <select className="input td-job-select" aria-label="Switch job" value={id} onChange={(e) => onSwitch(e.target.value)}>
              {jobs.map((j) => <option key={j.id} value={j.id}>{displayJobTitle(j)}</option>)}
            </select>
          </label>
        )}
      </div>
      <span className="td-sr">{"Section: " + (TABS.find((x) => x.key === tab)?.label || "")}</span>
    </header>
  );
}

// ---------------------------------------------------------------------------
// Overview

interface Next { label: string; why: string; to: string; cta: string; tone?: "done" }

/** The one next-best action, from the job's state (first rule that applies). */
export function nextBestAction(s: {
  jobId: string; hasAnalysis: boolean; hasFit: boolean; questionCount: number; practised: number;
  hasDefend: boolean; storyGap?: string; mockRecent: boolean; readiness: number | null; firstOpen?: PlanTask;
}): Next {
  const jobQ = "?job=" + enc(s.jobId);
  if (!s.hasAnalysis) return { label: "Add the job description", why: "Paste the job so the plan knows what the role needs.", to: "/analyze", cta: "Add a job" };
  if (!s.hasFit) return { label: "Add your resume", why: "See how your resume matches this job, and which gaps to close first.", to: jobPath(s.jobId, "resume"), cta: "Add your resume" };
  if (!s.questionCount || s.practised < 5) return {
    label: s.questionCount ? "Practise your questions" : "Get your interview questions",
    why: s.questionCount ? "You’ve practised " + s.practised + " so far. Answer five out loud to get a baseline." : "Questions written for this job and the gaps in your resume.",
    to: "/questions" + jobQ, cta: s.questionCount ? "Open questions" : "Get questions",
  };
  if (!s.hasDefend) return { label: "Try a trade-off drill", why: "Interviewers push back on your decisions. Practise holding your call when they do.", to: "/defend" + jobQ, cta: "Start a drill" };
  if (s.storyGap) return { label: "Write a story for " + s.storyGap.toLowerCase(), why: "This job will ask about " + s.storyGap.toLowerCase() + ", and you have no story for it yet.", to: "/stories?competency=" + enc(s.storyGap), cta: "Add a story" };
  if (!s.mockRecent) return { label: "Run a mock interview", why: "No mock in the last 7 days. A full run shows what breaks under time pressure.", to: "/mock", cta: "Start a mock" };
  if (s.readiness != null && s.readiness >= 80) return { label: "Light review", why: "Readiness is " + s.readiness + "%. Keep it warm: skim your stories and one weak area, then rest.", to: "/stories", cta: "Skim your stories", tone: "done" };
  if (s.firstOpen) return { label: s.firstOpen.title, why: s.firstOpen.detail || "Next in your plan.", to: resolveTo(s.firstOpen.to, s.jobId), cta: "Start" };
  return { label: "Raise your readiness", why: "Today’s plan is done. One more practice round moves the score.", to: "/practice" + jobQ, cta: "Practise" };
}

const parseWhen = (w: string) => { const t = Date.parse(w); return isNaN(t) ? 0 : t; };

function Overview({ data }: { data: JobDetail }) {
  const plan = usePlan();
  const today = localDay();
  const jobId = data.job.id;
  const [date, setDate] = useInterviewDate(jobId);
  const [state, setState] = useState<JobPlanState>(() => ensurePlanState(jobId, date, today));
  const [doneDays, setDoneDays] = useState<string[]>(allDoneDays);
  const [showAll, setShowAll] = useState(false);
  const debriefs = useDebriefs();

  useEffect(() => { setState(ensurePlanState(jobId, date, today)); }, [jobId, date, today]);
  // Account sync brought newer checkmarks: re-read.
  useEffect(() => onDataChanged([KEYS.prepPlan], () => { setState(ensurePlanState(jobId, date, today)); setDoneDays(allDoneDays()); }), [jobId, date, today]);

  const title = displayJobTitle(data.job);
  const derived = useMemo(() => {
    const a = data.job.analysis;
    const gap = data.gap;
    const history = getHistory();
    const latest = data.progress[0] || null;
    const practiceAvg = latest ? latest.avg_answer_score || 0 : 0;
    const completion = Math.min(latest?.questions_practiced || 0, 10) * 10;
    const readiness = latest && latest.overall_readiness != null ? latest.overall_readiness : gap ? weightedOverall(gap, practiceAvg, completion) : null;
    const practised = Math.max(latest?.questions_practiced || 0, history.filter((h) => h.mode !== "scenario").reduce((n, h) => n + (h.n || 0), 0));
    const hasDefend = data.practice.some((p) => p.mode === "scenario") || history.some((h) => h.mode === "scenario");
    const weekAgo = Date.now() - 7 * 86400000;
    const mockRecent = history.some((h) => /simulator|voice|mock/i.test(h.track + " " + h.mode) && parseWhen(h.when) >= weekAgo)
      || Object.entries(state.done).some(([id, d]) => id.includes(":mock:") && d >= localDay(new Date(weekAgo)));
    const gaps = [...(gap?.result?.missingSkills || []), ...(a?.potentialGaps || []).map((g) => g.requirement), ...(gap?.result?.missingKeywords || [])];
    const weak = Object.entries(weakTopicScores()).map(([topic, score]) => ({ topic, score }));
    const needed = neededCompetencies(a, data.job.title || "");
    const sGaps = storyGaps(needed, loadStories().filter((s) => !s.jobIds.length || s.jobIds.includes(jobId)));
    const top3 = needed.slice(0, 3).map((n) => n.label);
    // Questions that went badly in logged interviews (debriefs) → reviews.
    const debriefTopics = debriefReviewTopics(debriefs, jobId, localDay()).map((t) => ({ ...t, round: ROUND_LABELS[t.round], date: formatDay(t.date, { month: "short", day: "numeric" }) }));
    const prep: PrepPlan = buildPrepPlan({
      start: state.start, interviewDate: date || null, jobId, gaps, weakTopics: weak, storyGaps: sGaps, debriefTopics,
      hasFit: !!gap, questionCount: data.questions.length, hasDefend,
    });
    return {
      readiness, practised, hasDefend, mockRecent, prep,
      hasAnalysis: !!a && !!(a.roleSummary || (a.coreSkills || []).length),
      storyGap: sGaps.find((g) => top3.includes(g)),
    };
  }, [data, date, state.start, state.done, jobId, debriefs]); // eslint-disable-line react-hooks/exhaustive-deps

  const toggle = (t: PlanTask, on: boolean) => {
    const next = setTaskDone(jobId, t.id, on, today);
    if (next) setState(next);
    setDoneDays(allDoneDays());
  };

  const days = daysUntil(date, today);
  const passed = days != null && days < 0;
  const dStats = debriefStats(debriefs, jobId, today);
  // The interview on the current date hasn't been logged yet.
  const unlogged = !!date && days != null && days <= 0 && !debriefsForJob(debriefs, jobId).some((d) => d.date === date);
  const logTo = "/debrief?job=" + enc(jobId) + "&new=1";

  const { prep } = derived;
  const todayDay = prep.days.find((d) => d.date === today);
  const tasks = todayDay ? todayDay.tasks : [];
  const catchUp = carryOver(prep, today, state.done);
  const firstOpen = [...tasks, ...catchUp].find((t) => !state.done[t.id]);
  const next: Next = unlogged && passed
    ? { label: "Log how your interview went", why: "Note the questions while you still remember them. The ones that went badly come back in your plan, and a next round date re-plans up to it.", to: logTo, cta: "Log interview" }
    : nextBestAction({
      jobId, hasAnalysis: derived.hasAnalysis, hasFit: !!data.gap, questionCount: data.questions.length, practised: derived.practised,
      hasDefend: derived.hasDefend, storyGap: derived.storyGap, mockRecent: derived.mockRecent, readiness: derived.readiness, firstOpen,
    });
  const doneToday = tasks.filter((t) => state.done[t.id]).length;
  const upcoming = prep.days.filter((d) => d.date > today);
  const visibleUpcoming = showAll ? upcoming : upcoming.slice(0, 6);
  const isPro = plan.plan === "pro";
  const streak = streakDays(doneDays, today);

  const downloadIcs = () => {
    const ics = planToIcs(prep, { jobTitle: title, fromDate: today, baseUrl: window.location.origin });
    const url = URL.createObjectURL(new Blob([ics], { type: "text/calendar;charset=utf-8" }));
    const a = document.createElement("a");
    a.href = url;
    a.download = "offerready-plan-" + (title.toLowerCase().replace(/[^a-z0-9]+/g, "-").replace(/^-|-$/g, "") || "job") + ".ics";
    document.body.appendChild(a);
    a.click();
    a.remove();
    setTimeout(() => URL.revokeObjectURL(url), 1000);
  };

  return (
    <>
      <div className="td-top">
        <DateCard date={date} days={days} onSet={setDate} logTo={unlogged || (days != null && days <= 0) ? logTo : ""} />
        <section className={"td-next" + (next.tone === "done" ? " td-next-done" : "")} aria-labelledby="td-next-h">
          <span className="td-eyebrow">Do this next</span>
          <h2 id="td-next-h">{next.label}</h2>
          <p>{next.why}</p>
          <div className="row"><Link className="btn btn-primary" to={next.to}>{next.cta} {"→"}</Link></div>
        </section>
      </div>

      <div className="jw-pair">
        <ReadinessMini readiness={derived.readiness} streak={streak} week={doneThisWeek(doneDays, today)} />
        <FitMini data={data} />
      </div>

      <RoleGuideCard job={data.job} />

      {dStats.rounds > 0 && (
        <div className="td-debrief" role="status">
          <span className="td-debrief-mark" aria-hidden="true">{dStats.rounds}</span>
          <span className="td-debrief-text">{statsLine(dStats)}{dStats.bad ? " · " + dStats.bad + " to revisit" : ""}</span>
          <Link className="btn btn-small" to={jobPath(jobId, "after")}>Rounds</Link>
        </div>
      )}

      <section className="card td-tasks" aria-labelledby="td-tasks-h">
        <div className="td-sec-head">
          <div>
            <h2 id="td-tasks-h">Your plan for today</h2>
            <p className="muted small">
              {todayDay ? "Day " + (todayDay.index + 1) + " of " + prep.totalDays + (todayDay.type === "mock" ? " · mock day" : todayDay.type === "light" ? " · light day" : "") : "No tasks for today"}
              {" · "}{doneToday}/{tasks.length} done
            </p>
          </div>
          {tasks.length > 0 && <span className="td-ring" aria-hidden="true" style={{ background: "conic-gradient(var(--signal) " + Math.round((doneToday / tasks.length) * 100) + "%, var(--border) 0)" }}><span>{doneToday}/{tasks.length}</span></span>}
        </div>
        {(prep.defaulted || passed) && (
          <div className="td-note">
            {passed ? <>Your interview date has passed. <Link to={logTo}>Log how it went</Link>, or set the next date to re-plan.</> : "This is a 14-day plan. Set your interview date and the plan fits the days you have."}
          </div>
        )}
        <ul className="td-list">
          {tasks.map((t) => <TaskItem key={t.id} t={t} jobId={jobId} done={!!state.done[t.id]} onToggle={toggle} />)}
        </ul>
        {catchUp.length > 0 && (
          <>
            <h3 className="td-sub">Catch up from earlier days</h3>
            <ul className="td-list">
              {catchUp.map((t) => <TaskItem key={t.id} t={t} jobId={jobId} done={!!state.done[t.id]} onToggle={toggle} />)}
            </ul>
          </>
        )}
        {tasks.length > 0 && doneToday === tasks.length && <p className="td-alldone">Today{"’"}s plan is done. Nice work.</p>}
      </section>

      <section className="card td-plan" aria-labelledby="td-plan-h">
        <div className="td-sec-head">
          <div>
            <h2 id="td-plan-h">The plan to {prep.defaulted ? "day 14" : "your interview"}</h2>
            <p className="muted small">Weakest gaps first, spaced reviews, mock interviews halfway and near the end, and a light day before.</p>
          </div>
          <div className="td-cal">
            {isPro ? (
              <button type="button" className="btn btn-small" onClick={downloadIcs}>Add to calendar</button>
            ) : (
              <>
                <button type="button" className="btn btn-small" disabled aria-describedby="td-cal-pro">Add to calendar</button>
                <Link id="td-cal-pro" className="pro-badge" to="/pricing" title="Calendar export comes with any pass">Pass</Link>
              </>
            )}
          </div>
        </div>
        <ol className="td-days">
          {visibleUpcoming.map((d) => (
            <li key={d.date} className={"td-day td-day-" + d.type}>
              <div className="td-day-when">
                <span className="td-day-dow">{formatDay(d.date, { weekday: "short" })}</span>
                <span className="td-day-num">{formatDay(d.date, { day: "numeric" })}</span>
              </div>
              <div className="td-day-body">
                <div className="td-day-title">
                  Day {d.index + 1}
                  {d.type === "mock" && <span className="pill pill-info">Mock</span>}
                  {d.type === "light" && <span className="pill pill-ok">Light day</span>}
                </div>
                <div className="td-day-tasks">{d.tasks.map((t) => t.title).join(" · ")}</div>
              </div>
            </li>
          ))}
          {!prep.defaulted && (showAll || upcoming.length <= 6) && (
            <li className="td-day td-day-interview">
              <div className="td-day-when">
                <span className="td-day-dow">{formatDay(prep.end, { weekday: "short" })}</span>
                <span className="td-day-num">{formatDay(prep.end, { day: "numeric" })}</span>
              </div>
              <div className="td-day-body"><div className="td-day-title">Interview day</div><div className="td-day-tasks">{title}</div></div>
            </li>
          )}
        </ol>
        {upcoming.length > 6 && (
          <button type="button" className="btn btn-ghost btn-small td-more" onClick={() => setShowAll((s) => !s)}>
            {showAll ? "Show less" : "Show all " + upcoming.length + " days"}
          </button>
        )}
      </section>

      <AboutJob data={data} />
    </>
  );
}

function ReadinessMini({ readiness, streak, week }: { readiness: number | null; streak: number; week: number }) {
  const pct = readiness ?? 0;
  const r = 26;
  const c = 2 * Math.PI * r;
  return (
    <section className="card jw-ready" aria-labelledby="jw-ready-h">
      <div className="td-sec-head">
        <div>
          <h2 id="jw-ready-h">Readiness</h2>
          <p className="muted small">Resume match, practice and preparation, in one score.</p>
        </div>
        <Link className="small" to="/dashboard">Details</Link>
      </div>
      <div className="jw-ready-row">
        <div className={"jw-ring band-" + band(pct)} role="img" aria-label={readiness != null ? "Readiness " + pct + " percent" : "No readiness score yet"}>
          <svg viewBox="0 0 64 64" width="72" height="72" aria-hidden="true">
            <circle cx="32" cy="32" r={r} fill="none" stroke="var(--border)" strokeWidth="6" />
            {readiness != null && <circle cx="32" cy="32" r={r} fill="none" stroke="currentColor" strokeWidth="6" strokeLinecap="round" strokeDasharray={c} strokeDashoffset={c * (1 - pct / 100)} transform="rotate(-90 32 32)" />}
          </svg>
          <span className="jw-ring-num">{readiness != null ? pct + "%" : "—"}</span>
        </div>
        <dl className="jw-facts">
          <div><dt>Streak</dt><dd>{streak} {streak === 1 ? "day" : "days"}</dd></div>
          <div><dt>Tasks this week</dt><dd>{week}</dd></div>
        </dl>
      </div>
    </section>
  );
}

function FitMini({ data }: { data: JobDetail }) {
  const jobId = data.job.id;
  const r = gapRowToResult(data.gap);
  const gaps = topGaps(r, (data.job.analysis?.potentialGaps || []).map((g) => g.requirement), 3);
  const practiseTo = (g: string) => "/practice?job=" + enc(jobId) + "&topic=" + enc(g);
  return (
    <section className="card jw-fit" aria-labelledby="jw-fit-h">
      <div className="td-sec-head">
        <div>
          <h2 id="jw-fit-h">Resume match</h2>
          <p className="muted small">{r ? "Your top gaps. Practise each one." : "Add your resume to see how you match."}</p>
        </div>
        {r ? <span className={"jw-fit-num band-" + band(r.matchScore || 0)}>{r.matchScore || 0}%</span> : null}
      </div>
      {r ? (
        <>
          {gaps.length > 0 ? (
            <ul className="jw-gaps">
              {gaps.map((g) => (
                <li key={g}>
                  <span className="jw-gap-name">{g}</span>
                  <Link className="jw-gap-go" to={practiseTo(g)} aria-label={"Practise " + g}>Practise {"→"}</Link>
                </li>
              ))}
            </ul>
          ) : <p className="small muted">No gaps found. Nice.</p>}
          <Link className="small" to={jobPath(jobId, "resume")}>See the full match</Link>
        </>
      ) : (
        <>
          {gaps.length > 0 && (
            <ul className="jw-gaps">
              {gaps.map((g) => (
                <li key={g}><span className="jw-gap-name">{g}</span><Link className="jw-gap-go" to={practiseTo(g)} aria-label={"Practise " + g}>Practise {"→"}</Link></li>
              ))}
            </ul>
          )}
          <div className="row"><Link className="btn btn-primary btn-small" to={jobPath(jobId, "resume")}>Add your resume</Link></div>
        </>
      )}
    </section>
  );
}

/** Link to the study site's role guide when the job title matches one. */
function RoleGuideCard({ job }: { job: JobDetail["job"] }) {
  const guide = roleGuideFor(job);
  if (!guide) return null;
  return (
    <section className="card rg-card" aria-labelledby="rg-card-h">
      <div className="rg-card-copy">
        <span className="td-eyebrow">Role guide</span>
        <h2 id="rg-card-h">{guide.label}</h2>
        <p className="muted small">How the interview loop runs, what a strong answer sounds like at senior and staff level, the questions you’re most likely to get, and a 14-day plan.</p>
      </div>
      <ExternalLink className="btn rg-card-go" href={guide.url}>Read the guide <span aria-hidden="true">{"↗"}</span><span className="td-sr"> (opens in a new tab)</span></ExternalLink>
    </section>
  );
}

function AboutJob({ data }: { data: JobDetail }) {
  const a = data.job.analysis;
  if (!a) return null;
  const skills = [...(a.coreSkills || []).map((s) => (typeof s === "string" ? s : s.name)), ...(a.technologies || [])].filter(Boolean);
  return (
    <details className="card jw-about">
      <summary><h2>About this job</h2><span className="small muted">What the role asks for, from the description</span></summary>
      <div className="stack-sm">
        {a.roleSummary && <p>{a.roleSummary}</p>}
        {skills.length > 0 && <Chips label="Skills it asks for" items={Array.from(new Set(skills)).slice(0, 16)} />}
        {(a.potentialGaps || []).length > 0 && (
          <div>
            <div className="field-label">Areas to prepare</div>
            <ul>{(a.potentialGaps || []).map((g, i) => <li key={i}>{g.requirement}</li>)}</ul>
          </div>
        )}
        {(a.preparationPlan || []).map((p, i) => (
          <div className="model" key={i}>
            <h4>Priority {p.priority}: {p.title}</h4>
            {p.why && <p>{p.why}</p>}
            {p.resource?.path && <ExternalLink className="res-link" href={docsUrl(p.resource.path)}>{"→"} {p.resource.label}</ExternalLink>}
          </div>
        ))}
      </div>
    </details>
  );
}

function TaskItem({ t, jobId, done, onToggle }: { t: PlanTask; jobId: string; done: boolean; onToggle(t: PlanTask, on: boolean): void }) {
  return (
    <li className={"td-task" + (done ? " is-done" : "")}>
      <label className="td-check">
        <input type="checkbox" checked={done} onChange={(e) => onToggle(t, e.target.checked)} aria-label={"Mark done: " + t.title} />
        <span className="td-box" aria-hidden="true" />
      </label>
      <div className="td-task-body">
        <Link className="td-task-title" to={resolveTo(t.to, jobId)}>{t.title}</Link>
        {t.detail && <span className="td-task-detail">{t.detail}</span>}
      </div>
      <span className={"td-kind td-kind-" + t.kind}>{t.minutes} min</span>
    </li>
  );
}

function DateCard({ date, days, onSet, logTo }: { date: string; days: number | null; onSet(iso: string | null): void; logTo?: string }) {
  const [editing, setEditing] = useState(!date);
  const [val, setVal] = useState(date);
  useEffect(() => { setVal(date); setEditing(!date); }, [date]);
  const save = () => { if (val) { onSet(val); setEditing(false); } };

  return (
    <section className="card td-date-card" aria-labelledby="td-date-h">
      <span className="td-eyebrow" id="td-date-h">Interview</span>
      {date && !editing ? (
        <>
          <div className="td-count">
            <span className="td-count-num">{days != null && days >= 0 ? days : "—"}</span>
            <span className="td-count-label">{days != null && days > 1 ? "days to go" : days === 1 ? "day to go" : countdownLabel(days)}</span>
          </div>
          <p className="muted small">{formatDay(date, { weekday: "long", month: "long", day: "numeric", year: "numeric" })}</p>
          <div className="row">
            {logTo && <Link className="btn btn-primary btn-small td-log-btn" to={logTo}>Log interview</Link>}
            <button type="button" className="btn btn-small" onClick={() => setEditing(true)}>Change date</button>
          </div>
        </>
      ) : (
        <form className="stack-sm" onSubmit={(e) => { e.preventDefault(); save(); }}>
          <p className="small">{date ? "Pick the new date." : "When is your interview? Your plan fits the days you have."}</p>
          <label className="td-sr" htmlFor="td-date-input">Interview date</label>
          <input id="td-date-input" className="input" type="date" min={localDay()} value={val} onChange={(e) => setVal(e.target.value)} />
          <div className="row">
            <button type="submit" className="btn btn-primary btn-small" disabled={!val}>Save date</button>
            {date && <button type="button" className="btn btn-ghost btn-small" onClick={() => { setVal(date); setEditing(false); }}>Cancel</button>}
            {date && <button type="button" className="link-btn small" onClick={() => onSet(null)}>Clear</button>}
          </div>
        </form>
      )}
    </section>
  );
}

// ---------------------------------------------------------------------------
// Resume

function ResumeTab({ data, onGap }: { data: JobDetail; onGap(g: JobDetail["gap"]): void }) {
  const auth = useAuth();
  const [resume] = useSavedResume();
  const [busy, setBusy] = useState(false);
  const [msg, setMsg] = useState<{ text: ReactNode; err?: boolean } | null>(null);
  const r = gapRowToResult(data.gap);
  const jobId = data.job.id;
  const jd = data.job.job_description || data.job.analysis?.roleSummary || "";

  const check = async () => {
    if (!resume) return;
    if (jd.trim().length < 30) { setMsg({ text: "This job has no description saved, so there’s nothing to compare with. Add the job again with its description.", err: true }); return; }
    setBusy(true);
    setMsg({ text: "Comparing your resume with this job…" });
    const tok = await auth.getAccessToken();
    const res = await api.runGapAnalysis(tok, { jobId, role: displayJobTitle(data.job), jobDescription: jd, resumeText: resume.text });
    setBusy(false);
    if (res.status === 200 && res.body?.result) {
      invalidatePlan();
      onGap(resultToGapRow(res.body.result));
      setMsg({ text: "Updated. " + (res.body.saved ? "Saved to this job." : "") });
    } else if (res.status === 401) setMsg({ text: "Your session expired. Sign in again and retry.", err: true });
    else if (res.status === 503) setMsg({ text: "The fit check isn’t enabled on this deployment yet.", err: true });
    else if (res.status === 0) setMsg({ text: "Couldn’t reach the server. Check your connection and try again.", err: true });
    else setMsg({ text: res.body?.error || "Couldn’t compare your resume. Please try again.", err: true });
  };

  return (
    <div className="stack">
      <section className="card jw-resume" aria-labelledby="jw-res-h">
        <div className="td-sec-head">
          <div>
            <h2 id="jw-res-h">Your resume</h2>
            <p className="muted small">Added once and reused for every job, for tailoring and for mock interviews.</p>
          </div>
        </div>
        <ResumeField compact />
        <div className="row wrap">
          <button type="button" className="btn btn-primary" disabled={!resume || busy} onClick={check}>
            {busy ? "Checking…" : r ? "Check my fit again" : "Check my fit"}
          </button>
          {!resume && <span className="small muted">Add your resume above first.</span>}
        </div>
        {msg && <p className={"save-msg" + (msg.err ? " error" : "")} role="status">{msg.text}</p>}
        <p className="small muted">{RESUME_PRIVACY}</p>
      </section>

      {r ? <FitDetails result={r} /> : (
        <Card><Muted>No fit check yet. Add your resume and press {"“"}Check my fit{"”"} to see your match score, what{"’"}s found and what{"’"}s missing.</Muted></Card>
      )}

      <section className="card jw-tailor" aria-labelledby="jw-tl-h">
        <div className="jw-tailor-row">
          <div className="stack-sm">
            <h2 id="jw-tl-h">Tailor my resume for this job</h2>
            <Muted small>Rewrites your resume bullets for this job{"’"}s skills and gaps, without inventing anything. Uses your saved resume.</Muted>
          </div>
          <Link className="btn btn-primary" to={"/tailor?job=" + enc(jobId)}>Tailor my resume</Link>
        </div>
      </section>
    </div>
  );
}

// ---------------------------------------------------------------------------
// After the interview

function AfterTab({ jobId, title, company }: { jobId: string; title: string; company?: string }) {
  const all = useDebriefs();
  const list = debriefsForJob(all, jobId);
  const stats = debriefStats(all, jobId, localDay());
  return (
    <div className="stack">
      <section className="stack-sm jd-debriefs" aria-labelledby="jd-deb-h">
        <div className="dto-hist-bar">
          <h2 id="jd-deb-h">Interview rounds</h2>
          <span className="small muted">{list.length ? statsLine(stats) : "None logged yet"}</span>
        </div>
        {list.length === 0 ? (
          <Card>
            <p className="muted">After each interview, write down the questions and how they went. The ones that went badly come back in your plan, and a next round date re-plans up to it.</p>
            <div className="row"><Link className="btn btn-primary btn-small" to={"/debrief?job=" + enc(jobId) + "&new=1"}>Log an interview</Link></div>
          </Card>
        ) : (
          <>
            {list.slice(0, 4).map((d) => <DebriefCard key={d.id} d={d} job={{ title, company }} compact />)}
            <div className="row">
              <Link className="btn btn-primary btn-small" to={"/debrief?job=" + enc(jobId) + "&new=1"}>Log another round</Link>
              <Link className="btn btn-ghost btn-small" to={"/debrief?job=" + enc(jobId)}>See all {list.length} {list.length === 1 ? "round" : "rounds"}</Link>
            </div>
          </>
        )}
      </section>
      <section className="card jw-offers" aria-labelledby="jw-off-h">
        <div className="jw-tailor-row">
          <div className="stack-sm">
            <h2 id="jw-off-h">Got an offer?</h2>
            <Muted small>Put your offers side by side on year-1 and yearly pay, then plan how to negotiate. Stored on this device only.</Muted>
          </div>
          <Link className="btn" to={"/offers?job=" + enc(jobId)}>Compare offers</Link>
        </div>
      </section>
    </div>
  );
}
