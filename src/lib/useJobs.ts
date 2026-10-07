/* Loads the signed-in user's saved jobs once per screen and resolves the
 * active job (clearing a stale pointer, as every old script did). */

import { useCallback, useEffect, useState } from "react";
import { API_ENABLED } from "../config";
import { listJobs } from "./api";
import { useAuth } from "./auth";
import { clearActiveJob, getActiveJob } from "./readiness";
import type { JobRow } from "../types";

export type JobsStatus = "loading" | "disabled" | "signedout" | "ready" | "error";

export interface JobsState {
  status: JobsStatus;
  jobs: JobRow[];
  token: string | null;
  /** Active job id, validated against the owned list ("" if none/stale). */
  activeId: string;
  reload(): void;
}

export function useJobs(): JobsState {
  const auth = useAuth();
  const [state, setState] = useState<Omit<JobsState, "reload">>({
    status: "loading",
    jobs: [],
    token: null,
    activeId: "",
  });
  const [nonce, setNonce] = useState(0);
  const signedIn = !!auth.session;

  useEffect(() => {
    let alive = true;
    (async () => {
      if (!API_ENABLED || !auth.configured) {
        setState({ status: "disabled", jobs: [], token: null, activeId: "" });
        return;
      }
      if (!auth.ready) return;
      const token = await auth.getAccessToken();
      if (!token) {
        if (alive) setState({ status: "signedout", jobs: [], token: null, activeId: "" });
        return;
      }
      if (alive) setState((s) => ({ ...s, status: "loading", token }));
      const res = await listJobs(token);
      if (!alive) return;
      if (res.status === 401) {
        setState({ status: "signedout", jobs: [], token: null, activeId: "" });
        return;
      }
      if (res.status !== 200 || !res.body?.ok) {
        setState({ status: "error", jobs: [], token, activeId: "" });
        return;
      }
      const jobs = res.body.jobs || [];
      const pointer = getActiveJob();
      let activeId = "";
      if (pointer && jobs.some((j) => j.id === pointer)) activeId = pointer;
      else if (pointer) clearActiveJob();
      setState({ status: "ready", jobs, token, activeId });
    })();
    return () => {
      alive = false;
    };
    // signedIn re-runs this after sign-in/out.
  }, [auth.configured, auth.ready, signedIn, nonce]); // eslint-disable-line react-hooks/exhaustive-deps

  const reload = useCallback(() => setNonce((n) => n + 1), []);
  return { ...state, reload };
}
