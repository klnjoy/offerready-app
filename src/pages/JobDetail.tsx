/* The job page: the workspace for one job (was Today + Check fit + the old
 * job detail). Three tabs, kept in ?tab= so links can open one directly:
 *
 *   Overview (default)  countdown + date, ONE "Do this next", readiness,
 *                       resume match with its top gaps (each links to
 *                       Practice on that topic), today's tasks from the
 *                       day-by-day plan (lib/prepPlan.ts), and the job itself.
 *   Resume (?tab=resume) fit details, the saved resume, re-check, Tailor.
 *   After the interview (?tab=after) debriefs and offers. */

import { useEffect, useMemo, useRef, useState, type ReactNode } from "react";
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
import { band, clearActiveJob, getActiveJob, setActiveJob, weightedOverall } from "../lib/readiness";
import { displayJobTitle, roleGuideFor } from "../lib/roles";
import { ExternalLink, Link, useNavigate, useSearchParams } from "../lib/router";
import { getSavedResume, useSavedResume } from "../lib/savedResume";
import { loadStories, neededCompetencies, storyGaps } from "../lib/stories";
import { useJobs } from "../lib/useJobs";
import { KEYS, onDataChanged } from "../lib/storage";
import { SignInCard } from "../components/AuthForm";
import { DebriefCard } from "../components/DebriefHistory";
import { FitDetails, gapRowToResult, resultToGapRow, topGaps } from "../components/FitSummary";
import { RESUME_PRIVACY, ResumeField } from "../components/ResumeField";
import { Card, Chips, Disclaimer, Loading, Muted } from "../components/ui";
import type { JobDetail, JobRow } from "../types";
import { stepHref, usePracticePath } from "../lib/practicePath";
import { jobsChanged } from "../components/JobNav";
import { deleteTailoredResume, downloadText, useTailoredResume } from "../lib/tailoredResume";
import { CopyButton } from "../components/StreamDraft";
import { SettingsTab } from "./JobSettings";
import { ShortlistCheck } from "../components/ShortlistCheck";
import { jobKeywords } from "../lib/tailor";
import { Art } from "../components/Art";

