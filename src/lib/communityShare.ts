/* Opt-in data that makes OfferReady better for everyone (migration 0016).
 *
 * shareDebrief()     A debrief the user marked "Share anonymously" becomes one
 *                    row in public.interview_reports: company, role family,
 *                    level, round type, the MONTH, the questions (scrubbed) and
 *                    the outcome. Never interviewer names, notes or the day.
 *                    Un-ticking or deleting the debrief deletes the row.
 * recordPrepOutcome() The "How did it go?" answer plus readiness and practice
 *                    at the time, in public.prep_outcomes (own rows only).
 *
 * Both tables are readable only by the row's owner through the API. Every
 * failure is silent and returns a status: sharing must never block the app. */

import { getSupabaseClient } from "./auth";
import { scrub } from "./errorReport";
import { classifyFamilyFromJob } from "./roles";
import type { Debrief } from "./debrief";
import type { JobRow } from "../types";
import type { JobOutcome } from "./jobOutcomes";

export type ShareStatus = "shared" | "removed" | "skipped" | "unavailable" | "error";

const LEGAL_SUFFIX = /\b(inc|incorporated|llc|ltd|limited|corp|corporation|co|gmbh|plc|pvt|private|s\.?a)\.?$/i;

/** "  Acme, Inc. " → "acme" — the grouping key. */
export function normalizeCompany(name: string): string {
  let s = String(name || "").toLowerCase().replace(/[“”"']/g, "").replace(/\s+/g, " ").trim();
  for (let i = 0; i < 2; i++) s = s.replace(/[,.\s]+$/, "").replace(LEGAL_SUFFIX, "").trim();
  return s.replace(/[,.\s]+$/, "").slice(0, 80);
}

/** The anonymous row for a debrief, or null when it can't be shared. Pure. */
export function reportRow(d: Debrief, job?: Pick<JobRow, "title" | "seniority" | "analysis"> | null) {
  const company = normalizeCompany(d.company || "");
  if (company.length < 2 || !/^\d{4}-\d{2}-\d{2}$/.test(d.date)) return null;
  const questions = d.questions
    .map((q) => ({ text: scrub(q.text).replace(/\s+/g, " ").trim().slice(0, 300), rating: q.rating || "" }))
    .filter((q) => q.text.length >= 4)
    .slice(0, 25);
  return {
    debrief_id: d.id.slice(0, 64),
    company,
    company_display: String(d.company || "").trim().slice(0, 80) || null,
    role_family: (job ? classifyFamilyFromJob(job as JobRow) : null) || null,
    level: job?.seniority ? String(job.seniority).slice(0, 30) : null,
    round: d.round,
    interview_month: d.date.slice(0, 7),
    questions,
    outcome: d.outcome,
  };
}

async function signedIn() {
  const client = getSupabaseClient();
  if (!client) return null;
  try {
    const r = await client.auth.getSession();
    const id = (r?.data?.session?.user as { id?: string } | undefined)?.id;
    return id ? { client, id } : null;
  } catch {
    return null;
  }
}

/** Create, update or remove the shared row so it matches the debrief. */
export async function syncSharedDebrief(d: Debrief, job?: JobRow | null): Promise<ShareStatus> {
  const s = await signedIn();
  if (!s) return "unavailable";
  try {
    if (!d.share) {
      const r = await s.client.from("interview_reports").delete().eq("user_id", s.id).eq("debrief_id", d.id);
      return r.error ? "error" : "removed";
    }
    const row = reportRow(d, job);
    if (!row) return "skipped";
    const r = await s.client.from("interview_reports").upsert({ ...row, user_id: s.id }, { onConflict: "user_id,debrief_id" });
    return r.error ? "error" : "shared";
  } catch {
    return "error";
  }
}

export async function unshareDebrief(debriefId: string): Promise<ShareStatus> {
  const s = await signedIn();
  if (!s) return "unavailable";
  try {
    const r = await s.client.from("interview_reports").delete().eq("user_id", s.id).eq("debrief_id", debriefId);
    return r.error ? "error" : "removed";
  } catch {
    return "error";
  }
}

export async function recordPrepOutcome(input: {
  job: JobRow; outcome: JobOutcome; interviewDate?: string; readiness?: number | null; practiceCount?: number | null;
}): Promise<ShareStatus> {
  const s = await signedIn();
  if (!s) return "unavailable";
  const { job } = input;
  let days: number | null = null;
  if (input.interviewDate && job.created_at) {
    const t = Date.parse(input.interviewDate + "T00:00:00Z") - Date.parse(job.created_at);
    if (Number.isFinite(t)) days = Math.max(0, Math.min(3650, Math.round(t / 86400000)));
  }
  const clampN = (n: number | null | undefined, hi: number) => (typeof n === "number" && Number.isFinite(n) ? Math.max(0, Math.min(hi, Math.round(n))) : null);
  try {
    const r = await s.client.from("prep_outcomes").upsert({
      user_id: s.id,
      job_id: job.id.slice(0, 128),
      role_family: classifyFamilyFromJob(job) || null,
      level: job.seniority ? String(job.seniority).slice(0, 30) : null,
      interview_date: input.interviewDate && /^\d{4}-\d{2}-\d{2}$/.test(input.interviewDate) ? input.interviewDate : null,
      outcome: input.outcome,
      readiness: clampN(input.readiness, 100),
      practice_count: clampN(input.practiceCount, 100000),
      days_prepared: days,
    }, { onConflict: "user_id,job_id" });
    return r.error ? "error" : "shared";
  } catch {
    return "error";
  }
}

/** "Delete my data": remove every shared report and outcome of this user. */
export async function deleteCommunityData(): Promise<boolean> {
  const s = await signedIn();
  if (!s) return false;
  try {
    const a = await s.client.from("interview_reports").delete().eq("user_id", s.id);
    const b = await s.client.from("prep_outcomes").delete().eq("user_id", s.id);
    return !a.error && !b.error;
  } catch {
    return false;
  }
}
