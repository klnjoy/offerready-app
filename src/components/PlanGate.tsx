/* <PlanGate feature="voice_mock"> renders children for users who can use the
 * feature, otherwise an upgrade card. <UpgradeCard> is the same card alone,
 * for showing after the server answers 403 {upgrade:true}.
 * CONTRACT: keep these props stable; other screens use them. */
import type { ReactNode } from "react";
import type { PassKind } from "../lib/api";
import { LIMITS, PLAN_MATRIX, featureNoun, usePlan, type Feature } from "../lib/plans";
import { MOCK_PACK, PASSES, POPULAR, passName } from "../lib/passes";
import { Link } from "../lib/router";

function LockIcon() {
  return (
    <svg className="upgrade-lock" width="20" height="20" viewBox="0 0 24 24" aria-hidden="true" focusable="false">
      <rect x="4.5" y="10.5" width="15" height="10" rx="2.2" fill="none" stroke="currentColor" strokeWidth="1.8" />
      <path d="M8 10.5V7.8a4 4 0 0 1 8 0v2.7" fill="none" stroke="currentColor" strokeWidth="1.8" strokeLinecap="round" />
      <circle cx="12" cy="15.5" r="1.4" fill="currentColor" />
    </svg>
  );
}

function labelFor(feature: Feature): string {
  const row = PLAN_MATRIX.find((r) => r.feature === feature);
  return row ? row.label : featureNoun(feature, 2);
}

/** Default explanation, from the user's real usage when we have it. */
function defaultMessage(feature: Feature, used: number, limit: number | null, pass: PassKind | null): string {
  const pop = PASSES[POPULAR];
  const inPop = pop.limits[feature];
  const popPart = inPop === null ? `Every pass includes it.` : `The ${pop.name} includes ${inPop} ${featureNoun(feature, inPop)}.`;
  if (pass) {
    const name = passName(pass);
    if (feature === "saved_jobs") return `Your ${name} includes ${limit ?? 1} ${featureNoun(feature, limit ?? 1)}. Remove one you no longer need, or add a bigger pass.`;
    return `You’ve used all ${limit ?? 0} ${featureNoun(feature, 2)} in your ${name}.${feature === "voice_mock" ? " A mock pack adds 10 more, or add another pass." : " Add another pass to top it up."}`;
  }
  if (feature === "saved_jobs") {
    return `Free includes ${limit ?? 1} ${featureNoun(feature, limit ?? 1)}. ${popPart}`;
  }
  if (!limit) {
    return `${labelFor(feature)} ${feature === "premium_scenarios" ? "is previews only" : "isn’t included"} on Free. ${popPart}`;
  }
  return `You’ve used ${used} of ${limit} ${featureNoun(feature, 2)} this month on Free. ${popPart}`;
}

export function UpgradeCard({ feature, title, message }: { feature: Feature; title?: string; message?: string }) {
  const p = usePlan();
  const u = p.usage[feature];
  const passKind = p.pass ? p.pass.kind : null;
  const limit = u ? u.limit : LIMITS.free[feature];
  const used = u && !u.unknown ? u.used : limit ?? 0;
  const heading = title || (passKind ? `You’ve used this part of your pass` : limit ? `You’ve reached this month’s Free limit` : `${labelFor(feature)} comes with a pass`);
  const isMock = feature === "voice_mock";
  return (
    <div className="card upgrade-card" role="region" aria-label="Get more with a pass">
      <div className="upgrade-head">
        <span className="upgrade-icon">
          <LockIcon />
        </span>
        <h3>{heading}</h3>
      </div>
      {message ? <p className="upgrade-lead">{message}</p> : null}
      <p className="upgrade-msg">{defaultMessage(feature, used, limit, passKind)}</p>
      {p.resetsAt && limit && !passKind ? (
        <p className="upgrade-reset small">
          Free resets on{" "}
          {new Date(p.resetsAt).toLocaleDateString(undefined, { month: "short", day: "numeric", timeZone: "UTC" })}.
        </p>
      ) : null}
      <p className="upgrade-reset small">One-time payment. Nothing renews.</p>
      <div className="row upgrade-actions">
        {isMock && passKind ? (
          <Link className="btn btn-primary" to={"/account?upgrade=1&option=" + MOCK_PACK.kind}>
            Add {MOCK_PACK.amount} mock interviews ({MOCK_PACK.price})
          </Link>
        ) : (
          <Link className="btn btn-primary" to="/pricing">
            {passKind ? "Add another pass" : "See passes"}
          </Link>
        )}
        {isMock && !passKind ? (
          <Link className="btn btn-ghost" to={"/account?upgrade=1&option=" + MOCK_PACK.kind}>
            Or {MOCK_PACK.amount} mock interviews for {MOCK_PACK.price}
          </Link>
        ) : (
          <Link className="btn btn-ghost" to="/pricing">
            Compare passes
          </Link>
        )}
      </div>
    </div>
  );
}

export function PlanGate({ feature, title, message, children }: { feature: Feature; title?: string; message?: string; children: ReactNode }) {
  const p = usePlan();
  // While the plan loads, or when usage is unknown, show the feature: the
  // server enforces limits, so a gate here only saves a wasted request.
  if (p.loading || p.can(feature)) return <>{children}</>;
  return <UpgradeCard feature={feature} title={title} message={message} />;
}