type Tab = "overview" | "resume" | "after" | "settings";
const TABS: { key: Tab; label: string; short?: string }[] = [
  { key: "overview", label: "Overview" },
  { key: "resume", label: "Resume match", short: "Resume" },
  { key: "after", label: "After the interview", short: "After" },
  { key: "settings", label: "Settings" },
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
  const tab: Tab = t === "resume" || t === "after" || t === "settings" ? t : "overview";
  const added = params.get("added") === "1";
  const wantFit = params.get("fit") === "1";
  const [fitBusy, setFitBusy] = useState(false);

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

  // Just added with a resume: compare it with the job in the background.
  const fitRan = useRef(false);
  useEffect(() => {
    if (!wantFit || fitRan.current || state.kind !== "ready" || state.data.gap) return;
    const resume = getSavedResume();
    if (!resume) return;
    fitRan.current = true;
    const d = state.data;
    const jd = d.job.job_description || d.job.analysis?.roleSummary || "";
    if (jd.trim().length < 30) return;
    setFitBusy(true);
    void (async () => {
      const tok = await auth.getAccessToken();
      const res = await api.runGapAnalysis(tok, { jobId: id, role: displayJobTitle(d.job), jobDescription: jd, resumeText: resume.text });
      setFitBusy(false);
      if (res.status === 200 && res.body?.result) { invalidatePlan(); setState((s) => (s.kind === "ready" ? { kind: "ready", data: { ...s.data, gap: resultToGapRow(res.body!.result) } } : s)); }
    })();
  }, [wantFit, state.kind]); // eslint-disable-line react-hooks/exhaustive-deps

  const row = jobs.jobs.find((j) => j.id === id);
  const data = state.kind === "ready" ? state.data : null;
  const setData = (fn: (d: JobDetail) => JobDetail) => setState((s) => (s.kind === "ready" ? { kind: "ready", data: fn(s.data) } : s));

  return (
    <div className="page jw">
      <JobHead id={id} title={displayJobTitle(data?.job || row)} job={data?.job || row} jobs={jobs.jobs} tab={tab}
        onSwitch={(nid) => { setActiveJob(nid); navigate(jobPath(nid, tab)); }}
        onRenamed={(t, c) => { setData((d) => ({ ...d, job: { ...d.job, title: t, company: c } })); jobs.reload(); jobsChanged(); }} />
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
                {data.gap ? "Your resume matches " + (data.gap.match_score || 0) + "%. Your plan is ready below." : fitBusy ? "Your plan is ready below. Comparing your resume with the job… (a few seconds)" : "Your plan is ready below. Add your resume to see how you match."}
              </span>
              <button type="button" className="link-btn small" onClick={() => navigate(jobPath(id, tab), { replace: true })} disabled={fitBusy}>Dismiss</button>
            </div>
          )}
          <nav className="jw-tabs" aria-label="Job sections">
            {TABS.map((x) => (
              <Link key={x.key} to={jobPath(id, x.key)} className={"jw-tab" + (tab === x.key ? " on" : "")} aria-current={tab === x.key ? "page" : undefined}>
                {x.short ? <><span className="jw-tab-long">{x.label}</span><span className="jw-tab-short" aria-hidden="true">{x.short}</span></> : x.label}
              </Link>
            ))}
          </nav>
          {tab === "overview" && <Overview data={data} jobs={jobs.jobs} onSwitch={(nid) => { setActiveJob(nid); navigate(jobPath(nid, "overview")); }} />}
          {tab === "resume" && <ResumeTab data={data} onGap={(g) => setData((d) => ({ ...d, gap: g }))} />}
          {tab === "settings" && <SettingsTab data={data}
            onSaved={(t, c) => { setData((d) => ({ ...d, job: { ...d.job, title: t, company: c } })); jobs.reload(); jobsChanged(); }}
            onDeleted={() => { if (getActiveJob() === id) clearActiveJob(); jobsChanged(); navigate("/jobs"); }} />}
          {tab === "after" && <AfterTab jobId={id} title={displayJobTitle(data.job)} company={data.job.company} />}
          <Disclaimer />
        </>
      )}
    </div>
  );
}

