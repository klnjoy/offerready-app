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

import { useEffect, useMemo, useRef, useState, type ReactNode } from "react";
import * as api from "../lib/api";
import type { CopilotRefine, CopilotResult, CopilotSource } from "../lib/api";
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
import { UpgradeCard } from "../components/PlanGate";
import { CopyButton } from "../components/StreamDraft";
import { Card, Loading, Muted } from "../components/ui";
import type { Analysis, GapRow, GeneratedQuestion } from "../types";

/** One-tap changes after an answer (no mode to pick before asking). */
const REFINES: { key: CopilotRefine; label: string }[] = [
  { key: "shorter", label: "Shorter" },
  { key: "numbers", label: "Add numbers" },
  { key: "star", label: "STAR format" },
  { key: "technical", label: "More technical" },
  { key: "example", label: "Different example" },
];
const REFINE_DONE: Record<CopilotRefine, string> = {
  shorter: "Shorter version", numbers: "With numbers", star: "STAR version", technical: "More technical", example: "Different example",
};

const SOURCE_LABEL: Record<CopilotSource, string> = {
  resume: "Your resume",
  story: "Your story",
  you: "Your words",
  general: "General knowledge",
  suggestion: "Suggestion: only if true for you",
};

type Turn = {
  id: number;
  question: string;
  /** Set when this turn is a follow-up to the turn before it. */
  followup?: boolean;
  state: "busy" | "done" | "error" | "limit";
  result?: CopilotResult;
  /** The refinement that produced the current result, if any. */
  refined?: CopilotRefine;
  msg?: string;
};

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
  const [turns, setTurns] = useState<Turn[]>([]);
  const nextId = useRef(1);
  const endRef = useRef<HTMLDivElement | null>(null);

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
    setTimeout(() => { const a = getActiveJob(); if (a) { setJobId((cur) => (cur === a ? cur : a)); setTurns([]); } }, 0);
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
  const busy = turns.some((t) => t.state === "busy");
  // Hard questions for YOU: built from the gaps between your resume and the
  // job, plus two every interview asks. (The job's full question list lives
  // on Practice › Questions for this job; it isn't repeated here.)
  const starters = useMemo(() => {
    const role = title || "this role";
    const out = [
      "Tell me about yourself, for a " + role + " role.",
      ...gaps.slice(0, 4).map((g) => {
        const t = String(g).replace(/^(direct|proven|demonstrated|strong|solid|specific|deep|extensive|prior|relevant|hands-on)\s+/i, "").replace(/^(experience|background|exposure)\s+(with|in|of)\s+/i, "");
        return /^(leading|building|managing|running|owning)\b/i.test(t) ? "Tell me about your experience " + t + "." : "What's your experience with " + t + "?";
      }),
      "Why do you want this role, and why now?",
    ];
    return Array.from(new Set(out)).slice(0, 6);
  }, [gaps, title]);
  const autoAsked = useRef(false);
  useEffect(() => {
    if (autoAsked.current || params.get("ask") !== "1" || !question.trim() || jobs.status !== "ready") return;
    if (jobId && !detail) return; // wait for the job, so the answer fits it
    autoAsked.current = true;
    void ask({ q: question });
  }, [detail, jobs.status, jobId]); // eslint-disable-line react-hooks/exhaustive-deps

  /** Ask the coach. A new question starts a turn; a refinement or follow-up
   * builds on the latest answer, so the thread reads like a conversation. */
  const ask = async (opts: { q?: string; refine?: CopilotRefine; turnId?: number; followup?: boolean } = {}) => {
    const base = opts.turnId != null ? turns.find((t) => t.id === opts.turnId) : null;
    const text = (opts.q ?? base?.question ?? question).trim();
    if (text.length < 8) { setTurns((ts) => [...ts.filter((t) => t.state !== "error" || t.result), { id: nextId.current++, question: text, state: "error", msg: "Type the interview question first (a full sentence works best)." }]); return; }
    const prevAnswer = base?.result ? (base.result.improved_answer || "") : "";
    const last = [...turns].reverse().find((t) => t.state === "done" && t.result);
    const thread = opts.followup && last?.result ? { question: last.question, answer: last.result.short_answer || last.result.improved_answer } : undefined;
    const id = base ? base.id : nextId.current++;
    setTurns((ts): Turn[] => {
      const kept = ts.filter((t) => t.state !== "error" || !!t.result);
      return base
        ? kept.map((t): Turn => (t.id === id ? { ...t, state: "busy" } : t))
        : [...(opts.followup ? kept : []), { id, question: text, followup: !!opts.followup, state: "busy" as const }].slice(-6);
    });
    if (!base) { setQuestion(""); window.setTimeout(() => endRef.current?.scrollIntoView({ behavior: "smooth", block: "start" }), 60); }
    const tok = await auth.getAccessToken();
    const res = await api.copilot(tok, {
      mode: "answer", question: text, jobTitle: title, requirements, gaps,
      resume: resume?.text || "", stories: stories.slice(0, 8).map(storyText),
      ...(opts.refine ? { refine: opts.refine, previous: prevAnswer } : {}),
      ...(thread ? { thread } : {}),
    });
    const patch = (p: Partial<Turn>) => setTurns((ts) => ts.map((t) => (t.id === id ? { ...t, ...p } : t)));
    if (res.status === 200 && res.body?.result) {
      invalidatePlan();
      track("copilot_used", { mode: opts.refine || (opts.followup ? "followup" : "answer") });
      patch({ state: "done", result: res.body.result, refined: opts.refine, msg: undefined });
    } else {
      const msg = res.status === 403 ? res.body?.error || "You’ve used your AI coaching for now."
        : res.status === 401 ? "Your session expired. Sign in again and retry."
        : res.status === 503 ? "The AI Interview Coach isn’t switched on for this site yet."
        : res.status === 0 ? "Couldn’t reach the AI Interview Coach. Check your connection and try again."
        : res.body?.error || "The AI Interview Coach couldn’t build an answer this time. Please try again.";
      // A failed refinement keeps the answer you had.
      patch(base?.result ? { state: "done", msg } : { state: res.status === 403 ? "limit" : "error", msg });
    }
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
        <Library onPractise={(q) => { setTab("copilot"); setTurns([]); void ask({ q }); }} />
      ) : (
        <div className="cp2">
          <div className="cp2-ctx" aria-label="What the coach uses">
            <span className="cp2-ctx-k">Using</span>
            {jobs.status === "ready" && jobs.jobs.length > 0 ? (
              jobs.jobs.length > 1 ? (
                <label className="cp2-chip cp2-job">
                  <span className="hm-sr">Job</span>
                  <select value={jobId} onChange={(e) => { setJobId(e.target.value); setActiveJob(e.target.value); setTurns([]); }} aria-label="Job">
                    {jobs.jobs.map((j) => <option key={j.id} value={j.id}>{displayJobTitle(j)}</option>)}
                  </select>
                </label>
              ) : <span className="cp2-chip">{title}</span>
            ) : <Link className="cp2-chip is-warn" to="/analyze">Add a job</Link>}
            <Link className={"cp2-chip" + (resume ? " is-ok" : " is-warn")} to={jobId ? "/jobs/" + encodeURIComponent(jobId) + "?tab=resume" : "/account"}>{resume ? "✓ Resume" : "+ Add resume"}</Link>
            <Link className={"cp2-chip" + (stories.length ? " is-ok" : " is-warn")} to="/stories">{stories.length ? "✓ " + stories.length + (stories.length === 1 ? " story" : " stories") : "+ Add a story"}</Link>
          </div>

          <form className="cp2-ask" onSubmit={(e) => { e.preventDefault(); void ask({ q: question, followup: false }); }}>
            <label className="hm-sr" htmlFor="cp-q">Ask any interview question</label>
            <textarea id="cp-q" className="input" rows={2} value={question} placeholder="Ask any interview question…"
              onChange={(e) => setQuestion(e.target.value)}
              onKeyDown={(e) => { if (e.key === "Enter" && !e.shiftKey) { e.preventDefault(); void ask({ q: question }); } }} />
            <button type="submit" className="btn btn-primary cp2-go" disabled={busy || question.trim().length < 8}>{busy ? "…" : "Ask"}</button>
          </form>

          {turns.length === 0 && (
            <section className="tdy" aria-labelledby="cp2-qs-h">
              <div className="tdy-head"><h2 id="cp2-qs-h">Hard questions for you</h2><span className="small muted">{gaps.length ? "From your gaps" : "Start here"}</span></div>
              <ul className="tdy-group cp2-qs">
                {starters.map((q) => (
                  <li key={q}>
                    <button type="button" className="tdy-grow" onClick={() => void ask({ q })}>
                      <span className="tdy-text"><strong className="cp2-q">{q}</strong></span>
                      <span className="tdy-chev" aria-hidden="true">›</span>
                    </button>
                  </li>
                ))}
              </ul>
              <p className="small muted cp2-note">
                {jobId ? <>Your job{"’"}s full question list is in <Link to={"/questions?job=" + encodeURIComponent(jobId)}>Practice › Questions for this job</Link>. </> : null}
                The coach builds only from your resume and stories.
              </p>
            </section>
          )}

          <div ref={endRef} />
          {turns.map((t, i) => (
            <TurnView key={t.id} t={t} isLast={i === turns.length - 1} jobId={jobId} title={title} busy={busy}
              onRefine={(r) => void ask({ turnId: t.id, refine: r })}
              onFollowup={(q) => void ask({ q, followup: true })}
              onRetry={() => void ask({ turnId: t.id })} />
          ))}
          {turns.length > 0 && !busy && (
            <button type="button" className="link-btn small cp2-new" onClick={() => { setTurns([]); setQuestion(""); }}>Start a new question</button>
          )}
        </div>
      )}
    </div>
  );
}

