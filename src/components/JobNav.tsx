/* Job navigation, laid out like the study library:
 *   - a trail at the top of the page:  Jobs › Senior AI Engineer › Practise every day › Trade-off drill
 *     (every part is a link one level up),
 *   - a sidebar on wide screens with everything for the job, grouped, the
 *     current page highlighted and practice steps ticked,
 *   - the same list in a drawer on phones ("This job" button in the trail),
 *   - previous / next links at the bottom of the main steps.
 * Shown on job pages and the tools that work on a job, when you're signed in
 * and have at least one job. */

import { useEffect, useRef, useState } from "react";
import { getActiveJob, setActiveJob } from "../lib/readiness";
import { KEYS, onStorageWrite } from "../lib/storage";
import { Link, useLocation, useNavigate } from "../lib/router";
import { stepHref, usePracticePath } from "../lib/practicePath";
import { displayJobTitle } from "../lib/roles";
import type { JobsState } from "../lib/useJobs";
import type { JobRow } from "../types";
import { Icon } from "./Icon";

const SCOPED = ["/questions", "/defend", "/stories", "/practice", "/mock", "/interview/voice", "/simulator", "/coach", "/dashboard", "/notes", "/debrief", "/offers", "/tailor"];

export function isJobScoped(pathname: string): boolean {
  if (/^\/jobs\/[^/]+$/.test(pathname)) return true;
  return SCOPED.some((p) => pathname === p || pathname.startsWith(p + "/"));
}

export const JOBS_CHANGED = "offerready:jobs-changed";
export function jobsChanged(): void { window.dispatchEvent(new Event(JOBS_CHANGED)); }

type Key =
  | "overview" | "resume" | "after" | "settings"
  | "questions" | "drill" | "stories" | "mock"
  | "coach" | "bank" | "readiness"
  | "notes" | "debrief" | "offers";

interface Item { key: Key; label: string; to: string; n?: number; done?: boolean }
interface Group { id: string; title: string; to?: string; items: Item[] }

const enc = encodeURIComponent;

/** Which item the page belongs to, plus a deeper page under it if any. */
function locate(pathname: string, search: string): { key: Key | null; sub?: string; hub?: boolean } {
  const q = new URLSearchParams(search);
  if (pathname.startsWith("/jobs/")) {
    const t = q.get("tab");
    return { key: t === "resume" || t === "after" || t === "settings" ? t : "overview" };
  }
  if (pathname === "/tailor") return { key: "resume", sub: "Tailor your resume" };
  if (pathname.startsWith("/questions")) return { key: "questions" };
  if (pathname.startsWith("/defend")) return { key: "drill" };
  if (pathname.startsWith("/stories")) return { key: "stories" };
  if (pathname === "/mock") return { key: "mock" };
  if (pathname === "/interview/voice") return { key: "mock", sub: "Voice interview" };
  if (pathname === "/simulator") return { key: "mock", sub: "Text interview" };
  if (pathname === "/coach") return { key: "coach" };
  if (pathname === "/practice/bank") return { key: "bank" };
  if (pathname === "/practice") return { key: null, hub: true };
  if (pathname === "/dashboard") return { key: "readiness" };
  if (pathname === "/notes") return { key: "notes" };
  if (pathname === "/debrief") return { key: "debrief" };
  if (pathname === "/offers") return { key: "offers" };
  return { key: null };
}

function useGroups(jobId: string): Group[] {
  const path = usePracticePath(jobId);
  const jp = "/jobs/" + enc(jobId);
  const wj = (to: string) => to + "?job=" + enc(jobId);
  return [
    { id: "job", title: "This job", items: [
      { key: "overview", label: "Overview", to: jp },
      { key: "resume", label: "Resume", to: jp + "?tab=resume" },
      { key: "after", label: "After the interview", to: jp + "?tab=after" },
      { key: "settings", label: "Job settings", to: jp + "?tab=settings" },
    ] },
    { id: "practice", title: "Practise every day", to: "/practice", items: path.map((s) => ({
      key: s.key, label: s.label, to: stepHref(s, jobId), n: s.n, done: s.done,
    })) },
    { id: "any", title: "Any time", items: [
      { key: "coach", label: "AI Interview Coach", to: "/coach" },
      { key: "bank", label: "Question bank", to: "/practice/bank" },
      { key: "readiness", label: "Readiness", to: wj("/dashboard") },
    ] },
    { id: "day", title: "Interview day", to: jp + "?tab=after", items: [
      { key: "notes", label: "Interview notes", to: wj("/notes") },
      { key: "debrief", label: "Log a round", to: wj("/debrief") },
      { key: "offers", label: "Compare offers", to: "/offers" },
    ] },
  ];
}

