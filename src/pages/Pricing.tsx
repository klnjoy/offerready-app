/* Pricing: Free vs Pro, built from the same PLAN_MATRIX / LIMITS the server
 * enforces (api/_lib/plans.js), so the page can't drift from real limits.
 * Prices are display labels from config (VITE_PRO_PRICE_LABEL,
 * VITE_PRO_ANNUAL_PRICE_LABEL, VITE_SPRINT_PRICE_LABEL); Stripe holds the real
 * amounts. Which options exist comes from the API (only configured prices are
 * sold). Upgrade goes through /account?upgrade=1&option=… (checkout).
 *
 * When the Sprint pass is on sale it is the recommended paid option and sits
 * before Pro; with an interview date saved for any job (lib/interviewDates)
 * its card says how far away the interview is. */

import { useState } from "react";
import { PRO_ANNUAL_PRICE_LABEL, PRO_PRICE_LABEL, SPRINT_PRICE_LABEL, SUPPORT_EMAIL } from "../config";
import { annualSavingsPct, shortDate, splitLabel, useBilling } from "../lib/billing";
import { LIMITS, PLAN_MATRIX, usePlan, type Feature } from "../lib/plans";
import { daysUntil, useInterviewDates } from "../lib/interviewDates";
import { Link } from "../lib/router";

const SPRINT_POINTS = [
  "Everything in Pro for 30 days",
  "One payment. No subscription, nothing to cancel",
  "Buy again before it ends to add 30 more days",
];

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

/** Days to the nearest interview today or later, across all jobs; null when none. */
function nearestInterview(dates: Record<string, string>): number | null {
  let best: number | null = null;
  for (const iso of Object.values(dates)) {
    const d = daysUntil(iso);
    if (d != null && d >= 0 && (best == null || d < best)) best = d;
  }
  return best;
}

function sprintFit(days: number): string {
  if (days === 0) return "Your interview is today. Good luck: you’ve got this.";
  const when = days === 1 ? "tomorrow" : "in " + days + " days";
  if (days <= 30) return "Your interview is " + when + ". The Sprint pass covers it, with no renewal.";
  return "Your interview is " + when + ". Start a Sprint pass when you’re 30 days out, or add a second pass to cover the rest.";
}

function Cell({ value }: { value: string }) {
  if (value === "—") return <span className="pr-none" aria-label="Not included">{"—"}</span>;
  return <>{value}</>;
}

