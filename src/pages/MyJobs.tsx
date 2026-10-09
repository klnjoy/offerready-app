/* Jobs — the job-centered list (was content/assets/jobs.js, #jobs-app). */

import { useMemo, useState, type ReactNode } from "react";
import * as api from "../lib/api";
import { useAuth } from "../lib/auth";
import { countdownLabel, daysUntil, formatDay, useInterviewDates } from "../lib/interviewDates";
import { clearActiveJob, getActiveJob, setActiveJob } from "../lib/readiness";
import { displayJobTitle } from "../lib/roles";
import { Link, useNavigate } from "../lib/router";
import { useJobs } from "../lib/useJobs";
import { SignInCard } from "../components/AuthForm";
import { Card, Loading, Muted } from "../components/ui";
import { readString, writeString } from "../lib/storage";
import type { JobRow } from "../types";

const SHOW_CONTROLS_AT = 6;
const PAGE_SIZE = 9;
const LIST_PAGE_SIZE = 25;
const VIEW_KEY = "offerready.jobsView.v1";

type View = "list" | "cards";
type Filter = "all" | "soon" | "progress" | "ready";

type Sort = "recent" | "oldest" | "title" | "prep" | "gaps" | "interview";

/** Pipeline stage from prep_progress (25 fit, 50 questions, 75 practice). */
function pipeline(j: JobRow) {
  const p = j.prep_progress || 0;
  const id = encodeURIComponent(j.id);
  const steps = [
    { label: "Added", done: true },
    { label: "Resume", done: p >= 25 },
    { label: "Questions", done: p >= 50 },
    { label: "Practice", done: p >= 75 },
  ];
  const next =
    p < 25 ? { label: "Add your resume", to: "/jobs/" + id + "?tab=resume" }
    : p < 50 ? { label: "Get your interview questions", to: "/questions?job=" + id }
    : p < 75 ? { label: "Try a trade-off drill", to: "/defend?job=" + id }
    : { label: "See readiness", to: "/dashboard" };
  return { steps, next };
}

const timeOf = (j: JobRow) => {
  const d = j.created_at ? new Date(j.created_at).getTime() : 0;
  return isNaN(d) ? 0 : d;
};

export default function MyJobsPage() {
  const jobs = useJobs();
  // Deleted cards disappear in place; the list isn't re-fetched (no flash).
  const [gone, setGone] = useState<string[]>([]);
  const list = jobs.jobs.filter((j) => !gone.includes(j.id));

  if (jobs.status === "disabled") return <Page><Muted>Saved jobs aren{"’"}t enabled on this site yet.</Muted></Page>;
  if (jobs.status === "loading") return <Page><Loading>Loading your jobs{"…"}</Loading></Page>;
  if (jobs.status === "signedout") {
    return (
      <Page>
        <SignInCard title="Sign in to see your jobs">
          <p>Jobs keeps every role you{"’"}re preparing for in one place: its plan, your resume match and what to do next.</p>
        </SignInCard>
      </Page>
    );
  }
  if (jobs.status === "error") {
    return (
      <Page>
        <Card>
          <p>Couldn{"’"}t load your jobs right now. Please try again.</p>
          <button type="button" className="btn" onClick={jobs.reload}>Retry</button>
        </Card>
      </Page>
    );
  }

  if (!list.length) {
    return (
      <Page>
        <Card>
          <div className="question">No jobs yet</div>
          <p>Add the job you want. Paste a link or the description, and you get a day-by-day plan up to your interview.</p>
          <div className="row"><Link className="btn btn-primary" to="/analyze">+ Add a job</Link><Link className="btn btn-ghost" to="/example">See a sample</Link></div>
        </Card>
      </Page>
    );
  }

  return (
    <Page>
      <JobList jobs={list} activeId={jobs.activeId} onRemoved={(id) => setGone((g) => [...g, id])} />
    </Page>
  );
}

