/* DemoTour: a scripted, self-playing tour of everything OfferReady does, in
 * nine short chapters grouped as Prepare → Practise → Interview. Each chapter
 * shows the feature with one consistent sample story (a Senior AI Engineer
 * interview at "Northwind" on Oct 22) and says where to find it in the app.
 * Shown on the home page and full screen at /demo (which is also recorded
 * into the downloadable demo video).
 *
 * Autoplays when on screen; reduced-motion users get each chapter's finished
 * state and move between chapters themselves. */

import { useEffect, useRef, useState, type ReactNode } from "react";
import { Icon, type IconName } from "./Icon";

export const CHAPTER_MS = 7000;

type SceneProps = { t: number };
interface Chapter { phase: string; title: string; line: string; where: string; icon: IconName; url: string; Scene: (p: SceneProps) => ReactNode }

const clamp = (x: number, a = 0, b = 1) => Math.max(a, Math.min(b, x));
/** Progress 0…1 of a sub-animation between two times (ms). */
const seg = (t: number, from: number, to: number) => clamp((t - from) / (to - from));
const typed = (s: string, t: number, from: number, to: number) => s.slice(0, Math.round(seg(t, from, to) * s.length));

/* ---------- 1. Add the job ---------- */
const JOB_URL = "jobs.lever.co/northwind/senior-ai-engineer";
const SKILLS = ["RAG", "Evaluation", "Python", "AWS", "Guardrails"];
function SceneJob({ t }: SceneProps) {
  const loading = t > 1900 && t < 2500;
  const match = Math.round(81 * seg(t, 3200, 4300));
  return (
    <div className="dt-scene">
      <div className="dt-field"><span className="dt-label">Job link</span><span className="dt-input">{typed(JOB_URL, t, 150, 1700)}<i className="dt-caret" /></span></div>
      <div className="dt-row">
        <span className="dt-chip-soft">Interview · Thu, Oct 22</span>
        <span className={"dt-btn" + (t > 1800 && t < 2050 ? " press" : "")}>{loading ? "Reading the job…" : "Add this job"}</span>
      </div>
      {t >= 2500 ? (
        <div className="dt-card dt-in">
          <p className="dt-title">Senior AI Engineer · Northwind</p>
          <div className="dt-chips">{SKILLS.map((s, i) => <span key={s} className={"dt-chip" + (t > 2600 + i * 150 ? " in" : "")}>{s}</span>)}</div>
          <div className="dt-meter"><span>Resume match</span><span className="dt-track"><span style={{ width: match + "%" }} /></span><b>{match}%</b></div>
          {t > 4500 ? <div className="dt-gaps dt-in"><span>Gaps to close first:</span> <em>Evaluation harness</em> <em>Guardrails</em></div> : null}
          {t > 5400 ? <p className="dt-next dt-in"><Icon name="calendar" size={15} /> A 9-day plan to Oct 22, with one next step each day</p> : null}
        </div>
      ) : null}
    </div>
  );
}

/* ---------- 2. Tailor your resume ---------- */
const BEFORE = "Worked on data quality checks";
const AFTER = "Designed data quality checks that stopped bad records before they reached the evaluation dashboards";
function SceneTailor({ t }: SceneProps) {
  const cov = Math.round(12 + 28 * seg(t, 4200, 5400));
  return (
    <div className="dt-scene">
      <div className="dt-card">
        <span className="dt-label">Your bullet</span>
        <p className="dt-before">{BEFORE}</p>
        {t > 900 ? (
          <>
            <span className="dt-label dt-in">Tailored for Northwind</span>
            <p className="dt-after dt-in">{typed(AFTER, t, 1000, 3600)}{t < 3600 ? <i className="dt-caret" /> : null}</p>
          </>
        ) : null}
        {t > 3700 ? <p className="dt-muted dt-in"><Icon name="shield" size={14} /> Never adds employers, titles, dates or numbers you didn’t write.</p> : null}
      </div>
      {t > 4000 ? (
        <div className="dt-card dt-in">
          <div className="dt-meter"><span>Keywords this job looks for</span><span className="dt-track"><span style={{ width: cov + "%" }} /></span><b>{cov}%</b></div>
          <div className="dt-chips">{["Evaluation", "Python", "Guardrails", "RAG"].map((k, i) => <span key={k} className={"dt-chip" + (t > 4400 + i * 250 && i < 2 ? " in hit" : " in")}>{k}</span>)}</div>
        </div>
      ) : null}
    </div>
  );
}

