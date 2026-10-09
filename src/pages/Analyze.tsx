/* Analyze My Job (was content/assets/analyze.js, mounted on #analyze-app).
 *
 * Analysis needs a (free) account: the API answers 401 {signin:true} without
 * one. Signed-out visitors can still paste a job; on submit they get an inline
 * sign-in card, the role + JD are kept in sessionStorage (survives the OAuth
 * redirect), and the analysis runs by itself once they're signed in. The
 * resume text is kept in memory only (never written to storage), so it
 * survives email sign-in but not a Google/GitHub redirect. The sample analysis
 * and /example walkthrough stay public. */

import { useEffect, useRef, useState, type FormEvent, type ReactNode } from "react";
import { API_ENABLED, docsUrl } from "../config";
import * as api from "../lib/api";
import { useAuth } from "../lib/auth";
import { buildShareUrl, copyText, downloadText, planFilename, readSharedAnalysis, toMarkdown } from "../lib/analysisExport";
import { logActivity } from "../lib/progressStore";
import { setActiveJob } from "../lib/readiness";
import { CATEGORY_LABELS, cleanRole, deriveRoleTitle, inferScenarioCategory, isLevelOnly } from "../lib/roles";
import { ExternalLink, Link, useLocation, useNavigate, useSearchParams } from "../lib/router";
import { KEYS, readJSON, removeKey, writeJSON } from "../lib/storage";
import { SAMPLE_ANALYSIS } from "../data/sampleAnalysis";
import { Bullets, Card, Chips, ErrorText, Section, StatusPill } from "../components/ui";
import { SignInCard } from "../components/AuthForm";
import { LIMITS } from "../lib/plans";
import type { Analysis, Skill } from "../types";

const LOADING_STEPS = [
  "Analyzing role…",
  "Identifying requirements…",
  "Checking preparation areas…",
  "Preparing your role overview…",
];

interface SavedAnalysis {
  analysis: Analysis;
  model?: string;
  input?: { targetRole?: string };
  savedAt?: number;
}

interface ResultMeta {
  demo?: boolean;
  shared?: boolean;
  restored?: boolean;
  note?: string;
  model?: string;
  input?: { targetRole?: string; jobDescription?: string };
}

interface FormValues {
  targetRole: string;
  jobDescription: string;
  resume: string;
}

type View =
  | { kind: "form"; prefill?: Partial<FormValues>; error?: string }
  | { kind: "loading" }
  | { kind: "result"; analysis: Analysis; meta: ResultMeta };

// ---- pending analysis across sign-in -----------------------------------------

const PENDING_KEY = "offerready.analyze.pending.v1";
const PENDING_TTL_MS = 6 * 60 * 60 * 1000;
let pendingResume = ""; // memory only: the resume is never stored

interface Pending { targetRole: string; jobDescription: string; at: number }

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
  pendingResume = v.resume || "";
  try {
    sessionStorage.setItem(PENDING_KEY, JSON.stringify({ targetRole: v.targetRole || "", jobDescription: v.jobDescription, at: Date.now() }));
  } catch {
    /* blocked storage: the in-page state still works for email sign-in */
  }
}

function clearPending() {
  try { sessionStorage.removeItem(PENDING_KEY); } catch { /* ignore */ }
}

// ---- local signals (no JD/resume text at rest) -----------------------------

function logAnalyzeActivity(a: Analysis, role: string) {
  const gaps: string[] = [];
  (a.potentialGaps || []).forEach((g) => g?.requirement && gaps.push(g.requirement));
  (a.preparationPlan || []).forEach((p) => p?.title && gaps.push(p.title));
  logActivity({ type: "analyze", role: role || a.seniority || "target role", gaps });
}

