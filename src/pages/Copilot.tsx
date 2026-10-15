/* AI Interview Coach (/coach; /copilot and /studio redirect here) — builds practice answers
 * from YOUR material. Internally still called "copilot" (API action, files).
 *
 * Pick a job, ask any interview question and get a speakable answer built
 * from your saved resume, your STAR stories and the job's requirements. Each
 * point says where it came from (your resume, a story, your words, general
 * knowledge, or a suggestion to use only if true); numbers that aren't in your
 * material are flagged. Then practise it (scored, retry and compare) and save
 * the best version to your answer library.
 *
 * Practice only: no live-interview mode, no hidden overlay. */

import { useEffect, useMemo, useState, type ReactNode } from "react";
import * as api from "../lib/api";
import type { CopilotMode, CopilotResult, CopilotSource } from "../lib/api";
import { useAuth } from "../lib/auth";
import { deleteAnswer, saveAnswer, storyText, useAnswers } from "../lib/answerLibrary";
import { invalidatePlan } from "../lib/plans";
import { getActiveJob, setActiveJob } from "../lib/readiness";
import { displayJobTitle } from "../lib/roles";
import { Link, useSearchParams } from "../lib/router";
import { KEYS, onStorageWrite } from "../lib/storage";
import { useSavedResume } from "../lib/savedResume";
import { loadStories } from "../lib/stories";
import { track } from "../lib/track";
import { useJobs } from "../lib/useJobs";
import { AnswerCoach } from "../components/AnswerCoach";
import { SignInCard } from "../components/AuthForm";
import { CoachTour } from "../components/CoachTour";
import { JobPicker } from "../components/JobPicker";
import { UpgradeCard } from "../components/PlanGate";
import { CopyButton } from "../components/StreamDraft";
import { Card, Loading, Muted } from "../components/ui";
import type { Analysis, GapRow, GeneratedQuestion } from "../types";

const MODES: { key: CopilotMode; label: string; hint: string }[] = [
  { key: "answer", label: "Build my answer", hint: "A speakable answer from your experience" },
  { key: "example", label: "Find my best example", hint: "The strongest real project to use" },
  { key: "star", label: "STAR it", hint: "Situation, task, action, result" },
  { key: "tradeoff", label: "Explain the trade-off", hint: "Options, what you give up, when it flips" },
  { key: "design", label: "System design outline", hint: "Requirements to cost, in order" },
  { key: "followups", label: "Likely follow-ups", hint: "What they'll ask next, and how to handle it" },
];

const SOURCE_LABEL: Record<CopilotSource, string> = {
  resume: "Your resume",
  story: "Your story",
  you: "Your words",
  general: "General knowledge",
  suggestion: "Suggestion: only if true for you",
};

type Run =
  | { kind: "idle" }
  | { kind: "busy" }
  | { kind: "error"; msg: string }
  | { kind: "limit"; msg: string }
  | { kind: "done"; result: CopilotResult; mode: CopilotMode; question: string };

