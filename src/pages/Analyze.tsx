/* Add a job — the one flow that turns a posting into a saved, planned job.
 *
 *   1. The job: paste a link (importJobUrl) or the description.
 *   2. Your resume (optional): entered once, saved in this browser
 *      (lib/savedResume) and reused everywhere after.
 *   3. Interview date (optional).
 *
 * Submitting analyzes the job (with the resume when there is one), saves it
 * (createJob), runs the fit check against the saved job when a resume is
 * present, stores the date, and lands on the job page. When the job can't be
 * saved (free limit, demo, shared link) the analysis is shown here instead.
 *
 * Analysis needs a (free) account: signed-out visitors fill the form, get an
 * inline sign-in card, and the job (kept in sessionStorage, which survives the
 * OAuth redirect) is added by itself once they're signed in. The resume needs
 * no hand-off: it is already saved on this device. */

import { useEffect, useRef, useState, type FormEvent, type ReactNode } from "react";
import { API_ENABLED, docsUrl } from "../config";
import * as api from "../lib/api";
import { useAuth } from "../lib/auth";
import { buildShareUrl, copyText, downloadText, planFilename, readSharedAnalysis, toMarkdown } from "../lib/analysisExport";
import { isIsoDay, localDay, setInterviewDate } from "../lib/interviewDates";
import { logActivity } from "../lib/progressStore";
import { setActiveJob } from "../lib/readiness";
import { CATEGORY_LABELS, cleanRole, deriveRoleTitle, inferScenarioCategory, isLevelOnly } from "../lib/roles";
import { ExternalLink, Link, useLocation, useNavigate, useSearchParams } from "../lib/router";
import { getSavedResume, saveResume } from "../lib/savedResume";
import { KEYS, readJSON, writeJSON } from "../lib/storage";
import { SAMPLE_ANALYSIS } from "../data/sampleAnalysis";
import { Bullets, Card, Chips, ErrorText, Section, StatusPill } from "../components/ui";
import { SignInCard } from "../components/AuthForm";
import { FitDetails } from "../components/FitSummary";
import { RESUME_PRIVACY, ResumeField } from "../components/ResumeField";
import { LIMITS } from "../lib/plans";
import type { Analysis, GapResult, Skill } from "../types";
import { track } from "../lib/track";

interface ResultMeta {
  demo?: boolean;
  shared?: boolean;
  note?: string;
  model?: string;
  input?: { targetRole?: string; jobDescription?: string };
  /** Why the job wasn't saved (shown on the result). */
  saveNote?: ReactNode;
  fit?: GapResult | null;
}

interface FormValues {
  targetRole: string;
  jobDescription: string;
  interviewDate: string;
  sourceUrl: string;
}

type View =
  | { kind: "form"; prefill?: Partial<FormValues>; error?: string }
  | { kind: "loading"; step: number; withResume: boolean }
  | { kind: "result"; analysis: Analysis; meta: ResultMeta };

// ---- pending job across sign-in --------------------------------------------

const PENDING_KEY = "offerready.analyze.pending.v1";
const PENDING_TTL_MS = 6 * 60 * 60 * 1000;

interface Pending extends Partial<FormValues> { jobDescription: string; at: number }

function readPending(): Pending | null {
  try {
    const p = JSON.parse(sessionStorage.getItem(PENDING_KEY) || "null") as Pending | null;
    if (!p || typeof p.jobDescription !== "string" || !p.jobDescription.trim()) return null;
    if (Date.now() - (p.at || 0) > PENDING_TTL_MS) { sessionStorage.removeItem(PENDING_KEY); return null; }
    return p;
  } catch {
    return null;
  }
}

function writePending(v: FormValues) {
  try {
    sessionStorage.setItem(PENDING_KEY, JSON.stringify({ ...v, at: Date.now() }));
  } catch {
    /* blocked storage: the in-page state still works for email sign-in */
  }
}

function clearPending() {
  try { sessionStorage.removeItem(PENDING_KEY); } catch { /* ignore */ }
}

const fromPending = (p: Pending): FormValues => ({
  targetRole: p.targetRole || "", jobDescription: p.jobDescription, interviewDate: p.interviewDate || "", sourceUrl: p.sourceUrl || "",
});

