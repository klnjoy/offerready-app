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
import { Link, useLocation } from "../lib/router";
import { practicePath, stepHref, usePracticePath, type PathStep } from "../lib/practicePath";
import { displayJobTitle } from "../lib/roles";
import type { JobsState } from "../lib/useJobs";
import type { JobRow } from "../types";
import { Icon } from "./Icon";

const SCOPED = ["/asked", "/questions", "/defend", "/stories", "/practice", "/mock", "/interview/voice", "/simulator", "/coach", "/dashboard", "/notes", "/debrief", "/offers", "/tailor"];

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
  | "notes" | "debrief" | "asked" | "offers";

interface Item { key: Key; label: string; to: string; n?: number; done?: boolean; progress?: string }
/** `flat` groups list their pages straight under the job, without a folder. */
interface Group { id: string; title: string; to?: string; flat?: boolean; items: Item[] }

const enc = encodeURIComponent;

/** Which item the page belongs to, plus a deeper page under it if any. */
function locate(pathname: string, search: string): { key: Key | null; sub?: string; hub?: string } {
  const q = new URLSearchParams(search);
  if (pathname.startsWith("/jobs/")) {
    const t = q.get("tab");
    // The After tab is the "Interview day and after" folder's own page.
    if (t === "after") return { key: null, hub: "day" };
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
  if (pathname === "/practice") return { key: null, hub: "practice" };
  if (pathname === "/dashboard") return { key: "readiness" };
  if (pathname === "/notes") return { key: "notes" };
  if (pathname === "/debrief") return { key: "debrief" };
  if (pathname === "/offers") return { key: "offers" };
  if (pathname === "/asked") return { key: "asked" };
  return { key: null };
}

function useGroups(jobId: string): Group[] {
  return groupsFor(jobId, usePracticePath(jobId));
}

function groupsFor(jobId: string, path: PathStep[]): Group[] {
  const jp = "/jobs/" + enc(jobId);
  const wj = (to: string) => to + "?job=" + enc(jobId);
  return [
    // In the order you prepare: set up, practise, the interview, then settings.
    { id: "job", title: "This job", flat: true, items: [
      { key: "overview", label: "Today", to: jp },
      { key: "resume", label: "Resume match", to: jp + "?tab=resume" },
    ] },
    { id: "practice", title: "Practise every day", to: "/practice", items: path.map((s) => ({
      key: s.key, label: s.label, to: stepHref(s, jobId), n: s.n, done: s.done, progress: s.progress,
    })) },
    { id: "coach", title: "AI Interview Coach", flat: true, items: [
      { key: "coach", label: "AI Interview Coach", to: wj("/coach") },
    ] },
    { id: "any", title: "Any time", items: [
      { key: "bank", label: "Question bank", to: "/practice/bank" },
      { key: "readiness", label: "Readiness", to: wj("/dashboard") },
    ] },
    { id: "day", title: "Interviews", to: jp + "?tab=after", items: [
      { key: "notes", label: "Interview notes", to: wj("/notes") },
      // One place for rounds: log a new one, see the ones you've logged.
      { key: "debrief", label: "Debriefs", to: wj("/debrief") },
      { key: "asked", label: "Questions you were asked", to: wj("/asked") },
      { key: "offers", label: "Compare offers", to: "/offers" },
    ] },
    { id: "end", title: "Settings", flat: true, items: [
      { key: "settings", label: "Job settings", to: jp + "?tab=settings" },
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
  /** The page belongs to a job: show the trail, side list and previous/next. */
  scoped: boolean;
  jobId: string;
  title: string;
  groups: Group[];
  key: Key | null;
  sub?: string;
  hub?: string;
}

/** Everything the trail, sidebar, footer and phone menu need, or null when
 * there's no job yet (signed out, or no jobs). */
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

  if (jobs.status !== "ready" || !jobId) return null;
  const job = jobs.jobs.find((j) => j.id === jobId);
  const loc = scoped ? locate(pathname, search) : { key: null };
  return { scoped, jobId, title: displayJobTitle(job), groups, ...loc };
}

function findItem(nav: JobNavModel): { group: Group; item: Item } | null {
  for (const g of nav.groups) for (const it of g.items) if (it.key === nav.key) return { group: g, item: it };
  return null;
}

// ---------------------------------------------------------------------------
// Trail

export function JobTrail({ nav }: { nav: JobNavModel }) {
  const found = findItem(nav);
  const jobTo = "/jobs/" + enc(nav.jobId);
  const crumbs: { label: string; to?: string }[] = [
    { label: "Jobs", to: "/jobs" },
    { label: nav.title, to: jobTo },
  ];
  if (nav.hub) crumbs.push({ label: nav.groups.find((g) => g.id === nav.hub)?.title || "" });
  else if (found) {
    if (!found.group.flat) crumbs.push({ label: found.group.title, to: found.group.to });
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
    </div>
  );
}

// ---------------------------------------------------------------------------
// The folder tree: Your jobs › a job › Practise every day › a step

interface Node { id: string; label: string; sub?: string; to?: string; n?: number; done?: boolean; progress?: string; key?: Key; jobId?: string; kids?: Node[] }

const MAX_JOBS = 6;

function buildTree(nav: JobNavModel, jobs: JobRow[]): Node[] {
  // The job you're on, then the most recent others.
  const cur = jobs.find((j) => j.id === nav.jobId);
  const shown = [...(cur ? [cur] : []), ...jobs.filter((j) => j.id !== nav.jobId)].slice(0, MAX_JOBS);
  return shown.map((j) => {
    const groups = j.id === nav.jobId ? nav.groups : groupsFor(j.id, practicePath(j.id));
    const id = "j:" + j.id;
    const kids: Node[] = [];
    for (const g of groups) {
      const items = g.items.map((it): Node => ({ id: id + ":" + it.key, label: it.label, to: it.to, n: it.n, done: it.done, progress: it.progress, key: it.key, jobId: j.id }));
      if (g.flat) kids.push(...items);
      else kids.push({ id: id + ":" + g.id, label: g.title, kids: items });
    }
    // The company tells apart jobs with the same title.
    return { id, label: j.id === nav.jobId ? nav.title : displayJobTitle(j), sub: j.company || undefined, kids };
  });
}

/** Ids from the top down to the page you're on (the last one is the page). */
function pathTo(nodes: Node[], nav: JobNavModel): string[] {
  const want = nav.hub ? "j:" + nav.jobId + ":" + nav.hub : nav.key ? "j:" + nav.jobId + ":" + nav.key : "";
  const walk = (list: Node[], trail: string[]): string[] | null => {
    for (const n of list) {
      const t = [...trail, n.id];
      if (n.id === want) return t;
      if (n.kids) { const r = walk(n.kids, t); if (r) return r; }
    }
    return null;
  };
  return walk(nodes, []) || ["j:" + nav.jobId];
}

function findNode(nodes: Node[], id: string): Node | null {
  for (const n of nodes) {
    if (n.id === id) return n;
    if (n.kids) { const r = findNode(n.kids, id); if (r) return r; }
  }
  return null;
}

function NodeLink({ node, on, className, onPick }: { node: Node; on: boolean; className: string; onPick?(): void }) {
  return (
    <Link to={node.to!} className={className + (on ? " on" : "") + (node.done ? " done" : "")} aria-current={on ? "page" : undefined}
      onClick={() => { if (node.jobId && node.jobId !== getActiveJob()) setActiveJob(node.jobId); onPick?.(); }}>
      {node.n ? <span className="jn-n" aria-hidden="true">{node.done ? <Icon name="check" size={11} /> : node.n}</span> : null}
      <span className="jn-tx">{node.label}</span>
      {node.progress ? <span className="jn-prog" title={node.progress + " answered (5 marks it done)"}>{node.progress}</span> : null}
      {node.done ? <span className="hm-sr"> (done)</span> : null}
    </Link>
  );
}

const Chevron = () => (
  <svg className="jn-chev" viewBox="0 0 16 16" width="16" height="16" aria-hidden="true"><path d="M6 4l4 4-4 4" fill="none" stroke="currentColor" strokeWidth="1.8" strokeLinecap="round" strokeLinejoin="round" /></svg>
);

/** Wide screens: the study-notes sidebar. Folders open and close; the one
 * you're in is open. */
export function JobTree({ nav, jobs }: { nav: JobNavModel; jobs: JobsState }) {
  const nodes = buildTree(nav, jobs.jobs);
  const trail = pathTo(nodes, nav);
  const curId = trail[trail.length - 1];
  const [toggled, setToggled] = useState<Record<string, boolean>>({});
  const trailKey = trail.join("|");
  useEffect(() => setToggled({}), [trailKey]);
  const isOpen = (id: string) => (id in toggled ? toggled[id] : trail.includes(id));
  // Jobs open one at a time, like the study notes: opening a job closes the others.
  const toggle = (id: string, depth: number) => setToggled((t) => {
    const open = !(id in t ? t[id] : trail.includes(id));
    const next = { ...t, [id]: open };
    if (depth === 0 && open) for (const n of nodes) if (n.id !== id) next[n.id] = false;
    return next;
  });

  const render = (list: Node[], depth: number) => (
    <ul className={"jn-ul jn-d" + depth}>
      {list.map((n) => (
        <li key={n.id}>
          {n.kids ? (
            <>
              <button type="button" className={"jn-folder" + (trail.includes(n.id) ? " in" : "") + (curId === n.id ? " on" : "")}
                aria-expanded={isOpen(n.id)} onClick={() => toggle(n.id, depth)}>
                <span className="jn-tx">{n.label}{n.sub ? <small className="jn-sub">{n.sub}</small> : null}</span><Chevron />
              </button>
              {isOpen(n.id) ? render(n.kids, depth + 1) : null}
            </>
          ) : <NodeLink node={n} on={curId === n.id} className="jn-page" />}
        </li>
      ))}
    </ul>
  );

  return (
    <nav className="jn-tree" aria-label="Your jobs and steps">
      <p className="jn-title">Your jobs</p>
      {render(nodes, 0)}
      <div className="jn-foot">
        <Link to="/jobs">All jobs{jobs.jobs.length > MAX_JOBS ? " (" + jobs.jobs.length + ")" : ""}</Link>
        <Link to="/analyze"><Icon name="plus" size={13} /> Add a job</Link>
      </div>
    </nav>
  );
}

/** Phones and tablets: the one menu (the top bar's Menu button), like the
 * study notes menu. Slides in from the left, opens at the folder you're in;
 * go into a folder, or back up with the arrow. */
export function JobMenu({ nav, jobs, onClose }: { nav: JobNavModel; jobs: JobsState; onClose(): void }) {
  const nodes = buildTree(nav, jobs.jobs);
  const trail = pathTo(nodes, nav);
  const curId = trail[trail.length - 1];
  // Start inside the folder that holds the current page.
  const [stack, setStack] = useState<string[]>(() => trail.slice(0, -1).filter((id) => findNode(nodes, id)?.kids));
  const ref = useRef<HTMLDivElement | null>(null);
  const here = stack.length ? findNode(nodes, stack[stack.length - 1]) : null;
  const list = here?.kids || nodes;

  useEffect(() => {
    const onKey = (e: KeyboardEvent) => { if (e.key === "Escape") onClose(); };
    document.addEventListener("keydown", onKey);
    const prev = document.body.style.overflow;
    document.body.style.overflow = "hidden";
    return () => { document.removeEventListener("keydown", onKey); document.body.style.overflow = prev; };
  }, [onClose]);
  useEffect(() => { ref.current?.querySelector<HTMLElement>(".jn-dr-back, .jn-dr-close")?.focus(); }, [stack.length]);

  return (
    <div className="jn-drawer-wrap" onClick={onClose}>
      <div className="jn-drawer" id="jn-drawer" role="dialog" aria-modal="true" aria-label="Your jobs and steps" ref={ref} onClick={(e) => e.stopPropagation()}>
        <div className="jn-dr-top">
          {here ? (
            <button type="button" className="jn-dr-back" aria-label={"Back to " + (stack.length > 1 ? findNode(nodes, stack[stack.length - 2])?.label : "Your jobs")} onClick={() => setStack((s) => s.slice(0, -1))}>
              <svg viewBox="0 0 24 24" width="24" height="24" aria-hidden="true"><path d="M20 12H5m6-7-7 7 7 7" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round" /></svg>
            </button>
          ) : <span />}
          <button type="button" className="jn-dr-close" onClick={onClose}>Close</button>
        </div>
        <p className="jn-dr-title">{here ? here.label : "Your jobs"}{here?.sub ? <small className="jn-sub">{here.sub}</small> : null}</p>
        <ul className="jn-dr-list">
          {list.map((n) => (
            <li key={n.id}>
              {n.kids ? (
                <button type="button" className={"jn-dr-row jn-dr-folder" + (trail.includes(n.id) ? " in" : "")} onClick={() => setStack((s) => [...s, n.id])}>
                  <span className="jn-tx">{n.label}{n.sub ? <small className="jn-sub">{n.sub}</small> : null}</span><Chevron />
                </button>
              ) : <NodeLink node={n} on={curId === n.id} className="jn-dr-row" onPick={onClose} />}
            </li>
          ))}
        </ul>
        {!here ? (
          <div className="jn-foot jn-dr-foot">
            <Link to="/jobs" onClick={onClose}>All jobs{jobs.jobs.length > MAX_JOBS ? " (" + jobs.jobs.length + ")" : ""}</Link>
            <Link to="/analyze" onClick={onClose}><Icon name="plus" size={13} /> Add a job</Link>
          </div>
        ) : null}
      </div>
    </div>
  );
}

// ---------------------------------------------------------------------------
// On this page: the page's sections, like the study notes' table of contents

export function PageToc() {
  const { pathname, search } = useLocation();
  const [items, setItems] = useState<{ id: string; text: string }[]>([]);
  const [active, setActive] = useState("");
  useEffect(() => {
    let obs: IntersectionObserver | null = null;
    const scan = () => {
      const hs = Array.from(document.querySelectorAll<HTMLElement>(".jn-body h2")).filter((h) => h.offsetParent !== null && (h.textContent || "").trim());
      hs.forEach((h, i) => { if (!h.id) h.id = "sec-" + i + "-" + (h.textContent || "").trim().toLowerCase().replace(/[^a-z0-9]+/g, "-").slice(0, 40); });
      const next = hs.map((h) => ({ id: h.id, text: (h.textContent || "").trim() }));
      setItems((prev) => (prev.map((x) => x.id).join() === next.map((x) => x.id).join() ? prev : next));
      obs?.disconnect();
      obs = new IntersectionObserver((es) => {
        const vis = es.filter((e) => e.isIntersecting).sort((a, b) => a.boundingClientRect.top - b.boundingClientRect.top)[0];
        if (vis) setActive(vis.target.id);
      }, { rootMargin: "-80px 0px -60% 0px" });
      hs.forEach((h) => obs!.observe(h));
    };
    const t = window.setTimeout(scan, 300);
    // Pages load their parts after a moment; look again when the page changes.
    const body = document.querySelector(".jn-body");
    let pend = 0;
    const mo = body ? new MutationObserver(() => { window.clearTimeout(pend); pend = window.setTimeout(scan, 250); }) : null;
    if (body && mo) mo.observe(body, { childList: true, subtree: true });
    return () => { window.clearTimeout(t); window.clearTimeout(pend); mo?.disconnect(); obs?.disconnect(); };
  }, [pathname, search]);
  if (items.length < 2) return null;
  return (
    <nav className="jn-toc" aria-label="On this page">
      <p className="jn-toc-k">On this page</p>
      <ul>
        {items.map((x) => (
          <li key={x.id}>
            <a href={"#" + x.id} className={active === x.id ? "on" : ""}
              onClick={(e) => { e.preventDefault(); document.getElementById(x.id)?.scrollIntoView({ behavior: "smooth", block: "start" }); setActive(x.id); }}>{x.text}</a>
          </li>
        ))}
      </ul>
    </nav>
  );
}

// ---------------------------------------------------------------------------
// Previous / next, like the library's page footer

export function JobPager({ nav }: { nav: JobNavModel }) {
  // Same order as the left panel, so "Next" is always the item below this one.
  if (!nav.key || nav.sub) return null;
  const all = nav.groups.flatMap((g) => g.items);
  const i = all.findIndex((x) => x.key === nav.key);
  if (i < 0) return null;
  const prev = i > 0 ? all[i - 1] : null;
  const next = i < all.length - 1 ? all[i + 1] : null;
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