/* ---------- 3. Study library ---------- */
const TOPICS = ["RAG", "Evaluation & observability", "Agents", "System design", "Snowflake", "Kubernetes"];
function SceneStudy({ t }: SceneProps) {
  const hot = Math.min(TOPICS.length - 1, Math.floor(seg(t, 300, 3000) * TOPICS.length));
  return (
    <div className="dt-scene">
      <div className="dt-card">
        <span className="dt-label">Free study library</span>
        <div className="dt-topics">{TOPICS.map((x, i) => <span key={x} className={"dt-topic" + (i === hot && t < 3300 ? " on" : "") + (i === 1 && t >= 3300 ? " pick" : "")}><Icon name="book" size={15} /> {x}</span>)}</div>
      </div>
      {t > 3400 ? (
        <div className="dt-card dt-in">
          <p className="dt-title">Linked from your gaps</p>
          <p className="dt-muted">Evaluation harness → <b>RAG evaluation: offline sets, LLM-as-judge limits, release gates</b></p>
          {t > 4600 ? <p className="dt-next dt-in"><Icon name="check" size={15} /> Role guides, Q&amp;A banks and cheat sheets for AI, data, platform and FDE roles</p> : null}
        </div>
      ) : null}
    </div>
  );
}

/* ---------- 4. Questions + feedback ---------- */
const ANSWER = "I’d build an eval set from real queries, score retrieval and answers separately, and gate releases on it.";
function SceneQuestions({ t }: SceneProps) {
  const graded = t > 2600;
  const retry = t > 4600;
  const score = retry ? Math.round(42 + 19 * seg(t, 4600, 5600)) : 42;
  return (
    <div className="dt-scene">
      <div className="dt-card">
        <span className="dt-label">Question for this job</span>
        <p className="dt-q">How would you evaluate a RAG system in production?</p>
        <p className="dt-answer">{typed(ANSWER, t, 400, 2300)}{t < 2400 ? <i className="dt-caret" /> : null}</p>
      </div>
      {graded ? (
        <div className="dt-card dt-in">
          <div className="dt-scorebar"><b className="dt-score">{score}%</b>{retry ? <span className="dt-delta">+{score - 42} on retry</span> : <span className="dt-muted">Feedback quotes your own words</span>}</div>
          <ul className="dt-crit">
            <li><span>Explains how it works</span><em className={retry ? "ok" : "warn"}>{retry ? "Vague → Solid" : "Vague"}</em></li>
            <li><span>Trade-offs and when not to</span><em className={t > 5300 ? "ok" : "warn"}>{t > 5300 ? "Vague → Solid" : "Vague"}</em></li>
            <li><span>Evidence</span><em className="quote">“score retrieval and answers separately”</em></li>
          </ul>
        </div>
      ) : null}
    </div>
  );
}

/* ---------- 5. AI Interview Coach ---------- */
const OUTLINE: { point: string; src: string }[] = [
  { point: "Lead with the problem: answers were wrong when retrieval missed", src: "Resume" },
  { point: "Your fix: hybrid search plus a re-ranker, measured on an eval set", src: "Story" },
  { point: "Trade-off: re-ranking adds latency, so cache the top queries", src: "General" },
];
function SceneCoach({ t }: SceneProps) {
  return (
    <div className="dt-scene">
      <div className="dt-field"><span className="dt-label">Ask any interview question</span><span className="dt-input">{typed("Tell me about a time you improved retrieval quality", t, 100, 1500)}<i className="dt-caret" /></span></div>
      {t > 1800 ? (
        <div className="dt-card dt-in">
          <span className="dt-label">Answer outline, built from your resume and stories</span>
          <ul className="dt-outline">
            {OUTLINE.map((o, i) => (t > 2000 + i * 700 ? <li key={o.point} className="dt-in"><span className={"dt-src dt-src-" + o.src.toLowerCase()}>{o.src}</span>{o.point}</li> : null))}
          </ul>
          {t > 4400 ? <p className="dt-flag dt-in"><Icon name="shield" size={14} /> “cut errors by 40%” isn’t in your resume. Confirm the real number before you say it.</p> : null}
        </div>
      ) : null}
    </div>
  );
}

/* ---------- 6. Trade-off drill ---------- */
function SceneDrill({ t }: SceneProps) {
  return (
    <div className="dt-scene">
      <div className="dt-card">
        <span className="dt-label">Trade-off drill · Support assistant for 2M customers</span>
        <p className="dt-q">Fine-tune a model, or build RAG over the help centre?</p>
        <div className="dt-choices">
          <span className={"dt-choice" + (t > 1100 ? " on" : "")}>RAG over the help centre</span>
          <span className="dt-choice">Fine-tune</span>
        </div>
      </div>
      {t > 1900 ? <p className="dt-bubble dt-in">The help centre changes daily and your index is two days stale. What now?</p> : null}
      {t > 3300 ? <p className="dt-me dt-in">Incremental re-indexing on publish, plus a freshness check that falls back to search.</p> : null}
      {t > 4900 ? <p className="dt-bubble dt-in">Fine. And when the answer isn’t in the docs at all?</p> : null}
      {t > 6000 ? <p className="dt-next dt-in"><Icon name="check" size={15} /> You held your call through 2 rounds of pushback</p> : null}
    </div>
  );
}

