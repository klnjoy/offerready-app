/* Answer one interview question: optional 2-minute timer, type the gist, get
 * AI feedback like an interviewer (score, what held up, what was missing, the
 * follow-up they'd ask), reveal the strong answer, or rate yourself.
 * onResult fires once per question with the first AI score or self-rating. */

import { useEffect, useRef, useState } from "react";
import { API_ENABLED } from "../config";
import * as api from "../lib/api";
import { useAuth } from "../lib/auth";
import { invalidatePlan } from "../lib/plans";
import { UpgradeCard } from "./PlanGate";
import { FeedbackView } from "./FeedbackView";
import type { AnswerFeedback } from "../types";

const SELF = [
  { label: "Nailed it", score: 90 },
  { label: "Partly", score: 60 },
  { label: "Missed it", score: 30 },
];

export function AnswerCoach({ prompt, model, signals, topic, onResult, autoFocus }: {
  prompt: string;
  /** Category / topic hint so the grader picks the right rubric. */
  topic?: string;
  model?: string;
  signals?: string[];
  onResult?(score: number, how: "ai" | "self"): void;
  autoFocus?: boolean;
}) {
  const auth = useAuth();
  const [q, setQ] = useState(prompt);
  const [answer, setAnswer] = useState("");
  const [busy, setBusy] = useState(false);
  const [fb, setFb] = useState<AnswerFeedback | null>(null);
  const [note, setNote] = useState("");
  const [limit, setLimit] = useState("");
  const [shown, setShown] = useState(false);
  const [rated, setRated] = useState(false);
  const [secs, setSecs] = useState<number | null>(null);
  const reported = useRef(false);
  const isFollowup = q !== prompt;

  useEffect(() => {
    if (secs == null || secs <= 0) return;
    const t = setTimeout(() => setSecs((s) => (s == null ? s : s - 1)), 1000);
    return () => clearTimeout(t);
  }, [secs]);

  const report = (score: number, how: "ai" | "self") => {
    if (reported.current || isFollowup) return;
    reported.current = true;
    onResult?.(score, how);
  };

  const grade = async () => {
    const a = answer.trim();
    setNote(""); setLimit(""); setFb(null);
    if (a.length < 15) { setNote("Write a few sentences first: the main points you'd say out loud."); return; }
    setBusy(true);
    const res = await api.gradeAnswer(await auth.getAccessToken(), { prompt: q, signals: isFollowup ? [] : signals || [], model: isFollowup ? "" : model || "", answer: a, topic: topic || "" });
    setBusy(false);
    if (res.status === 200 && res.body?.feedback) {
      setFb(res.body.feedback);
      invalidatePlan();
      if (typeof res.body.feedback.score === "number") report(res.body.feedback.score, "ai");
    } else if (res.status === 401) setNote("Sign in to get feedback on your answer. You can still see the strong answer and rate yourself.");
    else if (res.status === 403) setLimit(res.body?.error || "You’ve used your AI feedback for now.");
    else if (res.status === 503) { setNote("AI feedback isn’t switched on here yet. Compare with the strong answer and rate yourself."); setShown(true); }
    else if (res.status === 0) setNote("Couldn’t reach the feedback service. Compare with the strong answer and rate yourself.");
    else setNote("Couldn’t get feedback right now. Compare with the strong answer and rate yourself.");
  };

  const followUp = () => {
    if (!fb?.followup) return;
    setQ(fb.followup); setAnswer(""); setFb(null); setNote(""); setShown(false); setSecs(null);
  };

  const fmt = (s: number) => Math.floor(s / 60) + ":" + String(s % 60).padStart(2, "0");
  const hasModel = !isFollowup && !!(model || (signals || []).length);

  return (
    <div className="coach">
      {isFollowup && (
        <div className="coach-followup">
          <span className="field-label">Follow-up</span>
          <p>{q}</p>
        </div>
      )}
      <div className="coach-top">
        <span className="muted small">Say it out loud first, then type the main points.</span>
        {secs == null ? (
          <button type="button" className="btn btn-ghost btn-small" onClick={() => setSecs(120)}>Start 2-minute timer</button>
        ) : (
          <span className={"coach-timer" + (secs <= 0 ? " done" : secs <= 20 ? " low" : "")} role="timer" aria-live="off">
            {secs <= 0 ? "Time’s up" : fmt(secs)}
            <button type="button" className="link-btn" onClick={() => setSecs(null)}>Stop</button>
          </span>
        )}
      </div>
      <textarea className="input textarea" rows={5} aria-label={isFollowup ? "Your answer to the follow-up" : "Your answer"} autoFocus={autoFocus}
        placeholder={"Your answer: situation or approach, the key decision, the trade-off, the result…"}
        value={answer} onChange={(e) => setAnswer(e.target.value)} />
      <div className="row wrap">
        {API_ENABLED && (
          <button type="button" className="btn btn-primary" disabled={busy} onClick={grade}>{busy ? "Getting feedback…" : "Get feedback"}</button>
        )}
        {hasModel && (
          <button type="button" className="btn btn-ghost" aria-expanded={shown} onClick={() => setShown((v) => !v)}>{shown ? "Hide strong answer" : "Show strong answer"}</button>
        )}
      </div>
      {note && <p className="hint">{note}</p>}
      {limit && <UpgradeCard feature="ai_grading" message={limit} />}
      {fb && (
        <FeedbackView f={fb}>
          {fb.followup && (
            <div className="fb-followup">
              <div className="field-label">The interviewer would ask next</div>
              <p>{fb.followup}</p>
              <button type="button" className="btn btn-small" onClick={followUp}>Answer the follow-up</button>
            </div>
          )}
        </FeedbackView>
      )}
      {shown && hasModel && (
        <div className="model">
          {model && (<><h4>What a strong answer says</h4><p>{model}</p></>)}
          {(signals || []).length > 0 && (
            <>
              <div className="field-label">What the interviewer listens for</div>
              <ul>{signals!.map((x, i) => <li key={i}>{x}</li>)}</ul>
            </>
          )}
        </div>
      )}
      {!isFollowup && !reported.current && (shown || note) && !rated && (
        <div className="coach-self">
          <span className="progress-label">How did your answer compare?</span>
          <div className="row wrap">
            {SELF.map((r) => (
              <button key={r.label} type="button" className="btn btn-small" onClick={() => { setRated(true); report(r.score, "self"); }}>{r.label}</button>
            ))}
          </div>
        </div>
      )}
    </div>
  );
}
