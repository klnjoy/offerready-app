/* After signing in, and when the app is opened fresh, take a signed-in user
 * straight to their current job (or to "Add a job" if they have none),
 * instead of the marketing home page.
 *
 * Mounted only on "/" and "/account".
 *  - "/" with at least one saved job: always opens that job, so a signed-in
 *    user never lands on sample screens (the logo goes to your job too).
 *    "/?home=1" still shows the public home page.
 *  - "/" with no job yet: once per browser session, to "Add a job"; after
 *    that the home page (with its samples) stays reachable.
 *  - Right after a sign-in on either page: to the job, or to "Add a job".
 * Deep links (e.g. /coach) are never redirected. */

import { useEffect } from "react";
import { JUST_SIGNED_IN, useAuth } from "../lib/auth";
import { useJobs } from "../lib/useJobs";
import { useLocation, useNavigate } from "../lib/router";
import { track } from "../lib/track";

const LANDED = "offerready.landed";

const ss = {
  get: (k: string) => { try { return sessionStorage.getItem(k); } catch { return null; } },
  set: (k: string, v: string) => { try { sessionStorage.setItem(k, v); } catch { /* private mode */ } },
  del: (k: string) => { try { sessionStorage.removeItem(k); } catch { /* private mode */ } },
};

export function LandOnJob() {
  const auth = useAuth();
  const jobs = useJobs();
  const { pathname, search } = useLocation();
  const navigate = useNavigate();

  useEffect(() => {
    if (!auth.session || jobs.status !== "ready") return;
    const justIn = ss.get(JUST_SIGNED_IN) === "1";
    const wantsHome = /[?&]home\b/.test(search);
    const hasJob = jobs.jobs.length > 0;
    const onHome = pathname === "/" && !wantsHome && (hasJob || !ss.get(LANDED));
    if (!justIn && !onHome) { ss.set(LANDED, "1"); return; }
    ss.del(JUST_SIGNED_IN);
    ss.set(LANDED, "1");
    const id = jobs.jobs.some((j) => j.id === jobs.activeId) ? jobs.activeId : jobs.jobs[0]?.id;
    const to = id ? "/jobs/" + encodeURIComponent(id) : "/analyze";
    track("landed", { to: id ? "job" : "add_job", why: justIn ? "sign_in" : "home" });
    navigate(to, { replace: true });
  }, [auth.session, jobs.status, pathname, search]); // eslint-disable-line react-hooks/exhaustive-deps

  return null;
}
