/* Readiness. With two or more jobs and no ?job=, the overview across all jobs
 * (ReadinessOverview). For one job: "Are you ready?": the score and a plain verdict,
 * a forecast of when you'll reach the ready line (lib/forecast.ts), what the
 * score is made of, a skills heatmap, the trend, and this week's top three.
 * The job's data comes from the API; localStorage is only an offline cache. */

import { useEffect, useMemo, useRef, useState } from "react";
import { API_ENABLED } from "../config";
import * as api from "../lib/api";
import { useAuth } from "../lib/auth";
import { READY_LINE, forecastReadiness, shortDay, type Forecast } from "../lib/forecast";
import { countdownLabel, daysUntil, formatDay, localDay, useInterviewDate } from "../lib/interviewDates";
import { addDays } from "../lib/prepPlan";
import { getHistory } from "../lib/progressStore";
import { clampInt, setActiveJob, weightedOverall } from "../lib/readiness";
import { displayJobTitle } from "../lib/roles";
import { Link, useNavigate, useSearchParams } from "../lib/router";
import { KEYS, readJSON, writeJSON } from "../lib/storage";
import { loadStories, neededCompetencies, storyGaps, type Story } from "../lib/stories";
import { useJobs } from "../lib/useJobs";
import { SignInCard } from "../components/AuthForm";
import { Card, Loading, Muted } from "../components/ui";
import ReadinessOverview from "./ReadinessOverview";
import type { GapRow, JobDetail, JobRow, PracticeRow, ProgressRow } from "../types";

interface Cached {
  when: number;
  jobId?: string;
  jobTitle?: string;
  job?: JobRow;
  gap: GapRow | null;
  progress: ProgressRow[];
  questionCount: number;
  practice: PracticeRow[];
}

export default function DashboardPage() {
  const auth = useAuth();
  const jobsState = useJobs();
  const params = useSearchParams();
  const navigate = useNavigate();
  const wanted = params.get("job") || "";
  const [jobId, setJobId] = useState("");
  const [detail, setDetail] = useState<JobDetail | null>(null);
  const [error, setError] = useState("");
  const [nonce, setNonce] = useState(0);
  const owned = (id: string) => !!id && jobsState.jobs.some((j) => j.id === id);

  // ?job= (when it's one of yours) shows that job. Otherwise one job shows
  // itself and two or more show the overview across all of them.
  useEffect(() => {
    if (jobsState.status !== "ready" || !jobsState.jobs.length) return;
    setJobId(owned(wanted) ? wanted : jobsState.jobs.length === 1 ? jobsState.jobs[0].id : "");
  }, [wanted, jobsState.status, jobsState.jobs]); // eslint-disable-line react-hooks/exhaustive-deps
  const openJob = (id: string) => navigate("/dashboard?job=" + encodeURIComponent(id));

  useEffect(() => {
    if (!jobId) return;
    let alive = true;
    setActiveJob(jobId);
    setDetail(null);
    setError("");
    (async () => {
      const tok = await auth.getAccessToken();
      if (!tok) return;
      const res = await api.getJob(tok, jobId);
      if (!alive) return;
      if (res.status === 0) { setError("Couldn’t reach the server."); return; }
      if (res.status !== 200 || !res.body?.job) { setError("Couldn’t load that job’s readiness."); return; }
      const d: JobDetail = { job: res.body.job, gap: res.body.gap || null, questions: res.body.questions || [], progress: res.body.progress || [], practice: res.body.practice || [] };
      const { job_description: _jd, ...slimJob } = d.job;
      void _jd;
      writeJSON(KEYS.readinessCache, {
        when: Date.now(), jobId: d.job.id, jobTitle: d.job.title, job: slimJob, gap: d.gap, progress: d.progress.slice(0, 60),
        questionCount: d.questions.length, practice: d.practice.slice(0, 30),
      } satisfies Cached);
      setDetail(d);
    })();
    return () => { alive = false; };
  }, [jobId, nonce]); // eslint-disable-line react-hooks/exhaustive-deps

  const fromCache = (reason: string) => {
    const c = readJSON<Cached | null>(KEYS.readinessCache, null);
    if (!c) return <SignedOut />;
    const job: JobRow = c.job || { id: c.jobId || "", title: c.jobTitle };
    const d: JobDetail = { job, gap: c.gap, questions: Array.from({ length: c.questionCount || 0 }, () => ({ category: "", prompt: "" })), progress: c.progress || [], practice: c.practice || [] };
    return <Readiness detail={d} jobs={[]} onSwitch={() => {}} note={reason} />;
  };

  let body;
  if (!API_ENABLED) body = fromCache("Live sync isn’t on for this site, so this is your last saved snapshot.");
  else if (jobsState.status === "disabled") body = fromCache("Sign-in isn’t available, so this is your last saved snapshot.");
  else if (jobsState.status === "loading") body = <Loading>Loading your readiness{"…"}</Loading>;
  else if (jobsState.status === "signedout") body = <SignedOut />;
  else if (jobsState.status === "error") body = fromCache("Couldn’t reach your account, so this is your last saved snapshot.");
  else if (!jobsState.jobs.length) body = <EmptyJobs />;
  else if (!jobId && jobsState.jobs.length > 1) body = <ReadinessOverview jobs={jobsState.jobs} />;
  else if (error) body = <Card><Muted>{error}</Muted><div className="row"><button type="button" className="btn" onClick={() => setNonce((n) => n + 1)}>Try again</button></div></Card>;
  else if (!detail) body = <Loading>Loading your readiness{"…"}</Loading>;
  else body = <Readiness key={detail.job.id} detail={detail} jobs={jobsState.jobs} onSwitch={openJob} />;

  return <div className="page rd">{body}</div>;
}

