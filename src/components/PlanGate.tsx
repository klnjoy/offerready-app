/* <PlanGate feature="voice_mock"> renders children for users who can use the
 * feature, otherwise an upgrade card. <UpgradeCard> is the same card alone,
 * for showing after the server answers 403 {upgrade:true}.
 * CONTRACT: keep these props stable; other screens use them. */
import type { ReactNode } from "react";
import { LIMITS, PLAN_MATRIX, featureNoun, usePlan, type Feature } from "../lib/plans";
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
function defaultMessage(feature: Feature, used: number, limit: number | null): string {
  const pro = LIMITS.pro[feature];
  const proPart = pro === null ? "Pro has no monthly limit." : `Pro includes ${pro} ${featureNoun(feature, pro)} a month.`;
  if (feature === "saved_jobs") {
    return `Free includes ${limit ?? 1} ${featureNoun(feature, limit ?? 1)}. Pro saves as many jobs as you need.`;
  }
  if (!limit) {
    return `${labelFor(feature)} ${feature === "premium_scenarios" ? "is previews only" : "isn’t included"} on Free. ${proPart}`;
  }
  return `You’ve used ${used} of ${limit} ${featureNoun(feature, 2)} this month on Free. ${proPart}`;
}

export function UpgradeCard({ feature, title, message }: { feature: Feature; title?: string; message?: string }) {
  const p = usePlan();
  const u = p.usage[feature];
  const limit = u ? u.limit : LIMITS.free[feature];
  const used = u && !u.unknown ? u.used : limit ?? 0;
  const heading = title || (limit ? `You’ve reached this month’s Free limit` : `${labelFor(feature)} is part of Pro`);
  return (
    <div className="card upgrade-card" role="region" aria-label="Upgrade to Pro">
      <div className="upgrade-head">
        <span className="upgrade-icon">
          <LockIcon />
        </span>
        <h3>{heading}</h3>
      </div>
      {message ? <p className="upgrade-lead">{message}</p> : null}
      <p className="upgrade-msg">{defaultMessage(feature, used, limit)}</p>
      {p.resetsAt && limit ? (
        <p className="upgrade-reset small">
          Free resets on{" "}
          {new Date(p.resetsAt).toLocaleDateString(undefined, { month: "short", day: "numeric", timeZone: "UTC" })}.
        </p>
      ) : null}
      <div className="row upgrade-actions">
        <Link className="btn btn-primary" to="/account?upgrade=1">
          Upgrade to Pro
        </Link>
        <Link className="btn btn-ghost" to="/pricing">
          Compare plans
        </Link>
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
