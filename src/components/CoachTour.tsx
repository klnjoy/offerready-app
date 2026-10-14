/* CoachTour: a self-playing walkthrough of the AI Interview Coach, using the
 * same player as the product demo. Seven short chapters on one sample job
 * (Senior AI Engineer at Northwind) and one sample resume. Shown on the
 * signed-out /coach page and on /demo. */

import { DemoTour, typed, type Chapter, type SceneProps } from "./DemoTour";
import { Icon } from "./Icon";

const Q = "Tell me about a time you improved an AI system’s quality.";
const SUGGESTED = ["How would you evaluate a RAG system?", Q, "How do you keep PII out of prompts?"];

/* 1. Ask */
function SceneAsk({ t }: SceneProps) {
  return (
    <div className="dt-scene">
      <div className="dt-card">
        <span className="dt-label">Questions predicted for this job</span>
        <div className="dt-chips">{SUGGESTED.map((s, i) => <span key={s} className={"dt-chip" + (t > 300 + i * 250 ? " in" : "") + (i === 1 && t > 1800 ? " hit" : "")}>{s}</span>)}</div>
      </div>
      <div className="dt-field">
        <span className="dt-label">Or type any question you were asked, or expect</span>
        <span className="dt-input">{typed(Q, t, 2000, 4200)}<i className="dt-caret" /></span>
      </div>
      {t > 4600 ? <span className="dt-btn dt-in">Build my answer</span> : null}
    </div>
  );
}

/* 2. Grounded in your job and your material */
function SceneContext({ t }: SceneProps) {
  const rows: [string, string][] = [
    ["Job", "Senior AI Engineer at Northwind"],
    ["What it asks for", "RAG, evaluation, Python, AWS, guardrails"],
    ["Your gaps", "Guardrails in production"],
    ["Your resume", "7 years · RAG assistant · ETL migration"],
    ["Your stories", "3 STAR stories saved"],
  ];
  return (
    <div className="dt-scene">
      <div className="dt-card">
        <span className="dt-label">What the coach reads before it answers</span>
        <ul className="dt-crit">
          {rows.map(([k, v], i) => (t > 300 + i * 700 ? <li key={k} className="dt-in"><span>{k}</span><em className="quote">{v}</em></li> : null))}
        </ul>
      </div>
      {t > 4200 ? <p className="dt-next dt-in"><Icon name="lock" size={15} /> Your resume stays on your device; it is sent only with the question you ask.</p> : null}
    </div>
  );
}

/* 3. Outline, every point labelled */
const OUTLINE: { p: string; src: "Resume" | "Story" | "General"; quote?: string }[] = [
  { p: "Situation: the support assistant gave wrong answers", src: "Resume", quote: "RAG assistant over 40k support articles" },
  { p: "Action: built an eval set first, then tuned retrieval", src: "Story", quote: "We measured before changing anything" },
  { p: "Result: accuracy on the eval set from 61% to 84%", src: "Resume", quote: "rose from 61% to 84%" },
  { p: "Close with what you learned about measuring first", src: "General" },
];
function SceneOutline({ t }: SceneProps) {
  return (
    <div className="dt-scene">
      <div className="dt-card">
        <span className="dt-label">Answer outline · where each point came from</span>
        <ul className="dt-outline">
          {OUTLINE.map((o, i) => (t > 400 + i * 1100 ? (
            <li key={o.p} className="dt-in">
              <span className={"dt-src dt-src-" + o.src.toLowerCase()}>{o.src === "General" ? "General knowledge" : "Your " + o.src.toLowerCase()}</span>
              <span>{o.p}{o.quote ? <em className="ct-quote"> “{o.quote}”</em> : null}</span>
            </li>
          ) : null))}
        </ul>
      </div>
      {t > 5000 ? <p className="dt-muted dt-in">Points from your resume or stories quote your own words. General knowledge is marked, so you know the difference.</p> : null}
    </div>
  );
}

/* 4. Say it like this */
const SAY = "Our support assistant answered from 40,000 articles and was often wrong. Before changing anything, I built an evaluation set from real questions. Then I tuned retrieval against it, and accuracy went from 61% to 84%.";
function SceneSay({ t }: SceneProps) {
  return (
    <div className="dt-scene">
      <div className="dt-card">
        <span className="dt-label">Your best example</span>
        <p className="dt-title">RAG assistant for support <span className="dt-muted">· from your resume</span></p>
      </div>
      {t > 900 ? (
        <div className="dt-card dt-in">
          <span className="dt-label">Say it like this · about 40 seconds out loud</span>
          <p className="dt-answer">{typed(SAY, t, 1100, 5600)}{t < 5600 ? <i className="dt-caret" /> : null}</p>
        </div>
      ) : null}
    </div>
  );
}

