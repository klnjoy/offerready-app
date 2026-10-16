/* Mock interview (/mock): set up and start in one place. The voice interview
 * is the main path: pick the kind of round and the length here (saved as the
 * voice mock's preferences), then Start. Recent mocks show how you did.
 * Other ways (text interview, notes for a real interview) sit below. */

import { useMemo, useState } from "react";
import { Link, useNavigate } from "../lib/router";
import { useJobs } from "../lib/useJobs";
import { displayJobTitle } from "../lib/roles";
import { detectSupport } from "../lib/voice";
import { readJSON, writeJSON } from "../lib/storage";
import { setActiveJob } from "../lib/readiness";
import { Icon } from "../components/Icon";
import { Art } from "../components/Art";

/* Same keys and shapes as pages/VoiceMock.tsx. */
const PREFS_KEY = "offerready.voicePrefs.v1";
const SESSIONS_KEY = "offerready.voiceSessions.v1";
type Kind = "behavioral" | "technical" | "system_design" | "mixed";
const KINDS: { id: Kind; label: string; line: string }[] = [
  { id: "behavioral", label: "Behavioral", line: "Your stories: ownership, conflict, impact" },
  { id: "technical", label: "Technical", line: "How it works, why, and the trade-offs" },
  { id: "system_design", label: "System design", line: "Requirements, components, scale, failure" },
  { id: "mixed", label: "Full loop", line: "All three, like a real interview day" },
];
type Rec = { at: number; jobTitle: string; type: Kind; length: number; answers: { feedback?: { scores?: Record<string, number> } | null; selfRating?: number }[] };

function score(r: Rec): number | null {
  const vals: number[] = [];
  for (const a of r.answers || []) {
    const s = a.feedback?.scores;
    if (s) { const v = Object.values(s).filter((x) => typeof x === "number"); if (v.length) vals.push(v.reduce((m, x) => m + x, 0) / v.length); }
    else if (a.selfRating) vals.push(a.selfRating);
  }
  return vals.length ? Math.round((vals.reduce((m, x) => m + x, 0) / vals.length) * 20) : null;
}

export default function MockHubPage() {
  const support = useMemo(() => detectSupport(), []);
  const voiceOk = support.recognition && support.mic;
  const jobs = useJobs();
  const navigate = useNavigate();
  const prefs = useMemo(() => readJSON<Record<string, unknown>>(PREFS_KEY, {}), []);
  const [kind, setKind] = useState<Kind>(KINDS.some((k) => k.id === prefs.type) ? (prefs.type as Kind) : "behavioral");
  const [len, setLen] = useState<3 | 5>(prefs.length === 5 ? 5 : 3);
  const recent = useMemo(() => {
    const s = readJSON<Rec[]>(SESSIONS_KEY, []);
    return (Array.isArray(s) ? s : []).filter((r) => r && r.answers?.length).sort((a, b) => b.at - a.at).slice(0, 3);
  }, []);
  const list = jobs.status === "ready" ? jobs.jobs : [];
  const job = list.find((j) => j.id === jobs.activeId) || list[0];

  const start = () => {
    writeJSON(PREFS_KEY, { ...prefs, type: kind, length: len, ...(voiceOk ? {} : { typeAnswers: true }) });
    navigate("/interview/voice");
  };

  return (
    <div className="page mk">
      <section className="tses mk-hero" aria-labelledby="mk-h">
        <span className="tses-eyebrow">Mock interview</span>
        <h2 id="mk-h">{job && list.length <= 1 ? "Practise for " + displayJobTitle(job) : "Practise a real interview round"}</h2>
        {list.length > 1 && job ? (
          <label className="mk-job">
            <span className="hm-sr">Job</span>
            <select value={job.id} onChange={(e) => setActiveJob(e.target.value)} aria-label="Job">
              {list.map((j) => <option key={j.id} value={j.id}>{displayJobTitle(j)}</option>)}
            </select>
          </label>
        ) : null}

        <div className="mk-kinds" role="radiogroup" aria-label="Kind of round">
          {KINDS.map((k) => (
            <button key={k.id} type="button" role="radio" aria-checked={kind === k.id} className={"mk-kind" + (kind === k.id ? " on" : "")} onClick={() => setKind(k.id)}>
              <strong>{k.label}</strong><span>{k.line}</span>
            </button>
          ))}
        </div>

        <div className="mk-len" role="radiogroup" aria-label="Length">
          {([3, 5] as const).map((n) => (
            <button key={n} type="button" role="radio" aria-checked={len === n} className={len === n ? "on" : ""} onClick={() => setLen(n)}>
              {n} questions · {n === 3 ? "about 12 min" : "about 20 min"}
            </button>
          ))}
        </div>

        <button type="button" className="btn tses-btn mk-start" onClick={start}>
          Start {voiceOk ? "voice interview" : "interview"} <span aria-hidden="true">→</span>
        </button>
        <p className="mk-what">
          {voiceOk
            ? "You answer out loud. The interviewer follows up on what you said, then scores content and delivery."
            : "Voice works best in Chrome or Edge. Here you type your answers; the follow-ups and scores are the same."}
        </p>
      </section>

      {recent.length > 0 && (
        <section className="tdy" aria-labelledby="mk-recent">
          <div className="tdy-head"><h2 id="mk-recent">Your recent mocks</h2></div>
          <ul className="tdy-group mk-recent">
            {recent.map((r) => {
              const sc = score(r);
              return (
                <li key={r.at} className="tdy-grow">
                  <span className="tdy-text">
                    <strong>{KINDS.find((k) => k.id === r.type)?.label || "Mock"} · {r.answers.length} answers</strong>
                    <span>{r.jobTitle || "General"} · {new Date(r.at).toLocaleDateString(undefined, { month: "short", day: "numeric" })}</span>
                  </span>
                  {sc != null && <span className={"rd2-score" + (sc >= 70 ? " is-good" : sc >= 50 ? " is-mid" : " is-weak")}>{sc}%</span>}
                </li>
              );
            })}
          </ul>
        </section>
      )}

      <section className="tdy" aria-labelledby="mk-other">
        <div className="tdy-head"><h2 id="mk-other">Other ways</h2></div>
        <div className="tdy-group">
          <Link className="tdy-grow" to="/simulator">
            <Art k="text" className="mk-art" />
            <span className="tdy-text"><strong>Text interview</strong><span>A general mixed loop, not tied to your job. No microphone.</span></span>
            <span className="tdy-chev" aria-hidden="true">›</span>
          </Link>
          <Link className="tdy-grow" to="/notes">
            <span className="mk-ico" aria-hidden="true"><Icon name="list" size={20} /></span>
            <span className="tdy-text"><strong>Real interview today?</strong><span>Take notes as it happens; they become a debrief after.</span></span>
            <span className="tdy-chev" aria-hidden="true">›</span>
          </Link>
        </div>
      </section>
      <p className="small muted">A voice mock for a saved job counts toward its score in <Link to="/dashboard">Progress</Link>. Practice only, never during a live interview.</p>
    </div>
  );
}