function SignedOut() {
  return (
    <SignInCard title="Your interview readiness">
      <Muted>Sign in to see how ready you are for each job, when you{"’"}ll be ready, and what to do next. Saved to your account, on any device.</Muted>
    </SignInCard>
  );
}

function EmptyJobs() {
  return (
    <section className="card rd-empty" aria-labelledby="rd-empty-h">
      <ScoreDial score={0} muted />
      <div className="stack-sm">
        <h2 id="rd-empty-h">Add a job to see how ready you are</h2>
        <p className="muted">Readiness is measured for one job at a time. Add the job you want and OfferReady scores you against it, then shows you when you{"’"}ll be ready for the interview.</p>
        <div className="row">
          <Link className="btn btn-primary" to="/analyze">Add a job</Link>
          <Link className="btn btn-ghost" to="/example">See a sample</Link>
        </div>
      </div>
    </section>
  );
}

// ---------------------------------------------------------------------------
// The model: everything the page shows, derived from the job's data.

type Level = "strong" | "ok" | "weak" | "untested";
interface Action { label: string; to: string }
interface Part { key: "match" | "quality" | "volume"; name: string; weight: number; value: number | null; points: number; line: string; status: string; action: Action }
interface SkillRow {
  name: string; level: Level; why: string;
  resume: "strong" | "gap" | null; practice: number | null; stories: number; mock: number | null;
}
interface Todo { title: string; why: string; to: string; cta: string; gain: number }

function verdictFor(score: number): { label: string; tone: "weak" | "mid" | "good" | "top"; line: string } {
  if (score >= 90) return { label: "Interview-ready", tone: "top", line: "You’re well prepared. Keep it warm and rest before the day." };
  if (score >= READY_LINE) return { label: "Ready", tone: "good", line: "You’re over the ready line. A little practice keeps you there." };
  if (score >= 50) return { label: "Getting there", tone: "mid", line: "The basics are in place. A few focused sessions close the gap." };
  return { label: "Not yet", tone: "weak", line: "There’s work to do, and the steps below show where to start." };
}