/* 5. Check the numbers */
function SceneCheck({ t }: SceneProps) {
  return (
    <div className="dt-scene">
      <div className="dt-card">
        <span className="dt-label">Say it like this</span>
        <p className="dt-answer">…and we <mark className={"ct-mark" + (t > 1200 ? " on" : "")}>cut support tickets by 30%</mark> within a quarter, with a team of <mark className={"ct-mark" + (t > 1800 ? " on" : "")}>[team size]</mark>.</p>
      </div>
      {t > 2400 ? <p className="dt-flag dt-in"><Icon name="shield" size={14} /> “cut support tickets by 30%” isn’t in your resume, stories or draft. Use your real figure or cut it.</p> : null}
      {t > 4000 ? <p className="dt-next dt-in"><Icon name="check" size={15} /> Anything in [brackets] is yours to fill in. The coach never invents your numbers silently.</p> : null}
    </div>
  );
}

/* 6. Pick how it helps */
const MODES = ["Build my answer", "Find my best example", "STAR it", "Explain the trade-off", "System design outline", "Likely follow-ups"];
function SceneModes({ t }: SceneProps) {
  const on = t > 1500;
  return (
    <div className="dt-scene">
      <div className="dt-card">
        <span className="dt-label">What should the coach do?</span>
        <div className="dt-chips">{MODES.map((m, i) => <span key={m} className={"dt-chip" + (t > 200 + i * 150 ? " in" : "") + (i === 3 && on ? " hit" : "")}>{m}</span>)}</div>
        <p className="dt-q">Why retrieval instead of fine-tuning?</p>
      </div>
      {t > 2000 ? (
        <div className="dt-card dt-in">
          <span className="dt-label">Explain the trade-off</span>
          <ul className="dt-crit">
            {[["Options", "RAG over the help centre, or fine-tune"], ["You give up", "a little latency for re-ranking"], ["It flips when", "the knowledge is small and rarely changes"]].map(([k, v], i) => (t > 2300 + i * 700 ? <li key={k} className="dt-in"><span>{k}</span><em className="quote">{v}</em></li> : null))}
          </ul>
        </div>
      ) : null}
      {t > 4800 ? <p className="dt-next dt-in"><Icon name="target" size={15} /> Then: Make it more concise, or Challenge it to hear the push-back.</p> : null}
    </div>
  );
}

/* 7. Follow-ups, then practise out loud */
const FOLLOW = ["How did you build the eval set?", "What did you change in retrieval?", "How did you know it held up in production?"];
function SceneRehearse({ t }: SceneProps) {
  const score = t < 3600 ? 42 : Math.round(42 + 19 * Math.min(1, (t - 3600) / 900));
  return (
    <div className="dt-scene">
      <div className="dt-card">
        <span className="dt-label">They’ll likely ask next</span>
        <ul className="dt-crit">
          {FOLLOW.map((f, i) => (t > 200 + i * 400 ? <li key={f} className="dt-in"><span>{f}</span><em className="quote">tap to answer</em></li> : null))}
        </ul>
      </div>
      {t > 1600 ? (
        <div className="dt-card dt-in">
          <span className="dt-label">Practise this question · say it out loud, then get scored</span>
          <div className="dt-scorebar"><b className="dt-score">{score}%</b>{t > 3600 ? <span className="dt-delta">+{score - 42} on your second try</span> : <span className="dt-muted">First try</span>}</div>
        </div>
      ) : null}
      {t > 5000 ? <p className="dt-muted dt-in">For practice before the interview. In the real one you answer yourself; the only tool open is a plain notepad.</p> : null}
    </div>
  );
}

export const COACH_CHAPTERS: Chapter[] = [
  { phase: "Ask", title: "Ask any interview question", line: "Pick one predicted for your job, or type a question you were asked or expect.", where: "Top bar → AI Coach", icon: "chat", url: "AI Interview Coach", Scene: SceneAsk },
  { phase: "Ask", title: "It reads your job and your material", line: "The job’s requirements, your gaps, your resume and your saved stories.", where: "AI Coach → choose the job at the top", icon: "briefcase", url: "AI Interview Coach", Scene: SceneContext },
  { phase: "Build", title: "An outline with sources", line: "Each point is labelled your resume, your story or general knowledge, with the words it came from.", where: "AI Coach → Build my answer", icon: "list", url: "AI Interview Coach", Scene: SceneOutline },
  { phase: "Build", title: "Your best example, ready to say", line: "It picks your strongest example and writes a version to say out loud.", where: "Result → Say it like this", icon: "spark", url: "AI Interview Coach", Scene: SceneSay },
  { phase: "Build", title: "Numbers are checked", line: "Any figure not in your material is flagged, so you never claim something you can’t back up.", where: "Result → Check these numbers", icon: "shield", url: "AI Interview Coach", Scene: SceneCheck },
  { phase: "Make it yours", title: "Pick how it helps", line: "STAR it, explain a trade-off, outline a system design, or get the likely follow-ups.", where: "AI Coach → the buttons under your question", icon: "layers", url: "AI Interview Coach", Scene: SceneModes },
  { phase: "Make it yours", title: "Practise until it’s yours", line: "Say it out loud, get scored, try again and see what improved. Save it to Your answers.", where: "Result → Practise this question", icon: "mic", url: "AI Interview Coach", Scene: SceneRehearse },
];


export function CoachTour({ autoStart = false }: { autoStart?: boolean }) {
  return <DemoTour chapters={COACH_CHAPTERS} label="AI Interview Coach walkthrough" autoStart={autoStart} />;
}