function Page({ children }: { children: ReactNode; addButton?: boolean }) {
  return (
    <div className="page">
      {children}
    </div>
  );
}

function JobList({ jobs, activeId, onRemoved }: { jobs: JobRow[]; activeId: string; onRemoved(id: string): void }) {
  const [q, setQ] = useState("");
  const [sort, setSort] = useState<Sort>("recent");
  const [filter, setFilter] = useState<Filter>("all");
  const many = jobs.length >= SHOW_CONTROLS_AT;
  // Many jobs read best as a compact list; a few look better as cards.
  const [view, setViewState] = useState<View>(() => {
    const saved = readString(VIEW_KEY);
    return saved === "cards" || saved === "list" ? saved : many ? "list" : "cards";
  });
  const setView = (v: View) => { setViewState(v); writeString(VIEW_KEY, v); setShown(v === "list" ? LIST_PAGE_SIZE : PAGE_SIZE); };
  const pageSize = view === "list" ? LIST_PAGE_SIZE : PAGE_SIZE;
  const [shown, setShown] = useState(pageSize);
  const active = activeId ? jobs.find((j) => j.id === activeId) : undefined;
  const [dates] = useInterviewDates();

  const counts = useMemo(() => {
    let soon = 0, progress = 0, ready = 0;
    for (const j of jobs) {
      const d = daysUntil(dates[j.id] || "");
      if (d != null && d >= 0 && d <= 14) soon++;
      const p = j.prep_progress || 0;
      if (p >= 75) ready++; else progress++;
    }
    return { all: jobs.length, soon, progress, ready };
  }, [jobs, dates]);

  const upcoming = useMemo(() => jobs
    .map((j) => ({ j, d: daysUntil(dates[j.id] || "") }))
    .filter((x): x is { j: JobRow; d: number } => x.d != null && x.d >= 0)
    .sort((a, b) => a.d - b.d)
    .slice(0, 3), [jobs, dates]);

  const list = useMemo(() => {
    const needle = q.trim().toLowerCase();
    const out = jobs.filter((j) => {
      if (needle && !(displayJobTitle(j) + " " + (j.company || "") + " " + (j.seniority || "")).toLowerCase().includes(needle)) return false;
      const p = j.prep_progress || 0;
      const d = daysUntil(dates[j.id] || "");
      if (filter === "soon") return d != null && d >= 0 && d <= 14;
      if (filter === "progress") return p < 75;
      if (filter === "ready") return p >= 75;
      return true;
    });
    out.sort((a, b) => {
      switch (sort) {
        case "oldest": return timeOf(a) - timeOf(b);
        case "title": return displayJobTitle(a).localeCompare(displayJobTitle(b));
        case "prep": return (b.prep_progress || 0) - (a.prep_progress || 0);
        case "gaps": return (b.gaps_count || 0) - (a.gaps_count || 0);
        case "interview": {
          const da = daysUntil(dates[a.id] || ""), db = daysUntil(dates[b.id] || "");
          const ka = da == null || da < 0 ? 1e9 : da, kb = db == null || db < 0 ? 1e9 : db;
          return ka - kb || timeOf(b) - timeOf(a);
        }
        default: return timeOf(b) - timeOf(a);
      }
    });
    return out;
  }, [jobs, q, sort, filter, dates]);

  const visible = list.slice(0, shown);
  const FILTERS: { key: Filter; label: string }[] = [
    { key: "all", label: "All" },
    { key: "soon", label: "Interview in 14 days" },
    { key: "progress", label: "In progress" },
    { key: "ready", label: "Prep done" },
  ];

  return (
    <>
      <div className="jobs-top">
        {active ? (
          <div className="job-banner">
            <span className="job-banner-label">Current job</span> <strong>{displayJobTitle(active)}</strong> {"·"}{" "}
            <span className="small">Practice, mock interviews and readiness use this job</span>
          </div>
        ) : <span />}
        <Link className="btn btn-primary jobs-add" to="/analyze">+ Add a job</Link>
      </div>

      {many && upcoming.length > 0 && (
        <div className="jobs-upcoming" aria-label="Upcoming interviews">
          <span className="jobs-upcoming-label">Next interviews</span>
          {upcoming.map(({ j, d }) => (
            <Link key={j.id} className="jobs-upcoming-item" to={"/jobs/" + encodeURIComponent(j.id)} onClick={() => setActiveJob(j.id)}>
              <strong>{displayJobTitle(j)}</strong>
              <span>{d === 0 ? "today" : d === 1 ? "tomorrow" : "in " + d + " days"}</span>
            </Link>
          ))}
        </div>
      )}

      <div className="jobs-toolbar">
        <input className="input jobs-search" type="search" aria-label="Search jobs" placeholder={"Search by title or company…"}
          value={q} onChange={(e) => { setQ(e.target.value); setShown(pageSize); }} />
        <label className="jobs-sort">
          <span className="small">Sort</span>
          <select className="input" value={sort} onChange={(e) => { setSort(e.target.value as Sort); setShown(pageSize); }}>
            <option value="recent">Most recent</option>
            <option value="interview">Interview date</option>
            <option value="oldest">Oldest first</option>
            <option value="title">Title (A{"–"}Z)</option>
            <option value="prep">Prep (high{"→"}low)</option>
            <option value="gaps">Gaps (high{"→"}low)</option>
          </select>
        </label>
        <div className="jobs-viewtoggle" role="group" aria-label="View">
          <button type="button" aria-pressed={view === "list"} className={view === "list" ? "on" : ""} onClick={() => setView("list")}>List</button>
          <button type="button" aria-pressed={view === "cards"} className={view === "cards" ? "on" : ""} onClick={() => setView("cards")}>Cards</button>
        </div>
      </div>

      {many && (
        <div className="jobs-filters" role="group" aria-label="Filter jobs">
          {FILTERS.map((f) => (
            <button key={f.key} type="button" aria-pressed={filter === f.key} className={"jobs-filter" + (filter === f.key ? " on" : "")}
              onClick={() => { setFilter(f.key); setShown(pageSize); }}>
              {f.label} <span className="jobs-filter-n">{counts[f.key]}</span>
            </button>
          ))}
        </div>
      )}

      <p className="muted small jobs-count">
        {list.length ? "Showing " + Math.min(shown, list.length) + " of " + list.length + (list.length === 1 ? " job" : " jobs") : ""}
      </p>

      {!list.length ? (
        <p className="hint">No jobs match. <button type="button" className="jobs-linkbtn" onClick={() => { setQ(""); setFilter("all"); }}>Clear search and filters</button></p>
      ) : view === "list" ? (
        <div className="jobs-table" role="table" aria-label="Your jobs">
          <div className="jobs-tr jobs-th" role="row">
            <span role="columnheader">Job</span>
            <span role="columnheader">Interview</span>
            <span role="columnheader">Prep</span>
            <span role="columnheader">Gaps</span>
            <span role="columnheader">Next step</span>
            <span role="columnheader"><span className="jobs-sr">Actions</span></span>
          </div>
          {visible.map((j) => <JobListRow key={j.id} job={j} isActive={j.id === activeId} interviewDate={dates[j.id] || ""} onRemoved={onRemoved} />)}
        </div>
      ) : (
        <div className="jobs-grid">
          {visible.map((j) => <JobCard key={j.id} job={j} isActive={j.id === activeId} interviewDate={dates[j.id] || ""} onRemoved={onRemoved} />)}
        </div>
      )}
      {shown < list.length && (
        <div className="center">
          <button type="button" className="btn btn-ghost" onClick={() => setShown((s) => s + pageSize)}>Show {Math.min(pageSize, list.length - shown)} more</button>
        </div>
      )}
    </>
  );
}

