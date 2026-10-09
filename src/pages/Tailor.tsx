/* Tailor my resume — rewrite up to 12 bullets for one saved job's skills and
 * gaps (POST /api/premium/tailor, metered as resume_tailor).
 *
 * The resume comes from the saved resume (lib/savedResume: this device only,
 * entered once). An older sessionStorage hand-off (SESSION_KEYS.tailorHandoff)
 * is still read once and removed. The text is sent once with the request and
 * never stored on the server. */

import { useEffect, useMemo, useRef, useState } from "react";
import * as api from "../lib/api";
import { useAuth } from "../lib/auth";
import { invalidatePlan } from "../lib/plans";
import { setActiveJob } from "../lib/readiness";
import { displayJobTitle } from "../lib/roles";
import { Link, useSearchParams } from "../lib/router";
import { useSavedResume } from "../lib/savedResume";
import { SESSION_KEYS } from "../lib/storage";
import {
  MAX_BULLETS, MAX_RESUME_CHARS, bulletsToText, extractBullets, finalBullets, jobKeywords, keywordCoverage, mentions, splitBullets,
  type TailorSuggestion,
} from "../lib/tailor";
import { useJobs } from "../lib/useJobs";
import { SignInCard } from "../components/AuthForm";
import { PlanGate, UpgradeCard } from "../components/PlanGate";
import { CopyButton } from "../components/StreamDraft";
import { ResumeField } from "../components/ResumeField";
import { Card, Loading, Muted } from "../components/ui";
import type { Analysis, GapRow } from "../types";

interface Handoff { jobId?: string; resumeText?: string; keywords?: string[] }

/** The Check fit hand-off, read once: removed from sessionStorage on first
 * read and kept in memory only until the screen has mounted (StrictMode may
 * render twice), then forgotten. */
let pending: Handoff | null = null;
function takeHandoff(): Handoff | null {
  try {
    const raw = sessionStorage.getItem(SESSION_KEYS.tailorHandoff);
    if (raw) {
      sessionStorage.removeItem(SESSION_KEYS.tailorHandoff);
      const v = JSON.parse(raw);
      pending = v && typeof v === "object" ? v : null;
    }
  } catch {
    /* blocked storage: nothing handed over */
  }
  return pending;
}

type Run =
  | { kind: "idle" }
  | { kind: "running" }
  | { kind: "error"; msg: string }
  | { kind: "upgrade" }
  | { kind: "done"; originals: string[]; suggestions: TailorSuggestion[] };

