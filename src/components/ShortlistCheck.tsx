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
      <details className="sl-how">
        <summary>How shortlisting works</summary>
        <ol className="sl-steps">
          {STAGES.map((st, i) => (
            <li key={st.t}>
              <span className="sl-step-n" aria-hidden="true">{i + 1}</span>
              <div>
                <strong>{st.t}</strong>
                <p className="small">{st.d}</p>
              </div>
            </li>
          ))}
        </ol>
        <p className="small muted">Every company{"’"}s process and tools differ; this is the common pattern. The checks above cover steps 1 and 2. For step 3, <Link to={"/tailor?job=" + encodeURIComponent(jobId)}>tailor your bullets</Link> to this job{"’"}s stack and scope.</p>
      </details>
    </section>
  );
}

const STAGES = [
  { t: "Screening software (ATS) filters", d: "Workday, Greenhouse, Lever and others read your resume as text. Recruiters filter by keywords, job title and must-have questions (location, work authorisation, years). Unreadable files (scans, tables, columns) can drop out here." },
  { t: "A recruiter scans for 10–30 seconds", d: "They read the top third: your title, recent company, years, main skills, and whether your results have numbers. A clear summary at the top helps most." },
  { t: "The hiring manager reads closely", d: "They look for the same stack, the scope you worked at (team, data size, users) and real impact. Referrals often skip straight to here." },
  { t: "Interview invites go to the closest matches", d: "The clearest evidence of fit wins, not the longest resume. Tailor for each job, apply early, and ask for a referral where you can." },
];