export default function CopilotPage() {
  const auth = useAuth();
  const jobs = useJobs();
  const [resume] = useSavedResume();
  const answers = useAnswers();
  const [tab, setTab] = useState<"copilot" | "library">("copilot");
  const [jobId, setJobId] = useState("");
  const [detail, setDetail] = useState<{ analysis: Analysis | null; gap: GapRow | null; questions: GeneratedQuestion[] } | null>(null);
  const params = useSearchParams();
  // ?q= prefills a question (from "Questions you were asked").
  const [question, setQuestion] = useState(() => (params.get("q") || "").slice(0, 600));
  const [run, setRun] = useState<Run>({ kind: "idle" });
  const [practise, setPractise] = useState(false);
  const [savedMsg, setSavedMsg] = useState("");

  const wantJob = params.get("job") || "";
  useEffect(() => {
    if (jobs.status !== "ready") return;
    if (wantJob && jobs.jobs.some((j) => j.id === wantJob)) { if (wantJob !== jobId) setJobId(wantJob); return; }
    if (jobId) return;
    setJobId(jobs.activeId || jobs.jobs[0]?.id || "");
  }, [jobs.status, wantJob]); // eslint-disable-line react-hooks/exhaustive-deps
  // Switching job from the menu follows here too.
  useEffect(() => onStorageWrite((k) => {
    if (k !== KEYS.activeJob) return;
    setTimeout(() => { const a = getActiveJob(); if (a) { setJobId((cur) => (cur === a ? cur : a)); setRun({ kind: "idle" }); } }, 0);
  }), []);

  useEffect(() => {
    if (!jobId) return;
    let alive = true;
    setDetail(null);
    (async () => {
      const tok = await auth.getAccessToken();
      if (!tok) return;
      const res = await api.getJob(tok, jobId);
      if (!alive || res.status !== 200 || !res.body?.job) return;
      setDetail({ analysis: res.body.job.analysis || null, gap: res.body.gap || null, questions: res.body.questions || [] });
    })();
    return () => { alive = false; };
  }, [jobId]); // eslint-disable-line react-hooks/exhaustive-deps

  const job = jobs.status === "ready" ? jobs.jobs.find((j) => j.id === jobId) : undefined;
  const title = job ? displayJobTitle(job) : "";
  const requirements = useMemo(() => {
    const a = detail?.analysis;
    const skills = (a?.coreSkills || []).map((s) => (typeof s === "string" ? s : s.name));
    return Array.from(new Set([...skills, ...(a?.technologies || [])].filter(Boolean))).slice(0, 12) as string[];
  }, [detail]);
  const gaps = useMemo(() => [...(detail?.gap?.result?.missingSkills || []), ...(detail?.gap?.result?.missingExperience || [])].slice(0, 8), [detail]);
  const stories = useMemo(() => loadStories().filter((s) => !s.jobIds.length || s.jobIds.includes(jobId)), [jobId, tab]); // eslint-disable-line react-hooks/exhaustive-deps
  const suggested = (detail?.questions || []).slice(0, 6).map((q) => q.prompt);

  const ask = async (mode: CopilotMode, q = question, draft = "") => {
    const text = q.trim();
    if (text.length < 8) { setRun({ kind: "error", msg: "Type the interview question first (a full sentence works best)." }); return; }
    setRun({ kind: "busy" });
    setPractise(false);
    setSavedMsg("");
    const tok = await auth.getAccessToken();
    const res = await api.copilot(tok, {
      mode, question: text, jobTitle: title, requirements, gaps,
      resume: resume?.text || "", stories: stories.slice(0, 8).map(storyText), draft,
    });
    if (res.status === 200 && res.body?.result) {
      invalidatePlan();
      track("copilot_used", { mode });
      setRun({ kind: "done", result: res.body.result, mode, question: text });
    } else if (res.status === 403) setRun({ kind: "limit", msg: res.body?.error || "You’ve used your AI coaching for now." });
    else if (res.status === 401) setRun({ kind: "error", msg: "Your session expired. Sign in again and retry." });
    else if (res.status === 503) setRun({ kind: "error", msg: "The AI Interview Coach isn’t switched on for this site yet." });
    else if (res.status === 0) setRun({ kind: "error", msg: "Couldn’t reach the AI Interview Coach. Check your connection and try again." });
    else setRun({ kind: "error", msg: res.body?.error || "The AI Interview Coach couldn’t build an answer this time. Please try again." });
  };

  if (jobs.status === "loading") return <div className="page"><Loading /></div>;
  if (jobs.status === "signedout") return (
    <div className="page cp-intro">
      <section aria-labelledby="cp-how-h">
        <h2 id="cp-how-h" className="cp-intro-h">How the AI Interview Coach works</h2>
        <p className="muted">Seven short steps on a sample job and resume. Turn on Sound to hear each one.</p>
        <CoachTour />
      </section>
      <ul className="cp-intro-points">
        <li><strong>Built from you.</strong> It reads the job, your resume and your stories, and labels where every point came from.</li>
        <li><strong>No invented numbers.</strong> Any figure not in your material is flagged before you say it.</li>
        <li><strong>Practice, not live help.</strong> Use it before the interview until the answer is yours. It never runs during the real one.</li>
      </ul>
      <SignInCard title="Sign in to use the AI Interview Coach">
        <Muted>The coach builds answers from your saved jobs, resume and stories, so it needs your account. Free to start, no card needed.</Muted>
      </SignInCard>
      <p className="small"><Link to="/try">Try a sample question first, no sign-up</Link></p>
    </div>
  );

  return (
    <div className="page cp">
      <div className="pt-tabs" role="tablist" aria-label="AI Interview Coach sections">
        <button type="button" role="tab" aria-selected={tab === "copilot"} className={"pt-tab" + (tab === "copilot" ? " on" : "")} onClick={() => setTab("copilot")}>Build an answer</button>
        <button type="button" role="tab" aria-selected={tab === "library"} className={"pt-tab" + (tab === "library" ? " on" : "")} onClick={() => setTab("library")}>Your answers ({answers.length})</button>
      </div>

      {tab === "library" ? (
        <Library onPractise={(q) => { setQuestion(q); setTab("copilot"); setRun({ kind: "idle" }); }} />
      ) : (
        <div className="cp-grid">
          <aside className="card cp-context" aria-labelledby="cp-ctx-h">
            <h2 id="cp-ctx-h">Your context</h2>
            {jobs.status === "ready" && jobs.jobs.length > 0 ? (
              <>
                {jobs.jobs.length > 1 ? (
                  <JobPicker jobs={jobs.jobs} current={jobId} onSwitch={(id) => { setJobId(id); setActiveJob(id); setRun({ kind: "idle" }); }}
                    label={<><span className="job-banner-label">Job</span> <strong>{title}</strong></>} />
                ) : <p><span className="job-banner-label">Job</span> <strong>{title}</strong>{job?.company ? " · " + job.company : ""}</p>}
                {requirements.length > 0 && (
                  <div className="cp-ctx-block">
                    <span className="field-label">What the role needs</span>
                    <div className="chips">{requirements.map((r) => <span key={r} className="chip">{r}</span>)}</div>
                  </div>
                )}
              </>
            ) : (
              <p className="small">No saved job yet. <Link to="/analyze">Add a job</Link> so answers fit the role. You can still ask general questions.</p>
            )}
            <ul className="cp-ctx-list">
              <li className={resume ? "ok" : ""}>{resume ? "Using your saved resume" : <>No resume yet. <Link to={jobId ? "/jobs/" + encodeURIComponent(jobId) + "?tab=resume" : "/account"}>Add it</Link> for answers from your real experience.</>}</li>
              <li className={stories.length ? "ok" : ""}>{stories.length ? stories.length + (stories.length === 1 ? " story" : " stories") + " available" : <>No STAR stories yet. <Link to="/stories">Add one</Link> for behavioral answers.</>}</li>
              {gaps.length > 0 && <li>Gaps to cover: {gaps.slice(0, 3).join(", ")}</li>}
            </ul>
            <p className="small muted">Practice tool. It only uses your own material and never invents experience. <Link to="/demo#coach">See how it works</Link></p>
          </aside>

          <section className="cp-main">
            <Card className="cp-ask">
              <label className="field-label" htmlFor="cp-q">Interview question</label>
              <textarea id="cp-q" className="input textarea" rows={3} value={question} placeholder="e.g. Why did you choose RAG instead of fine-tuning?"
                onChange={(e) => setQuestion(e.target.value)} />
              {suggested.length > 0 && !question && (
                <div className="cp-suggest">
                  <span className="small muted">From this job{"’"}s questions:</span>
                  {suggested.map((q) => <button key={q} type="button" className="cp-chip" onClick={() => setQuestion(q)}>{q.length > 90 ? q.slice(0, 88) + "…" : q}</button>)}
                </div>
              )}
              <div className="cp-modes" role="group" aria-label="What should the coach do?">
                {MODES.map((m) => (
                  <button key={m.key} type="button" className={"btn " + (m.key === "answer" ? "btn-primary" : "")} disabled={run.kind === "busy"} title={m.hint} onClick={() => ask(m.key)}>{m.label}</button>
                ))}
              </div>
            </Card>

            {run.kind === "busy" && <Loading>Building from your resume and stories{"…"}</Loading>}
            {run.kind === "error" && <p className="error" role="alert">{run.msg}</p>}
            {run.kind === "limit" && <UpgradeCard feature="ai_grading" message={run.msg} />}
            {run.kind === "done" && (
              <ResultView r={run.result} onFollowup={(q) => { setQuestion(q); void ask("answer", q); }} >
                <div className="row wrap cp-actions">
                  <button type="button" className="btn btn-primary" onClick={() => setPractise(true)}>Practise this question</button>
                  <button type="button" className="btn" onClick={() => {
                    saveAnswer({ jobId, jobTitle: title, question: run.question, answer: run.result.improved_answer, score: null, source: "copilot" });
                    setSavedMsg("Saved to Your answers.");
                  }} disabled={!run.result.improved_answer}>Save to my answers</button>
                  <button type="button" className="btn btn-ghost" onClick={() => ask("improve", run.question, run.result.improved_answer)}>Make it more concise</button>
                  <button type="button" className="btn btn-ghost" onClick={() => ask("followups", run.question, run.result.improved_answer)}>Challenge it</button>
                  {run.result.improved_answer && <CopyButton text={run.result.improved_answer} label="Copy" className="btn btn-ghost" />}
                </div>
                {savedMsg && <p className="hint" role="status">{savedMsg}</p>}
              </ResultView>
            )}
            {run.kind === "done" && practise && (
              <Card className="cp-practise">
                <h2>Practise it in your own words</h2>
                <p className="small muted">Say it out loud, type the gist, get scored. Then improve and try again to see what changed.</p>
                <AnswerCoach prompt={run.question} model={run.result.improved_answer} topic={run.result.question_type} jobId={jobId} jobTitle={title} autoFocus />
              </Card>
            )}
          </section>
        </div>
      )}
    </div>
  );
}

