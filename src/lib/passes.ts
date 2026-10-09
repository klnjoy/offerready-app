/* One-time passes and the mock pack: what each one is, costs and includes.
 * Allowances must match api/_lib/passes.js PASSES (the server enforces them).
 * A pass covers its whole length (not per month), never renews, and buying
 * another while one is live starts it when the current one ends. */

import { PRICE_LABELS } from "../config";
import type { PassKind } from "./api";
import type { Feature } from "./plans";

export interface PassDef {
  kind: PassKind;
  name: string;
  days: number;
  price: string;
  /** Who it's for, one line. */
  fit: string;
  limits: Record<Feature, number | null>;
}

export const PASSES: Record<PassKind, PassDef> = {
  job: {
    kind: "job", name: "Job pass", days: 45, price: PRICE_LABELS.job,
    fit: "One interview you’ve booked",
    limits: { saved_jobs: 1, analyses: 10, ai_grading: 100, voice_mock: 4, custom_scenarios: 5, premium_scenarios: null, story_ai: 20, prep_plan: null, resume_tailor: 10 },
  },
  pass30: {
    kind: "pass30", name: "30-day pass", days: 30, price: PRICE_LABELS.pass30,
    fit: "A few interviews this month",
    limits: { saved_jobs: 5, analyses: 30, ai_grading: 250, voice_mock: 8, custom_scenarios: 15, premium_scenarios: null, story_ai: 50, prep_plan: null, resume_tailor: 30 },
  },
  pass90: {
    kind: "pass90", name: "90-day pass", days: 90, price: PRICE_LABELS.pass90,
    fit: "A full job search",
    limits: { saved_jobs: 15, analyses: 80, ai_grading: 600, voice_mock: 20, custom_scenarios: 40, premium_scenarios: null, story_ai: 120, prep_plan: null, resume_tailor: 80 },
  },
  pass365: {
    kind: "pass365", name: "1-year pass", days: 365, price: PRICE_LABELS.pass365,
    fit: "Ongoing prep, or several searches",
    limits: { saved_jobs: 40, analyses: 200, ai_grading: 1500, voice_mock: 40, custom_scenarios: 100, premium_scenarios: null, story_ai: 300, prep_plan: null, resume_tailor: 200 },
  },
};

export const PASS_ORDER: PassKind[] = ["job", "pass30", "pass90", "pass365"];

/** The pass we suggest to most people. */
export const POPULAR: PassKind = "pass90";

export const MOCK_PACK = { kind: "mock10" as const, amount: 10, price: PRICE_LABELS.mock10, name: "Mock interview pack" };

export function passName(kind: string | null | undefined): string {
  return kind && kind in PASSES ? PASSES[kind as PassKind].name : "Pass";
}

/** Rough price per day, for the card ("about $0.66 a day"). null when the label isn't a number. */
export function perDay(def: PassDef): string | null {
  const m = /(\d+(?:\.\d+)?)/.exec(def.price);
  if (!m) return null;
  const cur = def.price.slice(0, m.index) || "$";
  const v = Number(m[1]) / def.days;
  return cur + (v >= 1 ? v.toFixed(2).replace(/\.00$/, "") : v.toFixed(2));
}

/** Pass that fits an interview `days` away (null = no date): shortest that covers it. */
export function passForDays(days: number | null, jobs: number): PassKind {
  if (days == null) return POPULAR;
  if (days <= 45 && jobs <= 1) return "job";
  if (days <= 30) return "pass30";
  if (days <= 90) return "pass90";
  return "pass365";
}