/** Distilled "defend role" signal so Defend can filter + personalize. */
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
  const [view, setView] = useState<View>(() => {
    const shared = readSharedAnalysis(location.hash);
    if (shared) return { kind: "result", analysis: shared, meta: { shared: true } };
    const pending = readPending();
    if (pending) return { kind: "form", prefill: { targetRole: pending.targetRole, jobDescription: pending.jobDescription, resume: pendingResume } };
    const role = params.get("role");
    return { kind: "form", prefill: role ? { targetRole: role.slice(0, 200) } : undefined };
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
    const resume = pendingResume;
    pendingResume = "";
    analyze({ targetRole: p.targetRole, jobDescription: p.jobDescription, resume });
  }, [auth.ready, auth.session]); // eslint-disable-line react-hooks/exhaustive-deps

  const analyze = async (payload: FormValues) => {
    setView({ kind: "loading" });
    // Signed-in runs count toward the plan's monthly analyses (server-enforced).
    const res = await api.analyzeJob(payload, auth.session ? await auth.getAccessToken() : null);
    if (res.status === 503) {
      setView({ kind: "result", analysis: SAMPLE_ANALYSIS, meta: { demo: true, note: "Live analysis isn't enabled on this deployment yet — showing a sample." } });
      return;
    }
    if (res.status === 0) {
      setView({ kind: "form", prefill: payload, error: "Couldn't reach the analysis service. Check your connection and try again." });
      return;
    }
    if (res.status === 401 && auth.configured) {
      // Session expired (or never existed): keep the text, sign in, then rerun.
      resumed.current = false;
      askSignIn(payload);
      return;
    }
    if (res.status < 200 || res.status >= 300) {
      setView({ kind: "form", prefill: payload, error: res.body?.error || "Analysis failed. Please try again." });
      return;
    }
    const d = res.body;
    if (!d?.analysis) {
      setView({ kind: "form", prefill: payload, error: "The analysis came back empty. Please try again." });
      return;
    }
    const saved: SavedAnalysis = { analysis: d.analysis, model: d.model, input: { targetRole: payload.targetRole || "" }, savedAt: Date.now() };
    writeJSON(KEYS.analysis, saved);
    logAnalyzeActivity(d.analysis, payload.targetRole);
    saveDefendRole(
      inferScenarioCategory(d.analysis, payload.targetRole),
      deriveRoleTitle(payload.targetRole, d.analysis),
      d.analysis,
    );
    setView({
      kind: "result",
      analysis: d.analysis,
      meta: { model: d.model, input: { targetRole: payload.targetRole, jobDescription: payload.jobDescription } },
    });
  };

  return (
    <div className="page">
      {view.kind === "form" && (
        <AnalyzeForm
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
            analyze(v);
          }}
          onDraft={needSignIn ? (v) => writePending(v) : undefined}
          onSample={() => setView({ kind: "result", analysis: SAMPLE_ANALYSIS, meta: { demo: true } })}
          onResume={(s) => setView({ kind: "result", analysis: s.analysis, meta: { model: s.model, restored: true } })}
        />
      )}
      {view.kind === "form" && needSignIn && !auth.session && (
        <div className="az-signin" ref={gateRef}>
          <SignInCard title="Sign in to analyze this job. It’s free.">
            <p className="muted">
              Your job description is kept on this page. As soon as you’re signed in, the analysis starts by itself.
            </p>
            <p className="muted small">Free includes {LIMITS.free.analyses} job analyses a month.</p>
          </SignInCard>
        </div>
      )}
      {view.kind === "loading" && <AnalyzeLoading />}
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

function AnalyzeForm({
  prefill, error, onSubmit, onSample, onResume, onDraft,
}: {
  prefill?: Partial<FormValues>;
  error?: string;
  onSubmit(v: FormValues): void;
  onSample(): void;
  onResume(s: SavedAnalysis): void;
  /** While the sign-in card is up: keep the pending copy in sync with edits. */
  onDraft?(v: FormValues): void;
}) {
  const [role, setRole] = useState(prefill?.targetRole || "");
  const [jd, setJd] = useState(prefill?.jobDescription || "");
  const [cv, setCv] = useState(prefill?.resume || "");
  const [err, setErr] = useState(error || "");
  useEffect(() => {
    if (onDraft && jd.trim()) onDraft({ targetRole: role.trim(), jobDescription: jd.trim(), resume: cv.trim() });
  }, [role, jd, cv]); // eslint-disable-line react-hooks/exhaustive-deps
  const [saved, setSaved] = useState<SavedAnalysis | null>(() => {
    if (prefill) return null;
    const s = readJSON<SavedAnalysis | null>(KEYS.analysis, null);
    return s?.analysis?.roleSummary ? s : null;
  });

  const submit = (e: FormEvent) => {
    e.preventDefault();
    const jobDescription = jd.trim();
    if (jobDescription.length < 30) {
      setErr("Please paste a job description (at least a few sentences).");
      return;
    }
    setErr("");
    onSubmit({ jobDescription, targetRole: role.trim(), resume: cv.trim() });
  };

  return (
    <>
      {saved && (
        <div className="resume-banner">
          <span>
            {"🔖"} You have a saved analysis
            {saved.input?.targetRole ? (
              <>
                {" "}for <strong>{saved.input.targetRole}</strong>
              </>
            ) : null}
            {saved.savedAt ? " (" + new Date(saved.savedAt).toLocaleDateString() + ")" : ""}.
          </span>
          <div className="row">
            <button type="button" className="btn btn-primary" onClick={() => onResume(saved)}>
              Resume it
            </button>
            <button type="button" className="btn btn-ghost" onClick={() => { removeKey(KEYS.analysis); setSaved(null); }}>
              Start fresh
            </button>
          </div>
        </div>
      )}
      <form className="card form" onSubmit={submit}>
        <label className="field-label" htmlFor="az-role">Target role (optional)</label>
        <input id="az-role" className="input" type="text" maxLength={200} placeholder="e.g. AI Solutions Architect"
          value={role} onChange={(e) => setRole(e.target.value)} />
        <label className="field-label" htmlFor="az-jd">Job description (required)</label>
        <textarea id="az-jd" className="input textarea" rows={8} maxLength={12000} placeholder={"Paste the full job description here…"}
          value={jd} onChange={(e) => setJd(e.target.value)} />
        <label className="field-label" htmlFor="az-cv">Resume (optional {"—"} enables alignment)</label>
        <textarea id="az-cv" className="input textarea" rows={5} maxLength={16000} placeholder="Paste your resume text (optional). Not stored."
          value={cv} onChange={(e) => setCv(e.target.value)} />
        {err ? <ErrorText>{err}</ErrorText> : null}
        <div className="row">
          <button type="submit" className="btn btn-primary">Analyze My Job</button>
          <button type="button" className="btn btn-ghost" onClick={onSample}>See a sample analysis</button>
        </div>
      </form>
    </>
  );
}