function ResultView({ r, onFollowup, children }: { r: CopilotResult; onFollowup(q: string): void; children?: ReactNode }) {
  return (
    <Card className="cp-result">
      {r.headline && <p className="cp-headline">{r.headline}</p>}
      {r.outline.length > 0 && (
        <>
          <div className="field-label">Answer outline</div>
          <ol className="cp-outline">
            {r.outline.map((o, i) => (
              <li key={i}>
                <span>{o.point}</span>
                <span className={"cp-src cp-src-" + o.source}>{SOURCE_LABEL[o.source]}</span>
                {o.quote && <span className="cp-quote">{"“"}{o.quote}{"”"}</span>}
              </li>
            ))}
          </ol>
        </>
      )}
      {r.example && (
        <div className={"cp-example" + (r.example.source === "none" ? " none" : "")}>
          <div className="field-label">{r.example.source === "none" ? "No matching example in your material" : "Your best example"}</div>
          <strong>{r.example.title}</strong>
          {r.example.quote && <p className="cp-quote">{"“"}{r.example.quote}{"”"} <span className="small muted">({r.example.source === "story" ? "your story" : "your resume"})</span></p>}
          {r.example.how_to_use && <p className="small">{r.example.how_to_use}</p>}
        </div>
      )}
      {r.improved_answer && (
        <div className="cp-answer">
          <div className="field-label">Say it like this</div>
          <p>{r.improved_answer}</p>
          {r.unverified.length > 0 && (
            <p className="cp-warn">Check these numbers: <strong>{r.unverified.join(", ")}</strong>. They aren{"’"}t in your resume, stories or draft. Use your real figures or cut them.</p>
          )}
          {/\[[^\]]+\]/.test(r.improved_answer) && <p className="small muted">Replace anything in [brackets] with your real detail.</p>}
        </div>
      )}
      {r.gaps.length > 0 && (
        <div className="cp-gaps">
          <div className="field-label">Prepare or verify</div>
          <ul>{r.gaps.map((g, i) => <li key={i}>{g}</li>)}</ul>
        </div>
      )}
      {r.followups.length > 0 && (
        <div className="cp-followups">
          <div className="field-label">They{"’"}ll likely ask next</div>
          <ul>{r.followups.map((f, i) => <li key={i}><button type="button" className="link-btn" onClick={() => onFollowup(f)}>{f}</button></li>)}</ul>
        </div>
      )}
      {!r.has_resume && <p className="small muted">Tip: add your resume and the coach will build from your real projects instead of general advice.</p>}
      {children}
    </Card>
  );
}

