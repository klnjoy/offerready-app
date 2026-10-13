/* DemoTour: a scripted, self-playing walkthrough of OfferReady in three steps
 * (Add the job → Practise → Rehearse and get ready), shown on the home page
 * and full-screen at /demo. One consistent sample story, clearly marked as
 * sample data. Each step plays for STEP_MS; the step list doubles as chapters.
 *
 * Autoplays when on screen; reduced-motion users get each step's finished
 * state and move between steps themselves. */

import { useEffect, useRef, useState } from "react";
import { Icon, type IconName } from "./Icon";

const STEP_MS = 9000;

const STEPS: { title: string; line: string; icon: IconName }[] = [
  { title: "Add the job", line: "Paste the job link and your interview date. See what the role needs, your resume match and a plan to the day.", icon: "briefcase" },
  { title: "Practise what it will ask", line: "Answer the questions this job will ask. Feedback quotes your own words; try again and watch the score move.", icon: "target" },
  { title: "Rehearse and get ready", line: "A voice mock follows up on what you said. Readiness rises, and you see the day you’ll be ready.", icon: "mic" },
];

const URL = "jobs.lever.co/northwind/senior-ai-engineer";
const SKILLS = ["RAG", "Evaluation", "Python", "AWS", "Guardrails"];
const ANSWER = "I’d build an eval set from real queries, score retrieval and answers separately, and gate releases on it.";

const clamp = (x: number, a = 0, b = 1) => Math.max(a, Math.min(b, x));
/** Progress 0…1 of a sub-animation between two times (ms). */
const seg = (t: number, from: number, to: number) => clamp((t - from) / (to - from));

function useReducedMotion(): boolean {
  const [r, setR] = useState(() => typeof window !== "undefined" && !!window.matchMedia && window.matchMedia("(prefers-reduced-motion: reduce)").matches);
  useEffect(() => {
    if (!window.matchMedia) return;
    const m = window.matchMedia("(prefers-reduced-motion: reduce)");
    const on = () => setR(m.matches);
    m.addEventListener?.("change", on);
    return () => m.removeEventListener?.("change", on);
  }, []);
  return r;
}

export function DemoTour({ autoStart = false, onEnd }: { autoStart?: boolean; onEnd?: () => void }) {
  const reduced = useReducedMotion();
  const [step, setStep] = useState(0);
  const [t, setT] = useState(0);
  const [playing, setPlaying] = useState(false);
  const [userPaused, setUserPaused] = useState(false);
  const root = useRef<HTMLDivElement | null>(null);
  const last = useRef<number>(0);

  // Start when scrolled into view (unless reduced motion or paused by the user).
  useEffect(() => {
    if (reduced) { setT(STEP_MS); return; }
    if (autoStart) { setPlaying(true); return; }
    const el = root.current;
    if (!el || !("IntersectionObserver" in window)) { setPlaying(true); return; }
    const io = new IntersectionObserver(([e]) => { if (!userPaused) setPlaying(e.isIntersecting); }, { threshold: 0.35 });
    io.observe(el);
    return () => io.disconnect();
  }, [reduced, autoStart, userPaused]);

  // Clock: refs hold the truth, state mirrors them once per frame (no side
  // effects inside state updaters, so StrictMode can't double-advance).
  const tRef = useRef(0);
  const stepRef = useRef(0);
  useEffect(() => { tRef.current = t; stepRef.current = step; }, [t, step]);
  useEffect(() => {
    if (!playing || reduced) return;
    last.current = performance.now();
    let raf = 0;
    const tick = (now: number) => {
      const dt = Math.min(100, now - last.current);
      last.current = now;
      let nt = tRef.current + dt;
      let ns = stepRef.current;
      if (nt >= STEP_MS) {
        nt = 0;
        if (ns < STEPS.length - 1) ns += 1;
        else { ns = 0; onEnd?.(); }
      }
      tRef.current = nt;
      stepRef.current = ns;
      setT(nt);
      setStep(ns);
      raf = requestAnimationFrame(tick);
    };
    raf = requestAnimationFrame(tick);
    return () => cancelAnimationFrame(raf);
  }, [playing, reduced]); // eslint-disable-line react-hooks/exhaustive-deps

  const go = (i: number) => { const nt = reduced ? STEP_MS : 0; stepRef.current = i; tRef.current = nt; setStep(i); setT(nt); };
  const toggle = () => { setUserPaused(playing); setPlaying(!playing); };

  return (
    <div className="dt" ref={root}>
      <ol className="dt-steps" aria-label="Demo steps">
        {STEPS.map((s, i) => {
          const pct = i < step ? 100 : i === step ? Math.round((t / STEP_MS) * 100) : 0;
          return (
            <li key={s.title}>
              <button type="button" className={"dt-step" + (i === step ? " on" : "") + (i < step ? " done" : "")} aria-current={i === step ? "step" : undefined} onClick={() => go(i)}>
                <span className="dt-num" aria-hidden="true">{i + 1}</span>
                <span className="dt-step-body">
                  <span className="dt-step-title">Step {i + 1}: {s.title}</span>
                  {i === step ? <span className="dt-step-line">{s.line}</span> : null}
                  <span className="dt-bar" aria-hidden="true"><span style={{ width: pct + "%" }} /></span>
                </span>
              </button>
            </li>
          );
        })}
        {!reduced ? (
          <li className="dt-ctl">
            <button type="button" className="btn btn-small" onClick={toggle} aria-label={playing ? "Pause the demo" : "Play the demo"}>
              {playing ? "Pause" : "Play"}
            </button>
            <span className="small muted">Sample data</span>
          </li>
        ) : <li className="dt-ctl"><span className="small muted">Sample data. Choose a step to see it.</span></li>}
      </ol>

      <figure className="dt-screen" aria-label={"Demo, step " + (step + 1) + ": " + STEPS[step].title}>
        <div className="hm-app-bar" aria-hidden="true">
          <span className="hm-app-dots"><i /><i /><i /></span>
          <span className="hm-app-url">offerready · {["Add a job", "Practice", "Mock interview"][step]}</span>
          <span className="hm-app-sample">Sample</span>
        </div>
        <div className="dt-stage" aria-hidden="true">
          {step === 0 ? <SceneJob t={t} /> : step === 1 ? <ScenePractice t={t} /> : <SceneReady t={t} />}
        </div>
      </figure>
    </div>
  );
}

