/* AI feedback on one answer, in the order a candidate needs it:
 *   1. the score (ring), the level against the senior bar and one-line verdict;
 *   2. "Fix these first": the weakest parts, biggest point gain first, each
 *      with what to add and roughly how many points it is worth;
 *   3. the actions (try again, stronger version, save), passed in as `actions`;
 *   4. the full breakdown and what a staff-level answer adds, folded away;
 *   5. `children` (e.g. the follow-up question).
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
/** Same scale as the server (api/_lib/gradeAnswer.js RATING_POINTS). */
const POINTS = [0, 0.35, 0.75, 1];
const CAPS: Record<string, string> = {
  very_short: "Capped: too short to judge as a full answer.",
  short: "Capped: a senior answer needs more depth than this.",
  ignored_instructions: "Text addressed to the grader was ignored.",
};

function Ring({ score, tone }: { score: number; tone: string }) {
  const R = 26; const C = 2 * Math.PI * R; const v = Math.max(0, Math.min(100, score));
  return (
    <span className={"fb-ring fb-ring-" + tone} aria-hidden="true">
      <svg viewBox="0 0 64 64" width="64" height="64">
        <circle cx="32" cy="32" r={R} className="fb-ring-track" />
        <circle cx="32" cy="32" r={R} className="fb-ring-fill" strokeDasharray={(C * v) / 100 + " " + C} transform="rotate(-90 32 32)" />
      </svg>
      <b>{v}</b>
    </span>
  );
}

export function FeedbackView({ f, actions, children }: { f: AnswerFeedback; actions?: ReactNode; children?: ReactNode }) {
  const score = typeof f.score === "number" ? f.score : 0;
  const tone = score >= 70 ? "strong" : score >= 50 ? "mid" : "weak"; // matches the levels (senior bar at 70)
  const crit = f.criteria || [];
  const capNotes = (f.caps || []).map((c) => CAPS[c] || (c.startsWith("no_") ? "Capped: the trade-off was missing or vague, and a senior answer can’t skip it." : "")).filter(Boolean);
  // Weakest parts, most points to gain first (gain = raising it to "Solid").
  const fixes = crit
    .filter((c) => c.rating <= 1)
    .map((c) => ({ ...c, gain: Math.max(1, Math.round((c.weight || 0) * (POINTS[2] - POINTS[c.rating]))) }))
    .sort((a, b) => b.gain - a.gain)
    .slice(0, 3);
  return (
    <div className={"fb fb-" + tone} role="status">
      <div className="fb-head">
        <Ring score={score} tone={tone} />
        <div className="fb-headtext">
          <span className="hm-sr">Score {score} out of 100.</span>
          {f.level && <span className={"fb-level fb-level-" + f.level}>{LEVEL[f.level]}</span>}
          <span className="fb-verdict">{f.verdict || ""}</span>
        </div>
      </div>

      {crit.length > 0 ? (
        fixes.length > 0 ? (
          <div className="fb-fixes">
            <div className="field-label">Fix these first</div>
            <ol>
              {fixes.map((c) => (
                <li key={c.id}>
                  <div className="fb-fix-top"><strong>{c.label}</strong><span className="fb-gain">up to +{c.gain}</span></div>
                  {c.note && <p>{c.note}</p>}
                </li>
              ))}
            </ol>
          </div>
        ) : (
          <p className="fb-allgood">Every part is at least solid. To reach staff level, see what a staff-level answer adds below.</p>
        )
      ) : (
        <>
          {(f.missing || []).length > 0 && (<><div className="field-label">Fix these first</div><ul className="fb-miss">{f.missing!.map((x, i) => <li key={i}>{x}</li>)}</ul></>)}
          {(f.covered || []).length > 0 && (<><div className="field-label">What held up</div><ul className="fb-ok">{f.covered!.map((x, i) => <li key={i}>{x}</li>)}</ul></>)}
        </>
      )}

      {actions ? <div className="fb-actions">{actions}</div> : null}

      {(crit.length > 0 || f.staff_upgrade) && (
        <details className="fb-more">
          <summary>{crit.length ? "Full scoring" + (f.rubric?.label ? " · " + f.rubric.label : "") : "What a staff-level answer adds"}</summary>
          {crit.length > 0 && (
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
          )}
          {capNotes.map((n, i) => <p key={i} className="fb-cap">{n}</p>)}
          {f.staff_upgrade && (
            <div className="fb-staff">
              <div className="field-label">What a staff-level answer adds</div>
              <p>{f.staff_upgrade}</p>
            </div>
          )}
        </details>
      )}
      {children}
    </div>
  );
}
