/* Pricing: Free vs Pro, built from the same PLAN_MATRIX / LIMITS the server
 * enforces (api/_lib/plans.js), so the page can't drift from real limits.
 * The price is a display label from config (VITE_PRO_PRICE_LABEL); Stripe
 * holds the real amount. Upgrade goes through /account?upgrade=1 (checkout). */

import { PRO_PRICE_LABEL, SUPPORT_EMAIL } from "../config";
import { LIMITS, PLAN_MATRIX, usePlan, type Feature } from "../lib/plans";
import { Link } from "../lib/router";

const FREE_POINTS = [
  "Study library, question banks and practice mode",
  `${LIMITS.free.saved_jobs} saved job and ${LIMITS.free.analyses} job analyses a month`,
  "Day-by-day plan to your interview date",
  `${LIMITS.free.ai_grading} AI answer gradings and ${LIMITS.free.voice_mock} voice mock interview a month`,
  `${LIMITS.free.story_ai} STAR story coaching sessions a month`,
];

const PRO_POINTS = [
  "Everything in Free",
  "Unlimited saved jobs",
  "The full defend-your-decision scenario library",
  "Scenarios generated for your exact job",
  `Up to ${LIMITS.pro.voice_mock} voice mock interviews and ${LIMITS.pro.ai_grading} AI gradings a month`,
  "Calendar export for your prep plan",
];

const FAIR_USE: { feature: Feature; label: string }[] = [
  { feature: "analyses", label: "job analyses" },
  { feature: "ai_grading", label: "AI answer gradings" },
  { feature: "voice_mock", label: "voice mock sessions" },
  { feature: "custom_scenarios", label: "generated scenarios" },
  { feature: "story_ai", label: "story coaching sessions" },
];

function Check() {
  return (
    <svg className="pr-check" width="16" height="16" viewBox="0 0 16 16" aria-hidden="true" focusable="false">
      <path d="M3.5 8.4l2.9 2.9 6.1-6.6" fill="none" stroke="currentColor" strokeWidth="1.9" strokeLinecap="round" strokeLinejoin="round" />
    </svg>
  );
}

function Cell({ value }: { value: string }) {
  if (value === "—") return <span className="pr-none" aria-label="Not included">{"—"}</span>;
  return <>{value}</>;
}

export default function PricingPage() {
  const p = usePlan();
  const onPro = p.signedIn && p.plan === "pro";
  const onFree = p.signedIn && p.plan === "free" && !p.loading;
  const [amount, ...rest] = PRO_PRICE_LABEL.split(" ");
  const per = rest.join(" ");

  return (
    <div className="page pricing">
      <header className="pr-hero">
        <p className="pr-eyebrow">Pricing</p>
        <h1>Free to start. Pro when your interview is real.</h1>
        <p className="pr-lede">
          Learn, analyze a job and practice for free. Upgrade when you have an interview on the calendar and want an AI
          interviewer that pushes back.
        </p>
      </header>

      <div className="pr-plans">
        <section className="card pr-plan" aria-labelledby="pr-free">
          <div className="pr-plan-top">
            <h2 id="pr-free">Free</h2>
            {onFree && <span className="pill pill-info">Your plan</span>}
          </div>
          <p className="pr-price">
            <span className="pr-amount">$0</span> <span className="pr-per">forever</span>
          </p>
          <p className="muted">Everything you need to understand a role and start preparing.</p>
          <ul className="pr-points">
            {FREE_POINTS.map((t) => (
              <li key={t}><Check />{t}</li>
            ))}
          </ul>
          <Link className="btn btn-block" to="/analyze">{p.signedIn ? "Analyze a job" : "Start free"}</Link>
        </section>

        <section className="card pr-plan pr-plan-pro" aria-labelledby="pr-pro">
          <div className="pr-plan-top">
            <h2 id="pr-pro">Pro</h2>
            {onPro ? <span className="pill pill-ok">Your plan</span> : <span className="pr-tag">For a real interview</span>}
          </div>
          <p className="pr-price">
            <span className="pr-amount">{amount}</span> {per && <span className="pr-per">{per}</span>}
          </p>
          <p className="muted">Practice the way the interview actually goes, as often as you need.</p>
          <ul className="pr-points">
            {PRO_POINTS.map((t) => (
              <li key={t}><Check />{t}</li>
            ))}
          </ul>
          {onPro ? (
            <Link className="btn btn-block" to="/account">Manage your plan</Link>
          ) : (
            <Link className="btn btn-primary btn-block" to="/account?upgrade=1">Upgrade to Pro</Link>
          )}
          <p className="pr-fine">Cancel anytime. Secure checkout by Stripe.</p>
        </section>
      </div>

      <section className="card pr-compare" aria-labelledby="pr-compare-h">
        <h2 id="pr-compare-h">Compare plans</h2>
        <div className="table-wrap">
          <table className="pr-table">
            <thead>
              <tr>
                <th scope="col">Feature</th>
                <th scope="col">Free</th>
                <th scope="col">Pro</th>
              </tr>
            </thead>
            <tbody>
              {PLAN_MATRIX.map((r) => (
                <tr key={r.feature}>
                  <th scope="row">{r.label}</th>
                  <td><Cell value={r.free} /></td>
                  <td><Cell value={r.pro} /></td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
        <p className="hint">Monthly limits follow the calendar month (UTC) and reset on the 1st. Unused uses don’t roll over.</p>
      </section>

      <section className="card pr-fair" aria-labelledby="pr-fair-h">
        <h2 id="pr-fair-h">What counts as fair use</h2>
        <p>
          Pro limits are generous caps, not a meter you need to watch. They sit far above what a focused interview
          prep uses, and exist to keep AI costs sustainable and stop automated abuse.
        </p>
        <ul className="pr-fair-list">
          {FAIR_USE.map((f) => (
            <li key={f.feature}>
              <strong>{LIMITS.pro[f.feature]}</strong> {f.label} a month
            </li>
          ))}
        </ul>
        <p className="hint">
          A use counts only when the AI result comes back. Failed or timed-out requests aren’t counted. If you reach a
          cap, it resets on the 1st{SUPPORT_EMAIL ? <> {"—"} or <a href={"mailto:" + SUPPORT_EMAIL}>write to us</a> if you need more for a real reason</> : null}.
        </p>
      </section>

      <section className="pr-faq" aria-labelledby="pr-faq-h">
        <h2 id="pr-faq-h">Questions</h2>
        <details>
          <summary>Can I cancel anytime?</summary>
          <p>
            Yes. Cancel from the Stripe customer portal (the “Manage subscription” link in any Stripe receipt email)
            {SUPPORT_EMAIL ? <>, or email <a href={"mailto:" + SUPPORT_EMAIL}>{SUPPORT_EMAIL}</a> and we’ll cancel it for you</> : <>, or email us and we’ll cancel it for you</>}.
            When Pro ends you move back to Free, and your saved jobs stay.
          </p>
        </details>
        <details>
          <summary>What happens to my resume?</summary>
          <p>
            Your resume is read in your browser and never stored. Only its text goes with the analysis you ask for, and
            it isn’t saved to your account.
          </p>
        </details>
        <details>
          <summary>What happens when I hit a Free limit?</summary>
          <p>Nothing is lost. The feature shows an upgrade card until your limit resets on the 1st of the month, and everything else keeps working.</p>
        </details>
        <details>
          <summary>Do I need an account for Free?</summary>
          <p>No account is needed to read the study library or analyze a job. Sign in to save jobs, track readiness and use the AI interviewer features.</p>
        </details>
      </section>
    </div>
  );
}
