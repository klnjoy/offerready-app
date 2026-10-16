/* "Will it get shortlisted?" on Resume match: the basics screening software
 * (ATS) and a recruiter's quick scan look for, with a fix for each. Runs in
 * the browser on your resume text. No AI, no credits. */

import { useMemo } from "react";
import { Link } from "../lib/router";
import { shortlistChecks, type CheckState } from "../lib/shortlist";

const MARK: Record<CheckState, string> = { pass: "✓", warn: "!", fail: "✕" };

export function ShortlistCheck({ text, fileName, title, keywords, jobId, tailored }: {
  text: string; fileName?: string; title: string; keywords: string[]; jobId: string; tailored: boolean;
}) {
  const checks = useMemo(() => shortlistChecks(text, { title, keywords, fileName }), [text, title, keywords, fileName]);
  const good = checks.filter((c) => c.state === "pass").length;
  const order: Record<CheckState, number> = { fail: 0, warn: 1, pass: 2 };
  const todo = checks.filter((c) => c.state !== "pass").sort((a, b) => order[a.state] - order[b.state]);
  const passed = checks.filter((c) => c.state === "pass");
  return (
    <section className="card sl" aria-labelledby="sl-h">
      <div className="sl-head">
        <div>
          <h2 id="sl-h">Will it get shortlisted?</h2>
          <p className="muted small">
            What screening software (ATS) and a recruiter{"’"}s 10-second scan look for, checked on your {tailored ? "tailored copy" : "resume"}.
            Every company{"’"}s tools differ; these are the common basics. Only add what{"’"}s true.
          </p>
        </div>
        <div className={"sl-score" + (good === checks.length ? " all" : "")} aria-label={good + " of " + checks.length + " look good"}>
          <strong>{good}</strong>/{checks.length}<span>look good</span>
        </div>
      </div>
      {todo.length ? (
        <ul className="sl-list">
          {todo.map((c) => (
            <li key={c.key} className={"sl-item is-" + c.state}>
              <span className="sl-mark" aria-label={c.state === "warn" ? "Could be better" : "Fix this"}>{MARK[c.state]}</span>
              <div>
                <strong>{c.label}</strong>
                <p className="small">{c.detail}</p>
                {c.fix ? <p className="small sl-fix">{c.fix}{c.tailor ? <> <Link to={"/tailor?job=" + encodeURIComponent(jobId)}>Tailor my resume</Link></> : null}</p> : null}
              </div>
            </li>
          ))}
        </ul>
      ) : null}
      {passed.length ? (
        <ul className="sl-pass" aria-label="Looks good">
          {passed.map((c) => (
            <li key={c.key}>
              <span className="sl-mark" aria-hidden="true">{MARK.pass}</span>
              <span><strong>{c.label}.</strong> <span className="muted">{c.detail}</span>
                {c.fix ? <> <span className="muted">{c.fix}</span>{c.tailor ? <> <Link to={"/tailor?job=" + encodeURIComponent(jobId)}>Tailor my resume</Link></> : null}</> : null}</span>
            </li>
          ))}
        </ul>
      ) : null}
    </section>
  );
}
