/* Today — the signed-in home and command centre for the active job:
 * interview countdown, the one next-best action, today's plan tasks, the
 * progress strip and the day-by-day plan (src/lib/prepPlan.ts). */

import { useEffect, useMemo, useState, type ReactNode } from "react";
import { API_ENABLED } from "../config";
import * as api from "../lib/api";
import { useAuth } from "../lib/auth";
import { countdownLabel, daysUntil, formatDay, localDay, useInterviewDate } from "../lib/interviewDates";
import { allDoneDays, ensurePlanState, setTaskDone, type JobPlanState } from "../lib/planProgress";
import { usePlan } from "../lib/plans";
import { buildPrepPlan, carryOver, doneThisWeek, planToIcs, streakDays, type PlanTask, type PrepPlan } from "../lib/prepPlan";
import { getHistory, weakTopicScores } from "../lib/progressStore";
import { setActiveJob, weightedOverall } from "../lib/readiness";
import { displayJobTitle } from "../lib/roles";
import { Link } from "../lib/router";
import { loadStories, neededCompetencies, storyGaps } from "../lib/stories";
import { useJobs } from "../lib/useJobs";
import { SignInCard } from "../components/AuthForm";
import { Card, Loading, Muted } from "../components/ui";
import type { JobDetail, JobRow } from "../types";

export default function TodayPage() {
  const jobs = useJobs();
  const [jobId, setJobId] = useState("");

  useEffect(() => {
    if (jobs.status === "ready" && jobs.jobs.length) setJobId((cur) => (cur && jobs.jobs.some((j) => j.id === cur) ? cur : jobs.activeId || jobs.jobs[0].id));
  }, [jobs.status, jobs.activeId, jobs.jobs]);

  let body;
  if (!API_ENABLED || jobs.status === "disabled") body = <Card><Muted>Today needs saved jobs, which aren{"’"}t enabled on this site yet.</Muted></Card>;
  else if (jobs.status === "loading") body = <Loading>Loading your plan{"…"}</Loading>;
  else if (jobs.status === "signedout") body = (
    <SignInCard title="Sign in to see today’s plan">
      <Muted>Today turns your saved job into a short daily plan up to your interview date: what to do next, a countdown and your streak.</Muted>
    </SignInCard>
  );
  else if (jobs.status === "error") body = (
    <Card>
      <p>Couldn{"’"}t load your jobs right now.</p>
      <div className="row"><button type="button" className="btn" onClick={jobs.reload}>Retry</button></div>
    </Card>
  );
  else if (!jobs.jobs.length) body = <EmptyToday />;
  else if (!jobId) body = <Loading>Loading your plan{"…"}</Loading>;
  else body = <TodayForJob key={jobId} jobId={jobId} jobs={jobs.jobs} onSwitch={(id) => { setActiveJob(id); setJobId(id); }} />;

  return <div className="page td">{body}</div>;
}

function TodayHead({ children }: { children?: ReactNode }) {
  return (
    <header className="td-head">
      <div>
        <p className="td-date">{formatDay(localDay(), { weekday: "long", month: "long", day: "numeric" })}</p>
        <h1>Today</h1>
      </div>
      {children}
    </header>
  );
}

function EmptyToday() {
  return (
    <>
      <TodayHead />
      <section className="card td-empty">
        <div className="td-empty-mark" aria-hidden="true">1</div>
        <div className="stack-sm">
          <h2>Start with the job you want</h2>
          <p className="muted">Paste a job description. OfferReady finds what the role needs and where you may fall short, then builds a day-by-day plan up to your interview.</p>
          <ol className="td-empty-steps">
            <li><strong>Understand</strong> the role and check your fit</li>
            <li><strong>Prepare</strong> questions, decisions and STAR stories</li>
            <li><strong>Prove</strong> it in mock interviews</li>
          </ol>
          <div className="row">
            <Link className="btn btn-primary btn-lg" to="/analyze">Analyze your first job</Link>
            <Link className="btn btn-ghost" to="/example">See a sample</Link>
          </div>
        </div>
      </section>
    </>
  );
}

// ---------------------------------------------------------------------------

interface Next { label: string; why: string; to: string; cta: string; tone?: "done" }