// ---- local signals (no JD/resume text at rest) -----------------------------

function logAnalyzeActivity(a: Analysis, role: string) {
  const gaps: string[] = [];
  (a.potentialGaps || []).forEach((g) => g?.requirement && gaps.push(g.requirement));
  (a.preparationPlan || []).forEach((p) => p?.title && gaps.push(p.title));
  logActivity({ type: "analyze", role: role || a.seniority || "target role", gaps });
}

/** Distilled "defend role" signal so Trade-off drills can filter + personalize. */
function saveDefendRole(category: string | null, role: string, a: Analysis) {
  if (!category) return;
  const techs: string[] = [];
  (a.technologies || []).forEach((t) => typeof t === "string" && t.trim() && techs.push(t.trim()));
  (a.coreSkills || []).forEach((s) => {
    const name = typeof s === "string" ? s : s?.name;
    if (name && !techs.includes(name)) techs.push(name);
  });
  const gaps: string[] = [];
  (a.potentialGaps || []).forEach((g) => g?.requirement && gaps.push(g.requirement));
  (a.preparationPlan || []).forEach((p) => p?.title && !gaps.includes(p.title) && gaps.push(p.title));
  // Seniority is supplementary context only; a bare level is scrubbed.
  let sen = cleanRole(a.seniority);
  if (sen && isLevelOnly(sen)) sen = "";
  writeJSON(KEYS.defendRole, {
    category,
    role: role || "",
    seniority: sen,
    technologies: techs.slice(0, 8),
    gaps: gaps.slice(0, 5),
    when: Date.now(),
  });
}

const skillLabel = (s: string | Skill): ReactNode =>
  typeof s === "string" ? s : (
    <>
      {s.name}
      {s.type ? <span className="tag">{s.type}</span> : null}
    </>
  );

// ---- page ------------------------------------------------------------------