function JobHead({ id, title, job, jobs, tab, onSwitch, onRenamed }: {
  id: string; title: string; job?: JobRow; jobs: JobRow[]; tab: Tab; onSwitch(id: string): void; onRenamed(title: string, company: string): void;
}) {
  const auth = useAuth();
  const [editing, setEditing] = useState(false);
  const [t, setT] = useState("");
  const [c, setC] = useState("");
  const [busy, setBusy] = useState(false);
  const [err, setErr] = useState("");
  // Company only: the level is part of the title when the posting states it.
  const meta = job?.company || "";
  const start = () => { setT(title === "Untitled role" ? "" : title); setC(job?.company || ""); setErr(""); setEditing(true); };
  const save = async () => {
    const nt = t.replace(/\s+/g, " ").trim();
    if (nt.length < 2) { setErr("Give the job a title."); return; }
    setBusy(true);
    const tok = await auth.getAccessToken();
    const res = tok ? await api.renameJob(tok, id, { title: nt, company: c.trim() }) : null;
    setBusy(false);
    if (res && res.status === 200) { onRenamed(nt, c.trim()); setEditing(false); }
    else setErr(res?.body?.error || "Couldn’t rename the job. Please try again.");
  };
  const phone = useNarrow("(max-width: 760px)");
  // Phone "Today": the header (with the calendar) is drawn by Overview.
  if (phone && tab === "overview" && !editing) return null;
  return (
    <header className="jw-head">
      <Link className="back-link" to="/jobs">{"←"} All jobs</Link>
      <div className="jw-head-row">
        <div className="jw-head-titles">
          <p className="td-job-label">Preparing for</p>
          {editing ? (
            <form className="jw-rename" onSubmit={(e) => { e.preventDefault(); void save(); }}>
              <label className="field-label" htmlFor="jw-rn-t">Job title</label>
              <input id="jw-rn-t" className="input" value={t} maxLength={200} autoFocus onChange={(e) => setT(e.target.value)} placeholder="e.g. AI Strategy Lead" />
              <label className="field-label" htmlFor="jw-rn-c">Company <span className="muted">(optional)</span></label>
              <input id="jw-rn-c" className="input" value={c} maxLength={200} onChange={(e) => setC(e.target.value)} placeholder="e.g. Acme" />
              {err && <p className="error small" role="alert">{err}</p>}
              <div className="row">
                <button type="submit" className="btn btn-primary btn-small" disabled={busy}>{busy ? "Saving…" : "Save"}</button>
                <button type="button" className="btn btn-ghost btn-small" onClick={() => setEditing(false)}>Cancel</button>
              </div>
            </form>
          ) : (
            <>
              <h1>{title} <button type="button" className="link-btn small jw-rename-btn" onClick={start} disabled={!job}>Rename</button></h1>
              {meta && <p className="muted">{meta}</p>}
            </>
          )}
        </div>
        {jobs.length > 1 && !editing && (
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

/** What you come back to every day for this job: the practice tools, already
 * pointed at this job. */
function EveryDay({ jobId, practised, mockDone }: { jobId: string; practised: number; mockDone: boolean }) {
  const path = usePracticePath(jobId);
  const next = path.find((x) => !x.done);
  const detail: Record<string, string> = {
    questions: practised ? practised + " answered so far" : "Written from this job",
    drill: "Hold a call under push-back",
    stories: "STAR stories for the behavioral round",
    mock: mockDone ? "Done this week" : "Voice, with follow-ups",
  };
  return (
    <section className="card jd-daily" aria-labelledby="jd-daily-h">
      <div className="jd-daily-head">
        <h2 id="jd-daily-h">Every day</h2>
        <span className="small muted">{next ? "Suggested order. Skip any step you don’t need." : "All four done. Repeat the ones you’re weakest at."}</span>
      </div>
      <ol className="jd-daily-grid">
        {path.map((x) => (
          <li key={x.key} className={(x.done ? "done" : "") + (next && next.key === x.key ? " next" : "")}>
            <Link to={stepHref(x, jobId)}>
              <span className="jd-daily-n" aria-hidden="true">{x.done ? "✓" : x.n}</span>
              <strong>{x.label}{x.done ? <span className="hm-sr"> (done)</span> : null}</strong>
              <span className="small muted">{detail[x.key]}</span>
              {next && next.key === x.key ? <span className="jd-daily-tag">Next</span> : null}
            </Link>
          </li>
        ))}
      </ol>
      <p className="small muted jd-daily-any">Any time: <Link to="/coach">AI Interview Coach</Link> · <Link to="/practice/bank">Question bank</Link></p>
    </section>
  );
}

/** One-time setup for this job. Open until it's done, then folded away. */
function SetupOnce({ jobId, hasResume, hasFit, hasDate, children }: { jobId: string; hasResume: boolean; hasFit: boolean; hasDate: boolean; children?: ReactNode }) {
  const steps = [
    { label: "Job added", done: true, to: jobPath(jobId, "overview") },
    { label: "Interview date", done: hasDate, to: jobPath(jobId, "overview") },
    { label: "Resume added", done: hasResume, to: jobPath(jobId, "resume") },
    { label: "Gaps checked", done: hasFit, to: jobPath(jobId, "resume") },
  ];
  const left = steps.filter((x) => !x.done).length;
  return (
    <details className="card jd-setup" open={left > 0}>
      <summary>
        <span className="jd-setup-h">Set up once</span>
        <span className="small muted">{left ? left + " of " + steps.length + " to do" : "All done · open to change"}</span>
      </summary>
      <ul className="jd-setup-list">
        {steps.map((x) => (
          <li key={x.label} className={x.done ? "done" : ""}>
            <span className="jd-setup-dot" aria-hidden="true">{x.done ? "✓" : ""}</span>
            {x.done ? <span>{x.label}</span> : <Link to={x.to}>{x.label}</Link>}
          </li>
        ))}
        <li className="opt"><span className="jd-setup-dot" aria-hidden="true">+</span><Link to={"/tailor?job=" + enc(jobId)}>Tailor your resume (optional)</Link></li>
      </ul>
      {children}
    </details>
  );
}

const parseWhen = (w: string) => { const t = Date.parse(w); return isNaN(t) ? 0 : t; };

function Overview({ data, jobs = [], onSwitch }: { data: JobDetail; jobs?: JobRow[]; onSwitch?(id: string): void }) {
  const plan = usePlan();
  const today = localDay();
  const jobId = data.job.id;
  const [date, setDate] = useInterviewDate(jobId);
  const [state, setState] = useState<JobPlanState>(() => ensurePlanState(jobId, date, today));
  const [doneDays, setDoneDays] = useState<string[]>(allDoneDays);
  const [showAll, setShowAll] = useState(false);
  const narrow = useNarrow();
  const phone = useNarrow("(max-width: 760px)");
  // Phone Today: the day shown (today unless picked on the calendar).
  const [sel, setSel] = useState(today);
  const [calOpen, setCalOpen] = useState(false);
  const debriefs = useDebriefs();
  const [resumeSaved] = useSavedResume();

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
  const viewDate = phone ? sel : today;
  const todayDay = prep.days.find((d) => d.date === viewDate);
  const tasks = todayDay ? todayDay.tasks : [];
  const catchUp = viewDate === today ? carryOver(prep, today, state.done) : [];
  const firstOpen = [...tasks, ...catchUp].find((t) => !state.done[t.id]);
  const next: Next = unlogged && passed
    ? { label: "Log how your interview went", why: "Note the questions while you still remember them. The ones that went badly come back in your plan, and a next round date re-plans up to it.", to: logTo, cta: "Log interview" }
    : unlogged && days === 0
    ? { label: "Your interview is today", why: "Keep the notes pad open to type each question as it’s asked. Afterwards it becomes your debrief in one click.", to: "/notes?job=" + enc(jobId), cta: "Open interview notes" }
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

  const dateCard = <DateCard date={date} days={days} onSet={setDate} logTo={unlogged || (days != null && days <= 0) ? logTo : ""} />;
  const nextCard = (
        <section className={"td-next" + (next.tone === "done" ? " td-next-done" : "")} aria-labelledby="td-next-h">
          <span className="td-eyebrow">Do this next</span>
          <h2 id="td-next-h">{next.label}</h2>
          <p>{next.why}</p>
          <div className="row"><Link className="btn btn-primary" to={next.to}>{next.cta} {"→"}</Link></div>
        </section>
  );
  const everyDay = <EveryDay jobId={jobId} practised={derived.practised} mockDone={derived.mockRecent} />;
  const todayCard = (
      <section className="card td-tasks" aria-labelledby="td-tasks-h">
        <div className="td-sec-head">
          <div>
            <h2 id="td-tasks-h">{viewDate === today ? "Your plan for today" : "Your plan for " + formatDay(viewDate, { weekday: "long", month: "short", day: "numeric" })}</h2>
            <p className="muted small">
              {todayDay ? "Day " + (todayDay.index + 1) + " of " + prep.totalDays + (todayDay.type === "mock" ? " · mock day" : todayDay.type === "light" ? " · light day" : "") : viewDate === date ? "Interview day" : viewDate === today ? "No tasks for today" : "No tasks this day"}
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
        {tasks.length > 0 && doneToday === tasks.length && <p className="td-alldone">{viewDate === today ? "Today’s plan is done. Nice work." : "All done for this day."}</p>}
        {viewDate !== today ? <button type="button" className="link-btn small" onClick={() => setSel(today)}>Back to today</button> : null}
      </section>
  );
  const readinessCard = <ReadinessMini readiness={derived.readiness} streak={streak} week={doneThisWeek(doneDays, today)} />;
  const interviewDay = (
      <section className="card jd-iday" aria-labelledby="jd-iday-h">
        <h2 id="jd-iday-h">Interview day</h2>
        <p className="muted small">Type each question as it{"’"}s asked, then turn your notes into a debrief. Questions that went badly come back in your plan.</p>
        <div className="row">
          <Link className="btn" to={"/notes?job=" + enc(jobId)}>Interview notes</Link>
          <Link className="btn btn-ghost" to={logTo}>Log a round</Link>
        </div>
        {dStats.rounds > 0 && (
          <div className="td-debrief" role="status">
            <span className="td-debrief-mark" aria-hidden="true">{dStats.rounds}</span>
            <span className="td-debrief-text">{statsLine(dStats)}{dStats.bad ? " · " + dStats.bad + " to revisit" : ""}</span>
            <Link className="btn btn-small" to={jobPath(jobId, "after")}>Rounds</Link>
          </div>
        )}
      </section>
  );
  const planCard = (
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
  );
  const roleGuide = <RoleGuideCard job={data.job} />;
  const setupCard = (
      <SetupOnce jobId={jobId} hasResume={!!resumeSaved?.text || !!data.gap} hasFit={!!data.gap} hasDate={!!date}>
        <FitMini data={data} />
      </SetupOnce>
  );
  const aboutCard = <AboutJob data={data} />;

  if (narrow || phone) {
    // Phone: only what to do now; the rest is one tap away.
    const r = derived.readiness;
    const marks: Record<string, { n: number; done: number; type: string }> = {};
    for (const d of prep.days) marks[d.date] = { n: d.tasks.length, done: d.tasks.filter((t) => state.done[t.id]).length, type: d.type };
    const head = phone ? (
      <header className="jw-head jw-today">
        <button type="button" className="jw-today-h" aria-expanded={calOpen} aria-controls="td-cal" onClick={() => setCalOpen((o) => !o)}>
          <h1>{sel === today ? "Today" : formatDay(sel, { weekday: "short", month: "short", day: "numeric" })}</h1>
          <svg viewBox="0 0 20 20" width="18" height="18" aria-hidden="true" className={calOpen ? "up" : ""}><path d="M5 8l5 5 5-5" fill="currentColor" /></svg>
          <span className="hm-sr">{calOpen ? "Hide calendar" : "Show calendar"}</span>
        </button>
        {calOpen ? (
          <PlanCalendar sel={sel} today={today} interview={date || ""} marks={marks}
            onPick={(d) => { setSel(d); setCalOpen(false); }}
            onSetInterview={(d) => setDate(d)} />
        ) : null}
        {jobs.length > 1 && onSwitch ? (
          <label className="jw-today-job">
            <span className="hm-sr">Job</span>
            <select aria-label="Switch job" value={jobId} onChange={(e) => onSwitch(e.target.value)}>
              {jobs.map((j) => <option key={j.id} value={j.id}>{displayJobTitle(j) + (j.company ? " · " + j.company : "")}</option>)}
            </select>
            <svg viewBox="0 0 20 20" width="14" height="14" aria-hidden="true"><path d="M5 7.5l5 5 5-5" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round" /></svg>
          </label>
        ) : (
          <p className="jw-today-job is-one">{title}{data.job.company ? " · " + data.job.company : ""}</p>
        )}
      </header>
    ) : null;
    return (
      <>
        {head}
        <p className="jd-status">
          <Link to="/dashboard" className="jd-status-item"><b>{r != null ? r + "%" : "—"}</b> ready</Link>
          {date && !passed ? <span className="jd-status-item">{days != null && days > 0 ? <>Interview in <b>{days}</b> {days === 1 ? "day" : "days"}</> : <b>Interview today</b>}</span> : null}
        </p>
        {nextCard}
        {todayCard}
        {!date || passed ? dateCard : null}
        {everyDay}
        <details className="card jd-more">
          <summary><span>More for this job</span><span className="small muted">Full plan, readiness, interview day, set-up</span></summary>
          <div className="jd-more-body">
            {date && !passed ? dateCard : null}
            {readinessCard}
            {interviewDay}
            {planCard}
            {roleGuide}
            {setupCard}
            {aboutCard}
          </div>
        </details>
      </>
    );
  }

  return (
    <>
      <div className="td-top">
        {dateCard}
        {nextCard}
      </div>
      {everyDay}
      {todayCard}
      {readinessCard}
      {interviewDay}
      {planCard}
      {roleGuide}
      {setupCard}
      {aboutCard}
    </>
  );
}


// ---------------------------------------------------------------------------
// Phone Today: a month calendar of the plan. Dots mark plan days, a tick
// marks a finished day, a ring marks the interview. Pick a day to see its
// tasks, or set it as the interview day.

function PlanCalendar({ sel, today, interview, marks, onPick, onSetInterview }: {
  sel: string; today: string; interview: string; marks: Record<string, { n: number; done: number; type: string }>;
  onPick(d: string): void; onSetInterview(d: string | null): void;
}) {
  const [ym, setYm] = useState(() => sel.slice(0, 7));
  const [pick, setPick] = useState(sel);
  const [y, m] = ym.split("-").map(Number);
  const first = new Date(y, m - 1, 1);
  const daysIn = new Date(y, m, 0).getDate();
  const lead = first.getDay();
  const iso = (d: number) => ym + "-" + String(d).padStart(2, "0");
  const shift = (n: number) => { const d = new Date(y, m - 1 + n, 1); setYm(d.getFullYear() + "-" + String(d.getMonth() + 1).padStart(2, "0")); };
  const cells: (number | null)[] = [...Array(lead).fill(null), ...Array.from({ length: daysIn }, (_, i) => i + 1)];
  const label = first.toLocaleDateString(undefined, { month: "long", year: "numeric" });
  const pickMark = marks[pick];
  return (
    <div id="td-cal" className="pcal" role="dialog" aria-label="Plan calendar">
      <div className="pcal-top">
        <strong>{label}</strong>
        <div>
          <button type="button" className="pcal-nav" aria-label="Previous month" onClick={() => shift(-1)}>{"‹"}</button>
          <button type="button" className="pcal-nav" aria-label="Next month" onClick={() => shift(1)}>{"›"}</button>
        </div>
      </div>
      <div className="pcal-grid" role="grid">
        {["S", "M", "T", "W", "T", "F", "S"].map((d, i) => <span key={i} className="pcal-dow" aria-hidden="true">{d}</span>)}
        {cells.map((d, i) => {
          if (!d) return <span key={"e" + i} />;
          const k = iso(d);
          const mk = marks[k];
          const cls = "pcal-day" + (k === today ? " is-today" : "") + (k === pick ? " is-sel" : "") + (k === interview ? " is-iv" : "")
            + (mk ? (mk.n && mk.done >= mk.n ? " is-done" : " has-plan") : "") + (k < today ? " is-past" : "");
          const desc = (k === interview ? "Interview day. " : "") + (mk ? mk.done + " of " + mk.n + " tasks done" : "No plan tasks");
          return (
            <button key={k} type="button" className={cls} aria-label={formatDay(k, { weekday: "long", month: "long", day: "numeric" }) + ". " + desc}
              aria-pressed={k === pick} onClick={() => setPick(k)}>
              {d}
            </button>
          );
        })}
      </div>
      <p className="pcal-legend small muted"><span className="pcal-key has-plan" /> plan day <span className="pcal-key is-done" /> done <span className="pcal-key is-iv" /> interview</p>
      <div className="pcal-foot">
        <span className="small">
          <strong>{pick === today ? "Today" : formatDay(pick, { weekday: "short", month: "short", day: "numeric" })}</strong>
          {pick === interview ? " · interview day" : pickMark ? " · " + pickMark.done + "/" + pickMark.n + " done" : ""}
        </span>
        <div className="row">
          {pick === interview
            ? <button type="button" className="btn btn-ghost btn-small" onClick={() => onSetInterview(null)}>Clear interview day</button>
            : pick > today ? <button type="button" className="btn btn-ghost btn-small" onClick={() => onSetInterview(pick)}>Set as interview day</button> : null}
          <button type="button" className="btn btn-primary btn-small" onClick={() => onPick(pick)}>Show this day</button>
        </div>
      </div>
    </div>
  );
}

/** True on phone-width screens. The job page shows less there: what to do
 * now first, everything else folded under "More for this job". */
function useNarrow(q = "(max-width: 640px)"): boolean {
  const [m, setM] = useState(() => typeof window !== "undefined" && !!window.matchMedia && window.matchMedia(q).matches);
  useEffect(() => {
    if (!window.matchMedia) return;
    const mq = window.matchMedia(q);
    const on = () => setM(mq.matches);
    mq.addEventListener?.("change", on);
    return () => mq.removeEventListener?.("change", on);
  }, [q]);
  return m;
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
          <label className="td-date-label" htmlFor="td-date-input">Interview date</label>
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
  const tailored = useTailoredResume(data.job.id);
  const [dropping, setDropping] = useState(false);
  const [busy, setBusy] = useState(false);
  const [msg, setMsg] = useState<{ text: ReactNode; err?: boolean } | null>(null);
  const r = gapRowToResult(data.gap);
  const jobId = data.job.id;
  const jd = data.job.job_description || data.job.analysis?.roleSummary || "";
  const params = useSearchParams();
  const navigate = useNavigate();
  const autoRan = useRef(false);
  const slKeywords = useMemo(() => jobKeywords(data.job.analysis, data.gap), [data.job.analysis, data.gap]);

  const check = async () => {
    if (!resume) return;
    if (jd.trim().length < 30) { setMsg({ text: "This job has no description saved, so there’s nothing to compare with. Add the job again with its description.", err: true }); return; }
    setBusy(true);
    setMsg({ text: "Comparing your resume with this job…" });
    const tok = await auth.getAccessToken();
    // This job's tailored copy when there is one, else the main resume.
    const res = await api.runGapAnalysis(tok, { jobId, role: displayJobTitle(data.job), jobDescription: jd, resumeText: tailored?.text || resume.text });
    setBusy(false);
    if (res.status === 200 && res.body?.result) {
      invalidatePlan();
      const before = r ? r.matchScore || 0 : null;
      const after = res.body.result.matchScore || 0;
      onGap(resultToGapRow(res.body.result));
      setMsg({ text: (tailored ? "Checked with your tailored copy. " : "") + (before != null ? "Your match is now " + after + "% (was " + before + "%). " : "Your match is " + after + "%. ") + (res.body.saved ? "Saved to this job." : "") });
    } else if (res.status === 401) setMsg({ text: "Your session expired. Sign in again and retry.", err: true });
    else if (res.status === 503) setMsg({ text: "The fit check isn’t enabled on this deployment yet.", err: true });
    else if (res.status === 0) setMsg({ text: "Couldn’t reach the server. Check your connection and try again.", err: true });
    else setMsg({ text: res.body?.error || "Couldn’t compare your resume. Please try again.", err: true });
  };

  // Back from Tailor with an updated resume: re-check once, automatically.
  useEffect(() => {
    if (params.get("recheck") !== "1" || autoRan.current || !resume) return;
    autoRan.current = true;
    navigate(jobPath(jobId, "resume"), { replace: true });
    void check();
  }, [resume?.updatedAt]); // eslint-disable-line react-hooks/exhaustive-deps

  const step = !resume ? 1 : !r ? 2 : 3;
  return (
    <div className="stack">
      <ol className="jw-steps" aria-label="How this works">
        <li className={step === 1 ? "on" : "done"}><span>1</span>Add your resume</li>
        <li className={step === 2 ? "on" : step > 2 ? "done" : ""}><span>2</span>Check your fit</li>
        <li className={step === 3 ? "on" : ""}><span>3</span>Tailor bullets for the gaps, then re-check</li>
      </ol>
      <section className="card jw-resume" aria-labelledby="jw-res-h">
        <div className="td-sec-head">
          <div>
            <h2 id="jw-res-h">Your main resume</h2>
            <p className="muted small">Added once and reused for every job, for tailoring and for mock interviews.</p>
          </div>
        </div>
        <ResumeField compact confirm />
        <div className="row wrap">
          <button type="button" className="btn btn-primary" disabled={!resume || busy} onClick={check}>
            {busy ? "Checking…" : r ? "Check my fit again" : "Check my fit"}
          </button>
          {!resume && <span className="small muted">Add your resume above first.</span>}
        </div>
        {msg && <p className={"save-msg" + (msg.err ? " error" : "")} role="status">{msg.text}</p>}
        <p className="small muted">{RESUME_PRIVACY}</p>
      </section>

      {tailored ? (
        <section className="card jw-tailored" aria-labelledby="jw-tc-h">
          <div className="td-sec-head">
            <div>
              <h2 id="jw-tc-h">Tailored for this job</h2>
              <p className="muted small">
                A copy of your resume with {tailored.replaced} {tailored.replaced === 1 ? "bullet" : "bullets"} rewritten for this job
                {tailored.updatedAt ? ", saved " + new Date(tailored.updatedAt).toLocaleDateString(undefined, { day: "numeric", month: "short", year: "numeric" }) : ""}.
                {" "}This job{"’"}s fit check uses it. Your main resume above is unchanged and used for your other jobs.
              </p>
            </div>
          </div>
          <details className="jw-tc-text"><summary>Show the tailored resume</summary><pre>{tailored.text}</pre></details>
          {dropping ? (
            <div className="row wrap" role="group" aria-label="Delete the tailored copy">
              <span className="small">Delete the tailored copy? This job goes back to your main resume.</span>
              <button type="button" className="btn btn-danger btn-small" onClick={() => { deleteTailoredResume(jobId); setDropping(false); }}>Delete copy</button>
              <button type="button" className="btn btn-ghost btn-small" onClick={() => setDropping(false)}>Keep it</button>
            </div>
          ) : (
            <div className="row wrap">
              <CopyButton text={tailored.text} label="Copy the text" className="btn btn-small" />
              <button type="button" className="btn btn-small" onClick={() => downloadText("resume-" + (displayJobTitle(data.job) || "job").toLowerCase().replace(/[^a-z0-9]+/g, "-") + ".txt", tailored.text)}>Download .txt</button>
              <Link className="btn btn-ghost btn-small" to={"/tailor?job=" + enc(jobId)}>Tailor again</Link>
              <button type="button" className="link-btn small" onClick={() => setDropping(true)}>Use my main resume instead</button>
            </div>
          )}
        </section>
      ) : null}

      {resume ? (
        <ShortlistCheck text={tailored?.text || resume.text} fileName={tailored ? tailored.fileName : resume.fileName} tailored={!!tailored}
          title={displayJobTitle(data.job)} keywords={slKeywords} jobId={jobId} />
      ) : null}

      {r ? <FitDetails result={r} /> : (
        <Card><Muted>No fit check yet. Add your resume and press {"“"}Check my fit{"”"} to see your match score, what{"’"}s found and what{"’"}s missing.</Muted></Card>
      )}

      <section className="card jw-tailor" aria-labelledby="jw-tl-h">
        <div className="jw-tailor-row">
          <div className="stack-sm">
            <h2 id="jw-tl-h">Tailor my resume for this job</h2>
            <Muted small>Rewrites your resume bullets to cover {r && (r.missingKeywords || []).length ? "the missing keywords above" : "this job’s skills"}, without inventing anything. You review each one, then save a tailored copy for this job and re-check your fit here. Your main resume doesn{"’"}t change.</Muted>
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
          <Card className="empty-card">
            <Art k="debrief" className="empty-art" />
            <p className="muted">After each interview, write down the questions and how they went. The ones that went badly come back in your plan, and a next round date re-plans up to it.</p>
            <div className="row">
              <Link className="btn btn-primary btn-small" to={"/debrief?job=" + enc(jobId) + "&new=1"}>Log an interview</Link>
              <Link className="btn btn-ghost btn-small" to={"/notes?job=" + enc(jobId)}>Take notes during an interview</Link>
            </div>
          </Card>
        ) : (
          <>
            {list.slice(0, 4).map((d) => <DebriefCard key={d.id} d={d} job={{ title, company }} compact />)}
            <div className="row">
              <Link className="btn btn-primary btn-small" to={"/debrief?job=" + enc(jobId) + "&new=1"}>Log another round</Link>
              <Link className="btn btn-ghost btn-small" to={"/notes?job=" + enc(jobId)}>Take notes during an interview</Link>
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
