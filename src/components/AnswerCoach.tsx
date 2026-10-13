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
import { saveAnswer, storyText } from "../lib/answerLibrary";
import { useSavedResume } from "../lib/savedResume";
import { loadStories } from "../lib/stories";
import { track } from "../lib/track";
import type { AnswerFeedback } from "../types";

const SELF = [
  { label: "Nailed it", score: 90 },
  { label: "Partly", score: 60 },
  { label: "Missed it", score: 30 },
];

export function AnswerCoach({ prompt, model, signals, topic, onResult, autoFocus, jobId, jobTitle }: {
  prompt: string;
  /** For the answer library and the Copilot's context. */
  jobId?: string;
  jobTitle?: string;
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
  const [resume] = useSavedResume();
  /** Earlier graded attempts at the MAIN question, oldest first. */
  const [attempts, setAttempts] = useState<{ answer: string; fb: AnswerFeedback }[]>([]);
  const [gradedText, setGradedText] = useState("");
  const [improve, setImprove] = useState<{ busy: boolean; text: string; unverified: string[]; note: string } | null>(null);
  const [saved, setSaved] = useState(false);

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
      setGradedText(a);
      setSaved(false);
      invalidatePlan();
      const sc = res.body.feedback.score;
      if (typeof sc === "number") {
        const prev = attempts.length ? attempts[attempts.length - 1].fb.score : null;
        // A better retry updates your progress too.
        if (!isFollowup && reported.current && typeof prev === "number" && sc > prev) onResult?.(sc, "ai");
        else report(sc, "ai");
      }
    } else if (res.status === 401) setNote("Sign in to get feedback on your answer. You can still see the strong answer and rate yourself.");
    else if (res.status === 403) setLimit(res.body?.error || "You’ve used your AI feedback for now.");
    else if (res.status === 503) { setNote("AI feedback isn’t switched on here yet. Compare with the strong answer and rate yourself."); setShown(true); }
    else if (res.status === 0) setNote("Couldn’t reach the feedback service. Compare with the strong answer and rate yourself.");
    else setNote("Couldn’t get feedback right now. Compare with the strong answer and rate yourself.");
  };

  /** Keep this graded attempt and answer again; the next grade is compared with it. */
  const retry = () => {
    if (!fb) return;
    setAttempts((xs) => [...xs, { answer: gradedText, fb }]);
    setFb(null); setNote(""); setShown(false); setSecs(null);
    track("answer_retried", { n: attempts.length + 2 });
  };

  /** Ask the Copilot to improve this draft from your resume and stories. */
  const improveIt = async () => {
    const draft = (gradedText || answer).trim();
    if (draft.length < 15) return;
    setImprove({ busy: true, text: "", unverified: [], note: "" });
    const stories = loadStories().filter((x) => !jobId || !x.jobIds.length || x.jobIds.includes(jobId)).slice(0, 8).map(storyText);
    const res = await api.copilot(await auth.getAccessToken(), { mode: "improve", question: q, jobTitle, resume: resume?.text || "", stories, draft });
    if (res.status === 200 && res.body?.result) {
      invalidatePlan();
      track("copilot_used", { mode: "improve" });
      const r = res.body.result;
      setImprove({ busy: false, text: r.improved_answer, unverified: r.unverified, note: r.gaps.join(" ") });
    } else if (res.status === 403) { setImprove(null); setLimit(res.body?.error || "You’ve used your AI coaching for now."); }
    else setImprove({ busy: false, text: "", unverified: [], note: res.status === 401 ? "Sign in to use Answer Studio." : "Answer Studio couldn’t improve this right now. Try again in a moment." });
  };

  const saveIt = (text: string, score: number | null) => {
    saveAnswer({ jobId: jobId || "", jobTitle: jobTitle || "", question: q, answer: text, score, source: "practice" });
    track("answer_saved", { score });
    setSaved(true);
  };

  const followUp = () => {
    if (!fb?.followup) return;
    setQ(fb.followup); setAnswer(""); setFb(null); setNote(""); setShown(false); setSecs(null); setAttempts([]); setImprove(null);
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
      {fb && attempts.length > 0 && <Compare before={attempts[attempts.length - 1].fb} after={fb} tries={attempts.length + 1} />}
      {fb && (
        <FeedbackView f={fb}>
          {fb.followup && (
            <div className="fb-followup">
              <div className="field-label">The interviewer would ask next</div>
              <p>{fb.followup}</p>
              <button type="button" className="btn btn-small" onClick={followUp}>Answer the follow-up</button>
            </div>
          )}
          <div className="coach-next">
            <span className="field-label">Make it stronger</span>
            <div className="row wrap">
              <button type="button" className="btn btn-small btn-primary" onClick={retry}>Try again and compare</button>
              <button type="button" className="btn btn-small" disabled={!!improve?.busy} onClick={improveIt}>{improve?.busy ? "Improving…" : "Improve in Answer Studio"}</button>
              <button type="button" className="btn btn-small btn-ghost" disabled={saved} onClick={() => saveIt(gradedText, typeof fb.score === "number" ? fb.score : null)}>{saved ? "Saved" : "Save this answer"}</button>
            </div>
          </div>
        </FeedbackView>
      )}
      {improve && !improve.busy && (improve.text || improve.note) && (
        <div className="coach-improve">
          <div className="field-label">A stronger version (from your resume and stories)</div>
          {improve.text && <p>{improve.text}</p>}
          {improve.unverified.length > 0 && <p className="cp-warn">Check these numbers: <strong>{improve.unverified.join(", ")}</strong>. They aren{"’"}t in your material.</p>}
          {improve.note && <p className="small muted">{improve.note}</p>}
          {improve.text && (
            <div className="row wrap">
              <button type="button" className="btn btn-small btn-primary" onClick={retry} disabled={!fb}>Now answer again in your words</button>
              <button type="button" className="btn btn-small btn-ghost" onClick={() => saveIt(improve.text, null)}>Save this version</button>
            </div>
          )}
        </div>
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

const RATING_WORD = ["Missing", "Vague", "Solid", "Staff"];

/** Attempt N vs attempt N-1: the score and every criterion that moved. */
function Compare({ before, after, tries }: { before: AnswerFeedback; after: AnswerFeedback; tries: number }) {
  const b = typeof before.score === "number" ? before.score : 0;
  const a = typeof after.score === "number" ? after.score : 0;
  const d = a - b;
  const rows = (after.criteria || []).map((c) => {
    const prev = (before.criteria || []).find((x) => x.id === c.id);
    return { label: c.label, from: prev ? prev.rating : null, to: c.rating };
  }).filter((r) => r.from != null && r.from !== r.to);
  return (
    <div className={"coach-compare " + (d > 0 ? "up" : d < 0 ? "down" : "same")} role="status">
      <div className="coach-compare-head">
        <strong>Attempt {tries} vs attempt {tries - 1}:</strong> {b}% {"→"} {a}% <span className="coach-delta">({d > 0 ? "+" : ""}{d})</span>
      </div>
      {rows.length > 0 ? (
        <ul>{rows.map((r) => <li key={r.label}>{r.label}: {RATING_WORD[r.from!]} {"→"} <b>{RATING_WORD[r.to]}</b></li>)}</ul>
      ) : <p className="small muted">{d === 0 ? "No criterion changed. Use the feedback below to add what was missing." : ""}</p>}
    </div>
  );
}