export default function AnalyzePage() {
  const location = useLocation();
  const auth = useAuth();
  const params = useSearchParams();
  const navigate = useNavigate();
  const [view, setView] = useState<View>(() => {
    const shared = readSharedAnalysis(location.hash);
    if (shared) return { kind: "result", analysis: shared, meta: { shared: true } };
    const pending = readPending();
    if (pending) return { kind: "form", prefill: fromPending(pending) };
    const role = params.get("role");
    const url = params.get("url");
    return { kind: "form", prefill: role || url ? { targetRole: (role || "").slice(0, 200), sourceUrl: (url || "").slice(0, 2000) } : undefined };
  });
  // Show the inline sign-in card (a submit while signed out, or a 401).
  const [needSignIn, setNeedSignIn] = useState(false);
  const gateRef = useRef<HTMLDivElement | null>(null);
  const resumed = useRef(false);

  const askSignIn = (v: FormValues) => {
    writePending(v);
    setView({ kind: "form", prefill: v });
    setNeedSignIn(true);
  };

  useEffect(() => {
    if (!needSignIn) return;
    const t = setTimeout(() => gateRef.current?.scrollIntoView({ behavior: "smooth", block: "start" }), 50);
    return () => clearTimeout(t);
  }, [needSignIn]);

  // Signed in with a pending job (email sign-in here, or back from OAuth): run it.
  useEffect(() => {
    if (!auth.ready || !auth.session || resumed.current) return;
    const p = readPending();
    if (!p) { setNeedSignIn(false); return; }
    if (view.kind !== "form") return;
    resumed.current = true;
    setNeedSignIn(false);
    clearPending();
    addJob(fromPending(p));
  }, [auth.ready, auth.session]); // eslint-disable-line react-hooks/exhaustive-deps

  const addJob = async (v: FormValues) => {
    const resume = getSavedResume();
    const withResume = !!resume;
    setView({ kind: "loading", step: 0, withResume });
    const tok = auth.session ? await auth.getAccessToken() : null;
    // Signed-in runs count toward the plan's monthly analyses (server-enforced).
    const res = await api.analyzeJob({ jobDescription: v.jobDescription, targetRole: v.targetRole, resume: resume?.text }, tok);
    if (res.status === 503) {
      setView({ kind: "result", analysis: SAMPLE_ANALYSIS, meta: { demo: true, note: "Live analysis isn't enabled on this deployment yet, so here's a sample." } });
      return;
    }
    if (res.status === 0) {
      setView({ kind: "form", prefill: v, error: "Couldn't reach the analysis service. Check your connection and try again." });
      return;
    }
    if (res.status === 401 && auth.configured) {
      // Session expired (or never existed): keep the text, sign in, then rerun.
      resumed.current = false;
      askSignIn(v);
      return;
    }
    if (res.status < 200 || res.status >= 300) {
      setView({ kind: "form", prefill: v, error: res.body?.error || "Analysis failed. Please try again." });
      return;
    }
    const d = res.body;
    if (!d?.analysis) {
      setView({ kind: "form", prefill: v, error: "The analysis came back empty. Please try again." });
      return;
    }
    const a = d.analysis;
    writeJSON(KEYS.analysis, { analysis: a, model: d.model, input: { targetRole: v.targetRole || "" }, savedAt: Date.now() });
    logAnalyzeActivity(a, v.targetRole);
    saveDefendRole(inferScenarioCategory(a, v.targetRole), deriveRoleTitle(v.targetRole, a), a);
    const meta: ResultMeta = { model: d.model, input: { targetRole: v.targetRole, jobDescription: v.jobDescription } };

    // Save the job.
    setView({ kind: "loading", step: 1, withResume });
    let jobId = "";
    if (tok) {
      const saved = await api.createJob(tok, { analysis: a, title: v.targetRole || a.seniority || "", jobDescription: v.jobDescription, model: d.model || "" });
      if (saved.status === 201 && saved.body?.job?.id) { jobId = saved.body.job.id; track("job_added", { resume: !!withResume }); }
      else if (saved.status === 403 && saved.body?.upgrade) meta.saveNote = <>Free includes {LIMITS.free.saved_jobs} saved job, so this one isn{"’"}t saved. <Link to="/pricing">Get a pass</Link> to keep more, or remove one in <Link to="/jobs">Jobs</Link>.</>;
      else meta.saveNote = saved.status === 0 ? "Couldn’t reach the server to save this job. Try “Save this job” below." : saved.body?.error || "Couldn’t save this job. Try “Save this job” below.";
    } else {
      meta.saveNote = <>Sign in to save this job and get a day-by-day plan. <Link to="/account">Sign in</Link></>;
    }
    if (jobId) {
      setActiveJob(jobId);
      if (v.interviewDate && isIsoDay(v.interviewDate)) setInterviewDate(jobId, v.interviewDate);
    }

    // Fit check with the saved resume (saved to the job when there is one).
    if (resume) {
      setView({ kind: "loading", step: 2, withResume });
      const fit = await api.runGapAnalysis(tok, { jobId: jobId || null, role: v.targetRole || deriveRoleTitle(v.targetRole, a), jobDescription: v.jobDescription, resumeText: resume.text });
      if (fit.status === 200 && fit.body?.result) meta.fit = fit.body.result;
    }

    if (jobId) {
      navigate("/jobs/" + encodeURIComponent(jobId) + "?added=1", { replace: true });
      return;
    }
    setView({ kind: "result", analysis: a, meta });
  };

  return (
    <div className="page">
      {view.kind === "form" && (
        <AddJobForm
          prefill={view.prefill}
          error={view.error}
          onSubmit={(v) => {
            if (!API_ENABLED) {
              setView({ kind: "result", analysis: SAMPLE_ANALYSIS, meta: { demo: true, note: "Live analysis isn't configured on this site yet, so here's a sample." } });
              return;
            }
            if (auth.configured && auth.ready && !auth.session) {
              resumed.current = false;
              askSignIn(v);
              return;
            }
            addJob(v);
          }}
          onDraft={needSignIn ? (v) => writePending(v) : undefined}
          onSample={() => setView({ kind: "result", analysis: SAMPLE_ANALYSIS, meta: { demo: true } })}
        />
      )}
      {view.kind === "form" && needSignIn && !auth.session && (
        <div className="az-signin" ref={gateRef}>
          <SignInCard title="Sign in to add this job. It’s free.">
            <p className="muted">
              Your job is kept on this page. As soon as you{"’"}re signed in, it{"’"}s added by itself.
            </p>
            <p className="muted small">Free includes {LIMITS.free.analyses} job analyses a month.</p>
          </SignInCard>
        </div>
      )}
      {view.kind === "loading" && <AddJobLoading step={view.step} withResume={view.withResume} />}
      {view.kind === "result" && (
        <AnalysisResult
          analysis={view.analysis}
          meta={view.meta}
          onAnother={() => {
            if (window.location.hash) window.history.replaceState(null, "", window.location.pathname);
            setView({ kind: "form" });
          }}
        />
      )}
    </div>
  );
}