/* ---------- 7. Voice mock ---------- */
function SceneMock({ t }: SceneProps) {
  return (
    <div className="dt-scene">
      <div className="dt-card">
        <span className="dt-label">Voice mock · System design</span>
        <p className="dt-bubble">You chose retrieval over fine-tuning. What happens when retrieval returns nothing useful?</p>
        <div className={"dt-wave" + (t > 900 && t < 3800 ? " live" : "")}>
          {Array.from({ length: 24 }).map((_, i) => <i key={i} style={{ animationDelay: (i % 6) * 0.08 + "s" }} />)}
          <span>{t < 900 ? "Your turn: answer out loud" : t < 3800 ? "Listening…" : "Answered"}</span>
        </div>
      </div>
      {t > 4000 ? (
        <div className="dt-card dt-in">
          <span className="dt-label">Feedback</span>
          <ul className="dt-crit">
            <li><span>Content</span><em className="ok">Strong: clear fallback plan</em></li>
            <li><span>Delivery</span><em className="ok">Clear pace · 2 filler words</em></li>
            <li><span>Follow-up</span><em className="warn">“How would you detect it?”</em></li>
          </ul>
        </div>
      ) : null}
    </div>
  );
}

/* ---------- 8. Readiness ---------- */
function SceneReady({ t }: SceneProps) {
  const ready = Math.round(58 + 22 * seg(t, 600, 3200));
  const ring = `conic-gradient(var(--signal) ${ready * 3.6}deg, var(--signal-soft) 0)`;
  return (
    <div className="dt-scene">
      <div className="dt-card dt-ready">
        <span className="dt-ring" style={{ background: ring }}><b>{ready}</b></span>
        <div>
          <span className="dt-label">Readiness · Senior AI Engineer at Northwind</span>
          <p className="dt-title">{ready >= 80 ? "Ready by Oct 18" : "Getting closer"}</p>
          <p className="dt-muted">{ready >= 80 ? "4 days before your interview on Oct 22" : "From your practice over the last 14 days"}</p>
        </div>
      </div>
      {t > 3600 ? (
        <div className="dt-card dt-in">
          <span className="dt-label">If you fall behind</span>
          <p className="dt-muted">3 days late? Add <b>15 minutes a day</b> and you’re ready in time.</p>
        </div>
      ) : null}
    </div>
  );
}

/* ---------- 9. Interview notes → debrief ---------- */
const NOTES = ["Walk me through your RAG evaluation setup", "How would you handle PII in prompts?"];
function SceneNotes({ t }: SceneProps) {
  const debrief = t > 4200;
  return (
    <div className="dt-scene">
      {!debrief ? (
        <div className="dt-card">
          <span className="dt-label">Interview notes · typed during the real interview</span>
          <span className="dt-input">{t < 2000 ? typed(NOTES[0], t, 100, 1600) : t < 3600 ? typed(NOTES[1], t, 2100, 3400) : ""}<i className="dt-caret" /></span>
          <ol className="dt-notes">
            {t > 1800 ? <li className="dt-in">{NOTES[0]}</li> : null}
            {t > 3500 ? <li className="dt-in">{NOTES[1]}</li> : null}
          </ol>
          {t > 3700 ? <span className="dt-btn dt-in">Done: turn into a debrief</span> : null}
        </div>
      ) : (
        <div className="dt-card dt-in">
          <span className="dt-label">Debrief · rate each question</span>
          <ul className="dt-crit">
            <li><span>{NOTES[0]}</span><em className="ok">Good</em></li>
            <li><span>{NOTES[1]}</span><em className="warn">Bad</em></li>
          </ul>
          {t > 5200 ? <p className="dt-next dt-in"><Icon name="calendar" size={15} /> “PII in prompts” is back in your plan before the next round</p> : null}
        </div>
      )}
    </div>
  );
}

