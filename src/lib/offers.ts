/* Offer comparison: shapes + PURE math (no storage, no DOM) so it can be
 * unit-tested. Storage: KEYS.offers (local only) via loadOffers/saveOffers.
 *
 * Totals:
 *  - equity per year = annual value when given, else amount / vesting years
 *  - bonus = base × target %
 *  - year 1  = base + bonus + equity/yr + sign-on
 *  - annualised = base + bonus + equity/yr + sign-on / vesting years (sign-on
 *    spread over the same horizon so a big one-off doesn't dominate)  */

import { KEYS, readJSON, writeJSON } from "./storage";

export interface Offer {
  id: string;
  company: string;
  title: string;
  level: string;
  base: number;
  bonusPct: number;
  /** "grant": total grant amount vested over vestYears; "annual": a yearly value. */
  equityMode: "grant" | "annual";
  equityAmount: number;
  vestYears: number;
  equityAnnual: number;
  signOn: number;
  location: string;
  remote: "onsite" | "hybrid" | "remote" | "";
  startDate: string;
  deadline: string;
  notes: string;
  currency: string;
}

export interface OfferTotals {
  base: number;
  bonus: number;
  equityPerYear: number;
  signOn: number;
  year1: number;
  annualised: number;
}

const num = (v: unknown, max = 1e9) => {
  const n = Number(v);
  return isFinite(n) && n > 0 ? Math.min(n, max) : 0;
};

export function emptyOffer(id: string): Offer {
  return { id, company: "", title: "", level: "", base: 0, bonusPct: 0, equityMode: "grant", equityAmount: 0, vestYears: 4, equityAnnual: 0, signOn: 0, location: "", remote: "", startDate: "", deadline: "", notes: "", currency: "USD" };
}

export function normalizeOffer(raw: unknown): Offer | null {
  if (!raw || typeof raw !== "object") return null;
  const r = raw as Record<string, unknown>;
  const s = (v: unknown, n: number) => (typeof v === "string" ? v.slice(0, n) : "");
  const id = s(r.id, 64);
  if (!id) return null;
  const day = (v: unknown) => (typeof v === "string" && /^\d{4}-\d{2}-\d{2}$/.test(v) ? v : "");
  return {
    id,
    company: s(r.company, 80), title: s(r.title, 100), level: s(r.level, 40),
    base: num(r.base), bonusPct: num(r.bonusPct, 200),
    equityMode: r.equityMode === "annual" ? "annual" : "grant",
    equityAmount: num(r.equityAmount), vestYears: Math.max(1, Math.min(10, Math.round(num(r.vestYears, 10)) || 4)),
    equityAnnual: num(r.equityAnnual), signOn: num(r.signOn),
    location: s(r.location, 80),
    remote: r.remote === "onsite" || r.remote === "hybrid" || r.remote === "remote" ? r.remote : "",
    startDate: day(r.startDate), deadline: day(r.deadline), notes: s(r.notes, 1000),
    currency: s(r.currency, 6) || "USD",
  };
}

export function offerTotals(o: Offer): OfferTotals {
  const vest = Math.max(1, o.vestYears || 4);
  const equityPerYear = o.equityMode === "annual" ? o.equityAnnual : o.equityAmount / vest;
  const bonus = (o.base * o.bonusPct) / 100;
  const year1 = o.base + bonus + equityPerYear + o.signOn;
  const annualised = o.base + bonus + equityPerYear + o.signOn / vest;
  const r = (n: number) => Math.round(n);
  return { base: r(o.base), bonus: r(bonus), equityPerYear: r(equityPerYear), signOn: r(o.signOn), year1: r(year1), annualised: r(annualised) };
}

export type Dimension = "base" | "bonus" | "equityPerYear" | "signOn" | "year1" | "annualised";
export const DIMENSIONS: { key: Dimension; label: string }[] = [
  { key: "base", label: "Base salary" },
  { key: "bonus", label: "Target bonus" },
  { key: "equityPerYear", label: "Equity / year" },
  { key: "signOn", label: "Sign-on" },
  { key: "year1", label: "Year-1 total" },
  { key: "annualised", label: "Annualised total" },
];

/** Offer id(s) with the highest value per dimension (none when all are 0;
 * all tied ids when tied; nothing when fewer than 2 offers). */
