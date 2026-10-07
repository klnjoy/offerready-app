/* Check My Fit — resume vs JD gap analysis (was content/assets/gap.js).
 * Job-rooted: the result is persisted server-side to the selected job. The
 * resume is parsed in the browser and never stored. */

import { useEffect, useRef, useState, type Dispatch, type SetStateAction } from "react";
import * as api from "../lib/api";
import { useAuth } from "../lib/auth";
import { setActiveJob } from "../lib/readiness";
import { extractResume, type ExtractedResume } from "../lib/resumeExtract";
import { displayJobTitle } from "../lib/roles";
import { Link } from "../lib/router";
import { useJobs } from "../lib/useJobs";
import { Card, Chips, ErrorText, JobBanner, Loading, Muted, NextAction, ScoreBar, ScoreHead } from "../components/ui";
import type { GapResult, JobRow } from "../types";

interface Form {
  jobId: string;
  role: string;
  jd: string;
  resumeText: string;
  resumeMeta: ExtractedResume["meta"] | null;
}

type View = { kind: "form"; error?: string } | { kind: "submitting" } | { kind: "result"; result: GapResult; saved: boolean };

export default function CheckFitPage() {
  const auth = useAuth();
  const jobsState = useJobs();
  const [jobs, setJobs] = useState<JobRow[]>([]);
  const [form, setForm] = useState<Form>({ jobId: "", role: "", jd: "", resumeText: "", resumeMeta: null });
  const [hydrating, setHydrating] = useState(false);
  const [view, setView] = useState<View>({ kind: "form" });
  const initialized = useRef(false);

  // Seed from the job list once; preselect + hydrate the active job.
  useEffect(() => {
    if (initialized.current || jobsState.status === "loading") return;
    initialized.current = true;
    setJobs(jobsState.jobs);
    if (jobsState.activeId) selectJob(jobsState.activeId, jobsState.jobs);
  }, [jobsState.status]); // eslint-disable-line react-hooks/exhaustive-deps

  /** The list rows omit job_description, so fetch the full job once. */
  async function selectJob(jobId: string, list = jobs) {
    const row = list.find((j) => j.id === jobId);
    setForm((f) => ({
      ...f,
      jobId,
      role: row?.title || f.role,
      jd: row?.job_description || row?.analysis?.roleSummary || f.jd,
    }));
    if (!jobId || !row || row.job_description) return;
    const tok = await auth.getAccessToken();
    if (!tok) return;
    setHydrating(true);
    const res = await api.getJob(tok, jobId);
    setHydrating(false);
    const full = res.body?.job;
    if (!full) return;
    setJobs((js) => js.map((j) => (j.id === jobId ? { ...j, job_description: full.job_description || "", analysis: full.analysis || j.analysis, title: j.title || full.title } : j)));
    // Only apply if this job is still the selected one (race guard).
    setForm((f) =>
      f.jobId !== jobId ? f : {
        ...f,
        role: full.title || f.role,
        jd: full.job_description || full.analysis?.roleSummary || f.jd,
      },
    );
  }

  const submit = async (v: { role: string; jd: string; resumeText: string }) => {
    setView({ kind: "submitting" });
    const tok = await auth.getAccessToken();
    const res = await api.runGapAnalysis(tok, { jobId: form.jobId || null, role: v.role, jobDescription: v.jd, resumeText: v.resumeText });
    if (res.status === 200 && res.body?.result) {
      if (form.jobId) setActiveJob(form.jobId);
      setView({ kind: "result", result: res.body.result, saved: !!res.body.saved });
    } else if (res.status === 401) setView({ kind: "form", error: "Sign in (Account, top-right) to run gap analysis — then try again." });
    else if (res.status === 503) setView({ kind: "form", error: "Gap analysis isn't enabled on this deployment yet." });
    else if (res.status === 0) setView({ kind: "form", error: "Couldn't reach the analysis service. Check your connection and try again." });
    else setView({ kind: "form", error: res.body?.error || "Couldn't complete the gap analysis. Please try again." });
  };

  const activeJob = jobs.find((j) => j.id === form.jobId);
  const activeTitle = activeJob ? displayJobTitle(activeJob) : form.jobId ? "Untitled role" : "";

  if (jobsState.status === "loading" && !initialized.current) return <div className="page"><Loading /></div>;

  return (
    <div className="page">
      {view.kind === "form" && (
        <FitForm form={form} setForm={setForm} jobs={jobs} activeTitle={activeTitle} hydrating={hydrating}
          error={view.error} onSelect={(id) => selectJob(id)} onSubmit={submit} />
      )}
      {view.kind === "submitting" && <Loading>Comparing your resume against the job{"…"}</Loading>}
      {view.kind === "result" && (
        <FitResult result={view.result} saved={view.saved} jobId={form.jobId} onAgain={() => setView({ kind: "form" })} />
      )}
    </div>
  );
}

