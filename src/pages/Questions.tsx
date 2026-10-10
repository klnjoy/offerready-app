/* Questions for this job: a question set written from the job and your gaps,
 * and a place to practise it. Open a question to answer it, get AI feedback
 * or the strong answer, and each practised question counts toward the job's
 * readiness. Switch job by searching (JobPicker). A saved set is restored
 * first; regenerating replaces it, so it's an explicit, confirmed action. */

import { useEffect, useMemo, useRef, useState } from "react";
import * as api from "../lib/api";
import { useAuth } from "../lib/auth";
import { displayJobTitle } from "../lib/roles";
import { Link, useSearchParams } from "../lib/router";
import { setActiveJob } from "../lib/readiness";
import { useJobs } from "../lib/useJobs";
import { Card, ErrorText, JobBanner, Loading, Muted } from "../components/ui";
import { AnswerCoach } from "../components/AnswerCoach";
import { JobPicker } from "../components/JobPicker";
import { qKey, useQuestionProgress } from "../lib/questionProgress";
import type { Analysis, GeneratedQuestion, JobRow } from "../types";
import { track } from "../lib/track";

const CATEGORY_LABEL: Record<string, string> = {
  technical: "Technical",
  behavioral: "Behavioral",
  system_design: "System Design",
  leadership: "Leadership",
};
const CATEGORY_ORDER = ["technical", "behavioral", "system_design", "leadership"];

type View =
  | { kind: "loading"; msg: string }
  | { kind: "form"; note?: string }
  | { kind: "restored"; questions: GeneratedQuestion[] }
  | { kind: "result"; questions: GeneratedQuestion[]; saved: boolean };

