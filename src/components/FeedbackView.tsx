/* AI feedback on one answer: score, level against the senior bar, the
 * rubric breakdown (what each criterion earned and the words that earned it),
 * what a staff-level answer adds, and the follow-up slot (children).
 * Falls back to the older covered / missing lists when there is no rubric. */

import type { ReactNode } from "react";
import type { AnswerFeedback } from "../types";

const LEVEL: Record<string, string> = {
  staff: "Staff level",
  senior: "Senior bar met",
  almost: "Close to the senior bar",
  not_yet: "Below the senior bar",
};
const RATING = ["Missing", "Vague", "Solid", "Staff level"];
const CAPS: Record<string, string> = {
  very_short: "Capped: too short to judge as a full answer.",
  short: "Capped: a senior answer needs more depth than this.",
  ignored_instructions: "Text addressed to the grader was ignored.",
};

export function FeedbackView({ f, children }: { f: AnswerFeedback; children?: ReactNode }) {
  const score = typeof f.score === "number" ? f.score : 0;
  const tone = score >= 80 ? "strong" : score >= 55 ? "mid" : "weak";
  const crit = f.criteria || [];
  const capNotes = (f.caps || []).map((c) => CAPS[c] || (c.startsWith("no_") ? "Capped: the trade-off was missing or vague, and a senior answer can’t skip it." : "")).filter(Boolean);
  return (
    <div className={"fb fb-" + tone} role="status">
      <div className="fb-head">
        <span className="fb-score">{score}%</span>
        <div className="fb-headtext">
          {f.level && <span className={"fb-level fb-level-" + f.level}>{LEVEL[f.level]}</span>}
          <span className="fb-verdict">{f.verdict || ""}</span>
        </div>
      </div>
      {crit.length > 0 ? (
        <>
          <div className="field-label">{f.rubric?.label ? "How it scored · " + f.rubric.label : "How it scored"}</div>
          <ul className="fb-crit">
            {crit.map((c) => (
              <li key={c.id} className={"fb-crit-row r" + c.rating}>
                <div className="fb-crit-top">
                  <span className="fb-crit-label">{c.label}</span>
                  <span className="fb-dots" aria-label={RATING[c.rating] + ", " + c.rating + " of 3"}>
                    {[1, 2, 3].map((n) => <i key={n} className={n <= c.rating ? "on" : ""} />)}
                  </span>
                  <span className="fb-crit-rating">{RATING[c.rating]}</span>
                </div>
                {c.note && <p className="fb-crit-note">{c.note}</p>}
                {c.evidence && <p className="fb-crit-quote">You said: {"“"}{c.evidence}{"”"}</p>}
              </li>
            ))}
          </ul>
          {capNotes.map((n, i) => <p key={i} className="fb-cap">{n}</p>)}
        </>
      ) : (
        <>
          {(f.covered || []).length > 0 && (<><div className="field-label">What held up</div><ul className="fb-ok">{f.covered!.map((x, i) => <li key={i}>{x}</li>)}</ul></>)}
          {(f.missing || []).length > 0 && (<><div className="field-label">What was missing</div><ul className="fb-miss">{f.missing!.map((x, i) => <li key={i}>{x}</li>)}</ul></>)}
        </>
      )}
      {f.staff_upgrade && (
        <div className="fb-staff">
          <div className="field-label">What a staff-level answer adds</div>
          <p>{f.staff_upgrade}</p>
        </div>
      )}
      {children}
    </div>
  );
}