// ---- form ------------------------------------------------------------------

type Tab = "link" | "paste";
interface Imported { title: string; company: string; location: string; url: string }

const hostOf = (u: string) => { try { return new URL(u).hostname.replace(/^www\./, ""); } catch { return ""; } };

function Step({ n, title, tag, sub, children }: { n: number; title: string; tag?: string; sub: string; children: ReactNode }) {
  return (
    <section className="card aj-step" aria-labelledby={"aj-step-" + n}>
      <div className="aj-step-head">
        <span className="aj-num" aria-hidden="true">{n}</span>
        <div className="aj-step-titles">
          <h2 id={"aj-step-" + n}>{title}{tag ? <span className="aj-tag">{tag}</span> : null}</h2>
          <p className="muted small">{sub}</p>
        </div>
      </div>
      {children}
    </section>
  );
}

function AddJobForm({
  prefill, error, onSubmit, onSample, onDraft,
}: {
  prefill?: Partial<FormValues>;
  error?: string;
  onSubmit(v: FormValues): void;
  onSample(): void;
  /** While the sign-in card is up: keep the pending copy in sync with edits. */
  onDraft?(v: FormValues): void;
}) {
  const auth = useAuth();
  const [tab, setTab] = useState<Tab>(prefill?.jobDescription ? "paste" : "link");
  const [url, setUrl] = useState(prefill?.sourceUrl || "");
  const [importing, setImporting] = useState(false);
  const [imported, setImported] = useState<Imported | null>(null);
  const [notice, setNotice] = useState("");
  const [role, setRole] = useState(prefill?.targetRole || "");
  const [jd, setJd] = useState(prefill?.jobDescription || "");
  const [date, setDate] = useState(prefill?.interviewDate || "");
  const [pastedResume, setPastedResume] = useState("");
  const [err, setErr] = useState(error || "");
  const urlRef = useRef<HTMLInputElement | null>(null);
  const jdRef = useRef<HTMLTextAreaElement | null>(null);

  const values = (): FormValues => ({ targetRole: role.trim(), jobDescription: jd.trim(), interviewDate: date, sourceUrl: url.trim() });
  useEffect(() => {
    if (onDraft && jd.trim()) onDraft(values());
  }, [role, jd, date, url]); // eslint-disable-line react-hooks/exhaustive-deps

  const toPaste = (msg: string) => {
    setNotice(msg);
    setTab("paste");
    setTimeout(() => jdRef.current?.focus(), 30);
  };

  const doImport = async () => {
    const u = url.trim();
    setNotice("");
    setErr("");
    if (!/^https?:\/\/\S+\.\S+/i.test(u)) { setErr("That doesn’t look like a link. Copy the full address of the job posting, starting with https://"); urlRef.current?.focus(); return; }
    setImporting(true);
    const tok = auth.session ? await auth.getAccessToken() : null;
    const res = await api.importJobUrl(tok, u);
    setImporting(false);
    const b = res.body;
    const site = hostOf(u) || "That site";
    if (res.status === 200 && b?.ok && (b.description || "").trim().length >= 30) {
      setImported({ title: b.title || "", company: b.company || "", location: b.location || "", url: b.source_url || u });
      setRole((b.title || "").slice(0, 200));
      setJd((b.description || "").slice(0, 12000));
      return;
    }
    if (res.status === 422 || b?.blocked) toPaste(site + " doesn’t allow automatic import. Open the posting, copy the job description and paste it here. We kept your link.");
    else if (res.status === 401) toPaste("Sign in to import from a link (it’s free), or paste the job description here.");
    else if (res.status === 0) toPaste("We couldn’t reach the server to read that link. Paste the job description here instead.");
    else toPaste("We couldn’t read a job description from that page. Paste it here instead. We kept your link.");
  };

  const submit = (e: FormEvent) => {
    e.preventDefault();
    const v = values();
    if (v.jobDescription.length < 30) {
      if (tab === "link" && !imported) { setErr(url.trim() ? "Press “Get the job” first, or switch to “Paste the description”." : "Paste a link to the job posting, or switch to “Paste the description”."); return; }
      setErr("Please paste the job description (at least a few sentences).");
      return;
    }
    if (v.interviewDate && (!isIsoDay(v.interviewDate) || v.interviewDate < localDay())) { setErr("Pick an interview date from today onwards, or leave it empty."); return; }
    // A pasted resume that wasn't saved yet: save it now, it's used for this job.
    if (!getSavedResume() && pastedResume.trim().length >= 40) saveResume(pastedResume, "");
    setErr("");
    onSubmit(v);
  };

  const showFields = tab === "paste" || !!imported;

  return (
    <form className="aj" onSubmit={submit} noValidate>
      <Step n={1} title="The job" sub="Paste a link to the posting, or the description itself.">
        <div className="seg" role="tablist" aria-label="How to add the job">
          <button type="button" role="tab" id="aj-tab-link" aria-selected={tab === "link"} aria-controls="aj-panel" className={"seg-btn" + (tab === "link" ? " on" : "")} onClick={() => { setTab("link"); setNotice(""); }}>Paste a link</button>
          <button type="button" role="tab" id="aj-tab-paste" aria-selected={tab === "paste"} aria-controls="aj-panel" className={"seg-btn" + (tab === "paste" ? " on" : "")} onClick={() => { setTab("paste"); setNotice(""); }}>Paste the description</button>
        </div>
        <div id="aj-panel" role="tabpanel" aria-labelledby={tab === "link" ? "aj-tab-link" : "aj-tab-paste"} className="stack-sm">
          {tab === "link" && !imported && (
            <>
              <label className="field-label" htmlFor="aj-url">Link to the job posting</label>
              <div className="aj-url-row">
                <input id="aj-url" ref={urlRef} className="input" type="url" inputMode="url" autoComplete="url" placeholder="https://boards.greenhouse.io/acme/jobs/123"
                  value={url} onChange={(e) => setUrl(e.target.value)}
                  onKeyDown={(e) => { if (e.key === "Enter") { e.preventDefault(); doImport(); } }} />
                <button type="button" className="btn btn-primary" disabled={importing || !url.trim()} onClick={doImport}>{importing ? "Reading…" : "Get the job"}</button>
              </div>
              <p className="small muted">Works with most company career pages, Greenhouse, Lever and Ashby. Some sites, like LinkedIn, block this; paste the description instead.</p>
            </>
          )}
          {imported && tab === "link" && (
            <div className="aj-imported" role="status">
              <span className="aj-imported-mark" aria-hidden="true">{"✓"}</span>
              <div className="aj-imported-text">
                <strong>{imported.title || "Job imported"}</strong>
                <span className="small muted">{[imported.company, imported.location].filter(Boolean).join(" · ") || hostOf(imported.url)}</span>
              </div>
              <button type="button" className="link-btn small" onClick={() => { setImported(null); setJd(""); setRole(""); }}>Use another link</button>
            </div>
          )}
          {notice && <p className="aj-notice" role="status">{notice}</p>}
          {tab === "paste" && url.trim() && !imported && (
            <p className="small muted">Posting: <ExternalLink href={url.trim()}>{hostOf(url.trim()) || url.trim()}</ExternalLink></p>
          )}
          {showFields && (
            <>
              <label className="field-label" htmlFor="az-role">Job title {imported ? "" : "(optional)"}</label>
              <input id="az-role" className="input" type="text" maxLength={200} placeholder="e.g. Senior Data Engineer"
                value={role} onChange={(e) => setRole(e.target.value)} />
              <label className="field-label" htmlFor="az-jd">Job description{imported ? " (check it, edit if needed)" : ""}</label>
              <textarea id="az-jd" ref={jdRef} className="input textarea" rows={imported ? 7 : 8} maxLength={12000} placeholder={"Paste the full job description here…"}
                value={jd} onChange={(e) => setJd(e.target.value)} />
            </>
          )}
        </div>
      </Step>

      <Step n={2} title="Your resume" tag="Optional, recommended" sub="With it, you see your match and your gaps straight away. You only add it once.">
        <ResumeField onPaste={setPastedResume} />
        <p className="small muted aj-privacy">
          <svg viewBox="0 0 24 24" width="15" height="15" fill="none" stroke="currentColor" strokeWidth="1.8" strokeLinecap="round" strokeLinejoin="round" aria-hidden="true"><rect x="4.5" y="10.5" width="15" height="10" rx="2.5" /><path d="M8 10.5V7.5a4 4 0 0 1 8 0v3" /></svg>
          {RESUME_PRIVACY}
        </p>
      </Step>

      <Step n={3} title="Interview date" tag="Optional" sub="We plan every day up to it. Skip it if you don’t know yet; you can add it later.">
        <div className="aj-date-row">
          <label className="td-sr" htmlFor="aj-date">Interview date</label>
          <input id="aj-date" className="input aj-date" type="date" min={localDay()} value={date} onChange={(e) => setDate(e.target.value)} />
          {date && <button type="button" className="link-btn small" onClick={() => setDate("")}>Clear</button>}
        </div>
      </Step>

      {err ? <ErrorText>{err}</ErrorText> : null}
      <div className="aj-submit">
        <button type="submit" className="btn btn-primary btn-lg">Add this job</button>
        <button type="button" className="btn btn-ghost" onClick={onSample}>See a sample first</button>
      </div>
    </form>
  );
}