export default function QuestionsPage() {
  const auth = useAuth();
  const jobsState = useJobs();
  const params = useSearchParams();
  const [jobs, setJobs] = useState<JobRow[]>([]);
  const [jobId, setJobId] = useState("");
  const [role, setRole] = useState("");
  const [jd, setJd] = useState("");
  const [view, setView] = useState<View>({ kind: "loading", msg: "Loading…" });
  const initialized = useRef(false);

  useEffect(() => {
    if (initialized.current || jobsState.status === "loading") return;
    initialized.current = true;
    setJobs(jobsState.jobs);
    // ?job= (from Practice or the job page) wins over the active job.
    const want = params.get("job");
    const id = want && jobsState.jobs.some((j) => j.id === want) ? want : jobsState.activeId;
    if (id) { if (id !== jobsState.activeId) setActiveJob(id); restoreOrForm(id); }
    else setView({ kind: "form" });
  }, [jobsState.status]); // eslint-disable-line react-hooks/exhaustive-deps

  /** Restore the job's saved JD/role and any existing question set. */
  async function restoreOrForm(id: string) {
    setJobId(id);
    if (id) setActiveJob(id);
    const row = jobsState.jobs.find((j) => j.id === id) || jobs.find((j) => j.id === id);
    if (row) {
      setRole(row.title || "");
      setJd(row.job_description || row.analysis?.roleSummary || "");
    }
    if (!id) { setView({ kind: "form" }); return; }
    setView({ kind: "loading", msg: "Loading this job’s saved questions…" });
    const tok = await auth.getAccessToken();
    if (!tok) { setView({ kind: "form" }); return; }
    const res = await api.getJob(tok, id);
    const full = res.body?.job;
    if (full) {
      setJobs((js) => js.map((j) => (j.id === full.id ? { ...j, job_description: full.job_description || j.job_description || "", analysis: full.analysis || j.analysis, title: j.title || full.title } : j)));
      if (full.title) setRole(full.title);
      setJd(full.job_description || full.analysis?.roleSummary || "");
    }
    const existing = Array.isArray(res.body?.questions) ? res.body!.questions : [];
    setView(existing.length ? { kind: "restored", questions: existing } : { kind: "form" });
  }

  const submit = async (r: string, d: string, mode?: "more") => {
    setRole(r);
    setJd(d);
    if (d.length < 30) { setView({ kind: "form", note: "Please paste a fuller job description first (or pick a saved job)." }); return; }
    const msg = mode === "more" ? "Writing more questions that don’t repeat your current ones… (about 30 seconds)" : "Writing about 30 questions for this job… (about 30 seconds)";
    setView({ kind: "loading", msg });
    const tok = await auth.getAccessToken();
    let res = await api.generateQuestions(tok, { jobId: jobId || null, role: r, jobDescription: d, mode });
    // A slow or incomplete answer from the AI: try once more automatically.
    if (res.status === 0 || res.status === 502 || res.status === 504) {
      setView({ kind: "loading", msg: "That took too long. Trying once more…" });
      res = await api.generateQuestions(tok, { jobId: jobId || null, role: r, jobDescription: d, mode });
    }
    if (res.status === 200 && res.body?.questions) {
      track("questions_generated", { n: res.body.questions.length, more: mode === "more" });
      setView({ kind: "result", questions: res.body.questions, saved: !!res.body.saved });
    }
    else if (res.status === 401) setView({ kind: "form", note: "Sign in (Account, top right) to get questions, then try again." });
    else if (res.status === 503) setView({ kind: "form", note: "Question generation isn't enabled on this deployment yet." });
    else if (res.status === 0) setView({ kind: "form", note: "Couldn't reach the generator. Check your connection and try again." });
    else setView({ kind: "form", note: res.body?.error || "Couldn't write the questions this time. Please press the button again." });
  };

  const activeJob = jobs.find((j) => j.id === jobId);
  const activeTitle = activeJob ? displayJobTitle(activeJob) : jobId ? "Untitled role" : "";
  const analysis = jobs.find((j) => j.id === jobId)?.analysis || null;
  const defendTo = "/defend" + (jobId ? "?job=" + encodeURIComponent(jobId) : "");

  return (
    <div className="page">
      {view.kind === "loading" && <Loading>{view.msg}</Loading>}
      {view.kind === "form" && (
        <QuestionForm key={jobId + "|" + jd.length} jobs={jobs} jobId={jobId} role={role} jd={jd} note={view.note}
          activeTitle={activeTitle} onPick={restoreOrForm} onSubmit={submit} />
      )}
      {(view.kind === "restored" || view.kind === "result") && (
        <Workspace
          key={jobId}
          jobId={jobId}
          jobs={jobs}
          title={activeTitle}
          questions={view.questions}
          fresh={view.kind === "result"}
          saved={view.kind === "restored" || view.saved}
          analysis={analysis}
          defendTo={defendTo}
          onSwitch={restoreOrForm}
          onMore={() => submit(role, jd, "more")}
        />
      )}
    </div>
  );
}

function QuestionForm({
  jobs, jobId, role, jd, note, activeTitle, onPick, onSubmit,
}: {
  jobs: JobRow[]; jobId: string; role: string; jd: string; note?: string; activeTitle: string;
  onPick(id: string): void; onSubmit(role: string, jd: string): void;
}) {
  const [r, setR] = useState(role);
  const [d, setD] = useState(jd);
  // A saved job already has its description: one button, details tucked away.
  const ready = !!jobId && jd.trim().length >= 30;
  const fields = (
    <>
      <label className="field-label" htmlFor="q-role">Job title</label>
      <input id="q-role" className="input" type="text" placeholder="Job title (optional)" value={r} onChange={(e) => setR(e.target.value)} />
      <label className="field-label" htmlFor="q-jd">Job description</label>
      <textarea id="q-jd" className="input textarea" rows={9} placeholder={"Paste the full job description here…"} value={d} onChange={(e) => setD(e.target.value)} />
    </>
  );
  return (
    <Card>
      {jobs.length > 1 ? (
        <JobPicker jobs={jobs} current={jobId} onSwitch={onPick} label={<><span className="job-banner-label">Job</span> <strong>{activeTitle || "Pick a job"}</strong></>} />
      ) : (
        <JobBanner title={activeTitle} hasJobs={jobs.length > 0} />
      )}
      {note && <ErrorText>{note}</ErrorText>}
      {ready ? (
        <>
          <p>We{"’"}ll write about 30 likely questions for <strong>{activeTitle}</strong> from its job description and the gaps in your resume, and save them to the job.</p>
          <div className="row">
            <button type="button" className="btn btn-primary" onClick={() => onSubmit(r.trim(), d.trim())}>Write my questions</button>
          </div>
          <details className="q-edit">
            <summary className="small">Edit the job description first</summary>
            {fields}
          </details>
        </>
      ) : (
        <>
          {!jobs.length && <Muted small>Tip: <Link to="/analyze">add the job</Link> first and the questions are saved to it.</Muted>}
          {fields}
          <div className="row">
            <button type="button" className="btn btn-primary" onClick={() => onSubmit(r.trim(), d.trim())}>Write my questions</button>
          </div>
        </>
      )}
    </Card>
  );
}

