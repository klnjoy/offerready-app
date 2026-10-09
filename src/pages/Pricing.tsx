/* Pricing: Free plus one-time passes that never auto-renew, and a mock pack.
 * Allowances come from lib/passes (mirrors api/_lib/passes.js, which the
 * server enforces); prices are display labels from config (PRICE_LABELS),
 * Stripe holds the real amounts. Which options can be bought comes from the
 * API (only configured prices are sold). Buying goes through
 * /account?upgrade=1&option=… (checkout).
 *
 * With an interview date saved for any job (lib/interviewDates), the page
 * suggests the shortest pass that covers it. Monthly/annual subscriptions are
 * shown only when the deployment still sells them. */

import { PRO_ANNUAL_PRICE_LABEL, PRO_PRICE_LABEL, SUPPORT_EMAIL } from "../config";
import type { BillingOption, PassKind } from "../lib/api";
import { shortDate, useBilling } from "../lib/billing";
import { LIMITS, PLAN_MATRIX, featureNoun, usePlan, type Feature } from "../lib/plans";
import { MOCK_PACK, PASSES, PASS_ORDER, POPULAR, passForDays, passName, perDay, type PassDef } from "../lib/passes";
import { daysUntil, useInterviewDates } from "../lib/interviewDates";
import { Link } from "../lib/router";

/** Rows of the compare table, in PLAN_MATRIX order and wording. */
const ROWS = PLAN_MATRIX.filter((r) => r.feature !== "library");

/** The four numbers each pass card leads with. */
const CARD_FEATURES: Feature[] = ["voice_mock", "ai_grading", "saved_jobs", "analyses"];

