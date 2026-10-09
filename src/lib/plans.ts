/* Free vs Pro: the single source of truth for plan limits in the app.
 *
 * CONTRACT (other screens import these; keep the signatures stable):
 *   type Plan, type Feature, PLAN_MATRIX, usePlan(), <PlanGate> (components/PlanGate.tsx)
 * The server enforces the same limits (api/_lib/plans.js); the app only uses
 * this to explain limits and show upgrade prompts before a request fails. */

import { useCallback, useEffect, useState } from "react";
import { API_ENABLED } from "../config";
import * as api from "./api";
import type { PassKind, PlanResponse } from "./api";
import { useAuth } from "./auth";

export type Plan = "free" | "pro";

export type Feature =
  | "saved_jobs"        // jobs saved to your account
  | "analyses"          // job analyses per month
  | "ai_grading"        // AI feedback on typed answers
  | "voice_mock"        // voice mock interview with follow-ups
  | "custom_scenarios"  // AI-generated Defend scenarios
  | "premium_scenarios" // the Pro Defend scenario library
  | "story_ai"          // AI help mapping/strengthening STAR stories
  | "prep_plan"         // day-by-day plan to an interview date
  | "resume_tailor";    // AI resume bullet tailoring for a job

export interface Usage { used: number; limit: number | null; unknown?: boolean } // null = unlimited; unknown = server couldn't count

export interface PlanPass { kind: PassKind; kinds: PassKind[]; expiresAt: string }

export interface PlanInfo {
  plan: Plan;
  signedIn: boolean;
  loading: boolean;
  usage: Partial<Record<Feature, Usage>>;
  /** When monthly counters reset (ISO, first instant of next UTC month). Unset on a pass: its allowance doesn't reset. */
  resetsAt?: string;
  /** The live one-time pass, when Pro comes from one. Usage then counts since the pass started. */
  pass: PlanPass | null;
  /** Mock pack credits left (never expire). */
  mockCredits: number;
}

/** Feature rows for Pricing, Account and the home page. `free` is the monthly
 * Free allowance; `pro` is what the most popular pass (90 days) includes for
 * its whole length. Pricing shows every pass from lib/passes. */
export const PLAN_MATRIX: { feature: Feature | "library"; label: string; free: string; pro: string }[] = [
  { feature: "library", label: "Study library, question banks, practice mode", free: "Included", pro: "Included" },
  { feature: "saved_jobs", label: "Saved jobs", free: "1", pro: "15" },
  { feature: "analyses", label: "Job analyses", free: "3 / month", pro: "80" },
  { feature: "prep_plan", label: "Day-by-day plan to your interview date", free: "Included", pro: "Included + calendar export" },
  { feature: "ai_grading", label: "AI feedback on your answers", free: "5 / month", pro: "600" },
  { feature: "voice_mock", label: "Voice mock interview with follow-ups", free: "1 / month", pro: "20" },
  { feature: "premium_scenarios", label: "Defend-your-decision scenario library", free: "Previews", pro: "Full library" },
  { feature: "custom_scenarios", label: "Scenarios generated for your job", free: "—", pro: "40" },
  { feature: "story_ai", label: "STAR story bank coaching", free: "3 / month", pro: "120" },
  { feature: "resume_tailor", label: "Resume tailoring for a job", free: "2 / month", pro: "80" },
];

/** Monthly limits; must match api/_lib/plans.js LIMITS. null = unlimited.
 * `pro` is the monthly subscription (only sold if configured); passes have
 * their own whole-pass allowances in lib/passes. */
export const LIMITS: Record<Plan, Record<Feature, number | null>> = {
  free: { saved_jobs: 1, analyses: 3, ai_grading: 5, voice_mock: 1, custom_scenarios: 0, premium_scenarios: 0, story_ai: 3, prep_plan: null, resume_tailor: 2 },
  pro: { saved_jobs: null, analyses: 60, ai_grading: 400, voice_mock: 40, custom_scenarios: 40, premium_scenarios: null, story_ai: 150, prep_plan: null, resume_tailor: 100 },
};

/** [singular, plural] nouns for limit messages ("1 of 1 voice sessions"). */
export const FEATURE_NOUNS: Record<Feature, [string, string]> = {
  saved_jobs: ["saved job", "saved jobs"],
  analyses: ["job analysis", "job analyses"],
  ai_grading: ["AI answer grading", "AI answer gradings"],
  voice_mock: ["voice session", "voice sessions"],
  custom_scenarios: ["custom scenario", "custom scenarios"],
  premium_scenarios: ["premium scenario", "premium scenarios"],
  story_ai: ["story coaching session", "story coaching sessions"],
  prep_plan: ["prep plan", "prep plans"],
  resume_tailor: ["resume tailoring run", "resume tailoring runs"],
};

export function featureNoun(f: Feature, n: number | null): string {
  const w = FEATURE_NOUNS[f] || [String(f), String(f)];
  return n === 1 ? w[0] : w[1];
}

