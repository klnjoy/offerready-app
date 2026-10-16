/* Phone header, top right: "Get Pro" on the free plan, a small "Pro" badge
 * when you have it. Only with the tab bar (see .plan-chip in styles.css). */

import { usePlan } from "../lib/plans";
import { Link } from "../lib/router";

export function PlanChip() {
  const plan = usePlan();
  if (!plan.signedIn || plan.loading) return null;
  if (plan.plan === "pro") {
    return <Link className="plan-chip is-pro" to="/account#usage" aria-label="Your Pro plan and usage">Pro</Link>;
  }
  return (
    <Link className="plan-chip" to="/pricing">
      <svg viewBox="0 0 20 20" width="14" height="14" aria-hidden="true"><path d="m10 2.5 2.1 4.6 5 .5-3.8 3.4 1.1 4.9L10 13.4l-4.4 2.5 1.1-4.9L2.9 7.6l5-.5L10 2.5Z" fill="currentColor" /></svg>
      Get Pro
    </Link>
  );
}
