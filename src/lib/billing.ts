/* Billing options + the user's Pro source, for Pricing and Account.
 *
 * Signed in: GET /api/me/plan (its `billing` block). Signed out: the public
 * GET /api/billing/checkout option list. `info` is null while loading or when
 * the API couldn't be reached; screens then fall back to the plain monthly
 * upgrade they always had. Cached in memory for a minute. */

import { useCallback, useEffect, useState } from "react";
import { API_ENABLED, PRO_ANNUAL_PRICE_LABEL, PRO_PRICE_LABEL } from "../config";
import * as api from "./api";
import type { BillingInfo, BillingOption } from "./api";
import { useAuth } from "./auth";

const TTL_MS = 60 * 1000;
let cache: { who: string; at: number; info: BillingInfo } | null = null;
const listeners = new Set<() => void>();

export function invalidateBilling() {
  cache = null;
  listeners.forEach((l) => l());
}

const EMPTY: Omit<BillingInfo, "options"> = { portal: false, pro_source: null, pro_expires_at: null, pro_interval: null, cancel_at_period_end: false, pass_kind: null, pass_kinds: [] };

function cleanOptions(v: unknown): BillingOption[] {
  if (!Array.isArray(v)) return [];
  // "sprint" is the old name of the 30-day pass (older API deployments).
  const out = v.map((o) => (o === "sprint" ? "pass30" : o)).filter((o) => api.BILLING_OPTIONS.includes(o as BillingOption)) as BillingOption[];
  return Array.from(new Set(out));
}

export function useBilling(): { info: BillingInfo | null; loading: boolean; refresh(): void } {
  const auth = useAuth();
  const who = auth.session ? auth.email || "signed-in" : "anon";
  const [, setTick] = useState(0);
  const [loading, setLoading] = useState(false);
  const [failedFor, setFailedFor] = useState("");

  useEffect(() => {
    const l = () => setTick((t) => t + 1);
    listeners.add(l);
    return () => { listeners.delete(l); };
  }, []);

  const load = useCallback(async (force: boolean) => {
    if (!API_ENABLED || !auth.ready) return;
    if (!force && cache && cache.who === who && Date.now() - cache.at < TTL_MS) return;
    setLoading(true);
    try {
      let info: BillingInfo | null = null;
      if (auth.session) {
        const tok = await auth.getAccessToken();
        if (tok) {
          const r = await api.getPlanWithBilling(tok);
          if (r.status === 200 && r.body) {
            const b = r.body.billing;
            info = b ? { ...EMPTY, ...b, options: cleanOptions(b.options) } : { ...EMPTY, options: [] };
          }
        }
      } else {
        const r = await api.getBillingOptions();
        if (r.status === 200 && r.body) info = { ...EMPTY, options: cleanOptions(r.body.options) };
      }
      if (info) { cache = { who, at: Date.now(), info }; setFailedFor(""); listeners.forEach((l) => l()); }
      else setFailedFor(who);
    } finally {
      setLoading(false);
    }
  }, [auth, who]);

  useEffect(() => { load(false); }, [load]);

  const info = cache && cache.who === who ? cache.info : null;
  // Loading until the first answer (or failure) for this viewer.
  const pending = API_ENABLED && !info && failedFor !== who;
  return { info, loading: loading || pending, refresh: () => { load(true); } };
}

/** First number in a display label ("$12 / month" -> 12). */
export function labelAmount(label: string): number | null {
  const m = /(\d+(?:[.,]\d+)?)/.exec(label || "");
  if (!m) return null;
  const n = Number(m[1].replace(",", "."));
  return Number.isFinite(n) && n > 0 ? n : null;
}

/** "Save X%" of annual vs 12 x monthly, from the labels. null when not a saving. */
export function annualSavingsPct(monthly = PRO_PRICE_LABEL, annual = PRO_ANNUAL_PRICE_LABEL): number | null {
  const m = labelAmount(monthly);
  const a = labelAmount(annual);
  if (!m || !a) return null;
  const pct = Math.round((1 - a / (m * 12)) * 100);
  return pct > 0 && pct < 100 ? pct : null;
}

/** "Oct 30" */
export function shortDate(iso: string | null | undefined): string {
  if (!iso) return "";
  const d = new Date(iso);
  return Number.isNaN(d.getTime()) ? "" : d.toLocaleDateString(undefined, { month: "short", day: "numeric" });
}

/** Split "$96 / year" into ["$96", "/ year"] for the big-number layout. */
export function splitLabel(label: string): [string, string] {
  const [amount, ...rest] = label.split(" ");
  return [amount, rest.join(" ")];
}
