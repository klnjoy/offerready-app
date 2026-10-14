/* Usage alert: "You've used 80% of your AI answer feedback". Shown on app
 * pages once the busiest allowance passes 50%, 80% and 100%, with when it
 * resets (monthly plans) or when the pass ends, and a link to the usage
 * breakdown. Each step can be dismissed; it comes back at the next step or
 * the next period. Counts come from the server (lib/plans), which also
 * enforces the limits. */

import { useState } from "react";
import { usePlan, type Feature } from "../lib/plans";
import { Link } from "../lib/router";

const WATCH: Feature[] = ["ai_grading", "voice_mock", "analyses", "resume_tailor", "story_ai", "custom_scenarios"];
const STEPS = [100, 80, 50];
const LABEL: Partial<Record<Feature, string>> = {
  ai_grading: "AI answer feedback",
  voice_mock: "voice mock interviews",
  analyses: "job analyses",
  resume_tailor: "resume tailoring",
  story_ai: "story coaching",
  custom_scenarios: "custom scenarios",
};
const KEY = "offerready.usageAlert.v1";

function readDismissed(): string[] {
  try { const v = JSON.parse(localStorage.getItem(KEY) || "[]"); return Array.isArray(v) ? v : []; } catch { return []; }
}

export function UsageAlert() {
  const p = usePlan();
  const [dismissed, setDismissed] = useState<string[]>(readDismissed);
  if (!p.signedIn || p.loading) return null;

  // The allowance closest to running out.
  let top: { f: Feature; used: number; limit: number; pct: number } | null = null;
  for (const f of WATCH) {
    const u = p.usage[f];
    if (!u || u.unknown || !u.limit) continue;
    const pct = Math.min(100, Math.round((u.used / u.limit) * 100));
    if (!top || pct > top.pct) top = { f, used: u.used, limit: u.limit, pct };
  }
  if (!top) return null;
  const step = STEPS.find((s) => top!.pct >= s);
  if (!step) return null;
  if (top.f === "voice_mock" && p.mockCredits > 0 && top.pct >= 100) return null; // pack credits keep mocks open

  const period = p.pass ? "pass:" + p.pass.expiresAt : "month:" + (p.resetsAt || "");
  const id = [top.f, step, period].join("|");
  if (dismissed.includes(id)) return null;
  const dismiss = () => {
    const next = [...dismissed.filter((d) => d.split("|")[2] === period), id].slice(-30);
    setDismissed(next);
    try { localStorage.setItem(KEY, JSON.stringify(next)); } catch { /* private mode */ }
  };

  const noun = LABEL[top.f] || top.f;
  const when = p.pass
    ? "Your pass runs until " + new Date(p.pass.expiresAt).toLocaleDateString(undefined, { month: "short", day: "numeric" })
    : p.resetsAt
    ? "Resets " + new Date(p.resetsAt).toLocaleDateString(undefined, { weekday: "long", month: "short", day: "numeric", timeZone: "UTC" })
    : "";
  const full = top.pct >= 100;
  const scope = p.pass ? "on this pass" : "this month";

  return (
    <aside className={"ua" + (full ? " ua-full" : step >= 80 ? " ua-high" : "")} role="status" aria-live="polite">
      <div className="ua-body">
        <p className="ua-title">{full ? "You’ve used all your " + noun + " " + scope : "You’ve used " + top.pct + "% of your " + noun + " " + scope}</p>
        <p className="ua-sub">{top.used} of {top.limit}{when ? " · " + when : ""}</p>
        <span className="ua-bar" aria-hidden="true"><span style={{ width: top.pct + "%" }} /></span>
      </div>
      <div className="ua-actions">
        <Link className="btn btn-small" to="/account#usage">View usage</Link>
        {full || (!p.pass && p.plan === "free" && step >= 80) ? <Link className="btn btn-small btn-primary" to="/pricing">{p.pass ? "Extend" : "See passes"}</Link> : null}
      </div>
      <button type="button" className="ua-x" aria-label="Dismiss" onClick={dismiss}>×</button>
    </aside>
  );
}