function SceneJob({ t }: { t: number }) {
  const typed = URL.slice(0, Math.round(seg(t, 200, 2300) * URL.length));
  const loading = t > 2500 && t < 3300;
  const shown = t >= 3300;
  const match = Math.round(81 * seg(t, 4300, 5600));
  return (
    <div className="dt-scene">
      <div className="dt-field">
        <span className="dt-label">Job link</span>
        <span className="dt-input">{typed}<i className="dt-caret" /></span>
      </div>
      <div className="dt-row">
        <span className="dt-chip-soft">Interview · Thu, Oct 22</span>
        <span className={"dt-btn" + (t > 2400 && t < 2700 ? " press" : "")}>{loading ? "Reading the job…" : "Add this job"}</span>
      </div>
      {shown ? (
        <div className="dt-card dt-in">
          <p className="dt-title">Senior AI Engineer · Northwind</p>
          <div className="dt-chips">
            {SKILLS.map((s, i) => <span key={s} className={"dt-chip" + (t > 3400 + i * 180 ? " in" : "")}>{s}</span>)}
          </div>
          <div className="dt-meter">
            <span>Resume match</span>
            <span className="dt-track"><span style={{ width: match + "%" }} /></span>
            <b>{match}%</b>
          </div>
          {t > 5800 ? (
            <div className="dt-gaps dt-in">
              <span>Gaps to close first:</span> <em>Evaluation harness</em> <em>Guardrails</em>
            </div>
          ) : null}
          {t > 7000 ? <p className="dt-next dt-in"><Icon name="calendar" size={15} /> A 9-day plan to Oct 22 · next: a trade-off drill on evaluation</p> : null}
        </div>
      ) : null}
    </div>
  );
}

function ScenePractice({ t }: { t: number }) {
  const typed = ANSWER.slice(0, Math.round(seg(t, 600, 3000) * ANSWER.length));
  const graded = t > 3400;
  const retry = t > 6000;
  const score = retry ? Math.round(42 + 19 * seg(t, 6000, 7200)) : 42;
  return (
    <div className="dt-scene">
      <div className="dt-card">
        <span className="dt-label">Question for this job</span>
        <p className="dt-q">How would you evaluate a RAG system in production?</p>
        <p className="dt-answer">{typed}{t < 3200 ? <i className="dt-caret" /> : null}</p>
      </div>
      {graded ? (
        <div className="dt-card dt-in">
          <div className="dt-scorebar">
            <b className="dt-score">{score}%</b>
            {retry ? <span className="dt-delta">+{score - 42} on retry</span> : <span className="dt-muted">Solid start</span>}
          </div>
          <ul className="dt-crit">
            <li><span>Explains how it works</span><em className={retry ? "ok" : "warn"}>{retry ? "Vague → Solid" : "Vague"}</em></li>
            <li><span>Trade-offs and when not to</span><em className={t > 6800 ? "ok" : "warn"}>{t > 6800 ? "Vague → Solid" : "Vague"}</em></li>
            <li><span>Evidence</span><em className="quote">“score retrieval and answers separately”</em></li>
          </ul>
        </div>
      ) : null}
    </div>
  );
}

function SceneReady({ t }: { t: number }) {
  const ready = Math.round(58 + 22 * seg(t, 4600, 6600));
  const ring = `conic-gradient(var(--signal) ${ready * 3.6}deg, var(--signal-soft) 0)`;
  return (
    <div className="dt-scene">
      <div className="dt-card">
        <span className="dt-label">Voice mock · System design</span>
        <p className="dt-bubble">You chose retrieval over fine-tuning. What happens when retrieval returns nothing useful?</p>
        <div className={"dt-wave" + (t > 1200 && t < 4200 ? " live" : "")}>
          {Array.from({ length: 24 }).map((_, i) => <i key={i} style={{ animationDelay: (i % 6) * 0.08 + "s" }} />)}
          <span>{t < 1200 ? "Your turn" : t < 4200 ? "Listening…" : "Follow-up answered · delivery: clear, 2 filler words"}</span>
        </div>
      </div>
      {t > 4400 ? (
        <div className="dt-card dt-ready dt-in">
          <span className="dt-ring" style={{ background: ring }}><b>{ready}</b></span>
          <div>
            <span className="dt-label">Readiness</span>
            <p className="dt-title">{ready >= 80 ? "Ready by Oct 18" : "Getting closer"}</p>
            <p className="dt-muted">{ready >= 80 ? "4 days before your interview on Oct 22" : "From your practice this week"}</p>
          </div>
        </div>
      ) : null}
    </div>
  );
}