function Library({ onPractise }: { onPractise(q: string): void }) {
  const answers = useAnswers();
  const [filter, setFilter] = useState("");
  const shown = answers.filter((a) => !filter || (a.question + " " + a.answer + " " + a.jobTitle).toLowerCase().includes(filter.toLowerCase()));
  if (!answers.length) return (
    <Card>
      <h2>No saved answers yet</h2>
      <Muted>Build an answer with the AI Interview Coach, or practise a question, then press Save. Your best version of each answer lives here, ready to review before the interview.</Muted>
    </Card>
  );
  return (
    <div className="stack">
      <input className="input" type="search" placeholder="Search your answers" value={filter} onChange={(e) => setFilter(e.target.value)} aria-label="Search your answers" />
      {shown.map((a) => (
        <Card key={a.id} className="cp-lib-item">
          <div className="cp-lib-top">
            <span className="small muted">{a.jobTitle || "General"}{a.score != null ? " · scored " + a.score + "%" : ""}{" · "}{a.source === "copilot" ? "from AI Coach" : "from practice"}</span>
          </div>
          <h3>{a.question}</h3>
          <p>{a.answer}</p>
          <div className="row wrap">
            <button type="button" className="btn btn-small" onClick={() => onPractise(a.question)}>Practise again</button>
            <CopyButton text={a.answer} label="Copy" className="btn btn-ghost btn-small" />
            <button type="button" className="link-btn small" onClick={() => deleteAnswer(a.id)}>Delete</button>
          </div>
        </Card>
      ))}
    </div>
  );
}