export function bestBy(offers: Offer[]): Record<Dimension, string[]> {
  const out = {} as Record<Dimension, string[]>;
  const totals = offers.map((o) => ({ id: o.id, t: offerTotals(o) }));
  for (const { key } of DIMENSIONS) {
    const max = Math.max(0, ...totals.map((x) => x.t[key]));
    out[key] = offers.length < 2 || max <= 0 ? [] : totals.filter((x) => x.t[key] === max).map((x) => x.id);
  }
  return out;
}

/** Days from today to the deadline (negative = passed), or null. */
export function deadlineDays(deadline: string, today: string): number | null {
  if (!/^\d{4}-\d{2}-\d{2}$/.test(deadline || "")) return null;
  const t = (s: string) => Date.UTC(+s.slice(0, 4), +s.slice(5, 7) - 1, +s.slice(8, 10));
  return Math.round((t(deadline) - t(today)) / 86400000);
}

export function deadlineLabel(days: number | null): string {
  if (days == null) return "";
  if (days < 0) return "Deadline passed";
  if (days === 0) return "Decide today";
  if (days === 1) return "1 day left";
  return days + " days left";
}

export function money(n: number, currency = "USD"): string {
  try {
    return new Intl.NumberFormat(undefined, { style: "currency", currency, maximumFractionDigits: 0 }).format(n || 0);
  } catch {
    return "$" + Math.round(n || 0).toLocaleString();
  }
}

/** Compact "$185k" for bars and chips. */
export function moneyShort(n: number, currency = "USD"): string {
  try {
    return new Intl.NumberFormat(undefined, { style: "currency", currency, notation: "compact", maximumFractionDigits: 1 }).format(n || 0);
  } catch {
    return "$" + Math.round((n || 0) / 1000) + "k";
  }
}

export type Leverage = "competing" | "final_round" | "niche_skill";
export const LEVERAGE: { key: Leverage; label: string; hint: string }[] = [
  { key: "competing", label: "A competing offer", hint: "Another written offer you'd genuinely consider." },
  { key: "final_round", label: "A strong final round", hint: "Clear positive signals from the loop or the hiring manager." },
  { key: "niche_skill", label: "A niche skill", hint: "Experience that is hard for them to hire for." },
];

const cut = (v: string, n: number) => { const t = String(v || "").replace(/\s+/g, " ").trim(); return t.length > n ? t.slice(0, n - 1) + "…" : t; };
const k = (n: number) => (n >= 1000 ? Math.round(n / 1000) + "k" : String(Math.round(n)));

/** Prompt for the help API (≤ 800 chars): a negotiation email + call script. */
export function negotiationPrompt(target: Offer, others: Offer[], leverage: Leverage, extra = ""): string {
  const t = offerTotals(target);
  const best = others.map((o) => ({ o, t: offerTotals(o) })).sort((a, b) => b.t.annualised - a.t.annualised)[0];
  const lev = LEVERAGE.find((l) => l.key === leverage)!;
  const lines = [
    "Draft a polite, confident salary negotiation: 1) an email under 150 words, 2) a short phone call script (5-7 lines). Plain text with the headings EMAIL and CALL SCRIPT. Ask for a specific, reasonable increase; never bluff or invent numbers; keep it collaborative.",
    "Offer to negotiate: " + cut(target.title || "the role", 50) + " at " + cut(target.company || "the company", 40) + (target.level ? ", level " + cut(target.level, 20) : "") +
      ". " + target.currency + " base " + k(t.base) + ", bonus " + target.bonusPct + "%, equity/yr " + k(t.equityPerYear) + ", sign-on " + k(t.signOn) + ".",
    "Leverage: " + lev.label + ".",
    leverage === "competing" && best ? "Competing offer: " + cut(best.o.company || "another company", 40) + ", annualised " + k(best.t.annualised) + " vs " + k(t.annualised) + "." : "",
    extra ? "Context: " + cut(extra, 120) : "",
  ].filter(Boolean);
  return lines.join("\n").slice(0, 790);
}

export function loadOffers(): Offer[] {
  const raw = readJSON<unknown[]>(KEYS.offers, []);
  return (Array.isArray(raw) ? raw : []).map(normalizeOffer).filter((o): o is Offer => !!o).slice(0, 4);
}

export function saveOffers(list: Offer[]): void {
  writeJSON(KEYS.offers, list.slice(0, 4));
}