/** Whole-word / phrase match so "Go" or "R" can't match inside "Google" or
 * "error". Multi-word terms fall back to their longest distinctive word
 * ("Azure Databricks" counts if "Databricks" appears). */
function termCovered(term: string, haystack: string): boolean {
  const t = String(term || "").trim().toLowerCase();
  if (!t) return false;
  const tryWord = (w: string) => {
    const e = w.replace(/[.*+?^${}()|[\]\\]/g, "\\$&");
    return !!e && new RegExp("(^|[^a-z0-9])" + e + "([^a-z0-9]|$)", "i").test(haystack);
  };
  if (tryWord(t)) return true;
  const words = t.split(/[^a-z0-9]+/).filter((w) => w.length >= 4).sort((a, b) => b.length - a.length);
  return words.length ? tryWord(words[0]) : false;
}

/** Why these questions — and evidence: a \u2713 means a returned question
 * actually references that role requirement or gap. */
function WhyPanel({ analysis, questions }: { analysis: Analysis | null; questions: GeneratedQuestion[] }) {
  if (!analysis) return null;
  const techs = (analysis.technologies || []).filter(Boolean).slice(0, 8);
  const gaps = (analysis.potentialGaps || []).map((g) => g?.requirement || g?.title || "").filter(Boolean).slice(0, 6);
  if (!techs.length && !gaps.length) return null;
  const hay = questions.map((q) => String(q?.prompt || "")).join("  \u2022  ").toLowerCase();
  const items = [...techs, ...gaps];
  const covered = new Set(items.filter((t) => termCovered(t, hay)));
  const ratio = items.length ? covered.size / items.length : 1;
  const row = (label: string, list: string[], warn: boolean) =>
    list.length ? (
      <div className="chips-block">
        <div className="field-label">{label}</div>
        <div className="chips">
          {list.map((t) => (
            <span key={t} className={"chip " + (covered.has(t) ? "chip-ok" : warn ? "chip-warn chip-off" : "chip-off")}>
              {(covered.has(t) ? "\u2713 " : "\u25cb ") + t}
            </span>
          ))}
        </div>
      </div>
    ) : null;
  return (
    <div className="why">
      <Muted small>Written for this role{"\u2019"}s requirements and the gaps in your resume. A {"\u2713"} means a question actually references that item.</Muted>
      {row("Because the role requires", techs, false)}
      {row("And to close your identified gaps", gaps, true)}
      {questions.length > 0 && (
        <>
          <p className="muted small"><strong>Coverage: {covered.size} of {items.length} role items are referenced by these questions.</strong></p>
          {ratio < 0.5 && (
            <p className="error">This set references few of your role{"\u2019"}s specifics {"\u2014"} it may be too generic. Regenerate to get questions tied more closely to this job.</p>
          )}
        </>
      )}
    </div>
  );
}

type CatFilter = "all" | "todo" | string;

/** Questions to practise before moving on to a drill. */
const GOAL = 5;