/** Shared delete flow for a card or a list row. */
function useDeleteJob(j: JobRow, onRemoved: (id: string) => void) {
  const auth = useAuth();
  const [confirming, setConfirming] = useState(false);
  const [deleting, setDeleting] = useState(false);
  const [delErr, setDelErr] = useState("");
  const remove = async () => {
    setDeleting(true);
    setDelErr("");
    const tok = await auth.getAccessToken();
    if (!tok) {
      setDeleting(false);
      setDelErr("Your session has expired. Sign in again, then retry.");
      return;
    }
    const res = await api.deleteJob(tok, j.id);
    if (res.status === 200 || res.status === 404) {
      if (getActiveJob() === j.id) clearActiveJob();
      onRemoved(j.id);
      return;
    }
    setDeleting(false);
    if (res.status === 0) setDelErr("Couldn\u2019t reach the server. Check your connection and try again.");
    else if (res.status === 401) setDelErr("Your session isn\u2019t valid. Sign in again and retry.");
    else if (res.status === 403) setDelErr("You don\u2019t have access to delete this job.");
    else if (res.status >= 500) setDelErr("The server couldn\u2019t delete this job right now. Please try again.");
    else setDelErr(res.body?.error || "Couldn\u2019t delete that job. Please try again.");
  };
  return { confirming, setConfirming, deleting, delErr, setDelErr, remove };
}