function FitForm({
  form, setForm, jobs, activeTitle, hydrating, error, onSelect, onSubmit,
}: {
  form: Form;
  setForm: Dispatch<SetStateAction<Form>>;
  jobs: JobRow[];
  activeTitle: string;
  hydrating: boolean;
  error?: string;
  onSelect(id: string): void;
  onSubmit(v: { role: string; jd: string; resumeText: string }): void;
}) {
  const [err, setErr] = useState(error || "");
  const [fileStatus, setFileStatus] = useState(
    form.resumeMeta ? "✓ " + form.resumeMeta.fileName + " · " + form.resumeMeta.chars + " chars read (still loaded)" : "No file selected.",
  );
  const [pasted, setPasted] = useState(form.resumeMeta ? "" : form.resumeText);
  const errRef = useRef<HTMLDivElement>(null);

  useEffect(() => setErr(error || ""), [error]);

  const onFile = async (f: File | undefined) => {
    if (!f) return;
    setFileStatus("Reading " + f.name + "…");
    try {
      const res = await extractResume(f);
      setForm((s) => ({ ...s, resumeText: res.text, resumeMeta: res.meta }));
      setFileStatus("✓ " + res.meta.fileName + " · " + res.meta.chars + " chars read");
      setPasted("");
    } catch (e) {
      setForm((s) => ({ ...s, resumeText: "", resumeMeta: null }));
      setFileStatus((e as Error).message || "Couldn't read that file.");
    }
  };

  const go = () => {
    const jd = form.jd.trim();
    // File text wins; else pasted text.
    const resumeText = form.resumeMeta ? form.resumeText : pasted.trim();
    setForm((s) => ({ ...s, role: s.role.trim(), jd, resumeText }));
    const show = (m: string) => {
      setErr(m);
      setTimeout(() => errRef.current?.scrollIntoView({ behavior: "smooth", block: "nearest" }), 0);
    };
    if (jd.length < 30) return show("Please paste a fuller job description first (or pick a saved job above to fill it in).");
    if (resumeText.length < 40) return show("Add your resume — upload a file or paste the text — so we can compare.");
    setErr("");
    onSubmit({ role: form.role.trim(), jd, resumeText });
  };

  return (
    <Card>
      <JobBanner title={activeTitle} hasJobs={jobs.length > 0} />
      <div ref={errRef}>{err && <ErrorText>{err}</ErrorText>}</div>

      {jobs.length > 0 ? (
        <>
          <label className="field-label" htmlFor="fit-job">Which job?</label>
          <select id="fit-job" className="input" value={form.jobId} onChange={(e) => onSelect(e.target.value)}>
            <option value="">{"—"} Select a saved job {"—"}</option>
            {jobs.map((j) => <option key={j.id} value={j.id}>{displayJobTitle(j)}</option>)}
          </select>
          <Muted small>
            Pick a job to auto-fill its description below, or paste a job description manually. <Link to="/analyze">Analyze &amp; save a new job</Link>.
          </Muted>
        </>
      ) : (
        <Muted small>
          No saved jobs yet. Paste a job description below to run a one-off gap analysis, or <Link to="/analyze">analyze &amp; save a job</Link> first so the result is stored and tracked.
        </Muted>
      )}

      <label className="field-label" htmlFor="fit-role">Target role</label>
      <input id="fit-role" className="input" type="text" placeholder={"Target role (optional) — e.g. Senior Snowflake Architect"}
        value={form.role} onChange={(e) => setForm((s) => ({ ...s, role: e.target.value }))} />

      <label className="field-label" htmlFor="fit-jd">Job description (required){hydrating ? " — loading saved description…" : ""}</label>
      <textarea id="fit-jd" className="input textarea" rows={9}
        placeholder={"Paste the full job description here… (required — gap analysis compares your resume against it)"}
        value={form.jd} onChange={(e) => setForm((s) => ({ ...s, jd: e.target.value }))} />

      <label className="field-label" htmlFor="fit-file">Your resume (PDF, DOCX, or TXT)</label>
      <div className="file-row">
        <input id="fit-file" type="file" accept=".pdf,.docx,.doc,.txt,application/pdf" onChange={(e) => onFile(e.target.files?.[0])} />
        <span className="muted">{fileStatus}</span>
      </div>
      <Muted small>Or skip the file and paste your resume text below.</Muted>
      <textarea className="input textarea" rows={6} aria-label="Resume text"
        placeholder={form.resumeMeta ? "Resume loaded from file. (Paste here only to override.)" : "…or paste your resume text here."}
        value={pasted}
        onChange={(e) => {
          setPasted(e.target.value);
          if (e.target.value.trim()) setForm((s) => ({ ...s, resumeMeta: null, resumeText: e.target.value }));
        }} />
      <div className="row">
        <button type="button" className="btn btn-primary" onClick={go}>Analyze gap</button>
      </div>
    </Card>
  );
}