/** The one next-best action, from the job's state (first rule that applies). */
export function nextBestAction(s: {
  jobId: string; hasAnalysis: boolean; hasFit: boolean; questionCount: number; practised: number;
  hasDefend: boolean; storyGap?: string; mockRecent: boolean; readiness: number | null; firstOpen?: PlanTask;
}): Next {
  const jobQ = "?job=" + encodeURIComponent(s.jobId);
  if (!s.hasAnalysis) return { label: "Analyze the job", why: "Paste the job description so the plan knows what the role needs.", to: "/analyze", cta: "Analyze the job" };
  if (!s.hasFit) return { label: "Check your fit", why: "Compare your resume with the role to find the gaps your plan should close first.", to: "/fit", cta: "Check fit" };
  if (!s.questionCount || s.practised < 5) return {
    label: s.questionCount ? "Practise your questions" : "Generate your questions",
    why: s.questionCount ? "You've practised " + s.practised + " so far. Answer five out loud to build a baseline." : "Get interview questions written for this job and its gaps.",
    to: "/questions", cta: s.questionCount ? "Open questions" : "Generate questions",
  };
  if (!s.hasDefend) return { label: "Defend a decision", why: "Interviewers push back on trade-offs. Practise holding a call under follow-ups.", to: "/defend" + jobQ, cta: "Start a scenario" };
  if (s.storyGap) return { label: "Write a story for " + s.storyGap.toLowerCase(), why: "This job will ask about " + s.storyGap.toLowerCase() + " and your story bank has nothing for it yet.", to: "/stories?competency=" + encodeURIComponent(s.storyGap), cta: "Add a story" };
  if (!s.mockRecent) return { label: "Run a mock interview", why: "No mock in the last 7 days. A full run shows what breaks under time pressure.", to: "/simulator", cta: "Start a mock" };
  if (s.readiness != null && s.readiness >= 80) return { label: "Light review", why: "Readiness is " + s.readiness + "%. Keep it warm: skim your stories and one weak area, then rest.", to: "/stories", cta: "Skim your stories", tone: "done" };
  if (s.firstOpen) return { label: s.firstOpen.title, why: s.firstOpen.detail || "Next on today's plan.", to: s.firstOpen.to, cta: "Start" };
  return { label: "Raise your readiness", why: "Today's plan is done. One more practice round moves the score.", to: "/practice", cta: "Practise" };
}

const parseWhen = (w: string) => { const t = Date.parse(w); return isNaN(t) ? 0 : t; };