export const CHAPTERS: Chapter[] = [
  { phase: "Prepare", title: "Add the job", line: "Paste the job link and your interview date. See what it needs, your resume match, the gaps and a plan.", where: "Top bar → Add a job", icon: "briefcase", url: "Add a job", Scene: SceneJob },
  { phase: "Prepare", title: "Tailor your resume", line: "Rewrite your bullets for this job’s keywords, without inventing anything.", where: "Your job → Resume tab → Tailor your resume", icon: "fit", url: "Tailor your resume", Scene: SceneTailor },
  { phase: "Prepare", title: "Study the gaps", line: "Free notes on every topic, linked from the gaps in your resume.", where: "Resources → Study library", icon: "book", url: "Study library", Scene: SceneStudy },
  { phase: "Practise", title: "Answer this job’s questions", line: "Feedback quotes your own words. Try again and see each criterion improve.", where: "Practice → Questions for this job", icon: "target", url: "Questions for this job", Scene: SceneQuestions },
  { phase: "Practise", title: "AI Interview Coach", line: "Any question, answered from your resume and stories, with every point labelled.", where: "Top bar → AI Coach", icon: "spark", url: "AI Interview Coach", Scene: SceneCoach },
  { phase: "Practise", title: "Trade-off drills", line: "Make a design call and hold it while the interviewer pushes back.", where: "Practice → Trade-off drills", icon: "shield", url: "Trade-off drills", Scene: SceneDrill },
  { phase: "Interview", title: "Voice mock interview", line: "Answer out loud. Follow-ups on what you said, then content and delivery feedback.", where: "Top bar → Mock interview", icon: "mic", url: "Mock interview", Scene: SceneMock },
  { phase: "Interview", title: "Know when you’re ready", line: "One score per job and the day you’ll be ready, checked against your interview.", where: "Top bar → Readiness", icon: "gauge", url: "Readiness", Scene: SceneReady },
  { phase: "Interview", title: "Interview notes and debrief", line: "Type questions during the real interview. Afterwards they become your debrief.", where: "Your job → After the interview → Take notes", icon: "list", url: "Interview notes", Scene: SceneNotes },
];

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

/** What the narrator says for a chapter. */
export function narration(i: number): string {
  const c = CHAPTERS[i];
  return "Step " + (i + 1) + ". " + c.title.replace("’", "'") + ". " + c.line.replace(/’/g, "'") + " You'll find it at: " + c.where.replace(/ → /g, ", then ") + ".";
}

function canSpeak(): boolean {
  return typeof window !== "undefined" && "speechSynthesis" in window && typeof SpeechSynthesisUtterance !== "undefined";
}

/** A clear English voice if the device has one. */
function pickVoice(): SpeechSynthesisVoice | null {
  const vs = window.speechSynthesis.getVoices().filter((v) => /^en(-|_|$)/i.test(v.lang));
  const pref = [/natural/i, /google us english/i, /samantha/i, /aria|jenny|guy/i, /google uk english female/i, /daniel/i];
  for (const r of pref) { const v = vs.find((x) => r.test(x.name)); if (v) return v; }
  return vs.find((v) => /en-us/i.test(v.lang)) || vs[0] || null;
}