const norm = (s: string) => String(s || "").toLowerCase().replace(/[^a-z0-9+#]+/g, " ").trim();
const toks = (s: string) => norm(s).split(" ").filter(Boolean);
/** Whole-word match either way ("dbt" ~ "dbt incremental models", not "SQL" ~ "NoSQL"). */
function sameSkill(a: string, b: string): boolean {
  const A = toks(a), B = toks(b);
  if (!A.length || !B.length) return false;
  const inB = A.every((t) => B.includes(t));
  const inA = B.every((t) => A.includes(t));
  return inA || inB;
}
const avg = (xs: number[]) => (xs.length ? Math.round(xs.reduce((a, b) => a + b, 0) / xs.length) : null);
const skillName = (s: unknown) => (typeof s === "string" ? s : s && typeof s === "object" && "name" in s ? String((s as { name: unknown }).name || "") : "");
const timeOf = (s?: string) => { const t = s ? Date.parse(s) : NaN; return isNaN(t) ? null : t; };

function storyText(s: Story) {
  return [s.title, s.situation, s.task, s.action, s.result, s.metrics, s.roles, s.tags.join(" ")].join(" ");
}

function buildModel(d: JobDetail, interviewDate: string, today: string, stories: Story[]) {
  const { job, gap, progress, practice, questions } = d;
  const jobQ = job.id ? "?job=" + encodeURIComponent(job.id) : "";
  const latest = progress[0] || null; // newest first from the API
  const done = practice.filter((s) => s && s.completed !== false && s.score != null);
  const hasGap = !!gap;
  const match = hasGap ? clampInt(gap!.match_score || 0, 0, 100) : null;
  const practiced = latest?.questions_practiced || 0;
  const quality = latest && (latest.avg_answer_score || 0) > 0 ? clampInt(latest.avg_answer_score, 0, 100) : done.length ? avg(done.map((s) => Number(s.score) || 0)) : null;
  const completion = Math.min(practiced, 10) * 10;
  const score = latest && latest.overall_readiness != null ? clampInt(latest.overall_readiness, 0, 100) : weightedOverall(gap, quality || 0, completion);

  // --- what makes up the score ---
  const parts: Part[] = [
    {
      key: "match", name: "Resume match", weight: 50, value: match, points: Math.round(0.5 * (match || 0)),
      line: "How well your resume lines up with what this job asks for.",
      status: match == null ? "Not measured yet" : match + "% match",
      action: match == null ? { label: "Check your fit", to: "/fit" + jobQ } : match < 85 ? { label: "Tailor your resume", to: "/tailor" + jobQ } : { label: "Re-check your fit", to: "/fit" + jobQ },
    },
    {
      key: "quality", name: "Answer quality", weight: 30, value: quality, points: Math.round(0.3 * (quality || 0)),
      line: "Your average score on practice answers for this job.",
      status: quality == null ? "No scored answers yet" : "Average " + quality + "%",
      action: quality == null ? { label: "Defend a decision", to: "/defend" + jobQ } : { label: "Try a voice mock", to: "/interview/voice" },
    },
    {
      key: "volume", name: "Practice done", weight: 20, value: practiced ? completion : null, points: Math.round(0.2 * completion),
      line: "How much you’ve practised, out of 10 rounds.",
      status: practiced ? Math.min(practiced, 10) + " of 10 rounds" : "No rounds yet",
      action: { label: practiced >= 10 ? "Keep practising" : "Practise a round", to: "/defend" + jobQ },
    },
  ];

  // --- score history for the trend + forecast ---
  const points = progress
    .map((p) => {
      const at = timeOf(p.recorded_at);
      const s = p.overall_readiness != null ? p.overall_readiness : weightedOverall(gap, p.avg_answer_score || 0, Math.min(p.questions_practiced || 0, 10) * 10);
      return at == null ? null : { at, score: clampInt(s, 0, 100) };
    })
    .filter((p): p is { at: number; score: number } => !!p)
    .sort((a, b) => a.at - b.at);
  const since = Date.parse(addDays(today, -14) + "T00:00:00Z");
  const recentSessions = done.filter((s) => (timeOf(s.completed_at) || 0) >= since).length || points.filter((p) => p.at >= since).length;
  const forecast = forecastReadiness({ points, today, interviewDate, recentSessions, target: READY_LINE });

  // --- skills heatmap ---
  const a = job.analysis;
  const res = gap?.result;
  const missing = [...(res?.missingSkills || []), ...(res?.missingKeywords || []), ...((a?.potentialGaps || []).map((g) => g.requirement))].filter(Boolean);
  const strengths = [...(res?.strengths || []), ...((a?.alignment || []).filter((x) => /met|strong|match|yes/i.test(x.status || "")).map((x) => x.requirement))].filter(Boolean);
  const raw = [...(a?.coreSkills || []).map(skillName), ...missing, ...(a?.technologies || []), ...(a?.preferredSkills || []).map(skillName)];
  const names: string[] = [];
  for (const n of raw) {
    const t = String(n || "").trim();
    if (t && t.length <= 48 && !names.some((x) => sameSkill(x, t) && toks(x).length === toks(t).length)) names.push(t);
    if (names.length >= 10) break;
  }
  const history = getHistory();
  const isMock = (h: { track?: string; mode?: string }) => /simulator|voice|mock/i.test((h.track || "") + " " + (h.mode || ""));
  const topicScores = (mock: boolean, skill: string) => {
    const xs: number[] = [];
    for (const h of history) {
      if (!h || isMock(h) !== mock) continue;
      for (const [k, v] of Object.entries(h.topics || {})) if (sameSkill(k, skill)) xs.push(Number(v) || 0);
    }
    return xs;
  };
  const skills: SkillRow[] = names.map((name) => {
    const isGap = hasGap && missing.some((m) => sameSkill(m, name));
    const isStrong = hasGap && !isGap && strengths.some((m) => sameSkill(m, name));
    const prac = [...topicScores(false, name), ...done.filter((s) => s.mode !== "voice" && (sameSkill(s.category || "", name) || sameSkill(s.content_slug || "", name))).map((s) => Number(s.score) || 0)];
    const mock = topicScores(true, name);
    const nStories = stories.filter((s) => toks(name).every((t) => toks(storyText(s)).includes(t))).length;
    const p = avg(prac), m = avg(mock);
    const all = avg([...prac, ...mock]);
    let level: Level = "untested";
    let why = "No evidence yet";
    if (all != null) {
      level = all >= 75 || (all >= 65 && nStories > 0) ? "strong" : all >= 55 ? "ok" : "weak";
      why = "Scored " + all + "% in practice" + (nStories ? " with a story to back it" : "");
    } else if (isGap) { level = "weak"; why = "Missing from your resume and not practised yet"; }
    else if (isStrong || nStories) { level = "ok"; why = isStrong ? "On your resume, not practised yet" : "You have a story, not practised yet"; }
    return { name, level, why, resume: isGap ? "gap" : isStrong ? "strong" : null, practice: p, stories: nStories, mock: m };
  });

  // --- top three this week ---
  const todo: Todo[] = [];
  if (match == null) todo.push({ title: "Check your fit for this job", why: "Resume match is half your score and hasn’t been measured yet.", to: "/fit" + jobQ, cta: "Check fit", gain: 25 });
  else if (match < 85) todo.push({ title: "Tailor your resume to this job", why: "Rewrite your bullets around the skills it asks for, then re-check your fit.", to: "/tailor" + jobQ, cta: "Tailor resume", gain: Math.max(1, Math.round(0.5 * Math.min(10, 85 - match))) });
  if (!questions.length) todo.push({ title: "Get your interview questions", why: "A question set written for this job and its gaps.", to: "/questions", cta: "Get questions", gain: 3 });
  if (practiced < 10) {
    const n = Math.min(5, 10 - practiced);
    todo.push({ title: "Practise " + n + " more round" + (n === 1 ? "" : "s"), why: "Each round counts toward the 10 that make up “Practice done”.", to: "/defend" + jobQ, cta: "Start a round", gain: 2 * n });
  }
  if (quality == null || quality < 80) {
    const q = quality || 0;
    todo.push({ title: quality == null ? "Get your first scored answer" : "Lift your answer quality", why: quality == null ? "Defend one decision under follow-ups. Your score starts counting." : "Your answers average " + q + "%. A voice mock shows what to tighten.", to: quality == null ? "/defend" + jobQ : "/interview/voice", cta: quality == null ? "Defend a decision" : "Try a voice mock", gain: Math.max(1, Math.round(0.3 * Math.min(15, 100 - q))) });
  }
  const weakest = skills.filter((s) => s.level === "weak").sort((x, y) => (x.practice ?? x.mock ?? -1) - (y.practice ?? y.mock ?? -1))[0];
  if (weakest) todo.push({ title: "Practise " + weakest.name, why: weakest.why + ". It’s the weakest skill this job needs.", to: practiseHref(weakest.name, job.id), cta: "Practise it", gain: 2 });
  const sg = storyGaps(neededCompetencies(a, job.title || "").slice(0, 4), stories)[0];
  if (sg) todo.push({ title: "Write a story for " + sg.toLowerCase(), why: "This job will ask about it and your story bank has nothing yet.", to: "/stories?competency=" + encodeURIComponent(sg), cta: "Add a story", gain: 1 });
  const seen = new Set<string>();
  const top = todo.sort((x, y) => y.gain - x.gain).filter((t) => (seen.has(t.to) ? false : (seen.add(t.to), true))).slice(0, 3);

  return { score, parts, points, forecast, skills, top, hasGap, practiced, quality, jobQ };
}

const practiseHref = (skill: string, jobId?: string) =>
  "/practice/bank?topic=" + encodeURIComponent(skill) + (jobId ? "&job=" + encodeURIComponent(jobId) : "");

// ---------------------------------------------------------------------------

function Readiness({ detail, jobs, onSwitch, note }: { detail: JobDetail; jobs: JobRow[]; onSwitch(id: string): void; note?: string }) {
  const today = localDay();
  const [date] = useInterviewDate(detail.job.id);
  const stories = useMemo(() => loadStories().filter((s) => !s.jobIds.length || s.jobIds.includes(detail.job.id)), [detail.job.id]);
  const m = useMemo(() => buildModel(detail, date, today, stories), [detail, date, today, stories]);
  const title = displayJobTitle(detail.job);
  const v = verdictFor(m.score);
  const days = daysUntil(date, today);
  const fresh = !m.points.length && !m.hasGap;

  return (
    <div className="rd-stack">
      {note && <Card><Muted>{note}</Muted></Card>}

      {jobs.length > 1 ? <JobSwitcher jobs={jobs} current={detail.job.id} onSwitch={onSwitch} /> : null}

      {/* 1. The answer */}
      <section className={"card rd-hero rd-tone-" + v.tone} aria-labelledby="rd-q">
        <div className="rd-hero-main">
          <ScoreDial score={m.score} />
          <div className="rd-answer">
            <h2 id="rd-q" className="rd-q">Are you ready for {title ? <span className="rd-job">{title}</span> : "this job"}?</h2>
            <p className="rd-verdict" data-testid="verdict">{v.label}</p>
            <p className="rd-verdict-line">{v.line}</p>
          </div>
        </div>
        <div className="rd-hero-side">
          {date && days != null ? (
            <div className="rd-count">
              <span className="rd-count-num">{days > 1 ? days : days === 1 ? "1" : days === 0 ? "0" : Math.abs(days)}</span>
              <span className="rd-count-text">
                <strong>{days > 1 ? "days to your interview" : days === 1 ? "day: it’s tomorrow" : days === 0 ? "Interview today" : countdownLabel(days)}</strong>
                <span>{formatDay(date, { weekday: "short", month: "short", day: "numeric" })}</span>
              </span>
            </div>
          ) : (
            <div className="rd-count rd-count-none">
              <span className="rd-count-text"><strong>No interview date yet</strong><span>Add it to see if you{"’"}ll be ready in time.</span></span>
              <Link className="btn btn-small" to={"/jobs/" + encodeURIComponent(detail.job.id)}>Set the date</Link>
            </div>
          )}
        </div>
      </section>

      {fresh && <HowItStarts jobQ={m.jobQ} />}

      {/* 2. Forecast */}
      <ForecastCard f={m.forecast} interviewDate={date} today={today} />

      {/* 3. Breakdown */}
      <Breakdown parts={m.parts} score={m.score} />

      {/* 6. This week (kept high: it's what to do) */}
      <section className="card rd-week" aria-labelledby="rd-week-h">
        <div className="rd-sec-head">
          <h2 id="rd-week-h">Your top 3 this week</h2>
          <p className="muted small">The biggest score gains first. Points are estimates.</p>
        </div>
        <ol className="rd-todo">
          {m.top.map((t, i) => (
            <li key={t.to} className="rd-todo-item">
              <span className="rd-todo-n" aria-hidden="true">{i + 1}</span>
              <div className="rd-todo-body">
                <strong>{t.title}</strong>
                <span className="muted small">{t.why}</span>
              </div>
              <div className="rd-todo-act">
                <Link className="btn btn-small" to={t.to} aria-label={t.cta + ": " + t.title}>{t.cta}</Link>
                <span className="rd-gain">up to +{t.gain} points</span>
              </div>
            </li>
          ))}
        </ol>
      </section>

      {/* 4. Skills heatmap */}
      <Heatmap skills={m.skills} jobId={detail.job.id} hasGap={m.hasGap} />

      {/* 5. Trend */}
      <section className="card rd-trend" aria-labelledby="rd-trend-h">
        <div className="rd-sec-head">
          <h2 id="rd-trend-h">Your score over time</h2>
          <p className="muted small">{m.points.length >= 2 ? "Each dot is a practice session. The dashed line is your forecast." : "Your trend appears after two practice sessions."}</p>
        </div>
        {m.points.length >= 2 ? <TrendChart points={m.points} today={today} interviewDate={date} f={m.forecast} /> : <TrendEmpty jobQ={m.jobQ} />}
      </section>
    </div>
  );
}

/** "← All jobs" plus a search box that finds any job by title or company
 * (a dropdown of hundreds of jobs is unusable). Shows the first 8 matches. */
function JobSwitcher({ jobs, current, onSwitch }: { jobs: JobRow[]; current: string; onSwitch(id: string): void }) {
  const [q, setQ] = useState("");
  const [open, setOpen] = useState(false);
  const needle = q.trim().toLowerCase();
  const matches = useMemo(
    () => jobs.filter((j) => j.id !== current && (!needle || (displayJobTitle(j) + " " + (j.company || "")).toLowerCase().includes(needle))).slice(0, 8),
    [jobs, current, needle],
  );
  const choose = (id: string) => { setQ(""); setOpen(false); onSwitch(id); };
  return (
    <div className="rd-switch">
      <Link className="rd-back" to="/dashboard">{"←"} All jobs ({jobs.length})</Link>
      <div className="rd-switch-box" onBlur={(e) => { if (!e.currentTarget.contains(e.relatedTarget as Node)) setOpen(false); }}>
        <input className="input" type="search" role="combobox" aria-expanded={open} aria-controls="rd-switch-list" aria-label="Switch to another job"
          placeholder={"Switch job: search title or company…"} value={q}
          onFocus={() => setOpen(true)} onChange={(e) => { setQ(e.target.value); setOpen(true); }}
          onKeyDown={(e) => { if (e.key === "Enter" && matches[0]) { e.preventDefault(); choose(matches[0].id); } if (e.key === "Escape") setOpen(false); }} />
        {open && (
          <ul id="rd-switch-list" className="rd-switch-list" role="listbox">
            {matches.length ? matches.map((j) => (
              <li key={j.id} role="option" aria-selected={false}>
                <button type="button" onClick={() => choose(j.id)}>
                  <strong>{displayJobTitle(j)}</strong>{j.company ? <span className="muted small"> {"·"} {j.company}</span> : null}
                </button>
              </li>
            )) : <li className="muted small rd-switch-none">No other job matches</li>}
          </ul>
        )}
      </div>
    </div>
  );
}

function ScoreDial({ score, muted }: { score: number; muted?: boolean }) {
  const r = 52, c = 2 * Math.PI * r;
  const pct = Math.max(0, Math.min(100, score));
  const ready = READY_LINE / 100;
  // The ready tick at 80% of the ring (from 12 o'clock, clockwise).
  const ang = -Math.PI / 2 + ready * 2 * Math.PI;
  const tx1 = 60 + (r - 9) * Math.cos(ang), ty1 = 60 + (r - 9) * Math.sin(ang);
  const tx2 = 60 + (r + 9) * Math.cos(ang), ty2 = 60 + (r + 9) * Math.sin(ang);
  return (
    <div className={"rd-dial" + (muted ? " rd-dial-muted" : "")}>
      <svg viewBox="0 0 120 120" aria-hidden="true" focusable="false">
        <circle cx="60" cy="60" r={r} className="rd-dial-track" />
        {pct > 0 && <circle cx="60" cy="60" r={r} className="rd-dial-fill" strokeDasharray={c * (pct / 100) + " " + c} transform="rotate(-90 60 60)" />}
        <line x1={tx1} y1={ty1} x2={tx2} y2={ty2} className="rd-dial-tick" />
      </svg>
      <div className="rd-dial-num">
        <span className="rd-dial-score">{score}</span>
        <span className="rd-dial-of">out of 100</span>
      </div>
      <span className="rd-sr">Readiness score {score} out of 100. The ready line is {READY_LINE}.</span>
    </div>
  );
}

function HowItStarts({ jobQ }: { jobQ: string }) {
  return (
    <section className="card rd-start" aria-labelledby="rd-start-h">
      <h2 id="rd-start-h">How your score starts</h2>
      <p className="muted">Everyone starts at 0. Your score builds from three things, and the first step is the biggest:</p>
      <ol className="rd-start-steps">
        <li><strong>Check your fit</strong> (up to 50 points). We compare your resume with the job.</li>
        <li><strong>Answer practice questions</strong> (up to 30). Your average answer score counts.</li>
        <li><strong>Keep practising</strong> (up to 20). Ten rounds fills this part.</li>
      </ol>
      <div className="row">
        <Link className="btn btn-primary" to={"/fit" + jobQ}>Check your fit</Link>
        <Link className="btn btn-ghost" to={"/defend" + jobQ}>Practise a round</Link>
      </div>
    </section>
  );
}

// ---- 2. Forecast ----
function ForecastCard({ f, interviewDate, today }: { f: Forecast; interviewDate: string; today: string }) {
  const tone = f.status === "on-track" || f.status === "reached" ? "good" : f.status === "late" || f.status === "stalled" || f.status === "far" ? "warn" : "locked";
  const dti = f.daysToInterview;
  const showStrip = f.readyDate && f.daysToReady != null;
  return (
    <section className={"card rd-fc rd-fc-" + tone} aria-labelledby="rd-fc-h" data-status={f.status}>
      <div className="rd-fc-top">
        <span className="rd-eyebrow">Readiness forecast</span>
        {f.used >= 2 && f.status !== "reached" && <span className="rd-pace">{f.pacePerDay > 0 ? "+" : ""}{f.pacePerDay} points a day lately</span>}
      </div>
      <h2 id="rd-fc-h" className="rd-fc-head">{f.headline}</h2>
      <p className="rd-fc-detail">{f.detail}</p>
      {showStrip && <ForecastStrip daysToReady={f.daysToReady!} readyDate={f.readyDate!} dti={dti != null && dti > 0 ? dti : null} interviewDate={interviewDate} today={today} />}
      {f.status === "locked" && (
        <div className="rd-lock" aria-hidden="true">
          {[0, 1].map((i) => <span key={i} className={"rd-lock-dot" + (i < f.used ? " on" : "")} />)}
          <span className="muted small">{f.used} of 2 sessions</span>
        </div>
      )}
    </section>
  );
}

function ForecastStrip({ daysToReady, readyDate, dti, interviewDate }: { daysToReady: number; readyDate: string; dti: number | null; interviewDate: string; today: string }) {
  const end = Math.max(daysToReady, dti || 0) * 1.1 + 1;
  const pos = (d: number) => Math.min(100, (d / end) * 100);
  const late = dti != null && daysToReady > dti;
  const lo = dti != null ? Math.min(daysToReady, dti) : 0, hi = dti != null ? Math.max(daysToReady, dti) : 0;
  const anchor = (p: number) => (p < 16 ? " at-start" : p > 84 ? " at-end" : "");
  const pr = pos(daysToReady), pi = dti != null ? pos(dti) : null;
  return (
    <div className="rd-strip" role="img" aria-label={"Timeline: today, ready on " + shortDay(readyDate) + (dti != null ? ", interview on " + shortDay(interviewDate) : "")}>
      <div className="rd-strip-row rd-strip-above">
        <span className={"rd-lab rd-lab-ready" + anchor(pr)} style={{ left: pr + "%" }}><b>Ready</b> {shortDay(readyDate)}</span>
      </div>
      <div className="rd-strip-track">
        <span className="rd-strip-fill" style={{ width: pos(lo || daysToReady) + "%" }} />
        {dti != null && <span className={"rd-strip-gap " + (late ? "is-late" : "is-spare")} style={{ left: pos(lo) + "%", width: Math.max(1, pos(hi) - pos(lo)) + "%" }} />}
        <span className="rd-strip-pin rd-pin-today" style={{ left: "0%" }} />
        <span className="rd-strip-pin rd-pin-ready" style={{ left: pr + "%" }} />
        {pi != null && <span className="rd-strip-pin rd-pin-int" style={{ left: pi + "%" }} />}
      </div>
      <div className="rd-strip-row rd-strip-below">
        {(pi == null || pi > 26) && <span className="rd-lab at-start" style={{ left: "0%" }}><b>Today</b></span>}
        {pi != null && <span className={"rd-lab rd-lab-int" + anchor(pi)} style={{ left: pi + "%" }}><b>Interview</b> {shortDay(interviewDate)}</span>}
      </div>
    </div>
  );
}

// ---- 3. Breakdown ----
function Breakdown({ parts, score }: { parts: Part[]; score: number }) {
  const sum = parts.reduce((n, p) => n + p.points, 0);
  return (
    <section className="card rd-bd" aria-labelledby="rd-bd-h">
      <div className="rd-sec-head">
        <h2 id="rd-bd-h">What makes up your score</h2>
        <p className="muted small">Three parts, worth 100 points in all. You have {sum}{sum !== score ? " (your saved score is " + score + ")" : ""}.</p>
      </div>
      <div className="rd-bar" role="img" aria-label={"Score " + sum + " of 100: " + parts.map((p) => p.name + " " + p.points + " of " + p.weight).join(", ") + ". Ready line at " + READY_LINE + "."}>
        <div className="rd-bar-track">
          {parts.filter((p) => p.points > 0).map((p) => (
            <span key={p.key} className={"rd-bar-seg rd-c" + (parts.indexOf(p) + 1)} style={{ width: p.points + "%" }} title={p.name + ": " + p.points} />
          ))}
        </div>
        <span className="rd-bar-ready" style={{ left: READY_LINE + "%" }} aria-hidden="true"><span>Ready {READY_LINE}</span></span>
        <span className="rd-bar-scale" aria-hidden="true"><span>0</span><span>100</span></span>
      </div>
      <ul className="rd-parts">
        {parts.map((p, i) => (
          <li key={p.key} className="rd-part" data-part={p.key}>
            <span className={"rd-swatch rd-c" + (i + 1)} aria-hidden="true" />
            <div className="rd-part-body">
              <div className="rd-part-top">
                <strong>{p.name}</strong>
                <span className="rd-part-pts"><b>{p.points}</b> of {p.weight}</span>
              </div>
              <span className="muted small">{p.line} <span className="rd-part-status">{p.status}.</span></span>
            </div>
            <Link className="btn btn-small rd-part-go" to={p.action.to}>{p.action.label}</Link>
          </li>
        ))}
      </ul>
    </section>
  );
}

// ---- 4. Skills heatmap ----
const LEVEL_LABEL: Record<Level, string> = { strong: "Strong", ok: "OK", weak: "Weak", untested: "Untested" };

function Heatmap({ skills, jobId, hasGap }: { skills: SkillRow[]; jobId: string; hasGap: boolean }) {
  if (!skills.length) {
    return (
      <section className="card rd-hm" aria-labelledby="rd-hm-h">
        <h2 id="rd-hm-h">Your skills for this job</h2>
        <p className="muted">We don{"’"}t know this job{"’"}s key skills yet. Analyze the job description to see them here.</p>
        <div className="row"><Link className="btn" to="/analyze">Analyze the job</Link></div>
      </section>
    );
  }
  const counts = skills.reduce((acc, s) => ({ ...acc, [s.level]: (acc[s.level] || 0) + 1 }), {} as Record<Level, number>);
  const lvlNum = (n: number | null) => (n == null ? "untested" : n >= 75 ? "strong" : n >= 55 ? "ok" : "weak");
  return (
    <section className="card rd-hm" aria-labelledby="rd-hm-h">
      <div className="rd-sec-head">
        <h2 id="rd-hm-h">Your skills for this job</h2>
        <p className="muted small">What the job needs, against your evidence. Tap a weak or untested skill to practise it.</p>
      </div>
      <ul className="rd-legend" aria-label="Key">
        {(["strong", "ok", "weak", "untested"] as Level[]).map((l) => (
          <li key={l}><span className={"rd-cell-dot lv-" + l} aria-hidden="true" />{LEVEL_LABEL[l]}{counts[l] ? " · " + counts[l] : ""}</li>
        ))}
      </ul>
      <table className="rd-grid">
        <caption className="rd-sr">Skills this job needs, with your evidence from your resume, practice, stories and mock interviews</caption>
        <thead>
          <tr>
            <th scope="col">Skill</th>
            <th scope="col"><span className="rd-long">Resume</span><span className="rd-short" aria-hidden="true">CV</span></th>
            <th scope="col"><span className="rd-long">Practice</span><span className="rd-short" aria-hidden="true">Prac.</span></th>
            <th scope="col"><span className="rd-long">Stories</span><span className="rd-short" aria-hidden="true">Story</span></th>
            <th scope="col">Mock</th>
          </tr>
        </thead>
        <tbody>
          {skills.map((s) => {
            const act = s.level === "weak" || s.level === "untested";
            const chip = (
              <>
                <span className={"rd-cell-dot lv-" + s.level} aria-hidden="true" />
                <span className="rd-skill-name">{s.name}</span>
                <span className={"rd-skill-lv lv-" + s.level}>{LEVEL_LABEL[s.level]}</span>
              </>
            );
            return (
              <tr key={s.name} data-level={s.level}>
                <th scope="row">
                  {act ? (
                    <Link className={"rd-skill is-link lv-" + s.level} to={practiseHref(s.name, jobId)} title={s.why} aria-label={"Practise " + s.name + " (" + LEVEL_LABEL[s.level] + ": " + s.why + ")"}>{chip}</Link>
                  ) : (
                    <span className={"rd-skill lv-" + s.level} title={s.why}>{chip}<span className="rd-sr"> ({s.why})</span></span>
                  )}
                </th>
                <td><span className={"rd-cell lv-" + (s.resume === "strong" ? "strong" : s.resume === "gap" ? "weak" : "untested")}>{s.resume === "strong" ? "Yes" : s.resume === "gap" ? "Gap" : hasGap ? "–" : "?"}</span></td>
                <td><span className={"rd-cell lv-" + lvlNum(s.practice)}>{s.practice == null ? "–" : s.practice}</span></td>
                <td><span className={"rd-cell lv-" + (s.stories ? "strong" : "untested")}>{s.stories || "–"}</span></td>
                <td><span className={"rd-cell lv-" + lvlNum(s.mock)}>{s.mock == null ? "–" : s.mock}</span></td>
              </tr>
            );
          })}
        </tbody>
      </table>
      <p className="muted small rd-hm-foot">Practice and mock show your average score (%). Stories shows how many of your stories mention the skill. {"–"} means no evidence yet{hasGap ? "" : "; ? means you haven’t checked your fit"}.</p>
    </section>
  );
}

// ---- 5. Trend ----
function TrendEmpty({ jobQ }: { jobQ: string }) {
  return (
    <div className="rd-trend-empty">
      <svg viewBox="0 0 320 80" aria-hidden="true" focusable="false"><path d="M8 66 C 80 60, 120 48, 170 40 S 260 20, 312 14" className="rd-ghost" /></svg>
      <Link className="btn btn-small" to={"/defend" + jobQ}>Practise a round</Link>
    </div>
  );
}

function TrendChart({ points, today, interviewDate, f }: { points: { at: number; score: number }[]; today: string; interviewDate: string; f: Forecast }) {
  const box = useRef<HTMLElement | null>(null);
  const [W, setW] = useState(640);
  useEffect(() => {
    const el = box.current;
    if (!el) return;
    const fit = () => setW(Math.max(280, Math.round(el.clientWidth || 640)));
    fit();
    if (typeof ResizeObserver === "undefined") return;
    const ro = new ResizeObserver(fit);
    ro.observe(el);
    return () => ro.disconnect();
  }, []);
  const H = W < 480 ? 200 : 230, L = 30, R = 12, T = 24, B = 30;
  const dayOf = (t: number) => new Date(t).toISOString().slice(0, 10);
  const tToday = Date.parse(today + "T12:00:00Z");
  const first = Math.min(points[0].at, tToday - 13 * 86400000);
  const tInt = interviewDate ? Date.parse(interviewDate + "T12:00:00Z") : null;
  const tReady = f.readyDate ? Date.parse(f.readyDate + "T12:00:00Z") : null;
  let last = Math.max(tToday, points[points.length - 1].at);
  if (tInt && tInt > last) last = tInt;
  // Show the projection when it lands within ~3 weeks of the other dates.
  const showReady = tReady != null && tReady <= Math.max(last, tToday) + 21 * 86400000;
  if (showReady && tReady! > last) last = tReady!;
  last += 1.5 * 86400000;
  const x = (t: number) => L + ((t - first) / (last - first)) * (W - L - R);
  const y = (v: number) => T + (1 - v / 100) * (H - T - B);
  const path = points.map((p, i) => (i ? "L" : "M") + x(p.at).toFixed(1) + " " + y(p.score).toFixed(1)).join(" ");
  const lp = points[points.length - 1];
  const fcStart = { t: Math.max(lp.at, tToday - 86400000 / 2), v: lp.score };
  const fcEnd = showReady ? { t: tReady!, v: READY_LINE } : null;
  const fmt = (t: number) => shortDay(dayOf(t));
  const desc = "Readiness score from " + fmt(points[0].at) + " (" + points[0].score + ") to " + fmt(lp.at) + " (" + lp.score + ")" +
    (fcEnd ? ". Forecast reaches " + READY_LINE + " on " + shortDay(f.readyDate!) : "") +
    (tInt ? ". Interview on " + shortDay(interviewDate) : "") + ".";
  const intLeft = tInt != null && x(tInt) > W - 110;
  return (
    <figure className="rd-chart" ref={box}>
      <svg viewBox={`0 0 ${W} ${H}`} role="img" aria-labelledby="rd-chart-t rd-chart-d" preserveAspectRatio="xMidYMid meet">
        <title id="rd-chart-t">Readiness score over time</title>
        <desc id="rd-chart-d">{desc}</desc>
        {[0, 50, 100].map((g) => (
          <g key={g}>
            <line x1={L} x2={W - R} y1={y(g)} y2={y(g)} className="rd-grid-line" />
            <text x={L - 8} y={y(g) + 4} textAnchor="end" className="rd-axis">{g}</text>
          </g>
        ))}
        <line x1={L} x2={W - R} y1={y(READY_LINE)} y2={y(READY_LINE)} className="rd-ready-line" />
        <text x={L + 4} y={y(READY_LINE) - 6} className="rd-axis rd-ready-text">Ready {READY_LINE}</text>
        {tInt != null && tInt >= first && (
          <g className="rd-int">
            <line x1={x(tInt)} x2={x(tInt)} y1={T - 6} y2={H - B} />
            <text x={x(tInt) + (intLeft ? -6 : 6)} y={T + 4} textAnchor={intLeft ? "end" : "start"} className="rd-axis rd-int-text">Interview {shortDay(interviewDate)}</text>
          </g>
        )}
        <line x1={x(tToday)} x2={x(tToday)} y1={H - B} y2={H - B + 5} className="rd-tick" />
        {fcEnd && <path d={"M" + x(fcStart.t).toFixed(1) + " " + y(fcStart.v).toFixed(1) + " L" + x(fcEnd.t).toFixed(1) + " " + y(fcEnd.v).toFixed(1)} className="rd-fc-line" />}
        {fcEnd && <circle cx={x(fcEnd.t)} cy={y(fcEnd.v)} r="4" className="rd-fc-dot" />}
        <path d={path} className="rd-line" />
        {points.map((p, i) => (
          <circle key={i} cx={x(p.at)} cy={y(p.score)} r={i === points.length - 1 ? 5 : 4} className={"rd-dot" + (i === points.length - 1 ? " is-last" : "")}>
            <title>{fmt(p.at) + ": " + p.score}</title>
          </circle>
        ))}
        <text x={x(lp.at)} y={y(lp.score) - 11} textAnchor="middle" className="rd-last-label">{lp.score}</text>
        <text x={L} y={H - 8} className="rd-axis">{fmt(first)}</text>
        <text x={x(tToday)} y={H - 8} textAnchor={x(tToday) > W - 90 ? "end" : "middle"} className="rd-axis">Today</text>
        {fcEnd && x(fcEnd.t) - x(tToday) > 60 && <text x={Math.min(x(fcEnd.t), W - R)} y={H - 8} textAnchor="end" className="rd-axis">{shortDay(f.readyDate!)}</text>}
      </svg>
      <table className="rd-sr">
        <caption>Readiness snapshots</caption>
        <thead><tr><th scope="col">Date</th><th scope="col">Score</th></tr></thead>
        <tbody>{points.map((p, i) => <tr key={i}><td>{fmt(p.at)}</td><td>{p.score}</td></tr>)}</tbody>
      </table>
    </figure>
  );
}