/** One question and its answer, with refinements, practice and follow-ups. */
function TurnView({ t, isLast, jobId, title, busy, onRefine, onFollowup, onRetry }: {
  t: Turn; isLast: boolean; jobId: string; title: string; busy: boolean;
  onRefine(r: CopilotRefine): void; onFollowup(q: string): void; onRetry(): void;
}) {
  const [len, setLen] = useState<"short" | "full">("short");
  const [practise, setPractise] = useState(false);
  const [saved, setSaved] = useState(false);
  const r = t.result;
  useEffect(() => { setSaved(false); setPractise(false); }, [r]);
  const shown = r ? (len === "short" && r.short_answer ? r.short_answer : r.improved_answer) : "";
  return (
    <article className={"cp2-turn" + (t.followup ? " is-follow" : "")} aria-busy={t.state === "busy"}>
      <p className="cp2-turn-q">{t.followup ? <span className="cp2-tag">Follow-up</span> : null}{t.question}</p>
      {t.state === "busy" && !r && <Loading>Building from your resume and stories{"…"}</Loading>}
      {t.state === "error" && <p className="error" role="alert">{t.msg} <button type="button" className="link-btn" onClick={onRetry}>Try again</button></p>}
      {t.state === "limit" && <UpgradeCard feature="ai_grading" message={t.msg || ""} />}
      {r && (
        <ResultView r={r} len={len} onLen={setLen} shown={shown} refined={t.refined} busy={t.state === "busy"}>
          {t.msg && <p className="error small" role="alert">{t.msg}</p>}
          <div className="cp2-refine" role="group" aria-label="Change this answer">
            {REFINES.map((x) => (
              <button key={x.key} type="button" className={"cp-chip" + (t.refined === x.key ? " on" : "")} disabled={busy} onClick={() => onRefine(x.key)}>{x.label}</button>
            ))}
          </div>
          <div className="cp2-actions">
            <button type="button" className="btn btn-primary" onClick={() => setPractise((v) => !v)} aria-expanded={practise}>{practise ? "Hide practice" : "Practise saying it"}</button>
            <button type="button" className="btn" disabled={saved || !r.improved_answer} onClick={() => { saveAnswer({ jobId, jobTitle: title, question: t.question, answer: r.improved_answer, score: null, source: "copilot" }); setSaved(true); }}>{saved ? "Saved ✓" : "Save"}</button>
            {shown && <CopyButton text={shown} label="Copy" className="btn btn-ghost" />}
          </div>
          {practise && (
            <div className="cp-practise">
              <p className="small muted">Say it out loud in your own words, type the gist, and get scored. The coach{"’"}s answer stays hidden unless you open {"“"}Show strong answer{"”"}.</p>
              <AnswerCoach prompt={t.question} model={r.improved_answer} topic={r.question_type} jobId={jobId} jobTitle={title} autoFocus />
            </div>
          )}
          {isLast && r.followups.length > 0 && (
            <div className="cp2-next">
              <span className="field-label">They{"’"}ll likely ask next</span>
              <div className="cp2-next-list">
                {r.followups.slice(0, 3).map((f) => <button key={f} type="button" className="cp-chip" disabled={busy} onClick={() => onFollowup(f)}>{f}</button>)}
              </div>
            </div>
          )}
        </ResultView>
      )}
    </article>
  );
}