function FitResult({ result: r, saved, jobId, onAgain }: { result: GapResult; saved: boolean; jobId: string; onAgain(): void }) {
  const score = r.matchScore || 0;
  const missing = [
    { label: "⚠ Skills not found in your resume", items: r.missingSkills || [] },
    { label: "⚠ Keywords not found in your resume", items: r.missingKeywords || [] },
    { label: "⚠ Experience not evidenced in your resume", items: r.missingExperience || [] },
  ].filter((m) => m.items.length);
  const jobQ = jobId ? "?job=" + encodeURIComponent(jobId) : "";

  return (
    <div className="stack">
      <Card><ScoreHead pct={score} title="Resume match" sub={r.summary} /></Card>
      <Card>
        <h3>Match by area</h3>
        <ScoreBar label="Technical" pct={r.technicalScore || 0} />
        <ScoreBar label="Behavioral" pct={r.behavioralScore || 0} />
        <ScoreBar label="Architecture" pct={r.architectureScore || 0} />
        <ScoreBar label="Domain" pct={r.domainScore || 0} />
      </Card>
      <Card className="factors">
        <div className="field-label">How your Interview Readiness is built</div>
        <div className="factor factor-on"><span className="factor-mark">{"✓"}</span> <strong>Resume match</strong> <span className="muted small">measured here {"—"} {score}% for this role</span></div>
        <div className="factor factor-off"><span className="factor-mark">{"—"}</span> <strong>Practice activity</strong> <span className="muted small">from how you score when you practice questions and defend decisions</span></div>
        <div className="factor factor-off"><span className="factor-mark">{"—"}</span> <strong>Preparation coverage</strong> <span className="muted small">from how much of your prepared question set you work through</span></div>
        <Muted small>Your blended <strong>Interview Readiness</strong> combines all three and updates as you practice. See it on your <Link to="/dashboard">readiness dashboard</Link>.</Muted>
      </Card>
      {(r.strengths || []).length > 0 && (
        <Card tone="ok"><Chips label={"✓ Evidence found in your resume"} items={r.strengths || []} tone="ok" /></Card>
      )}
      {missing.length > 0 && (
        <Card tone="warn">
          {missing.map((m) => <Chips key={m.label} label={m.label} items={m.items} tone="warn" />)}
          <Muted small>{"“"}Not found{"”"} means this wasn{"’"}t shown in your uploaded resume {"—"} it isn{"’"}t a judgment of your ability. Treat these as recommended preparation areas.</Muted>
        </Card>
      )}
      {jobId && saved ? (
        <Card><Muted>{"✓"} Saved to this job. It{"’"}s on your <Link to="/dashboard">dashboard</Link> and any device you sign in from.</Muted></Card>
      ) : !jobId ? (
        <Card><Muted>This result isn{"’"}t saved yet {"—"} <Link to="/analyze">analyze &amp; save a job</Link>, then re-run gap analysis against it to keep it.</Muted></Card>
      ) : null}
      {saved && jobId && (
        <>
          <NextAction label="What to do next" to="/questions" cta="Prepare Practice Questions"
            why={"Generate role-specific questions from this job and the gaps found above. Your job stays selected — no need to pick it again."} />
          <Card>
            <div className="field-label">Or go straight to decision defense</div>
            <Link className="btn" to={"/defend" + jobQ}>Practice Decision Defense</Link>
            <Muted small>Decision defense practices explaining tradeoffs, alternatives, cost, scale, and failure modes under follow-up pressure.</Muted>
          </Card>
        </>
      )}
      <div className="row">
        <button type="button" className="btn" onClick={onAgain}>Run another</button>
        <Link className="btn btn-primary" to="/dashboard">See readiness dashboard</Link>
      </div>
    </div>
  );
}