export default function PricingPage() {
  const p = usePlan();
  const b = useBilling();
  const opts = b.info ? b.info.options : null; // null = unknown (offline / old API): plain monthly as before
  const hasMonthly = !opts || opts.includes("monthly");
  const hasAnnual = !!opts && opts.includes("annual");
  const hasSprint = !!opts && opts.includes("sprint");
  const hasPro = hasMonthly || hasAnnual;
  const showToggle = hasMonthly && hasAnnual;
  const save = showToggle ? annualSavingsPct() : null;
  const [picked, setPicked] = useState<"monthly" | "annual">("monthly");
  const cycle: "monthly" | "annual" = !hasMonthly && hasAnnual ? "annual" : hasAnnual ? picked : "monthly";

  const source = b.info?.pro_source || null;
  const onPro = p.signedIn && p.plan === "pro";
  const onSub = onPro && source === "subscription";
  const onSprint = onPro && source === "sprint";
  const onFree = p.signedIn && p.plan === "free" && !p.loading;
  const [amount, per] = splitLabel(cycle === "annual" ? PRO_ANNUAL_PRICE_LABEL : PRO_PRICE_LABEL);
  const [sAmount, sPer] = splitLabel(SPRINT_PRICE_LABEL);
  const [dates] = useInterviewDates();
  const days = nearestInterview(dates);
  const fit = hasSprint && days != null && !onPro ? sprintFit(days) : "";
  // Sprint leads the paid options whenever it's on sale.
  const sprintFirst = hasSprint;

  return (
    <div className="page pricing">
      <header className="pr-hero">
        <p className="pr-eyebrow">Pricing</p>
        <h1>{hasSprint ? "Free to start. A pass for the interview you’ve booked." : "Free to start. Pro when your interview is real."}</h1>
        <p className="pr-lede">
          {hasSprint
            ? "Learn, add a job and practise for free. When an interview is on the calendar, a 30-day Sprint pass covers the run-up with one payment and nothing to cancel."
            : "Learn, add a job and practise for free. Upgrade when you have an interview on the calendar and want an AI interviewer that pushes back."}
        </p>
        {showToggle && (
          <div className="bl-toggle" role="group" aria-label="Billing period">
            <button type="button" aria-pressed={cycle === "monthly"} className={cycle === "monthly" ? "on" : ""} onClick={() => setPicked("monthly")}>
              Monthly
            </button>
            <button type="button" aria-pressed={cycle === "annual"} className={cycle === "annual" ? "on" : ""} onClick={() => setPicked("annual")}>
              Annual{save ? <span className="bl-save">save {save}%</span> : null}
            </button>
          </div>
        )}
      </header>

      <div className={"pr-plans" + (hasSprint && hasPro ? " pr-plans-3" : "")}>
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
          <Link className="btn btn-block" to="/analyze">{p.signedIn ? "Add a job" : "Start free"}</Link>
        </section>

        {hasSprint && (
          <section className={"card pr-plan pr-plan-sprint" + (sprintFirst ? " pr-rec" : "")} aria-labelledby="pr-sprint">
            {sprintFirst && !onPro ? <p className="pr-rec-tag">Recommended if your interview is booked</p> : null}
            <div className="pr-plan-top">
              <h2 id="pr-sprint">Interview Sprint</h2>
              {onSprint ? <span className="pill pill-ok">Ends {shortDate(b.info?.pro_expires_at)}</span> : <span className="bl-pass">30-day pass</span>}
            </div>
            <p className="pr-price">
              <span className="pr-amount">{sAmount}</span> {sPer && <span className="pr-per">{sPer}</span>}
            </p>
            <p className="muted">One payment for 30 days of Pro. Sized for one interview loop, not a subscription.</p>
            {fit ? <p className="pr-fit" role="status">{fit}</p> : null}
            <ul className="pr-points">
              {SPRINT_POINTS.map((t) => (
                <li key={t}><Check />{t}</li>
              ))}
            </ul>
            {onSub ? (
              <Link className="btn btn-block" to="/account">You have Pro</Link>
            ) : (
              <Link className="btn btn-primary btn-block" to="/account?upgrade=1&option=sprint">
                {onSprint ? "Extend 30 days" : "Get the 30-day pass"}
              </Link>
            )}
            <p className="pr-fine">Doesn’t renew. Secure checkout by Stripe.</p>
          </section>
        )}

        {hasPro && (
          <section className={"card pr-plan pr-plan-pro" + (sprintFirst ? " pr-plan-pro-alt" : "")} aria-labelledby="pr-pro">
            <div className="pr-plan-top">
              <h2 id="pr-pro">Pro</h2>
              {onSub || (onPro && !onSprint) ? <span className="pill pill-ok">Your plan</span> : <span className="pr-tag">{sprintFirst ? "For a longer search" : "For a real interview"}</span>}
            </div>
            <p className="pr-price">
              <span className="pr-amount">{amount}</span> {per && <span className="pr-per">{per}</span>}
            </p>
            <p className="muted">
              {cycle === "annual" ? "Billed once a year. " : ""}Practice the way the interview actually goes, as often as you need.
            </p>
            <ul className="pr-points">
              {PRO_POINTS.map((t) => (
                <li key={t}><Check />{t}</li>
              ))}
            </ul>
            {onPro && !onSprint ? (
              <Link className="btn btn-block" to="/account">Manage your plan</Link>
            ) : (
              <Link className={"btn btn-block" + (sprintFirst ? "" : " btn-primary")} to={"/account?upgrade=1&option=" + cycle}>
                {onSprint ? (cycle === "annual" ? "Switch to annual" : "Switch to monthly") : cycle === "annual" ? "Upgrade to Pro, yearly" : "Upgrade to Pro"}
              </Link>
            )}
            <p className="pr-fine">Cancel anytime. Secure checkout by Stripe.</p>
          </section>
        )}

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
            Yes. Open <Link to="/account">Account</Link> and choose <strong>Manage billing</strong> to cancel, switch
            between monthly and annual, or update your card
            {SUPPORT_EMAIL ? <>. You can also email <a href={"mailto:" + SUPPORT_EMAIL}>{SUPPORT_EMAIL}</a> and we’ll cancel it for you</> : null}.
            When Pro ends you move back to Free, and your saved jobs stay.
          </p>
        </details>
        {hasSprint && (
          <details>
            <summary>How does the Interview Sprint pass work?</summary>
            <p>
              You pay once and get everything in Pro for 30 days. It doesn’t renew, so there’s nothing to cancel. Buying
              another pass before it ends adds 30 days to your current end date. You can switch to a subscription any
              time.
            </p>
          </details>
        )}
        <details>
          <summary>Does OfferReady help during a live interview?</summary>
          <p>
            No, and that’s on purpose. OfferReady is practice-only: there is no live mode, overlay or answer feed. It
            prepares you before the interview and helps you debrief after it. The follow-ups you practise are the same
            kind interviewers use to tell rehearsed or AI-fed answers from real understanding, so what you bring into
            the room is your own.
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
          <p>No account is needed to read the study library or see the <Link to="/example">sample walkthrough</Link>. Analyzing your own job needs a free account, and so does saving jobs, tracking readiness and the AI interviewer features.</p>
        </details>
      </section>
    </div>
  );
}
