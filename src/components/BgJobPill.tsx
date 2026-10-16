/* App-wide status for a job being added in the background (lib/bgAddJob). */

import { addJobInBackground, clearBgJob, useBgJob } from "../lib/bgAddJob";
import { useAuth } from "../lib/auth";
import { setActiveJob } from "../lib/readiness";
import { Link, useNavigate } from "../lib/router";

export function BgJobPill() {
  const j = useBgJob();
  const navigate = useNavigate();
  const auth = useAuth();
  if (j.state === "idle") return null;
  const name = j.title + (j.company ? " · " + j.company : "");
  return (
    <div className={"bgj bgj-" + j.state} role="status" aria-live="polite">
      {j.state === "busy" && (<><span className="bgj-spin" aria-hidden="true" /><span className="bgj-text"><strong>Adding {j.title}</strong><span>Keep browsing. About 20 seconds.</span></span></>)}
      {j.state === "done" && (<>
        <span className="bgj-ok" aria-hidden="true">✓</span>
        <span className="bgj-text"><strong>{name} is ready</strong><span>Gaps, questions and your plan</span></span>
        <button type="button" className="btn btn-primary btn-small" onClick={() => { setActiveJob(j.jobId); clearBgJob(); navigate("/jobs/" + encodeURIComponent(j.jobId) + "?added=1" + (j.fit ? "&fit=1" : "")); }}>Open</button>
        <button type="button" className="bgj-x" aria-label="Dismiss" onClick={clearBgJob}>×</button>
      </>)}
      {j.state === "error" && (<>
        <span className="bgj-err" aria-hidden="true">!</span>
        <span className="bgj-text"><strong>Couldn{"’"}t add {j.title}</strong><span>{j.msg}</span></span>
        {j.upgrade
          ? <Link className="btn btn-small" to="/pricing" onClick={clearBgJob}>See plans</Link>
          : <button type="button" className="btn btn-small" onClick={async () => { const t = await auth.getAccessToken(); if (t) void addJobInBackground(t, j.retry); }}>Try again</button>}
        <button type="button" className="bgj-x" aria-label="Dismiss" onClick={clearBgJob}>×</button>
      </>)}
    </div>
  );
}