function AnalyzeLoading() {
  const [step, setStep] = useState(0);
  useEffect(() => {
    // Cosmetic progression; one API call underneath.
    const iv = setInterval(() => setStep((s) => Math.min(s + 1, LOADING_STEPS.length - 1)), 900);
    return () => clearInterval(iv);
  }, []);
  return (
    <Card>
      <div className="question">Analyzing this job{"…"}</div>
      <ul className="steps" aria-live="polite">
        {LOADING_STEPS.map((s, i) => (
          <li key={s} className={i <= step ? "step-on" : ""}>{s}</li>
        ))}
      </ul>
    </Card>
  );
}

// ---- result ----------------------------------------------------------------

type SaveMsg = { text: ReactNode; err?: boolean } | null;

function useSaveJob(analysis: Analysis, meta: ResultMeta) {
  const auth = useAuth();
  const [savedJobId, setSavedJobId] = useState<string | null>(null);
  const [busy, setBusy] = useState(false);
  const busyRef = useRef(false);

  /** Resolves to the saved job id, or null with a message to show. */
  const save = async (setMsg: (m: SaveMsg) => void, signInPrompt: string): Promise<string | null> => {
    if (savedJobId) return savedJobId;
    if (busyRef.current) return null;
    if (!API_ENABLED) { setMsg({ text: "Saving isn't enabled on this site yet." }); return null; }
    if (!auth.configured) { setMsg({ text: "Sign-in isn't available yet." }); return null; }
    busyRef.current = true;
    setBusy(true);
    setMsg({ text: "Saving…" });
    try {
      const token = await auth.getAccessToken();
      if (!token) {
        setMsg({ text: <>Please <Link to="/account">sign in</Link> {signInPrompt}</> });
        return null;
      }
      const inp = meta.input || {};
      const res = await api.createJob(token, {
        analysis,
        title: inp.targetRole || analysis.seniority || "",
        jobDescription: inp.jobDescription || "",
        model: meta.model || "",
      });
      if (res.status === 201 && res.body?.job?.id) {
        setSavedJobId(res.body.job.id);
        setActiveJob(res.body.job.id);
        return res.body.job.id;
      }
      if (res.status === 403 && res.body?.upgrade) {
        setMsg({
          text: (
            <>
              Free includes one saved job. <Link to="/pricing">Upgrade to Pro</Link> to save more, or open{" "}
              <Link to="/jobs">My Jobs</Link> to Check My Fit on an existing job.
            </>
          ),
        });
      } else if (res.status === 401) {
        setMsg({ text: <>Please <Link to="/account">sign in</Link> {signInPrompt}</> });
      } else if (res.status === 0) {
        setMsg({ text: "Couldn't reach the server. Please try again.", err: true });
      } else {
        setMsg({ text: res.body?.error || "Couldn't save this job. Please try again.", err: true });
      }
      return null;
    } finally {
      busyRef.current = false;
      setBusy(false);
    }
  };

  return { savedJobId, busy, save };
}