/** True when the feature may be used: unlimited, under the limit, or usage unknown. */
export function canUse(usage: Partial<Record<Feature, Usage>>, f: Feature): boolean {
  const u = usage[f];
  if (!u || u.unknown) return true;
  if (u.limit === null) return true;
  return u.used < u.limit;
}

// ---- usePlan: /api/me/plan with a 2-minute memory + sessionStorage cache ----

interface Cached { who: string; at: number; plan: Plan; usage: Partial<Record<Feature, Usage>>; resetsAt?: string; pass?: PlanPass | null; mockCredits?: number }

const TTL_MS = 2 * 60 * 1000;
const SS_KEY = "offerready.plan.v2";
let mem: Cached | null = null;
let inflight: { who: string; p: Promise<void> } | null = null;
const listeners = new Set<() => void>();

function readSession(who: string): Cached | null {
  try {
    const raw = sessionStorage.getItem(SS_KEY);
    if (!raw) return null;
    const c = JSON.parse(raw) as Cached;
    return c && c.who === who && Date.now() - c.at < TTL_MS ? c : null;
  } catch {
    return null;
  }
}

function writeSession(c: Cached | null) {
  try {
    if (c) sessionStorage.setItem(SS_KEY, JSON.stringify(c));
    else sessionStorage.removeItem(SS_KEY);
  } catch {
    /* private mode / blocked storage: memory cache still works */
  }
}

function fresh(who: string): Cached | null {
  if (mem && mem.who === who && Date.now() - mem.at < TTL_MS) return mem;
  const s = readSession(who);
  if (s) mem = s;
  return s;
}

function normalize(body: PlanResponse): Pick<Cached, "plan" | "usage" | "resetsAt" | "pass" | "mockCredits"> {
  const plan: Plan = body.plan === "pro" ? "pro" : "free";
  const usage: Partial<Record<Feature, Usage>> = {};
  for (const f of Object.keys(LIMITS[plan]) as Feature[]) {
    const e = body.usage ? body.usage[f] : undefined;
    const limit = e && e.limit !== undefined ? e.limit : LIMITS[plan][f];
    if (limit === 0) usage[f] = { used: 0, limit: 0 }; // not included: known without counting
    else if (!e || e.unknown || typeof e.used !== "number") usage[f] = { used: 0, limit, unknown: true };
    else usage[f] = { used: e.used, limit };
  }
  const bp = body.pass;
  const pass: PlanPass | null = plan === "pro" && bp && bp.kind && bp.expires_at
    ? { kind: bp.kind, kinds: Array.isArray(bp.kinds) && bp.kinds.length ? bp.kinds : [bp.kind], expiresAt: bp.expires_at }
    : null;
  const mockCredits = Math.max(0, Number(body.credits?.voice_mock) || 0);
  return { plan, usage, resetsAt: pass ? undefined : body.period_end, pass, mockCredits };
}

function notify() {
  listeners.forEach((l) => l());
}

/** Drop the cached plan (e.g. after an upgrade or a 403). Next render refetches. */
export function invalidatePlan() {
  mem = null;
  writeSession(null);
  notify();
}

export function usePlan(): PlanInfo & { refresh(): void; can(f: Feature): boolean } {
  const auth = useAuth();
  const signedIn = !!auth.session;
  const who = signedIn ? auth.email || "signed-in" : "";
  const [, setTick] = useState(0);
  const [failed, setFailed] = useState(false);

  useEffect(() => {
    const l = () => setTick((t) => t + 1);
    listeners.add(l);
    return () => {
      listeners.delete(l);
    };
  }, []);

  const load = useCallback(
    (force: boolean) => {
      if (!signedIn || !API_ENABLED) return;
      if (!force && fresh(who)) return;
      if (inflight && inflight.who === who && !force) return;
      const p = (async () => {
        const tok = await auth.getAccessToken();
        if (!tok) { setFailed(true); return; }
        const res = await api.getPlan(tok);
        if (res.status === 200 && res.body) {
          mem = { who, at: Date.now(), ...normalize(res.body) };
          writeSession(mem);
          setFailed(false);
        } else {
          setFailed(true); // fail open: free, usage unknown -> can() is true
        }
      })().finally(() => {
        if (inflight && inflight.p === p) inflight = null;
        notify();
      });
      inflight = { who, p };
      notify();
    },
    [signedIn, who, auth],
  );

  useEffect(() => {
    load(false);
  }, [load]);

  const cached = signedIn ? fresh(who) : null;
  const plan: Plan = cached ? cached.plan : "free";
  const usage = cached ? cached.usage : {};
  // Signed in but no answer yet (first fetch in flight). Gates show their
  // children meanwhile; the server is the one that enforces.
  const loading = signedIn && API_ENABLED && !cached && !failed;
  return {
    plan,
    signedIn,
    loading,
    usage,
    resetsAt: cached?.resetsAt,
    pass: cached?.pass || null,
    mockCredits: cached?.mockCredits || 0,
    refresh: () => load(true),
    // Pack credits keep voice mock interviews open past the allowance.
    can: (f: Feature) => canUse(usage, f) || (f === "voice_mock" && (cached?.mockCredits || 0) > 0),
  };
}