function Workspace({ jobId, jobs, title, questions, fresh, saved, analysis, defendTo, onSwitch, onMore }: {
  jobId: string; jobs: JobRow[]; title: string; questions: GeneratedQuestion[]; fresh: boolean; saved: boolean;
  analysis: Analysis | null; defendTo: string; onSwitch(id: string): void; onMore(): void;
}) {
  const auth = useAuth();
  const [progress, saveProgress] = useQuestionProgress(jobId);
  const [filter, setFilter] = useState<CatFilter>("all");
  const [open, setOpen] = useState<number | null>(null);
  const [savedNote, setSavedNote] = useState("");

  const ordered = useMemo(() => {
    const rank = (c: string) => { const i = CATEGORY_ORDER.indexOf(c); return i < 0 ? 99 : i; };
    return questions.map((q, i) => ({ q, i })).sort((a, b) => rank(a.q.category) - rank(b.q.category) || a.i - b.i);
  }, [questions]);
  const statusOf = (q: GeneratedQuestion) => progress[qKey(q.prompt)];
  const done = ordered.filter((x) => statusOf(x.q));
  const avg = done.length ? Math.round(done.reduce((n, x) => n + statusOf(x.q)!.score, 0) / done.length) : null;
  const cats = CATEGORY_ORDER.filter((c) => questions.some((q) => q.category === c)).concat(
    Array.from(new Set(questions.map((q) => q.category))).filter((c) => !CATEGORY_ORDER.includes(c)),
  );
  const shown = ordered.filter((x) => filter === "all" ? true : filter === "todo" ? !statusOf(x.q) : x.q.category === filter);
  const nextTodo = ordered.find((x) => !statusOf(x.q));

  const onResult = async (q: GeneratedQuestion, score: number, how: "ai" | "self") => {
    saveProgress(q.prompt, { score, how, at: new Date().toISOString() });
    track("question_practised", { how, score });
    if (!jobId) return;
    const tok = await auth.getAccessToken();
    if (!tok) { setSavedNote("Practice saved on this device. Sign in to count it toward readiness."); return; }
    const res = await api.completePractice(tok, jobId, {
      sessionId: "q:" + qKey(q.prompt) + ":" + Date.now().toString(36),
      category: "questions-" + (q.category || "general"),
      contentSlug: "question:" + qKey(q.prompt),
      score, completedAt: new Date().toISOString(), mode: "practice",
    });
    setSavedNote(res.status === 200 || res.status === 207 ? "Saved. It counts toward this job’s readiness." : "Saved on this device. Readiness will update next time.");
  };

  return (
    <>
      <Card className="qw-head">
        {jobs.length > 1 ? (
          <JobPicker jobs={jobs} current={jobId} onSwitch={onSwitch} label={<><span className="job-banner-label">Job</span> <strong>{title}</strong></>} />
        ) : (
          <JobBanner title={title} hasJobs={jobs.length > 0} />
        )}
        <div className="qw-stats">
          <div>
            <h2 className="qw-title">{questions.length} questions for this job</h2>
            <p className="muted small">
              {fresh ? (saved && jobId ? "Just written and saved to this job." : "Just written. Pick a saved job to keep them.") : lastGenerated(questions) ? "Written " + lastGenerated(questions) + "." : ""}
              {" "}Open one, answer it, and get feedback like a real interviewer.
            </p>
          </div>
          <div className="qw-meter" aria-label={done.length + " of " + questions.length + " practised"}>
            <span className="qw-meter-n"><b>{done.length}</b> of {questions.length} practised{avg != null ? " · average " + avg + "%" : ""}</span>
            <span className="qw-bar" aria-hidden="true"><span style={{ width: (questions.length ? (done.length / questions.length) * 100 : 0) + "%" }} /></span>
          </div>
        </div>
        <div className="row wrap">
          {nextTodo ? (
            <button type="button" className="btn btn-primary" onClick={() => { setFilter("all"); setOpen(nextTodo.i); setTimeout(() => document.getElementById("qw-q-" + nextTodo.i)?.scrollIntoView({ block: "start", behavior: "smooth" }), 30); }}>
              {done.length ? "Practise the next one" : "Start with question 1"}
            </button>
          ) : (
            <Link className="btn btn-primary" to={defendTo}>All practised. Try a trade-off drill</Link>
          )}
          <button type="button" className="btn btn-ghost" onClick={onMore} title="Keeps these questions and your practice, and adds new ones">Get more questions</button>
        </div>
        <p className="small muted qw-goal">
          {done.length >= GOAL
            ? <>Goal reached: {GOAL} practised. Next, <Link to={defendTo}>a trade-off drill</Link>. Keep practising here any time.</>
            : <>Goal: practise {GOAL} out loud ({done.length} done), then a trade-off drill. {"“"}Get more questions{"”"} keeps these and your practice.</>}
        </p>
        {savedNote && <p className="hint" role="status">{savedNote}</p>}
      </Card>

      <div className="jobs-filters" role="group" aria-label="Filter questions">
        {(["all", "todo", ...cats] as CatFilter[]).map((c) => {
          const n = c === "all" ? questions.length : c === "todo" ? questions.length - done.length : questions.filter((q) => q.category === c).length;
          return (
            <button key={c} type="button" aria-pressed={filter === c} className={"jobs-filter" + (filter === c ? " on" : "")} onClick={() => setFilter(c)}>
              {c === "all" ? "All" : c === "todo" ? "Not practised" : CATEGORY_LABEL[c] || c} <span className="jobs-filter-n">{n}</span>
            </button>
          );
        })}
      </div>

      {!shown.length ? (
        <p className="hint">{filter === "todo" ? "You’ve practised every question here." : "No questions in this group."}</p>
      ) : (
        <ol className="qw-list">
          {shown.map(({ q, i }) => {
            const st = statusOf(q);
            const isOpen = open === i;
            return (
              <li key={i} id={"qw-q-" + i} className={"qw-item" + (isOpen ? " open" : "") + (st ? " done" : "")}>
                <button type="button" className="qw-q" aria-expanded={isOpen} onClick={() => setOpen(isOpen ? null : i)}>
                  <span className="qw-num">{ordered.findIndex((x) => x.i === i) + 1}</span>
                  <span className="qw-text">
                    <span className="qw-meta">
                      <span className="qw-cat">{CATEGORY_LABEL[q.category] || q.category}</span>
                      <span className={"diff diff-" + (q.difficulty === "hard" ? "hard" : q.difficulty === "easy" ? "easy" : "med")}>{q.difficulty || "medium"}</span>
                    </span>
                    <span className="qw-prompt">{q.prompt}</span>
                  </span>
                  <span className={"qw-status" + (st ? (st.score >= 80 ? " good" : st.score >= 55 ? " mid" : " low") : "")}>
                    {st ? (st.how === "ai" ? st.score + "%" : st.score >= 80 ? "Nailed it" : st.score >= 55 ? "Partly" : "Missed") : "Practise"}
                  </span>
                </button>
                {isOpen && (
                  <div className="qw-body">
                    <AnswerCoach prompt={q.prompt} model={q.model_answer} signals={q.signals} topic={String(q.category || "")} autoFocus onResult={(score, how) => onResult(q, score, how)} />
                  </div>
                )}
              </li>
            );
          })}
        </ol>
      )}

      <details className="card why-details">
        <summary>Why these questions</summary>
        <WhyPanel analysis={analysis} questions={questions} />
      </details>

      <section className={"qw-next" + (done.length >= GOAL ? " ready" : "")} aria-labelledby="qw-next-h">
        <span className="td-eyebrow">{done.length >= GOAL ? "Next step" : "After " + GOAL + " questions"}</span>
        <h2 id="qw-next-h">Trade-off drill</h2>
        <p>The interviewer pushes back on your design call: why, what you trade away, a new constraint, an incident. About 10 minutes.</p>
        <div className="row">
          <Link className={"btn " + (done.length >= GOAL ? "btn-primary" : "")} to={defendTo}>Start a trade-off drill {"→"}</Link>
          {done.length < GOAL && <span className="small muted">{GOAL - done.length} more {GOAL - done.length === 1 ? "question" : "questions"} to go first (recommended)</span>}
        </div>
      </section>
    </>
  );
}

function lastGenerated(questions: GeneratedQuestion[]): string {
  let ts = "";
  questions.forEach((q) => { if (q.created_at && (!ts || q.created_at > ts)) ts = q.created_at; });
  if (!ts) return "";
  const d = new Date(ts);
  if (isNaN(d.getTime())) return "";
  return d.toLocaleString(undefined, { year: "numeric", month: "short", day: "numeric", hour: "2-digit", minute: "2-digit" });
}