function AddJobLoading({ step, withResume }: { step: number; withResume: boolean }) {
  const steps = ["Reading the job", "Saving it to your jobs", ...(withResume ? ["Comparing your resume"] : [])];
  return (
    <Card>
      <div className="question">Adding your job{"…"}</div>
      <ul className="steps" aria-live="polite">
        {steps.map((s, i) => (
          <li key={s} className={i <= step ? "step-on" : ""}>{s}{i < step ? " ✓" : i === step ? "…" : ""}</li>
        ))}
      </ul>
    </Card>
  );
}

// ---- result (sample, shared link, or a job that couldn't be saved) ---------

type SaveMsg = { text: ReactNode; err?: boolean } | null;

function AnalysisResult({ analysis: a, meta, onAnother }: { analysis: Analysis; meta: ResultMeta; onAnother(): void }) {
  const auth = useAuth();
  const navigate = useNavigate();
  const [saveMsg, setSaveMsg] = useState<SaveMsg>(meta.saveNote ? { text: meta.saveNote } : null);
  const [busy, setBusy] = useState(false);
  const [copied, setCopied] = useState("");
  const [feedback, setFeedback] = useState<"none" | "done">("none");

  const targetRole = meta.input?.targetRole || "";
  const roleTitle = deriveRoleTitle(targetRole, a);
  const cat = inferScenarioCategory(a, targetRole);

  const flash = (label: string) => {
    setCopied(label);
    setTimeout(() => setCopied(""), 1700);
  };

  const saveToJobs = async () => {
    if (busy) return;
    setBusy(true);
    setSaveMsg({ text: "Saving…" });
    const token = await auth.getAccessToken();
    if (!token) { setBusy(false); setSaveMsg({ text: <>Please <Link to="/account">sign in</Link> to save this job.</> }); return; }
    const res = await api.createJob(token, { analysis: a, title: targetRole || a.seniority || "", jobDescription: meta.input?.jobDescription || "", model: meta.model || "" });
    setBusy(false);
    if (res.status === 201 && res.body?.job?.id) {
      track("job_added", { via: "save" });
      setActiveJob(res.body.job.id);
      navigate("/jobs/" + encodeURIComponent(res.body.job.id) + "?added=1");
    } else if (res.status === 403 && res.body?.upgrade) {
      setSaveMsg({ text: <>Free includes {LIMITS.free.saved_jobs} saved job. <Link to="/pricing">Get a pass</Link> to save more, or remove one in <Link to="/jobs">Jobs</Link>.</> });
    } else if (res.status === 401) setSaveMsg({ text: <>Please <Link to="/account">sign in</Link> to save this job.</> });
    else if (res.status === 0) setSaveMsg({ text: "Couldn't reach the server. Please try again.", err: true });
    else setSaveMsg({ text: res.body?.error || "Couldn't save this job. Please try again.", err: true });
  };

  const recordFeedback = (v: "up" | "down") => {
    const f = readJSON<{ up: number; down: number; updatedAt?: number }>(KEYS.feedback, { up: 0, down: 0 });
    if (v === "up") f.up++;
    else f.down++;
    f.updatedAt = Date.now();
    writeJSON(KEYS.feedback, f);
    setFeedback("done");
  };

  return (
    <div className="stack">
      {meta.demo && (
        <div className="demo-banner">
          <strong>Sample analysis</strong>: illustrative data for a fictional role.{" "}
          {meta.note || "This was not generated from your resume."}
        </div>
      )}
      {!meta.demo && !meta.shared && saveMsg && (
        <div className={"aj-notice" + (saveMsg.err ? " is-err" : "")} role="status">{saveMsg.text}</div>
      )}
      <p className="hint">Preparation guidance only, <strong>not a prediction</strong> of interview or offer outcomes.</p>

      <Section title="Role summary">
        {roleTitle ? <span className="topic">{roleTitle}</span> : a.seniority && !isLevelOnly(a.seniority) ? <span className="topic">{a.seniority}</span> : null}
        <p>{a.roleSummary}</p>
      </Section>

      {meta.fit && (
        <section className="card section">
          <h2 className="section-title">Your resume against this job</h2>
          <FitDetails result={meta.fit} />
        </section>
      )}

      <Section title="What this job requires">
        <Chips label="Core skills" items={(a.coreSkills || []).map(skillLabel)} />
        <Chips label="Technologies" items={a.technologies || []} />
        <Bullets label="Experience" items={a.experienceRequirements || []} />
      </Section>

      {a.resumeProvided && (a.alignment || []).length > 0 && (
        <Section title="Initial alignment">
          <div className="table-wrap">
            <table>
              <thead>
                <tr><th>Requirement</th><th>Status</th><th>Evidence in resume</th></tr>
              </thead>
              <tbody>
                {(a.alignment || []).map((r, i) => (
                  <tr key={i}>
                    <td>{r.requirement}</td>
                    <td><StatusPill status={r.status} resumeProvided /></td>
                    <td>{r.evidence}</td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        </Section>
      )}

      {(a.readiness || []).length > 0 && (
        <Section title="What the role expects">
          {!a.resumeProvided && (
            <p className="hint">No resume was included. Add your resume when you add a job to compare your evidence with each requirement.</p>
          )}
          <div className="table-wrap">
            <table>
              <thead>
                <tr><th>Dimension</th><th>Status</th><th>Role requires</th><th>Found in resume</th><th>Gap</th></tr>
              </thead>
              <tbody>
                {(a.readiness || []).map((r, i) => (
                  <tr key={i}>
                    <td>{r.dimension}</td>
                    <td><StatusPill status={r.status} resumeProvided={a.resumeProvided} /></td>
                    <td>{r.roleRequires}</td>
                    <td>{r.candidateHas}</td>
                    <td>{r.gap}</td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        </Section>
      )}

      {(a.potentialGaps || []).length > 0 && (
        <Section title="Potential gaps">
          {(a.potentialGaps || []).map((g, i) => (
            <div className="model" key={i}>
              <h4>{g.requirement}</h4>
              {g.whatIsMissing && <p><strong>Missing:</strong> {g.whatIsMissing}</p>}
              {g.whyItMatters && <p><strong>Why it matters:</strong> {g.whyItMatters}</p>}
              <Bullets label="Study" items={g.whatToStudy || []} />
              <Bullets label="Build" items={g.whatToBuild || []} />
              <Bullets label="Practice" items={g.whatToPractice || []} />
              {g.interviewExpectation && <p><strong>In the interview:</strong> {g.interviewExpectation}</p>}
            </div>
          ))}
        </Section>
      )}

      {(a.interviewSignals || []).length > 0 && (
        <Section title="Interview signals">
          <Bullets
            items={(a.interviewSignals || []).map((s) =>
              typeof s === "string" ? s : (
                <>
                  {s.area || ""}
                  {s.type ? <span className="tag">{s.type}</span> : null}
                  {s.note ? " — " + s.note : ""}
                </>
              ),
            )}
          />
        </Section>
      )}

      {(a.preparationPlan || []).length > 0 && (
        <Section title="Your preparation plan">
          {(a.preparationPlan || []).map((p, i) => (
            <div className="model" key={i}>
              <h4>Priority {p.priority}: {p.title}</h4>
              {p.why && <p>{p.why}</p>}
              {p.resource?.path && (
                <ExternalLink className="res-link" href={docsUrl(p.resource.path)}>
                  {"→"} {p.resource.label}
                </ExternalLink>
              )}
            </div>
          ))}
        </Section>
      )}

      {!meta.shared && (
        <Section title="Trade-off drills for this role">
          <div className="model">
            <p>
              The interview that decides the offer is where you <strong>defend</strong> your design while the interviewer pushes back.{" "}
              {cat ? <>We matched this job to the <strong>{CATEGORY_LABELS[cat]}</strong> drills.</> : "Pick a drill for your target role."}
            </p>
            <Link className="btn btn-primary" to={"/defend" + (cat ? "?role=" + encodeURIComponent(cat) : "")}>
              {cat ? "Start a " + CATEGORY_LABELS[cat] + " drill →" : "Open trade-off drills →"}
            </Link>
          </div>
        </Section>
      )}

      <Section title="Relevant OfferReady resources">
        {(a.offerReadyResources || []).length ? (
          <>
            {(a.technologies || []).filter(Boolean).length > 0 && (
              <p className="muted small">Matched to what this role requires: {(a.technologies || []).filter(Boolean).slice(0, 6).join(", ")}.</p>
            )}
            <div className="res-list">
              {(a.offerReadyResources || []).map((r, i) => (
                <ExternalLink key={i} className="res-link" href={docsUrl(r.path)}>{r.label}</ExternalLink>
              ))}
            </div>
          </>
        ) : (
          <p className="hint">No matching OfferReady resource found for this role's skills.</p>
        )}
      </Section>

      <Card>
        <button type="button" className="btn btn-ghost" onClick={onAnother}>Add another job</button>
      </Card>

      {!meta.demo && (
        <div className="card toolbar no-print">
          <div className="field-label">Save &amp; share this plan</div>
          <div className="row wrap">
            {!meta.shared && (
              <button type="button" className="btn btn-primary" disabled={busy} onClick={saveToJobs}>Save this job</button>
            )}
            <button type="button" className="btn btn-ghost" onClick={async () => { if (await copyText(toMarkdown(a))) flash("md"); }}>
              {copied === "md" ? "Copied ✓" : "Copy plan (Markdown)"}
            </button>
            <button type="button" className="btn btn-ghost" onClick={() => downloadText(planFilename(a), toMarkdown(a))}>Download .md</button>
            <button type="button" className="btn btn-ghost" onClick={() => window.print()}>Print / PDF</button>
            <button type="button" className="btn btn-ghost"
              onClick={async () => {
                const url = buildShareUrl(a);
                if (url && (await copyText(url))) flash("link");
                else flash("nolink");
              }}>
              {copied === "link" ? "Link copied ✓" : copied === "nolink" ? "Couldn't build link" : "Copy shareable link"}
            </button>
          </div>
          <p className="hint">
            {meta.shared
              ? "You're viewing a shared plan. Nothing here is stored on a server."
              : "The shareable link contains only the plan, never your resume."}
          </p>
        </div>
      )}

      {!meta.shared && (
        <div className="feedback-row no-print">
          {feedback === "none" ? (
            <>
              <span>Was this analysis helpful?</span>
              <button type="button" className="btn btn-ghost" onClick={() => recordFeedback("up")}>Yes</button>
              <button type="button" className="btn btn-ghost" onClick={() => recordFeedback("down")}>Not really</button>
            </>
          ) : (
            <span>Thanks, noted.</span>
          )}
        </div>
      )}

      {meta.model && <p className="hint">Analyzed with model: {meta.model}.</p>}
    </div>
  );
}