const FREE_POINTS = [
  "Study library, question banks and practice mode",
  `${LIMITS.free.saved_jobs} saved job and ${LIMITS.free.analyses} job analyses a month`,
  `${LIMITS.free.ai_grading} AI answer gradings and ${LIMITS.free.voice_mock} voice mock interview a month`,
  "Day-by-day plan to your interview date",
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

function fitLine(days: number, kind: PassKind): string {
  const when = days === 0 ? "today" : days === 1 ? "tomorrow" : "in " + days + " days";
  return `Your interview is ${when}. The ${PASSES[kind].name} covers it, with nothing to cancel afterwards.`;
}

const CARD_NOUNS: Partial<Record<Feature, [string, string]>> = { voice_mock: ["mock interview", "mock interviews"] };

function amount(def: PassDef, f: Feature): string {
  const v = def.limits[f];
  const w = CARD_NOUNS[f];
  if (v === null) return "Unlimited " + (w ? w[1] : featureNoun(f, 2));
  return `${v} ${w ? w[v === 1 ? 0 : 1] : featureNoun(f, v)}`;
}

function cell(v: number | null | undefined, monthly: boolean): string {
  if (v === undefined) return "";
  if (v === null) return "Included";
  if (v === 0) return "—";
  return monthly ? `${v} / month` : String(v);
}

function Cell({ value }: { value: string }) {
  if (value === "—") return <span className="pr-none" aria-label="Not included">{"—"}</span>;
  return <>{value}</>;
}

export default function PricingPage() {
  const p = usePlan();
  const b = useBilling();
  const opts = b.info ? b.info.options : null; // null = unknown (loading / offline): show every option
  const sells = (o: BillingOption) => !opts || opts.includes(o);
  const anyPassSold = !opts || PASS_ORDER.some((k) => opts.includes(k));
  const subs = !!opts && (opts.includes("monthly") || opts.includes("annual"));

  const mine: PassKind | null = p.pass ? p.pass.kind : b.info?.pass_kind || null;
  const passEnd = p.pass?.expiresAt || (b.info?.pro_source === "pass" ? b.info.pro_expires_at : null);
  const onSub = p.plan === "pro" && b.info?.pro_source === "subscription";
  const onFree = p.signedIn && p.plan === "free" && !p.loading;

  const [dates] = useInterviewDates();
  const days = nearestInterview(dates);
  const jobs = Object.keys(dates).length;
  const suggested = passForDays(days, jobs);
  const fit = days != null && !mine ? fitLine(days, suggested) : "";
  const highlight: PassKind = days != null && !mine ? suggested : POPULAR;

  return (
    <div className="page pricing">
      <header className="pr-hero">
        <p className="pr-eyebrow">Pricing</p>
        <h1>Pay once for your interview. Nothing renews.</h1>
        <p className="pr-lede">
          Interview prep has an end date, so OfferReady doesn’t charge by the month. Pick a pass for the length of
          your search. Every pass includes everything, with an allowance sized to its length.
        </p>
        {fit ? <p className="pr-fit" role="status">{fit}</p> : null}
        {mine && passEnd ? (
          <p className="pr-fit" role="status">
            You have the {passName(mine)} until {shortDate(passEnd)}. A new pass starts when it ends, and its allowance is added right away.
          </p>
        ) : null}
      </header>

      <div className="pr-plans pr-passes">
        {PASS_ORDER.map((k) => {
          const def = PASSES[k];
          const rec = k === highlight;
          const day = perDay(def);
          const isMine = mine === k;
          const sold = sells(k);
          return (
            <section key={k} className={"card pr-plan pr-pass" + (rec ? " pr-rec" : "")} aria-labelledby={"pr-" + k}>
              {rec ? <p className="pr-rec-tag">{days != null && !mine ? "Fits your interview date" : "Most popular"}</p> : null}
              <div className="pr-plan-top">
                <h2 id={"pr-" + k}>{def.name}</h2>
                {isMine ? <span className="pill pill-ok">Your pass</span> : <span className="pr-days">{def.days} days</span>}
              </div>
              <p className="pr-price">
                <span className="pr-amount">{def.price}</span> <span className="pr-per">one-time</span>
              </p>
              <p className="pr-forwho">{def.fit}{day ? <span className="pr-perday"> · about {day} a day</span> : null}</p>
              <ul className="pr-points">
                {CARD_FEATURES.map((f) => (
                  <li key={f}><Check />{amount(def, f)}</li>
                ))}
                <li><Check />Full trade-off scenario library</li>
              </ul>
              {sold ? (
                <Link className={"btn btn-block" + (rec ? " btn-primary" : "")} to={"/account?upgrade=1&option=" + k}>
                  {mine ? "Add after my pass" : "Get this pass"}
                </Link>
              ) : (
                <button type="button" className="btn btn-block" disabled>Coming soon</button>
              )}
              <p className="pr-fine">Doesn’t renew. Secure checkout by Stripe.</p>
            </section>
          );
        })}
      </div>

      <section className="card pr-addon" aria-labelledby="pr-pack-h">
        <div>
          <h2 id="pr-pack-h">{MOCK_PACK.name}</h2>
          <p className="muted">
            {MOCK_PACK.amount} extra voice mock interviews for {MOCK_PACK.price}, on Free or any pass. They never expire and are
            used only after your plan’s own mock interviews run out.
          </p>
        </div>
        {sells(MOCK_PACK.kind) ? (
          <Link className="btn" to={"/account?upgrade=1&option=" + MOCK_PACK.kind}>Add {MOCK_PACK.amount} mock interviews</Link>
        ) : (
          <button type="button" className="btn" disabled>Coming soon</button>
        )}
      </section>

      <section className="card pr-free" aria-labelledby="pr-free">
        <div>
          <div className="pr-plan-top">
            <h2 id="pr-free">Free</h2>
            {onFree && <span className="pill pill-info">Your plan</span>}
          </div>
          <p className="muted">Everything you need to understand a role and start preparing. Limits reset each month.</p>
          <ul className="pr-points pr-points-inline">
            {FREE_POINTS.map((t) => (
              <li key={t}><Check />{t}</li>
            ))}
          </ul>
        </div>
        <Link className="btn" to="/analyze">{p.signedIn ? "Add a job" : "Start free"}</Link>
      </section>

      <section className="card pr-compare" aria-labelledby="pr-compare-h">
        <h2 id="pr-compare-h">What each plan includes</h2>
        <div className="table-wrap">
          <table className="pr-table pr-table-passes">
            <thead>
              <tr>
                <th scope="col">Feature</th>
                <th scope="col">Free</th>
                {PASS_ORDER.map((k) => <th scope="col" key={k} className={k === highlight ? "pr-col-rec" : ""}>{PASSES[k].name}</th>)}
              </tr>
            </thead>
            <tbody>
              <tr>
                <th scope="row">Price</th>
                <td>$0</td>
                {PASS_ORDER.map((k) => <td key={k} className={k === highlight ? "pr-col-rec" : ""}>{PASSES[k].price} once</td>)}
              </tr>
              <tr>
                <th scope="row">Length</th>
                <td>Always</td>
                {PASS_ORDER.map((k) => <td key={k} className={k === highlight ? "pr-col-rec" : ""}>{PASSES[k].days} days</td>)}
              </tr>
              {ROWS.map((r) => {
                const f = r.feature as Feature;
                return (
                  <tr key={r.feature}>
                    <th scope="row">{r.label}</th>
                    <td><Cell value={f === "premium_scenarios" ? "Previews" : f === "prep_plan" ? "Included" : cell(LIMITS.free[f], f !== "saved_jobs")} /></td>
                    {PASS_ORDER.map((k) => (
                      <td key={k} className={k === highlight ? "pr-col-rec" : ""}>
                        <Cell value={f === "premium_scenarios" ? "Full library" : f === "prep_plan" ? "Included + calendar" : cell(PASSES[k].limits[f], false)} />
                      </td>
                    ))}
                  </tr>
                );
              })}
            </tbody>
          </table>
        </div>
        <p className="hint">
          Pass numbers are for the whole pass, not per month. Saved jobs is how many you can keep at once. A use counts
          only when the AI result comes back; failed or timed-out requests aren’t counted.
        </p>
      </section>

      {subs && (
        <section className="card pr-subs" aria-labelledby="pr-subs-h">
          <h2 id="pr-subs-h">Prefer a subscription?</h2>
          <p className="muted">
            Pro is also available as a subscription
            {opts?.includes("monthly") ? <> at {PRO_PRICE_LABEL}</> : null}
            {opts?.includes("monthly") && opts?.includes("annual") ? " or " : opts?.includes("annual") ? " at " : ""}
            {opts?.includes("annual") ? PRO_ANNUAL_PRICE_LABEL : null}, with monthly fair-use limits. Cancel anytime.
          </p>
          <div className="row wrap">
            {onSub ? <Link className="btn" to="/account">Manage your subscription</Link> : (
              <>
                {opts?.includes("monthly") && <Link className="btn btn-ghost" to="/account?upgrade=1&option=monthly">Monthly</Link>}
                {opts?.includes("annual") && <Link className="btn btn-ghost" to="/account?upgrade=1&option=annual">Yearly</Link>}
              </>
            )}
          </div>
        </section>
      )}

      <section className="pr-faq" aria-labelledby="pr-faq-h">
        <h2 id="pr-faq-h">Questions</h2>
        <details>
          <summary>Does a pass renew automatically?</summary>
          <p>
            No. You pay once and the pass ends on its own date. There’s no subscription, so there’s nothing to cancel and
            no surprise charge after you get the offer. When it ends you move back to Free, and your saved jobs stay.
          </p>
        </details>
        <details>
          <summary>What if my search takes longer?</summary>
          <p>
            Buy another pass any time. It starts the day your current pass ends, so you don’t lose any days, and its
            allowance is added to what you have left straight away.
          </p>
        </details>
        <details>
          <summary>Why do passes have limits?</summary>
          <p>
            Every AI grading and mock interview costs us to run, so each pass includes a fixed allowance for its whole
            length. The numbers sit well above what a focused prep uses. If you run out of mock interviews, a mock pack
            adds {MOCK_PACK.amount} more{SUPPORT_EMAIL ? <>, or <a href={"mailto:" + SUPPORT_EMAIL}>write to us</a> if you need more of something for a real reason</> : null}.
          </p>
        </details>
        <details>
          <summary>Which pass should I pick?</summary>
          <p>
            One interview booked: the {PASSES.job.name}. A few interviews in the next month: the {PASSES.pass30.name}.
            A full job search: the {PASSES.pass90.name}, which most people choose. Preparing over many months: the {PASSES.pass365.name}.
            {anyPassSold ? null : " Passes open for checkout soon."}
          </p>
        </details>
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
            Your resume is read in your browser. Its text goes only with the analysis you ask for, and it’s saved to your
            account only if you turn on resume sync.
          </p>
        </details>
        <details>
          <summary>Do I need an account for Free?</summary>
          <p>No account is needed to read the study library or see the <Link to="/example">sample walkthrough</Link>. Analyzing your own job needs a free account, and so does saving jobs, tracking readiness and the AI interviewer features.</p>
        </details>
      </section>
    </div>
  );
}
