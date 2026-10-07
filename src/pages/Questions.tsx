/* Practice Questions — JD-driven question generator (was
 * content/assets/questions.js). Job-rooted: a saved set is restored first;
 * regenerating replaces it, so it's an explicit, confirmed action. */

import { useEffect, useRef, useState } from "react";
import * as api from "../lib/api";
import { useAuth } from "../lib/auth";
import { displayJobTitle } from "../lib/roles";
import { Link } from "../lib/router";
import { useJobs } from "../lib/useJobs";
import { Card, ErrorText, JobBanner, Loading, Muted } from "../components/ui";
import type { Analysis, GeneratedQuestion, JobRow } from "../types";

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
    if (jobsState.activeId) restoreOrForm(jobsState.activeId);
    else setView({ kind: "form" });
  }, [jobsState.status]); // eslint-disable-line react-hooks/exhaustive-deps

  /** Restore the job's saved JD/role and any existing question set. */
  async function restoreOrForm(id: string) {
    setJobId(id);
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

  const submit = async (r: string, d: string) => {
    setRole(r);
    setJd(d);
    if (d.length < 30) { setView({ kind: "form", note: "Please paste a fuller job description first (or pick a saved job)." }); return; }
    setView({ kind: "loading", msg: "Generating your question set…" });
    const tok = await auth.getAccessToken();
    const res = await api.generateQuestions(tok, { jobId: jobId || null, role: r, jobDescription: d });
    if (res.status === 200 && res.body?.questions) setView({ kind: "result", questions: res.body.questions, saved: !!res.body.saved });
    else if (res.status === 401) setView({ kind: "form", note: "Sign in (Account, top-right) to generate questions — then try again." });
    else if (res.status === 503) setView({ kind: "form", note: "Question generation isn't enabled on this deployment yet." });
    else if (res.status === 0) setView({ kind: "form", note: "Couldn't reach the generator. Check your connection and try again." });
    else setView({ kind: "form", note: res.body?.error || "Couldn't generate the question set. Please try again." });
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
      {view.kind === "restored" && (
        <>
          <Card>
            <JobBanner title={activeTitle} hasJobs={jobs.length > 0} />
            <h2>Your practice questions are ready</h2>
            <p className="qcount">{view.questions.length} saved questions for this job</p>
            {lastGenerated(view.questions) && <Muted small>Last generated: {lastGenerated(view.questions)}</Muted>}
            <Muted small>Continue preparing with the saved questions for this job {"—"} available on any device.</Muted>
            <div className="row">
              <Link className="btn btn-primary" to={defendTo}>Continue Practice</Link>
              <button type="button" className="btn"
                onClick={() => {
                  if (window.confirm("Regenerating will replace the current saved question set for this job.\n\nThis can’t be undone.")) {
                    setView({ kind: "form", note: "Regenerating replaces your saved questions for this job. Review the job description, then generate to confirm the replacement." });
                  }
                }}>
                Regenerate Questions
              </button>
            </div>
          </Card>
          <QuestionCards questions={view.questions} analysis={analysis} defendTo={defendTo} />
        </>
      )}
      {view.kind === "result" && (
        <>
          <Card>
            <h2>Your interview question set</h2>
            <Muted>
              {view.questions.length} questions generated
              {view.saved && jobId ? " · ✓ saved to this job" : jobId ? "" : " · not saved (pick a saved job to keep it)"}
              {" · answer them out loud, then practice defending your decisions."}
            </Muted>
            <button type="button" className="btn" onClick={() => setView({ kind: "form" })}>Generate for another job</button>
          </Card>
          <QuestionCards questions={view.questions} analysis={analysis} defendTo={defendTo} />
        </>
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
  return (
    <Card>
      <JobBanner title={activeTitle} hasJobs={jobs.length > 0} />
      {note && <ErrorText>{note}</ErrorText>}
      {jobs.length > 0 && (
        <>
          <label className="field-label" htmlFor="q-job">Which job?</label>
          <select id="q-job" className="input" value={jobId} onChange={(e) => onPick(e.target.value)}>
            <option value="">{"—"} Select a saved job {"—"}</option>
            {jobs.map((j) => <option key={j.id} value={j.id}>{displayJobTitle(j)}</option>)}
          </select>
          <Muted small>No job here yet? <Link to="/analyze">Analyze &amp; save a job</Link> first.</Muted>
        </>
      )}
      <label className="field-label" htmlFor="q-role">Target role</label>
      <input id="q-role" className="input" type="text" placeholder="Target role (optional)" value={r} onChange={(e) => setR(e.target.value)} />
      <label className="field-label" htmlFor="q-jd">Job description</label>
      <textarea id="q-jd" className="input textarea" rows={9} placeholder={"Paste the full job description here…"} value={d} onChange={(e) => setD(e.target.value)} />
      <div className="row">
        <button type="button" className="btn btn-primary" onClick={() => onSubmit(r.trim(), d.trim())}>Prepare Practice Questions</button>
      </div>
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
    <Card className="why">
      <div className="field-label">Why these questions</div>
      <Muted small>Generated for this role{"\u2019"}s requirements and the gaps found in your analysis. A {"\u2713"} means a question actually references that item.</Muted>
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
    </Card>
  );
}

function QuestionCards({ questions, analysis, defendTo }: { questions: GeneratedQuestion[]; analysis: Analysis | null; defendTo: string }) {
  const byCat: Record<string, GeneratedQuestion[]> = {};
  questions.forEach((q) => (byCat[q.category] = byCat[q.category] || []).push(q));
  return (
    <>
      <WhyPanel analysis={analysis} questions={questions} />
      {CATEGORY_ORDER.filter((c) => byCat[c]?.length).map((cat) => (
        <Card key={cat} className={"qcat qcat-" + cat}>
          <h3>{CATEGORY_LABEL[cat] || cat} <span className="muted small">({byCat[cat].length})</span></h3>
          <ol className="qlist">
            {byCat[cat].map((q, i) => (
              <li key={i}>
                <span className={"diff diff-" + (q.difficulty === "hard" ? "hard" : q.difficulty === "easy" ? "easy" : "med")}>{q.difficulty || "medium"}</span> {q.prompt}
              </li>
            ))}
          </ol>
        </Card>
      ))}
      <div className="next-action">
        <div className="next-action-label">What to do next</div>
        <div className="next-action-row">
          <Link className="btn btn-primary" to={defendTo}>{"🗡️"} Start Recommended Practice</Link>
          <span className="next-action-why">Defend these answers under follow-up pressure {"—"} tradeoffs, alternatives, cost, scale, failure modes {"—"} to raise your Interview Readiness for this job.</span>
        </div>
      </div>
      <div className="row"><Link className="btn" to="/dashboard">{"📊"} View My Readiness</Link></div>
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