function TodayForJob({ jobId, jobs, onSwitch }: { jobId: string; jobs: JobRow[]; onSwitch(id: string): void }) {
  const auth = useAuth();
  const plan = usePlan();
  const today = localDay();
  const row = jobs.find((j) => j.id === jobId);
  const [detail, setDetail] = useState<JobDetail | null>(null);
  const [err, setErr] = useState("");
  const [date, setDate] = useInterviewDate(jobId);
  const [state, setState] = useState<JobPlanState>(() => ensurePlanState(jobId, date, today));
  const [doneDays, setDoneDays] = useState<string[]>(allDoneDays);
  const [showAll, setShowAll] = useState(false);

  useEffect(() => { setActiveJob(jobId); }, [jobId]);
  useEffect(() => { setState(ensurePlanState(jobId, date, today)); }, [jobId, date, today]);

  useEffect(() => {
    let alive = true;
    (async () => {
      const tok = await auth.getAccessToken();
      if (!tok) return;
      const res = await api.getJob(tok, jobId);
      if (!alive) return;
      if (res.status !== 200 || !res.body?.job) { setErr(res.status === 0 ? "Couldn’t reach the server." : "Couldn’t load this job."); return; }
      setDetail({ job: res.body.job, gap: res.body.gap || null, questions: res.body.questions || [], progress: res.body.progress || [], practice: res.body.practice || [] });
    })();
    return () => { alive = false; };
  }, [jobId]); // eslint-disable-line react-hooks/exhaustive-deps

  const title = displayJobTitle(detail?.job || row);
  const derived = useMemo(() => {
    if (!detail) return null;
    const a = detail.job.analysis;
    const gap = detail.gap;
    const history = getHistory();
    const latest = detail.progress[0] || null;
    const practiceAvg = latest ? latest.avg_answer_score || 0 : 0;
    const completion = Math.min(latest?.questions_practiced || 0, 10) * 10;
    const readiness = latest && latest.overall_readiness != null ? latest.overall_readiness : gap ? weightedOverall(gap, practiceAvg, completion) : null;
    const practised = Math.max(latest?.questions_practiced || 0, history.filter((h) => h.mode !== "scenario").reduce((n, h) => n + (h.n || 0), 0));
    const hasDefend = detail.practice.some((p) => p.mode === "scenario") || history.some((h) => h.mode === "scenario");
    const weekAgo = Date.now() - 7 * 86400000;
    const mockRecent = history.some((h) => /simulator|voice|mock/i.test(h.track + " " + h.mode) && parseWhen(h.when) >= weekAgo)
      || Object.entries(state.done).some(([id, d]) => id.includes(":mock:") && d >= localDay(new Date(weekAgo)));
    const gaps = [...(gap?.result?.missingSkills || []), ...(a?.potentialGaps || []).map((g) => g.requirement), ...(gap?.result?.missingKeywords || [])];
    const weak = Object.entries(weakTopicScores()).map(([topic, score]) => ({ topic, score }));
    const needed = neededCompetencies(a, detail.job.title || "");
    const sGaps = storyGaps(needed, loadStories().filter((s) => !s.jobIds.length || s.jobIds.includes(jobId)));
    const top3 = needed.slice(0, 3).map((n) => n.label);
    const prep: PrepPlan = buildPrepPlan({
      start: state.start, interviewDate: date || null, jobId, gaps, weakTopics: weak, storyGaps: sGaps,
      hasFit: !!gap, questionCount: detail.questions.length, hasDefend,
    });
    return {
      readiness, practised, hasDefend, mockRecent, prep,
      hasAnalysis: !!a && !!(a.roleSummary || (a.coreSkills || []).length),
      storyGap: sGaps.find((g) => top3.includes(g)),
    };
  }, [detail, date, state.start, state.done, jobId]); // eslint-disable-line react-hooks/exhaustive-deps

  const toggle = (t: PlanTask, on: boolean) => {
    const next = setTaskDone(jobId, t.id, on, today);
    if (next) setState(next);
    setDoneDays(allDoneDays());
  };

  const days = daysUntil(date, today);
  const passed = days != null && days < 0;

  const head = (
    <TodayHead>
      <div className="td-job">
        <span className="td-job-label">Preparing for</span>
        {jobs.length > 1 ? (
          <select className="input td-job-select" aria-label="Job you're preparing for" value={jobId} onChange={(e) => onSwitch(e.target.value)}>
            {jobs.map((j) => <option key={j.id} value={j.id}>{displayJobTitle(j)}</option>)}
          </select>
        ) : <Link className="td-job-title" to={"/jobs/" + encodeURIComponent(jobId)}>{title}</Link>}
      </div>
    </TodayHead>
  );

  if (err) return <>{head}<Card><Muted>{err}</Muted></Card></>;
  if (!detail || !derived) return <>{head}<Loading>Building today{"’"}s plan{"…"}</Loading></>;

  const { prep } = derived;
  const todayDay = prep.days.find((d) => d.date === today);
  const tasks = todayDay ? todayDay.tasks : [];
  const catchUp = carryOver(prep, today, state.done);
  const firstOpen = [...tasks, ...catchUp].find((t) => !state.done[t.id]);
  const next = nextBestAction({
    jobId, hasAnalysis: derived.hasAnalysis, hasFit: !!detail.gap, questionCount: detail.questions.length, practised: derived.practised,
    hasDefend: derived.hasDefend, storyGap: derived.storyGap, mockRecent: derived.mockRecent, readiness: derived.readiness, firstOpen,
  });
  const doneToday = tasks.filter((t) => state.done[t.id]).length;
  const upcoming = prep.days.filter((d) => d.date > today);
  const visibleUpcoming = showAll ? upcoming : upcoming.slice(0, 6);
  const isPro = plan.plan === "pro";

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
      {head}

      <div className="td-top">
        <DateCard date={date} days={days} onSet={setDate} />
        <section className={"td-next" + (next.tone === "done" ? " td-next-done" : "")} aria-labelledby="td-next-h">
          <span className="td-eyebrow">Do this next</span>
          <h2 id="td-next-h">{next.label}</h2>
          <p>{next.why}</p>
          <div className="row"><Link className="btn btn-primary" to={next.to}>{next.cta} {"→"}</Link></div>
        </section>
      </div>

      <div className="td-strip" role="group" aria-label="Your progress">
        <div className="td-metric">
          <span className="td-metric-num">{derived.readiness != null ? derived.readiness + "%" : "—"}</span>
          <span className="td-metric-label">Readiness</span>
          {derived.readiness != null && <span className="td-meter" aria-hidden="true"><span style={{ width: Math.max(3, derived.readiness) + "%" }} /></span>}
        </div>
        <div className="td-metric">
          <span className="td-metric-num">{streakDays(doneDays, today)}<small> {streakDays(doneDays, today) === 1 ? "day" : "days"}</small></span>
          <span className="td-metric-label">Streak</span>
        </div>
        <div className="td-metric">
          <span className="td-metric-num">{doneThisWeek(doneDays, today)}</span>
          <span className="td-metric-label">Tasks this week</span>
        </div>
      </div>

      <section className="card td-tasks" aria-labelledby="td-tasks-h">
        <div className="td-sec-head">
          <div>
            <h2 id="td-tasks-h">Today{"’"}s plan</h2>
            <p className="muted small">
              {todayDay ? "Day " + (todayDay.index + 1) + " of " + prep.totalDays + (todayDay.type === "mock" ? " · mock day" : todayDay.type === "light" ? " · light day" : "") : "No tasks for today"}
              {" · "}{doneToday}/{tasks.length} done
            </p>
          </div>
          {tasks.length > 0 && <span className="td-ring" aria-hidden="true" style={{ background: "conic-gradient(var(--signal) " + Math.round((doneToday / tasks.length) * 100) + "%, var(--border) 0)" }}><span>{doneToday}/{tasks.length}</span></span>}
        </div>
        {(prep.defaulted || passed) && (
          <div className="td-note">
            {passed ? "Your interview date has passed. Set the next one to re-plan." : "This is a 14-day plan. Set your interview date and the plan fits the days you have."}
          </div>
        )}
        <ul className="td-list">
          {tasks.map((t) => <TaskItem key={t.id} t={t} done={!!state.done[t.id]} onToggle={toggle} />)}
        </ul>
        {catchUp.length > 0 && (
          <>
            <h3 className="td-sub">Catch up from earlier days</h3>
            <ul className="td-list">
              {catchUp.map((t) => <TaskItem key={t.id} t={t} done={!!state.done[t.id]} onToggle={toggle} />)}
            </ul>
          </>
        )}
        {tasks.length > 0 && doneToday === tasks.length && <p className="td-alldone">Today{"’"}s plan is done. Nice work.</p>}
      </section>

      <section className="card td-plan" aria-labelledby="td-plan-h">
        <div className="td-sec-head">
          <div>
            <h2 id="td-plan-h">The plan to {prep.defaulted ? "day 14" : "your interview"}</h2>
            <p className="muted small">Weakest gaps first, spaced reviews, mocks at the halfway mark and near the end, and a light day before.</p>
          </div>
          <div className="td-cal">
            {isPro ? (
              <button type="button" className="btn btn-small" onClick={downloadIcs}>Add to calendar</button>
            ) : (
              <>
                <button type="button" className="btn btn-small" disabled aria-describedby="td-cal-pro">Add to calendar</button>
                <Link id="td-cal-pro" className="pro-badge" to="/pricing" title="Calendar export is a Pro feature">Pro</Link>
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
    </>
  );
}

function TaskItem({ t, done, onToggle }: { t: PlanTask; done: boolean; onToggle(t: PlanTask, on: boolean): void }) {
  return (
    <li className={"td-task" + (done ? " is-done" : "")}>
      <label className="td-check">
        <input type="checkbox" checked={done} onChange={(e) => onToggle(t, e.target.checked)} aria-label={"Mark done: " + t.title} />
        <span className="td-box" aria-hidden="true" />
      </label>
      <div className="td-task-body">
        <Link className="td-task-title" to={t.to}>{t.title}</Link>
        {t.detail && <span className="td-task-detail">{t.detail}</span>}
      </div>
      <span className={"td-kind td-kind-" + t.kind}>{t.minutes} min</span>
    </li>
  );
}

function DateCard({ date, days, onSet }: { date: string; days: number | null; onSet(iso: string | null): void }) {
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
            <button type="button" className="btn btn-small" onClick={() => setEditing(true)}>Change date</button>
          </div>
        </>
      ) : (
        <form className="stack-sm" onSubmit={(e) => { e.preventDefault(); save(); }}>
          <p className="small">{date ? "Pick the new date." : "When is your interview? The plan fits the days you have."}</p>
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