function JobListRow({ job: j, isActive, interviewDate, onRemoved }: { job: JobRow; isActive: boolean; interviewDate: string; onRemoved(id: string): void }) {
  const navigate = useNavigate();
  const del = useDeleteJob(j, onRemoved);
  const pl = pipeline(j);
  const p = j.prep_progress || 0;
  const open = () => { setActiveJob(j.id); navigate("/jobs/" + encodeURIComponent(j.id)); };
  return (
    <div className={"jobs-tr" + (isActive ? " jobs-tr-active" : "")} role="row">
      <span role="cell" className="jobs-td-title">
        <button type="button" className="jobs-title-btn" onClick={open}>{displayJobTitle(j)}</button>
        {isActive && <span className="job-activebadge">Active</span>}
        {(j.company || j.seniority) && <span className="jobs-sub">{[j.company, j.seniority].filter(Boolean).join(" · ")}</span>}
      </span>
      <span role="cell" className="jobs-td-iv">{daysUntil(interviewDate) != null ? <InterviewChip date={interviewDate} /> : <span className="muted small">No date</span>}</span>
      <span role="cell" className="jobs-td-prep">
        <span className="jobs-bar" aria-hidden="true"><span style={{ width: Math.max(0, Math.min(100, p)) + "%" }} /></span>
        <span className="small">{p}%</span>
      </span>
      <span role="cell" className="jobs-td-gaps"><span className="jobs-cellnum">{j.gaps_count || 0}</span><span className="jobs-cell-label"> gaps</span></span>
      <span role="cell" className="jobs-td-next"><Link to={pl.next.to} onClick={() => setActiveJob(j.id)}>{pl.next.label}</Link></span>
      <span role="cell" className="jobs-td-actions">
        {!del.confirming ? (
          <>
            <button type="button" className="btn btn-primary btn-small" onClick={open}>Open</button>
            <button type="button" className="btn btn-ghost btn-small" aria-label={"Delete " + displayJobTitle(j)} onClick={() => del.setConfirming(true)}>Delete</button>
          </>
        ) : (
          <span className="jobs-rowconfirm" role="alertdialog" aria-label="Confirm delete">
            <span className="small">Delete with its analysis and practice?</span>
            <button type="button" className="btn btn-danger btn-small" disabled={del.deleting} onClick={del.remove}>{del.deleting ? "Deleting\u2026" : "Delete"}</button>
            <button type="button" className="btn btn-ghost btn-small" disabled={del.deleting} onClick={() => { del.setConfirming(false); del.setDelErr(""); }}>Cancel</button>
            {del.delErr && <span className="error small" role="alert">{del.delErr}</span>}
          </span>
        )}
      </span>
    </div>
  );
}