export function DemoTour({ autoStart = false, loop = true, onEnd }: { autoStart?: boolean; loop?: boolean; onEnd?: () => void }) {
  const reduced = useReducedMotion();
  const [step, setStep] = useState(0);
  const [t, setT] = useState(0);
  const [playing, setPlaying] = useState(false);
  const [userPaused, setUserPaused] = useState(false);
  const root = useRef<HTMLDivElement | null>(null);
  const last = useRef(0);
  const tRef = useRef(0);
  const stepRef = useRef(0);
  const [sound, setSound] = useState(false);
  const speaking = useRef(false);
  const speech = canSpeak();

  // Start when scrolled into view (unless reduced motion or paused by the user).
  useEffect(() => {
    if (reduced) { tRef.current = CHAPTER_MS; setT(CHAPTER_MS); return; }
    if (autoStart) { if (!userPaused) setPlaying(true); return; }
    const el = root.current;
    if (!el || !("IntersectionObserver" in window)) { setPlaying(true); return; }
    const io = new IntersectionObserver(([e]) => { if (!userPaused) setPlaying(e.isIntersecting); }, { threshold: 0.35 });
    io.observe(el);
    return () => io.disconnect();
  }, [reduced, autoStart, userPaused]);

  // Clock: refs hold the truth; state mirrors them once per frame.
  useEffect(() => {
    if (!playing || reduced) return;
    last.current = performance.now();
    let raf = 0;
    const tick = (now: number) => {
      const dt = Math.min(100, now - last.current);
      last.current = now;
      let nt = tRef.current + dt;
      let ns = stepRef.current;
      if (nt >= CHAPTER_MS && speaking.current) nt = CHAPTER_MS - 1;
      if (nt >= CHAPTER_MS) {
        if (ns < CHAPTERS.length - 1) { ns += 1; nt = 0; }
        else if (loop) { ns = 0; nt = 0; onEnd?.(); }
        else { nt = CHAPTER_MS; tRef.current = nt; setT(nt); setPlaying(false); onEnd?.(); return; }
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

  // Narration: read each chapter aloud while sound is on and the tour plays.
  useEffect(() => {
    if (!speech) return;
    const synth = window.speechSynthesis;
    synth.cancel();
    speaking.current = false;
    if (!sound || (!playing && !reduced)) return;
    const u = new SpeechSynthesisUtterance(narration(step));
    const v = pickVoice();
    if (v) { u.voice = v; u.lang = v.lang; } else u.lang = "en-US";
    u.rate = 1;
    u.onend = u.onerror = () => { speaking.current = false; };
    speaking.current = true;
    // Never hold a chapter for more than 10 extra seconds if a voice misbehaves.
    const guard = window.setTimeout(() => { speaking.current = false; }, CHAPTER_MS + 10000);
    synth.speak(u);
    return () => { window.clearTimeout(guard); synth.cancel(); speaking.current = false; };
  }, [step, sound, playing, reduced, speech]);
  useEffect(() => () => { if (speech) window.speechSynthesis.cancel(); }, [speech]);

  const toggleSound = () => {
    const on = !sound;
    setSound(on);
    if (on && !playing && !reduced) { setUserPaused(false); setPlaying(true); }
  };

  const go = (i: number) => { const nt = reduced ? CHAPTER_MS : 0; stepRef.current = i; tRef.current = nt; setStep(i); setT(nt); };
  const toggle = () => { setUserPaused(playing); setPlaying(!playing); };
  const ch = CHAPTERS[step];
  const Scene = ch.Scene;
  const phases = Array.from(new Set(CHAPTERS.map((c) => c.phase)));

  return (
    <div className="dt" ref={root}>
      <div className="dt-side">
        {phases.map((ph) => (
          <div key={ph} className="dt-phase">
            <p className="dt-phase-h">{ph}</p>
            <ol className="dt-steps">
              {CHAPTERS.map((c, i) => (c.phase !== ph ? null : (
                <li key={c.title}>
                  <button type="button" className={"dt-step" + (i === step ? " on" : "") + (i < step ? " done" : "")} aria-current={i === step ? "step" : undefined} onClick={() => go(i)}>
                    <span className="dt-num" aria-hidden="true">{i + 1}</span>
                    <span className="dt-step-body">
                      <span className="dt-step-title">{c.title}</span>
                      {i === step ? <span className="dt-step-line">{c.line}</span> : null}
                      {i === step ? <span className="dt-where"><Icon name="arrow" size={13} /> {c.where}</span> : null}
                      {i === step ? <span className="dt-bar" aria-hidden="true"><span style={{ width: Math.round((t / CHAPTER_MS) * 100) + "%" }} /></span> : null}
                    </span>
                  </button>
                </li>
              )))}
            </ol>
          </div>
        ))}
        <div className="dt-ctl">
          {!reduced ? (
            <button type="button" className="btn btn-small" onClick={toggle} aria-label={playing ? "Pause the demo" : "Play the demo"}>{playing ? "Pause" : "Play"}</button>
          ) : null}
          {speech ? (
            <button type="button" className={"btn btn-small dt-sound" + (sound ? " on" : "")} onClick={toggleSound} aria-pressed={sound}
              aria-label={sound ? "Turn narration off" : "Turn narration on"}>
              <Icon name={sound ? "volume" : "mute"} size={15} /> {sound ? "Sound on" : "Sound off"}
            </button>
          ) : null}
          <span className="small muted">{reduced ? "Sample data. Choose a chapter to see it." : "Sample data · about a minute"}</span>
        </div>
      </div>

      <figure className="dt-screen" aria-label={"Demo, chapter " + (step + 1) + " of " + CHAPTERS.length + ": " + ch.title}>
        <div className="hm-app-bar" aria-hidden="true">
          <span className="hm-app-dots"><i /><i /><i /></span>
          <span className="hm-app-url">offerready · {ch.url}</span>
          <span className="hm-app-sample">Sample</span>
        </div>
        <div className="dt-cap" aria-hidden="true">
          <span className="dt-cap-n">{step + 1}/{CHAPTERS.length}</span>
          <span className="dt-cap-t">{ch.title}</span>
          <span className="dt-cap-w">{ch.where}</span>
        </div>
        <div className="dt-stage" aria-hidden="true" key={step}>
          <Scene t={t} />
        </div>
      </figure>
    </div>
  );
}
