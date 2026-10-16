/* Add a job in the background (from Open roles): the AI reads the posting and
 * the job is saved while the person keeps browsing. One job at a time; the
 * status is shown app-wide by <BgJobPill/>. Nothing is switched for them:
 * the new job only becomes the current one when they open it. */

import { useEffect, useState } from "react";
import * as api from "./api";
import { getSavedResume } from "./savedResume";
import { track } from "./track";

export type BgJob =
  | { state: "idle" }
  | { state: "busy"; title: string; company: string; started: number }
  | { state: "done"; title: string; company: string; jobId: string; fit: boolean }
  | { state: "error"; title: string; company: string; msg: string; upgrade?: boolean; retry: { title: string; company: string; jd: string; url: string } };

let cur: BgJob = { state: "idle" };
const subs = new Set<(j: BgJob) => void>();
const set = (j: BgJob) => { cur = j; subs.forEach((f) => f(j)); };

export function useBgJob(): BgJob {
  const [j, setJ] = useState(cur);
  useEffect(() => { subs.add(setJ); setJ(cur); return () => { subs.delete(setJ); }; }, []);
  return j;
}
export const bgJobBusy = () => cur.state === "busy";
export const clearBgJob = () => set({ state: "idle" });

export async function addJobInBackground(token: string, p: { title: string; company: string; jd: string; url: string }): Promise<void> {
  if (cur.state === "busy") return;
  const base = { title: p.title, company: p.company };
  set({ state: "busy", ...base, started: Date.now() });
  const fail = (msg: string, upgrade?: boolean) => set({ state: "error", ...base, msg, upgrade, retry: p });
  const resume = getSavedResume();
  const res = await api.analyzeJob({ jobDescription: p.jd, targetRole: p.title, resume: resume?.text }, token);
  if (res.status === 403) return fail(res.body?.error || "You’ve used this month’s job analyses.", true);
  if (res.status === 0) return fail("Couldn’t reach OfferReady. Check your connection.");
  if (res.status < 200 || res.status >= 300 || !res.body?.analysis) return fail(res.body?.error || "Couldn’t read this posting.");
  const a = res.body.analysis;
  const summary = a.roleSummary && a.roleSummary.trim() ? a.roleSummary : p.jd.replace(/\s+/g, " ").slice(0, 400);
  const saved = await api.createJob(token, { analysis: { ...a, roleSummary: summary }, title: p.title || a.jobTitle || "", company: (p.company || a.company || "").slice(0, 200), jobDescription: p.jd, model: res.body.model || "" });
  if (saved.status === 403 && saved.body?.upgrade) return fail("Your plan’s saved-job limit is reached. Remove one in Jobs or get a pass.", true);
  if (saved.status !== 201 || !saved.body?.job?.id) return fail(saved.body?.error || "Couldn’t save this job.");
  track("job_added", { resume: !!resume, from: "roles" });
  set({ state: "done", ...base, jobId: saved.body.job.id, fit: !!resume });
}
