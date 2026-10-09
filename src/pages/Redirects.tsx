/* Old destinations that now live inside the job page. They redirect (with
 * history.replace) so old links, plan tasks and Help actions keep working.
 *
 *   /today → the active job's page (or the most recent job), else /jobs.
 *   /fit   → the job's Resume tab (?job= or the active job), else Add a job. */

import { useEffect } from "react";
import { useNavigate, useSearchParams } from "../lib/router";
import { useJobs, type JobsState } from "../lib/useJobs";
import { Loading } from "../components/ui";

function pickJob(jobs: JobsState, want?: string | null): string {
  if (jobs.status !== "ready" || !jobs.jobs.length) return "";
  if (want && jobs.jobs.some((j) => j.id === want)) return want;
  if (jobs.activeId) return jobs.activeId;
  return [...jobs.jobs].sort((a, b) => String(b.created_at || "").localeCompare(String(a.created_at || "")))[0].id;
}

function useRedirect(target: (jobs: JobsState) => string | null) {
  const jobs = useJobs();
  const navigate = useNavigate();
  useEffect(() => {
    if (jobs.status === "loading") return;
    const to = target(jobs);
    if (to) navigate(to, { replace: true });
  }, [jobs.status]); // eslint-disable-line react-hooks/exhaustive-deps
}

export function TodayRedirect() {
  useRedirect((jobs) => {
    const id = pickJob(jobs);
    return id ? "/jobs/" + encodeURIComponent(id) : "/jobs";
  });
  return <div className="page"><Loading>Opening your plan{"…"}</Loading></div>;
}

export function FitRedirect() {
  const params = useSearchParams();
  useRedirect((jobs) => {
    const id = pickJob(jobs, params.get("job"));
    return id ? "/jobs/" + encodeURIComponent(id) + "?tab=resume" : "/analyze";
  });
  return <div className="page"><Loading>Opening your resume match{"…"}</Loading></div>;
}