function AnalysisResult({ analysis: a, meta, onAnother }: { analysis: Analysis; meta: ResultMeta; onAnother(): void }) {
  const navigate = useNavigate();
  const { savedJobId, busy, save } = useSaveJob(a, meta);
  const [fitMsg, setFitMsg] = useState<SaveMsg>(null);
  const [saveMsg, setSaveMsg] = useState<SaveMsg>(null);
  const [copied, setCopied] = useState("");
  const [feedback, setFeedback] = useState<"none" | "done">("none");

  const targetRole = meta.input?.targetRole || "";
  const roleTitle = deriveRoleTitle(targetRole, a);
  const cat = inferScenarioCategory(a, targetRole);

  const flash = (label: string) => {
    setCopied(label);
    setTimeout(() => setCopied(""), 1700);
  };

  const checkFit = async () => {
    const id = savedJobId || (await save(setFitMsg, "to save this job and check your fit."));
    if (!id) return;
    setFitMsg({ text: "Saved ✓ — opening Check My Fit…" });
    navigate("/fit");
  };

  const saveToJobs = async () => {
    const id = await save(setSaveMsg, "to save this job.");
    if (id) {
      setSaveMsg({
        text: (
          <>
            Saved {"✓"} {"—"} next: <Link to="/fit">Check My Fit</Link> {"·"} <Link to="/questions">questions</Link> {"·"}{" "}
            <Link to="/jobs">My Jobs</Link>
          </>
        ),
      });
    }
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
          {"🧪"} <strong>Sample analysis</strong> {"—"} illustrative demo data for a fictional role.{" "}
          {meta.note || "This was not generated from your resume."}
        </div>
      )}
      <p className="hint">Preparation guidance only {"—"} <strong>not a prediction</strong> of interview or offer outcomes.</p>

      <Section title="Role summary">
        {roleTitle ? <span className="topic">{roleTitle}</span> : a.seniority && !isLevelOnly(a.seniority) ? <span className="topic">{a.seniority}</span> : null}
        <p>{a.roleSummary}</p>
      </Section>

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
            <p className="hint">
              A resume was not included in this analysis. Save the role and use <strong>Check My Fit</strong> to compare your resume evidence with the job requirements.
            </p>
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
              <h4>Priority {p.priority} {"—"} {p.title}</h4>
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

      {!meta.shared && !meta.demo && (
        <Section title="Next step">
          <div className="next-fit">
            <h3>Check My Fit</h3>
            <p>Compare your resume evidence with this role to identify your strengths, missing evidence, and highest-priority preparation areas.</p>
            <div className="row">
              <button type="button" className="btn btn-primary" disabled={busy} onClick={checkFit}>
                {savedJobId ? "Check My Fit" : "Save Job and Check My Fit"}
              </button>
            </div>
            {fitMsg && <p className={"save-msg" + (fitMsg.err ? " error" : "")}>{fitMsg.text}</p>}
            <p className="hint">After you check your fit: prepare role-specific questions, practice decision defense, then measure Interview Readiness.</p>
          </div>
        </Section>
      )}

      {!meta.shared && (
        <Section title="Defend your decisions for this role">
          <div className="model">
            <p>
              The interview that decides the offer is where you <strong>defend</strong> your design under follow-ups.{" "}
              {cat ? <>We matched this job to the <strong>{CATEGORY_LABELS[cat]}</strong> scenarios.</> : "Pick a scenario for your target role."}
            </p>
            <Link className="btn btn-primary" to={"/defend" + (cat ? "?role=" + encodeURIComponent(cat) : "")}>
              {cat ? "Defend a " + CATEGORY_LABELS[cat] + " scenario →" : "Open Defend scenarios →"}
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
        <button type="button" className="btn btn-ghost" onClick={onAnother}>Analyze another job</button>
      </Card>

      {!meta.demo && (
        <div className="card toolbar no-print">
          <div className="field-label">Save &amp; share this plan</div>
          <div className="row wrap">
            {!meta.shared && (
              <button type="button" className="btn btn-primary" disabled={busy} onClick={saveToJobs}>
                {"💾"} Save to My Jobs
              </button>
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
          {saveMsg && <p className={"save-msg" + (saveMsg.err ? " error" : "")}>{saveMsg.text}</p>}
          <p className="hint">
            {meta.shared
              ? "You're viewing a shared plan. Nothing here is stored on a server."
              : "Saved to this browser — it'll be here when you come back. The shareable link contains only the plan, not your resume."}
          </p>
        </div>
      )}

      {!meta.shared && (
        <div className="feedback-row no-print">
          {feedback === "none" ? (
            <>
              <span>Was this analysis helpful?</span>
              <button type="button" className="btn btn-ghost" onClick={() => recordFeedback("up")}>{"👍"} Yes</button>
              <button type="button" className="btn btn-ghost" onClick={() => recordFeedback("down")}>{"👎"} Not really</button>
            </>
          ) : (
            <span>Thanks {"—"} noted.</span>
          )}
        </div>
      )}

      {meta.model && <p className="hint">Analyzed with model: {meta.model}.</p>}
    </div>
  );
}