export default function TailorPage() {
  const auth = useAuth();
  const jobs = useJobs();
  const params = useSearchParams();
  const [h] = useState<Handoff | null>(takeHandoff);
  useEffect(() => { pending = null; }, []);

  const [jobId, setJobId] = useState("");
  const [detail, setDetail] = useState<{ analysis: Analysis | null; gap: GapRow | null } | null>(null);
  const [saved] = useSavedResume();
  const resumeText = (h?.resumeText || saved?.text || "").slice(0, MAX_RESUME_CHARS);
  const [text, setText] = useState<string>(() => (resumeText ? extractBullets(resumeText).join("\n") : ""));
  // A resume saved on this screen fills the bullets (if none were typed yet).
  useEffect(() => {
    if (saved?.text && !text.trim()) setText(extractBullets(saved.text).join("\n"));
  }, [saved?.updatedAt]); // eslint-disable-line react-hooks/exhaustive-deps
  const [run, setRun] = useState<Run>({ kind: "idle" });
  const [accepted, setAccepted] = useState<Record<number, boolean>>({});
  const resultsRef = useRef<HTMLDivElement | null>(null);

  // Pick the job: ?job=, the hand-off, the active job, else the first.
  useEffect(() => {
    if (jobs.status !== "ready" || !jobs.jobs.length || jobId) return;
    const want = [params.get("job"), h?.jobId, jobs.activeId].find((x) => x && jobs.jobs.some((j) => j.id === x));
    setJobId(want || jobs.jobs[0].id);
  }, [jobs.status]); // eslint-disable-line react-hooks/exhaustive-deps

  useEffect(() => {
    if (!jobId) return;
    let alive = true;
    setDetail(null);
    (async () => {
      const tok = await auth.getAccessToken();
      if (!tok) return;
      const res = await api.getJob(tok, jobId);
      if (!alive) return;
      setDetail({ analysis: res.body?.job?.analysis || null, gap: res.body?.gap || null });
    })();
    return () => { alive = false; };
  }, [jobId]); // eslint-disable-line react-hooks/exhaustive-deps

  const row = jobs.jobs.find((j) => j.id === jobId);
  const keywords = useMemo(() => {
    const k = jobKeywords(detail?.analysis, detail?.gap);
    if (k.length || !h?.keywords) return k;
    return (h.keywords || []).filter((x) => typeof x === "string").slice(0, 25);
  }, [detail]); // eslint-disable-line react-hooks/exhaustive-deps
  const gaps = useMemo(() => [...(detail?.gap?.result?.missingSkills || []), ...(detail?.gap?.result?.missingKeywords || []), ...((detail?.analysis?.potentialGaps || []).map((g) => g.requirement))].slice(0, 15), [detail]);
  const bullets = useMemo(() => splitBullets(text), [text]);
  const allLines = useMemo(() => text.split("\n").filter((l) => l.trim()).length, [text]);
  const before = useMemo(() => keywordCoverage(keywords, bullets), [keywords, bullets]);

  const go = async () => {
    if (!bullets.length || !row) return;
    setRun({ kind: "running" });
    setAccepted({});
    const tok = await auth.getAccessToken();
    const res = await api.tailorResume(tok, {
      bullets,
      resume_text: resumeText || bullets.join("\n"),
      job: { title: displayJobTitle(row), company: row.company, seniority: row.seniority, skills: keywords, gaps },
    });
    if (res.status === 200 && res.body?.suggestions) {
      invalidatePlan();
      setRun({ kind: "done", originals: bullets, suggestions: res.body.suggestions });
      setTimeout(() => resultsRef.current?.scrollIntoView({ behavior: "smooth", block: "start" }), 0);
    } else if (res.status === 403 && res.body?.upgrade) { invalidatePlan(); setRun({ kind: "upgrade" }); }
    else if (res.status === 403) setRun({ kind: "error", msg: res.body?.error || "You’ve reached this month’s tailoring limit." });
    else if (res.status === 401) setRun({ kind: "error", msg: "Your session expired. Sign in again (Account, top-right) and retry." });
    else if (res.status === 503) setRun({ kind: "error", msg: "Resume tailoring isn’t enabled on this deployment yet." });
    else if (res.status === 0) setRun({ kind: "error", msg: "Couldn’t reach the server. Check your connection and try again." });
    else setRun({ kind: "error", msg: res.body?.error || "Couldn’t tailor your bullets. Please try again." });
  };

  if (jobs.status === "loading") return <div className="page"><Loading /></div>;
  if (jobs.status === "signedout") return (
    <div className="page">
      <SignInCard title="Sign in to tailor your resume">
        <Muted>Tailoring rewrites your bullets for a saved job{"’"}s skills and gaps. Your resume is never stored on our servers.</Muted>
      </SignInCard>
    </div>
  );
  if (jobs.status !== "ready" || !jobs.jobs.length) return (
    <div className="page">
      <Card>
        <h2>Add a job first</h2>
        <Muted>Tailoring targets one job{"’"}s skills and gaps. Add the job, then come back.</Muted>
        <div className="row"><Link className="btn btn-primary" to="/analyze">Add a job</Link></div>
      </Card>
    </div>
  );

  const done = run.kind === "done" ? run : null;
  const final = done ? finalBullets(done.originals, done.suggestions, accepted) : [];
  const after = done ? keywordCoverage(keywords, final) : null;
  const acceptedCount = done ? done.suggestions.filter((s) => accepted[s.index] !== false).length : 0;
  const facts = done ? done.suggestions.filter((s) => s.needs_fact && accepted[s.index] !== false).length : 0;

  return (
    <div className="page dto">
      <section className="card dto-tl-input" aria-labelledby="tl-in-h">
        <div className="td-sec-head">
          <div>
            <h2 id="tl-in-h">Your bullets</h2>
            <p className="muted small">One bullet per line, up to {MAX_BULLETS}. {resumeText ? "Pulled from your saved resume. Edit freely." : "Add your resume once, or paste the bullets below."}</p>
          </div>
        </div>
        <div className="dto-tl-job">
          <label className="dto-field">
            <span className="field-label">Tailor for</span>
            <select className="input" value={jobId} onChange={(e) => { setJobId(e.target.value); setActiveJob(e.target.value); setRun({ kind: "idle" }); }}>
              {jobs.jobs.map((j) => <option key={j.id} value={j.id}>{displayJobTitle(j)}</option>)}
            </select>
          </label>
        </div>
        {!saved && !h?.resumeText && <ResumeField compact />}
        <textarea className="input textarea dto-tl-text" rows={9} value={text} aria-label="Resume bullets, one per line"
          placeholder={"- Built ELT pipelines in Python that loaded 40 tables into Snowflake\n- Worked on data quality checks\n- Led migration of reports to a new BI tool"}
          onChange={(e) => { setText(e.target.value); if (run.kind !== "running") setRun({ kind: "idle" }); }} />
        <p className="small muted">
          {bullets.length ? bullets.length + (bullets.length === 1 ? " bullet" : " bullets") + " ready" : "No bullets yet"}
          {allLines > MAX_BULLETS ? " · only the first " + MAX_BULLETS + " are used" : ""}
          {" · "}Sent once to rewrite these bullets, never stored on our servers.
        </p>

        <Coverage label="Keyword coverage now" cov={before} total={keywords.length} loading={!detail} />

        <PlanGate feature="resume_tailor" title="Tailor your resume with AI" message="Rewrite your bullets for this job’s skills and gaps.">
          <div className="row">
            <button type="button" className="btn btn-primary dto-tl-run" onClick={go} disabled={!bullets.length || run.kind === "running" || !detail}>
              {run.kind === "running" ? "Tailoring…" : done ? "Tailor again" : "Tailor my bullets"}
            </button>
            <span className="small muted">Never adds employers, titles, dates or numbers you didn{"’"}t write.</span>
          </div>
        </PlanGate>
        {run.kind === "error" && <p className="error" role="alert">{run.msg}</p>}
      </section>

      {run.kind === "upgrade" && <UpgradeCard feature="resume_tailor" message="Rewrite your bullets for this job’s skills and gaps." />}
      {run.kind === "running" && <Loading>Rewriting your bullets for {row ? displayJobTitle(row) : "this job"}{"…"}</Loading>}

      {done && after && (
        <div ref={resultsRef} className="stack dto-tl-results">
          <section className="card dto-tl-summary" aria-labelledby="tl-sum-h">
            <div className="td-sec-head">
              <div>
                <h2 id="tl-sum-h">{done.suggestions.length} {done.suggestions.length === 1 ? "suggestion" : "suggestions"}</h2>
                <p className="muted small">{acceptedCount} accepted{facts ? " · " + facts + (facts === 1 ? " needs a number from you" : " need a number from you") : ""}</p>
              </div>
              <CopyButton text={bulletsToText(final)} label="Copy all" className="btn btn-primary btn-small" />
            </div>
            <div className="dto-cov-compare">
              <CoverageBar label="Before" pct={before.pct} n={before.covered.length} total={keywords.length} />
              <CoverageBar label="After" pct={after.pct} n={after.covered.length} total={keywords.length} strong />
            </div>
            {after.covered.length > before.covered.length && (
              <div className="chips" aria-label="Keywords now covered">
                {after.covered.filter((k) => !before.covered.includes(k)).map((k) => <span key={k} className="chip chip-ok">+ {k}</span>)}
              </div>
            )}
            {after.missing.length > 0 && <p className="small muted">Still not covered: {after.missing.slice(0, 8).join(", ")}{after.missing.length > 8 ? "…" : ""}. Only add these if your experience supports them.</p>}
          </section>

          <ol className="dto-sugs">
            {done.suggestions.map((s) => {
              const on = accepted[s.index] !== false;
              return (
                <li key={s.index} className={"card dto-sug" + (on ? " is-on" : " is-off")}>
                  <div className="dto-sug-head">
                    <span className="dto-sug-n">Bullet {s.index + 1}</span>
                    <div className="dto-seg dto-seg-sm" role="group" aria-label={"Bullet " + (s.index + 1)}>
                      <button type="button" className={"dto-seg-btn" + (on ? " on" : "")} aria-pressed={on} onClick={() => setAccepted((a) => ({ ...a, [s.index]: true }))}>Accept</button>
                      <button type="button" className={"dto-seg-btn" + (!on ? " on" : "")} aria-pressed={!on} onClick={() => setAccepted((a) => ({ ...a, [s.index]: false }))}>Keep original</button>
                    </div>
                  </div>
                  <p className="dto-orig"><span className="dto-sr">Original: </span>{s.original}</p>
                  <p className="dto-new"><span className="dto-sr">Rewritten: </span><Highlight text={s.rewritten} words={s.keywords_added} /></p>
                  {s.keywords_added.length > 0 && (
                    <div className="chips">{s.keywords_added.map((k) => <span key={k} className="chip sb-tag">{k}</span>)}</div>
                  )}
                  {s.why && <p className="small muted dto-why">{s.why}</p>}
                  {s.needs_fact && (
                    <div className="dto-fact">
                      <strong>Needs a fact from you</strong>
                      <span>{s.fact_question || "What was the actual number?"} Replace the placeholder in brackets with the real figure, or cut it.</span>
                    </div>
                  )}
                  <div className="row">
                    <CopyButton text={on ? s.rewritten : s.original} label="Copy" className="btn btn-ghost btn-small" />
                  </div>
                </li>
              );
            })}
          </ol>
        </div>
      )}
    </div>
  );
}

