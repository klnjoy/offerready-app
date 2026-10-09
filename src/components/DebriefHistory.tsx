/* A job's debrief history: one card per logged round, newest first, with the
 * thank-you email draft. Used by the Debrief screen and Job detail. */

import { useState } from "react";
import { FEELINGS, OUTCOME_LABELS, ROUND_LABELS, thankYouPrompt, type Debrief } from "../lib/debrief";
import { formatDay } from "../lib/interviewDates";
import { Link } from "../lib/router";
import { StreamDraft } from "./StreamDraft";

const OUTCOME_TONE: Record<Debrief["outcome"], string> = { waiting: "pill-info", next: "pill-ok", offer: "pill-ok", rejected: "pill-gap" };

export function DebriefCard({ d, job, onEdit, onDelete, compact }: {
  d: Debrief;
  job: { title: string; company?: string };
  onEdit?(d: Debrief): void;
  onDelete?(d: Debrief): void;
  compact?: boolean;
}) {
  const [drafting, setDrafting] = useState(false);
  const [confirm, setConfirm] = useState(false);
  const counts = { good: 0, ok: 0, bad: 0 };
  d.questions.forEach((q) => { if (q.rating) counts[q.rating]++; });
  const shown = compact ? d.questions.slice(0, 3) : d.questions;

  return (
    <article className="card dto-hist" aria-label={ROUND_LABELS[d.round] + " on " + d.date}>
      <header className="dto-hist-head">
        <div className="dto-when" aria-hidden="true">
          <span>{formatDay(d.date, { month: "short" })}</span>
          <strong>{formatDay(d.date, { day: "numeric" })}</strong>
        </div>
        <div className="dto-hist-title">
          <h3>{ROUND_LABELS[d.round]}</h3>
          <p className="small muted">
            {formatDay(d.date, { weekday: "long", month: "long", day: "numeric" })}
            {d.interviewers ? " · with " + d.interviewers : ""}
          </p>
        </div>
        <span className={"pill " + OUTCOME_TONE[d.outcome]}>{OUTCOME_LABELS[d.outcome]}</span>
      </header>

      <div className="dto-hist-meta">
        {d.feeling > 0 && <span className="dto-feel" data-f={d.feeling}>Felt {FEELINGS[d.feeling - 1].toLowerCase()}</span>}
        {d.questions.length > 0 && (
          <span className="dto-tally" aria-label={counts.good + " good, " + counts.ok + " okay, " + counts.bad + " bad"}>
            <i className="dto-dot dto-good" aria-hidden="true" />{counts.good}
            <i className="dto-dot dto-ok" aria-hidden="true" />{counts.ok}
            <i className="dto-dot dto-bad" aria-hidden="true" />{counts.bad}
          </span>
        )}
        {d.outcome === "next" && d.nextDate && (
          <span className="iv-chip">Next{d.nextRound ? ": " + ROUND_LABELS[d.nextRound].toLowerCase() : " round"} {formatDay(d.nextDate)}</span>
        )}
      </div>

      {shown.length > 0 && (
        <ul className="dto-qlist">
          {shown.map((q) => (
            <li key={q.id} className={"dto-q dto-q-" + (q.rating || "none")}>
              <i className={"dto-dot dto-" + (q.rating || "none")} aria-hidden="true" />
              <div>
                <span className="dto-q-text">{q.text}</span>
                <span className="dto-sr"> ({q.rating ? (q.rating === "ok" ? "okay" : q.rating) : "not rated"})</span>
                {q.note && <span className="dto-q-note">{q.note}</span>}
              </div>
            </li>
          ))}
          {compact && d.questions.length > shown.length && <li className="small muted dto-more">+{d.questions.length - shown.length} more</li>}
        </ul>
      )}
      {!compact && d.notes && <p className="dto-notes">{d.notes}</p>}

      {drafting ? (
        <StreamDraft title="Thank-you email" prompt={() => thankYouPrompt(d, job)} page={{ title: "Interview debrief", path: "/debrief" }} onClose={() => setDrafting(false)} />
      ) : null}

      <div className="dto-actions">
        {!drafting && <button type="button" className="btn btn-small dto-ty-btn" onClick={() => setDrafting(true)}>Draft a thank-you email</button>}
        {onEdit && <button type="button" className="btn btn-ghost btn-small" onClick={() => onEdit(d)}>Edit</button>}
        {compact && <Link className="btn btn-ghost btn-small" to={"/debrief?job=" + encodeURIComponent(d.jobId)}>Open debrief</Link>}
        {onDelete && (confirm ? (
          <span className="dto-confirm">Delete this round?
            <button type="button" className="btn btn-danger btn-small" onClick={() => onDelete(d)}>Delete</button>
            <button type="button" className="btn btn-ghost btn-small" onClick={() => setConfirm(false)}>Keep</button>
          </span>
        ) : <button type="button" className="link-btn small dto-del" onClick={() => setConfirm(true)}>Delete</button>)}
      </div>
    </article>
  );
}
