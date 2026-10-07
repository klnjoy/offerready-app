/* Master Interview Simulator — mock loop across areas and levels (was
 * content/assets/simulator.js). Self-rated; recorded to the local progress
 * store. */

import { Fragment, useEffect, useRef, useState } from "react";
import { SIM_BANK, SIM_LEVELS, type SimItem } from "../data/simulatorBank";
import { record } from "../lib/progressStore";
import { Link } from "../lib/router";

const AREAS = Array.from(new Set(SIM_BANK.map((b) => b.area)));
const LENGTHS = [["3", "Quick (3)"], ["5", "Standard (5)"], ["8", "Full loop (8)"]] as const;

const shuffle = <T,>(a: T[]): T[] => {
  const b = a.slice();
  for (let i = b.length - 1; i > 0; i--) {
    const j = Math.floor(Math.random() * (i + 1));
    [b[i], b[j]] = [b[j], b[i]];
  }
  return b;
};

function Md({ text }: { text: string }) {
  const parts = String(text).split(/(`[^`]+`|\*\*[^*]+\*\*)/g);
  return (
    <>
      {parts.map((p, i) =>
        p.startsWith("`") && p.endsWith("`") && p.length > 1 ? <code key={i}>{p.slice(1, -1)}</code>
        : p.startsWith("**") && p.endsWith("**") && p.length > 3 ? <strong key={i}>{p.slice(2, -2)}</strong>
        : <Fragment key={i}>{p}</Fragment>,
      )}
    </>
  );
}

interface Run {
  qs: SimItem[];
  i: number;
  ratings: { area: string; topic: string; rating: number }[];
  level: string;
}

export default function SimulatorPage() {
  const [run, setRun] = useState<Run | null>(null);
  const [done, setDone] = useState(false);

  return (
    <div className="page">
      {!run && <Setup onStart={(r) => { setRun(r); setDone(false); }} />}
      {run && !done && <Question key={run.i} run={run} setRun={setRun} onFinish={() => setDone(true)} />}
      {run && done && <Results run={run} onAgain={() => setRun(null)} />}
    </div>
  );
}

function Setup({ onStart }: { onStart(r: Run): void }) {
  const [level, setLevel] = useState<string>("Mixed");
  const [areas, setAreas] = useState<string[]>(AREAS);
  const [len, setLen] = useState("5");

  const start = () => {
    const picked = areas.length ? areas : AREAS;
    let pool = SIM_BANK.filter((b) => picked.includes(b.area) && (level === "Mixed" || b.level === level));
    if (!pool.length) pool = SIM_BANK.filter((b) => picked.includes(b.area));
    const n = Math.min(parseInt(len, 10) || 5, pool.length);
    onStart({ qs: shuffle(pool).slice(0, n), i: 0, ratings: [], level });
  };

  return (
    <div className="stack">
      <p>
        Run a <strong>mock loop</strong>: questions jump across areas and levels like a real onsite. For each, answer <strong>out loud and timed (~2&nbsp;min)</strong>, then reveal what{"’"}s tested, the strong vs weak patterns, and the expected depth. Rate yourself honestly, then face the follow-up. Your scores are saved locally.
      </p>
      <div className="option-grid option-grid-3">
        <div className="option static">
          <h3>1 {"·"} Target level</h3>
          <select className="input" aria-label="Target level" value={level} onChange={(e) => setLevel(e.target.value)}>
            {SIM_LEVELS.map((l) => <option key={l} value={l}>{l}</option>)}
          </select>
          <p>Mixed pulls every level, like a real loop.</p>
        </div>
        <div className="option static">
          <h3>2 {"·"} Areas</h3>
          <div className="area-checks">
            {AREAS.map((a) => (
              <label key={a} className="check">
                <input type="checkbox" checked={areas.includes(a)}
                  onChange={(e) => setAreas((xs) => (e.target.checked ? [...xs, a] : xs.filter((x) => x !== a)))} /> {a}
              </label>
            ))}
          </div>
        </div>
        <div className="option static">
          <h3>3 {"·"} Length</h3>
          <select className="input" aria-label="Length" value={len} onChange={(e) => setLen(e.target.value)}>
            {LENGTHS.map(([v, l]) => <option key={v} value={v}>{l}</option>)}
          </select>
          <p>Answer out loud. Don{"’"}t skip the follow-up {"—"} that{"’"}s where loops separate candidates.</p>
        </div>
      </div>
      <div className="row"><button type="button" className="btn btn-primary" onClick={start}>Start mock {"→"}</button></div>
    </div>
  );
}

function Question({ run, setRun, onFinish }: { run: Run; setRun(r: Run): void; onFinish(): void }) {
  const item = run.qs[run.i];
  const [secs, setSecs] = useState(0);
  const [revealed, setRevealed] = useState(false);
  const [rated, setRated] = useState(false);

  // Counts up; ~2 min target, no penalty. Stops on reveal.
  useEffect(() => {
    if (revealed) return;
    const start = Date.now() - secs * 1000;
    const t = setInterval(() => setSecs(Math.floor((Date.now() - start) / 1000)), 1000);
    return () => clearInterval(t);
  }, [revealed]); // eslint-disable-line react-hooks/exhaustive-deps

  const mm = String(Math.floor(secs / 60)).padStart(2, "0");
  const ss = String(secs % 60).padStart(2, "0");
  const last = run.i >= run.qs.length - 1;

  return (
    <div className="card">
      <div className="progress-label">Question {run.i + 1} of {run.qs.length} {"·"} {item.area} {"·"} {item.level}</div>
      <div className="bar"><div style={{ width: Math.round((run.i / run.qs.length) * 100) + "%" }} /></div>
      <span className="topic">{item.topic}</span>
      <div className={"timer" + (secs >= 120 ? " timer-over" : "")} aria-label="Elapsed time">{mm}:{ss}</div>
      <div className="question">{"🧑‍💼"} {item.q}</div>
      <textarea className="input textarea" autoFocus aria-label="Notes" placeholder="Answer out loud (or type notes), then reveal what a strong answer covers." />
      <div className="row">
        <button type="button" className="btn btn-primary" disabled={revealed} onClick={() => setRevealed(true)}>Reveal what{"’"}s tested {"→"}</button>
      </div>
      {revealed && (
        <>
          <div className="model">
            <p className="tested"><strong>What{"’"}s tested:</strong> <Md text={item.tested} /></p>
            <h4>A strong answer shows</h4>
            <ul>{item.strong.map((p, i) => <li key={i}><Md text={p} /></li>)}</ul>
            <h4 className="weak-h">Weak patterns to avoid</h4>
            <ul className="weak">{item.weak.map((p, i) => <li key={i}><Md text={p} /></li>)}</ul>
            <p className="depth"><strong>Expected depth:</strong> <Md text={item.depth} /></p>
          </div>
          {!rated ? (
            <>
              <div className="progress-label">How close was your spoken answer?</div>
              <div className="rate">
                {[[1, "1 · Missed it"], [2, "2 · Shaky"], [3, "3 · Solid"], [4, "4 · Strong"], [5, "5 · Nailed it"]].map(([v, l]) => (
                  <button key={v} type="button" className="star"
                    onClick={() => { setRun({ ...run, ratings: [...run.ratings, { area: item.area, topic: item.topic, rating: v as number }] }); setRated(true); }}>
                    {l}
                  </button>
                ))}
              </div>
            </>
          ) : (
            <>
              <div className="model followup">
                <h4>{"🔁"} Follow-up (don{"’"}t stall)</h4>
                <p><Md text={item.followup} /></p>
              </div>
              <div className="row">
                {!last
                  ? <button type="button" className="btn btn-primary" onClick={() => setRun({ ...run, i: run.i + 1 })}>Next question {"→"}</button>
                  : <button type="button" className="btn btn-primary" onClick={onFinish}>See results {"→"}</button>}
                <button type="button" className="btn btn-ghost" onClick={onFinish}>End mock</button>
              </div>
            </>
          )}
        </>
      )}
    </div>
  );
}

function Results({ run, onAgain }: { run: Run; onAgain(): void }) {
  const answered = run.ratings.length;
  const avg = answered ? run.ratings.reduce((s, r) => s + r.rating, 0) / answered : 0;
  const score = Math.round((avg / 5) * 100);
  const byTopic: Record<string, number[]> = {};
  run.ratings.forEach((r) => (byTopic[r.topic] = byTopic[r.topic] || []).push(r.rating));
  const topics: Record<string, number> = {};
  Object.keys(byTopic).forEach((k) => {
    topics[k] = Math.round((byTopic[k].reduce((a, b) => a + b, 0) / byTopic[k].length / 5) * 100);
  });
  const weakest = Object.keys(topics).sort((a, b) => topics[a] - topics[b]).slice(0, 3);

  const saved = useRef(false); // once, even under StrictMode's double effects
  useEffect(() => {
    if (saved.current || !answered) return;
    saved.current = true;
    record({ mode: "exam", track: "Master Simulator", topic: run.level === "Mixed" ? "Mixed loop" : run.level, score, n: answered, topics });
  }, []); // eslint-disable-line react-hooks/exhaustive-deps

  return (
    <div className="card summary">
      <div className="big-score">{answered ? score + "%" : "—"}</div>
      <p>
        {answered
          ? <>You ran <strong>{answered}</strong> question{answered === 1 ? "" : "s"} at an average self-rating of <strong>{avg.toFixed(1)}/5</strong>.</>
          : "No questions rated this run."}
      </p>
      {weakest.length > 0 && <p>Focus next on: <strong>{weakest.join(", ")}</strong> {"—"} your lowest self-ratings this run.</p>}
      <p>The goal isn{"’"}t the number {"—"} it{"’"}s answering each out loud with clarify {"→"} claim {"→"} mechanism {"→"} trade-off {"→"} how I{"’"}d verify, without stalling on the follow-up.</p>
      <div className="row wrap">
        <button type="button" className="btn btn-primary" onClick={onAgain}>Run another mock</button>
        <Link className="btn btn-ghost" to="/defend">Defend a decision {"→"}</Link>
      </div>
    </div>
  );
}