function Coverage({ label, cov, total, loading }: { label: string; cov: ReturnType<typeof keywordCoverage>; total: number; loading: boolean }) {
  if (loading) return <p className="small muted">Loading the job{"’"}s keywords{"…"}</p>;
  if (!total) return <p className="small muted">This job has no skills list yet. <Link to="/analyze">Add the job</Link> with its description, or check your fit on the job{"’"}s Resume tab first.</p>;
  return (
    <div className="dto-cov">
      <CoverageBar label={label} pct={cov.pct} n={cov.covered.length} total={total} />
      <div className="chips dto-cov-chips">
        {cov.covered.map((k) => <span key={k} className="chip chip-ok">{k}</span>)}
        {cov.missing.map((k) => <span key={k} className="chip chip-off">{k}</span>)}
      </div>
    </div>
  );
}

function CoverageBar({ label, pct, n, total, strong }: { label: string; pct: number; n: number; total: number; strong?: boolean }) {
  return (
    <div className={"dto-covbar" + (strong ? " is-strong" : "")}>
      <div className="dto-covbar-top"><span>{label}</span><strong>{pct}%</strong><span className="small muted">{n} of {total} keywords</span></div>
      <div className="dto-covbar-track" role="img" aria-label={label + ": " + pct + "% keyword coverage"}><span style={{ width: Math.max(2, pct) + "%" }} /></div>
    </div>
  );
}

/** Mark the added keywords inside the rewritten bullet (React elements only). */
function Highlight({ text, words }: { text: string; words: string[] }) {
  const ws = words.filter((w) => mentions(text, w));
  if (!ws.length) return <>{text}</>;
  const esc = (s: string) => s.replace(/[.*+?^${}()|[\]\\]/g, "\\$&");
  const re = new RegExp("(" + ws.map(esc).sort((a, b) => b.length - a.length).join("|") + ")", "gi");
  return <>{text.split(re).map((p, i) => (ws.some((w) => w.toLowerCase() === p.toLowerCase()) ? <mark key={i}>{p}</mark> : <span key={i}>{p}</span>))}</>;
}
