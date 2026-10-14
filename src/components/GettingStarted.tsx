/* Getting started: a three-step guide for new users, shown on the home page
 * (signed in) and the Jobs page until all three steps are done or the user
 * hides it.
 *   1. Add a job            done when a job is saved
 *   2. Practise             done after any practice (questions, drill, bank, story)
 *   3. Run a mock interview done after a voice or text mock
 * Labelled with the same stages as everywhere else (Set up once, Practise
 * every day), not a separate numbering.
 * The next step is highlighted with one button, so a new user always knows
 * where to go. */

import { useState } from "react";
import { KEYS, readJSON, writeJSON } from "../lib/storage";
import { getHistory } from "../lib/progressStore";
import { Link } from "../lib/router";
import { useJobs } from "../lib/useJobs";
import { Icon } from "./Icon";

const HIDE_KEY = "offerready.gettingStarted.hidden.v1";

function hasPractised(): boolean {
  const qp = readJSON<Record<string, unknown>>(KEYS.questionProgress, {});
  if (qp && Object.values(qp).some((v) => v && typeof v === "object" && Object.keys(v as object).length)) return true;
  if (readJSON<unknown[]>(KEYS.stories, []).length) return true;
  if (readJSON<unknown[]>(KEYS.answerLibrary, []).length) return true;
  return getHistory().some((h) => h.mode !== "mock" && h.mode !== "exam");
}

function hasMocked(): boolean {
  return getHistory().some((h) => h.mode === "mock" || h.mode === "exam");
}

export function GettingStarted({ where }: { where: "home" | "jobs" }) {
  const jobs = useJobs();
  const [hidden, setHidden] = useState(() => !!readJSON<boolean>(HIDE_KEY, false));
  if (hidden || jobs.status !== "ready") return null;

  const firstJob = jobs.jobs[0]?.id;
  const jobQ = jobs.activeId || firstJob ? "?job=" + encodeURIComponent(jobs.activeId || firstJob) : "";
  const done = [jobs.jobs.length > 0, hasPractised(), hasMocked()];
  if (done.every(Boolean)) return null;
  const next = done.findIndex((d) => !d);

  const steps = [
    { stage: "Set up once", title: "Add the job", text: "Paste the job link or description, add your resume and the interview date.", to: "/analyze", cta: "Add a job" },
    { stage: "Practise every day", title: "Answer your first questions", text: "Step 1 on the Practice page. Then a trade-off drill, your stories and a mock interview. Skip any you don’t need.", to: "/questions" + jobQ, cta: "Practise a question" },
    { stage: "Practise every day", title: "Run a mock interview", text: "Step 4: a voice or text mock with follow-ups on what you said.", to: "/mock", cta: "Start a mock" },
  ];

  return (
    <section className={"gs gs-" + where} aria-labelledby="gs-h">
      <div className="gs-head">
        <h2 id="gs-h">Getting started: {done.filter(Boolean).length} of 3 done</h2>
        <div className="gs-head-actions">
          <Link className="gs-demo" to="/demo"><Icon name="spark" size={15} /> Watch the 1-minute demo</Link>
          <button type="button" className="gs-hide" onClick={() => { writeJSON(HIDE_KEY, true); setHidden(true); }}>Hide</button>
        </div>
      </div>
      <ol className="gs-steps">
        {steps.map((s, i) => (
          <li key={s.title} className={"gs-step" + (done[i] ? " done" : "") + (i === next ? " next" : "")}>
            <span className="gs-mark" aria-hidden="true">{done[i] ? <Icon name="check" size={15} /> : i + 1}</span>
            <div className="gs-body">
              <p className="gs-title"><span className="gs-stage">{s.stage}</span>{s.title}{done[i] ? <span className="hm-sr"> (done)</span> : null}</p>
              <p className="gs-text">{s.text}</p>
              {i === next ? <Link className="btn btn-primary btn-small gs-cta" to={s.to}>{s.cta} <Icon name="arrow" size={15} /></Link> : null}
            </div>
          </li>
        ))}
      </ol>
    </section>
  );
}
