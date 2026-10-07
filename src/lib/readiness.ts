/* The single readiness formula + the active-job pointer (was
 * window.OfferReadyReadiness in content/assets/readiness.js). */

import { KEYS, readString, removeKey, writeString } from "./storage";
import type { GapRow } from "../types";

export function clampInt(n: unknown, lo: number, hi: number): number {
  const v = Math.round(Number(n));
  if (!isFinite(v)) return lo;
  return Math.max(lo, Math.min(hi, v));
}

/** Weighted overall: 50% resume match, 30% practice average, 20% completion. */
export function weightedOverall(gap: GapRow | null | undefined, practiceAvg?: number, completion?: number): number {
  const match = gap ? gap.match_score || 0 : 0;
  if (!gap && !practiceAvg) return 0;
  return clampInt(0.5 * match + 0.3 * (practiceAvg || 0) + 0.2 * (completion || 0), 0, 100);
}

export type Band = "good" | "mid" | "weak";
export function band(pct: number): Band {
  return pct >= 75 ? "good" : pct >= 50 ? "mid" : "weak";
}

// ---- active job pointer (a convenience pointer, never the source of truth) ----
export function getActiveJob(): string {
  return readString(KEYS.activeJob) || "";
}
export function setActiveJob(id: string | null | undefined): void {
  writeString(KEYS.activeJob, id || "");
}
export function clearActiveJob(): void {
  removeKey(KEYS.activeJob);
}