/** The job the page is about: the job page's own id, ?job=, else the current job. */
function useJobId(pathname: string, search: string, jobs: JobsState): string {
  const [active, setActive] = useState(getActiveJob);
  useEffect(() => onStorageWrite((k) => { if (k === KEYS.activeJob) setTimeout(() => setActive(getActiveJob()), 0); }), []);
  const m = /^\/jobs\/([^/]+)$/.exec(pathname);
  const fromUrl = m ? decodeURIComponent(m[1]) : new URLSearchParams(search).get("job") || "";
  const ids = jobs.jobs.map((j) => j.id);
  if (fromUrl && ids.includes(fromUrl)) return fromUrl;
  if (active && ids.includes(active)) return active;
  return ids[0] || "";
}

export interface JobNavModel {
  jobId: string;
  title: string;
  groups: Group[];
  key: Key | null;
  sub?: string;
  hub?: boolean;
}

/** Everything the trail, sidebar and footer need, or null when they don't show. */
export function useJobNav(live: JobsState): JobNavModel | null {
  const { pathname, search } = useLocation();
  // While the list reloads (after a rename, say), keep showing the last one,
  // so the page under it doesn't jump or lose what it was showing.
  const last = useRef<JobRow[] | null>(null);
  if (live.status === "ready") last.current = live.jobs;
  else if (live.status !== "loading") last.current = null;
  const jobs: JobsState = live.status === "loading" && last.current ? { ...live, status: "ready", jobs: last.current } : live;
  const scoped = isJobScoped(pathname);
  const jobId = useJobId(pathname, search, jobs);
  const groups = useGroups(jobId);
  // A job added, renamed or deleted elsewhere: refresh the list.
  const { reload } = jobs;
  useEffect(() => {
    const on = () => reload();
    window.addEventListener(JOBS_CHANGED, on);
    return () => window.removeEventListener(JOBS_CHANGED, on);
  }, [reload]);
  const m = /^\/jobs\/([^/]+)$/.exec(pathname);
  const missing = m && jobs.status === "ready" && !jobs.jobs.some((j) => j.id === decodeURIComponent(m[1]));
  useEffect(() => { if (missing) reload(); }, [missing, reload]);

  if (!scoped || jobs.status !== "ready" || !jobId) return null;
  const job = jobs.jobs.find((j) => j.id === jobId);
  const loc = locate(pathname, search);
  return { jobId, title: displayJobTitle(job), groups, ...loc };
}

function findItem(nav: JobNavModel): { group: Group; item: Item } | null {
  for (const g of nav.groups) for (const it of g.items) if (it.key === nav.key) return { group: g, item: it };
  return null;
}

// ---------------------------------------------------------------------------
// Trail

export function JobTrail({ nav, jobs }: { nav: JobNavModel; jobs: JobsState }) {
  const [open, setOpen] = useState(false);
  const { pathname, search } = useLocation();
  useEffect(() => setOpen(false), [pathname, search]);
  const found = findItem(nav);
  const jobTo = "/jobs/" + enc(nav.jobId);
  const crumbs: { label: string; to?: string }[] = [
    { label: "Jobs", to: "/jobs" },
    { label: nav.title, to: jobTo },
  ];
  if (nav.hub) crumbs.push({ label: "Practise every day" });
  else if (found) {
    if (found.group.id !== "job") crumbs.push({ label: found.group.title, to: found.group.to });
    if (!(found.group.id === "job" && found.item.key === "overview")) {
      crumbs.push({ label: (found.item.n ? found.item.n + " · " : "") + found.item.label, to: nav.sub ? found.item.to : undefined });
    } else crumbs[1] = { label: nav.title };
    if (nav.sub) crumbs.push({ label: nav.sub });
  }
  const last = crumbs.length - 1;
  return (
    <div className="jn-trail-row">
      <nav className="jn-trail" aria-label="You are here">
        <ol>
          {crumbs.map((c, i) => (
            <li key={i}>
              {i < last && c.to
                ? <Link to={c.to}>{c.label}</Link>
                : <span aria-current={i === last ? "page" : undefined}>{c.label}</span>}
            </li>
          ))}
        </ol>
      </nav>
      <button type="button" className="jn-open" aria-expanded={open} aria-controls="jn-drawer" onClick={() => setOpen(true)}>
        <Icon name="list" size={16} /> This job
      </button>
      {open && <Drawer nav={nav} jobs={jobs} onClose={() => setOpen(false)} />}
    </div>
  );
}

function Drawer({ nav, jobs, onClose }: { nav: JobNavModel; jobs: JobsState; onClose(): void }) {
  const ref = useRef<HTMLDivElement | null>(null);
  useEffect(() => {
    const onKey = (e: KeyboardEvent) => { if (e.key === "Escape") onClose(); };
    document.addEventListener("keydown", onKey);
    const prev = document.body.style.overflow;
    document.body.style.overflow = "hidden";
    ref.current?.querySelector<HTMLElement>("button, a, select")?.focus();
    return () => { document.removeEventListener("keydown", onKey); document.body.style.overflow = prev; };
  }, [onClose]);
  return (
    <div className="jn-drawer-wrap" onClick={onClose}>
      <div className="jn-drawer" id="jn-drawer" role="dialog" aria-modal="true" aria-label="This job" ref={ref} onClick={(e) => e.stopPropagation()}>
        <div className="jn-drawer-head">
          <strong>This job</strong>
          <button type="button" className="btn btn-ghost btn-small" onClick={onClose}>Close</button>
        </div>
        <JobTree nav={nav} jobs={jobs} />
      </div>
    </div>
  );
}