function ResultView({ r, len, onLen, shown, refined, busy, children }: {
  r: CopilotResult; len: "short" | "full"; onLen(l: "short" | "full"): void; shown: string; refined?: CopilotRefine; busy?: boolean; children?: ReactNode;
}) {
  const hasShort = !!r.short_answer;
  return (
    <Card className={"cp-result cp2-result" + (busy ? " is-busy" : "")}>
      {refined && <span className="cp2-tag cp2-tag-ok">{REFINE_DONE[refined]}</span>}
      {r.headline && <p className="cp-headline">{r.headline}</p>}
      {hasShort && (
        <div className="cp2-len" role="tablist" aria-label="Answer length">
          <button type="button" role="tab" aria-selected={len === "short"} className={len === "short" ? "on" : ""} onClick={() => onLen("short")}>30 seconds</button>
          <button type="button" role="tab" aria-selected={len === "full"} className={len === "full" ? "on" : ""} onClick={() => onLen("full")}>Full answer</button>
        </div>
      )}
      {shown && <p className="cp2-say">{shown}</p>}
      {r.unverified.length > 0 && (
        <p className="cp-warn">Check these numbers: <strong>{r.unverified.join(", ")}</strong>. They aren{"’"}t in your resume or stories. Use your real figures or cut them.</p>
      )}
      {/\[[^\]]+\]/.test(shown) && <p className="small muted">Replace anything in [brackets] with your real detail.</p>}
      {(r.key_points || []).length > 0 && (
        <div className="cp2-keys">
          <span className="field-label">Remember</span>
          <ol>{r.key_points!.map((k, i) => <li key={i}>{k}</li>)}</ol>
        </div>
      )}
      {(r.outline.length > 0 || r.example || r.gaps.length > 0) && (
        <details className="cp2-src">
          <summary>Where this comes from{r.outline.length ? " · " + r.outline.filter((o) => o.source === "resume" || o.source === "story").length + " from your material" : ""}</summary>
          {r.example && (
            <div className={"cp-example" + (r.example.source === "none" ? " none" : "")}>
              <div className="field-label">{r.example.source === "none" ? "No matching example in your material" : "Your best example"}</div>
              <strong>{r.example.title}</strong>
              {r.example.quote && <p className="cp-quote">{"“"}{r.example.quote}{"”"} <span className="small muted">({r.example.source === "story" ? "your story" : "your resume"})</span></p>}
              {r.example.how_to_use && <p className="small">{r.example.how_to_use}</p>}
            </div>
          )}
          {r.outline.length > 0 && (
            <ol className="cp-outline">
              {r.outline.map((o, i) => (
                <li key={i}>
                  <span>{o.point}</span>
                  <span className={"cp-src cp-src-" + o.source}>{SOURCE_LABEL[o.source]}</span>
                  {o.quote && <span className="cp-quote">{"“"}{o.quote}{"”"}</span>}
                </li>
              ))}
            </ol>
          )}
          {r.gaps.length > 0 && (
            <div className="cp-gaps">
              <div className="field-label">Prepare or verify</div>
              <ul>{r.gaps.map((g, i) => <li key={i}>{g}</li>)}</ul>
            </div>
          )}
        </details>
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