function JobCard({ job: j, isActive, interviewDate, onRemoved }: { job: JobRow; isActive: boolean; interviewDate: string; onRemoved(id: string): void }) {
  const navigate = useNavigate();
  const { confirming, setConfirming, deleting, delErr, setDelErr, remove } = useDeleteJob(j, onRemoved);
  const pl = pipeline(j);
  const when = j.created_at ? new Date(j.created_at) : null;

  return (
    <div className={"job-card" + (isActive ? " job-active" : "")}>
      <div className="job-titlerow">
        <h3>{displayJobTitle(j)}</h3>
        {isActive && <span className="job-activebadge">Active</span>}
      </div>
      <InterviewChip date={interviewDate} />
      {(j.company || j.seniority) && <div className="job-meta">{[j.company, j.seniority].filter(Boolean).join(" · ")}</div>}
      <div className="job-stats">
        <div className="jobstat"><div className="jobstat-num">{j.skills_count || 0}</div><div className="jobstat-label">Skills</div></div>
        <div className="jobstat"><div className="jobstat-num">{j.gaps_count || 0}</div><div className="jobstat-label">Gaps</div></div>
        <div className="jobstat"><div className="jobstat-num">{(j.prep_progress || 0) + "%"}</div><div className="jobstat-label">Prep</div></div>
      </div>
      {when && !isNaN(when.getTime()) && <div className="job-date">Added {when.toLocaleDateString()}</div>}
      <div className="job-pipeline">
        {pl.steps.map((s) => (
          <span key={s.label} title={s.label + (s.done ? " done" : " not done yet")} className={"job-step " + (s.done ? "job-step-done" : "job-step-todo")}>
            {(s.done ? "✓ " : "") + s.label}
          </span>
        ))}
      </div>
      <div className="job-next">
        <span className="job-next-label">Next</span>
        <Link className="job-nextlink" to={pl.next.to} onClick={() => setActiveJob(j.id)}>{pl.next.label}</Link>
      </div>
      {!confirming ? (
        <div className="row">
          <button type="button" className="btn btn-primary" onClick={() => { setActiveJob(j.id); navigate("/jobs/" + encodeURIComponent(j.id)); }}>
            Open job
          </button>
          <button type="button" className="btn btn-ghost" onClick={() => setConfirming(true)}>Delete</button>
        </div>
      ) : (
        <div className="job-delconfirm" role="alertdialog" aria-label="Confirm delete">
          <p>
            Delete {"\u201c"}{displayJobTitle(j)}{"\u201d"}? This also removes its gap analysis, questions, and practice {"\u2014"} and can{"\u2019"}t be undone.
          </p>
          <div className="row">
            <button type="button" className="btn btn-danger" disabled={deleting} onClick={remove}>{deleting ? "Deleting\u2026" : "Delete"}</button>
            <button type="button" className="btn btn-ghost" disabled={deleting} onClick={() => { setConfirming(false); setDelErr(""); }}>Cancel</button>
          </div>
          {delErr && <p className="error" role="alert">{delErr}</p>}
        </div>
      )}
    </div>
  );
}

function InterviewChip({ date }: { date: string }) {
  const days = daysUntil(date);
  if (days == null) return null;
  const label = days > 1 ? "Interview in " + days + " days" : days === 1 ? "Interview tomorrow" : countdownLabel(days);
  return (
    <span className={"iv-chip" + (days >= 0 && days <= 3 ? " iv-chip-soon" : "") + (days < 0 ? " iv-chip-past" : "")} title={formatDay(date, { weekday: "long", month: "long", day: "numeric" })}>
      <svg viewBox="0 0 16 16" width="13" height="13" aria-hidden="true"><rect x="2" y="3" width="12" height="11" rx="2" fill="none" stroke="currentColor" strokeWidth="1.5" /><path d="M2 6.5h12M5.5 1.5v3M10.5 1.5v3" stroke="currentColor" strokeWidth="1.5" strokeLinecap="round" /></svg>
      {label}
    </span>
  );
}