// ---------------------------------------------------------------------------
// Sidebar / drawer tree

export function JobTree({ nav, jobs }: { nav: JobNavModel; jobs: JobsState }) {
  const navigate = useNavigate();
  const { pathname, search } = useLocation();
  const found = findItem(nav);
  const curGroup = nav.hub ? "practice" : found?.group.id;
  // Groups open like the library: the one you're in is open; you can open
  // and close the others.
  const [shut, setShut] = useState<Record<string, boolean>>({});
  useEffect(() => setShut({}), [curGroup]);

  const switchTo = (id: string) => {
    setActiveJob(id);
    if (pathname.startsWith("/jobs/")) {
      const t = new URLSearchParams(search).get("tab");
      navigate("/jobs/" + enc(id) + (t ? "?tab=" + t : ""));
    } else if (new URLSearchParams(search).get("job")) {
      const q = new URLSearchParams(search);
      q.set("job", id);
      navigate(pathname + "?" + q.toString());
    }
  };

  return (
    <div className="jn-tree">
      <div className="jn-job">
        <label className="jn-k" htmlFor="jn-job-select">Job</label>
        {jobs.jobs.length > 1 ? (
          <select id="jn-job-select" className="input jn-select" value={nav.jobId} onChange={(e) => switchTo(e.target.value)}>
            {jobs.jobs.map((j) => <option key={j.id} value={j.id}>{displayJobTitle(j)}</option>)}
          </select>
        ) : <p className="jn-job-one" id="jn-job-select">{nav.title}</p>}
        <div className="jn-job-links">
          <Link to="/jobs">All jobs</Link>
          <Link to="/analyze"><Icon name="plus" size={13} /> Add a job</Link>
        </div>
      </div>
      {nav.groups.map((g) => {
        const isOpen = g.id === "job" || !shut[g.id] && (g.id === curGroup || shut[g.id] === false);
        const gid = "jn-g-" + g.id;
        return (
          <div key={g.id} className={"jn-group" + (g.id === curGroup ? " cur" : "")}>
            {g.id === "job" ? <p className="jn-gt">{g.title}</p> : (
              <button type="button" className="jn-gt jn-gt-btn" aria-expanded={isOpen} aria-controls={gid}
                onClick={() => setShut((s) => ({ ...s, [g.id]: isOpen }))}>
                <span>{g.title}</span>
                <svg className="jn-chev" viewBox="0 0 16 16" width="14" height="14" aria-hidden="true"><path d="M6 4l4 4-4 4" fill="none" stroke="currentColor" strokeWidth="1.8" strokeLinecap="round" strokeLinejoin="round" /></svg>
              </button>
            )}
            {isOpen && (
              <ul id={gid}>
                {g.items.map((it) => {
                  const on = it.key === nav.key;
                  return (
                    <li key={it.key}>
                      <Link to={it.to} className={"jn-item" + (on ? " on" : "") + (it.done ? " done" : "")} aria-current={on ? "page" : undefined}>
                        {it.n ? <span className="jn-n" aria-hidden="true">{it.done ? <Icon name="check" size={11} /> : it.n}</span> : null}
                        <span>{it.label}</span>
                        {it.done ? <span className="hm-sr"> (done)</span> : null}
                      </Link>
                    </li>
                  );
                })}
              </ul>
            )}
          </div>
        );
      })}
    </div>
  );
}

// ---------------------------------------------------------------------------
// Previous / next, like the library's page footer

const SEQ: Key[] = ["overview", "questions", "drill", "stories", "mock", "readiness", "notes"];

export function JobPager({ nav }: { nav: JobNavModel }) {
  const { pathname } = useLocation();
  if (!nav.key || nav.sub || !SEQ.includes(nav.key)) return null;
  // The job page's other tabs aren't in the sequence.
  if (pathname.startsWith("/jobs/") && nav.key !== "overview") return null;
  const all = nav.groups.flatMap((g) => g.items);
  const i = SEQ.indexOf(nav.key);
  const prev = i > 0 ? all.find((x) => x.key === SEQ[i - 1]) : null;
  const next = i < SEQ.length - 1 ? all.find((x) => x.key === SEQ[i + 1]) : null;
  const name = (x: Item) => (x.n ? "Step " + x.n + " · " : "") + x.label;
  return (
    <nav className="jn-pager" aria-label="Previous and next">
      {prev ? (
        <Link className="jn-pg jn-prev" to={prev.to}>
          <span className="jn-pg-k">{"←"} Previous</span><span className="jn-pg-t">{name(prev)}</span>
        </Link>
      ) : <span />}
      {next ? (
        <Link className="jn-pg jn-next" to={next.to}>
          <span className="jn-pg-k">Next {"→"}</span><span className="jn-pg-t">{name(next)}</span>
        </Link>
      ) : <span />}
    </nav>
  );
}
