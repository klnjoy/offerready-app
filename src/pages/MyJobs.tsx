/* My Jobs — the job-centered list (was content/assets/jobs.js, #jobs-app). */

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
import type { JobRow } from "../types";

const SHOW_CONTROLS_AT = 6;
const PAGE_SIZE = 9;

type Sort = "recent" | "oldest" | "title" | "prep" | "gaps";

/** Pipeline stage from prep_progress (25 fit, 50 questions, 75 practice). */
function pipeline(j: JobRow) {
  const p = j.prep_progress || 0;
  const steps = [
    { label: "Analyzed", done: true },
    { label: "Fit", done: p >= 25 },
    { label: "Questions", done: p >= 50 },
    { label: "Practice", done: p >= 75 },
  ];
  const next =
    p < 25 ? { label: "Check My Fit", to: "/fit" }
    : p < 50 ? { label: "Prepare Practice Questions", to: "/questions" }
    : p < 75 ? { label: "Start Recommended Practice", to: "/defend?job=" + encodeURIComponent(j.id) }
    : { label: "View My Readiness", to: "/dashboard" };
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
          <p>My Jobs keeps each role you analyze {"—"} requirements, gaps, and prep progress {"—"} in one place.</p>
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
          <div className="question">No saved jobs yet</div>
          <p>Analyze a job description to create your first preparation plan.</p>
          <Link className="btn btn-primary" to="/analyze">Analyze a Job</Link>
        </Card>
      </Page>
    );
  }

  return (
    <Page addButton>
      <JobList jobs={list} activeId={jobs.activeId} onRemoved={(id) => setGone((g) => [...g, id])} />
    </Page>
  );
}

function Page({ children, addButton }: { children: ReactNode; addButton?: boolean }) {
  return (
    <div className="page">
      {addButton && (
        <div className="page-actions">
          <Link className="btn btn-primary" to="/analyze">+ Analyze new job</Link>
        </div>
      )}
      {children}
    </div>
  );
}

function JobList({ jobs, activeId, onRemoved }: { jobs: JobRow[]; activeId: string; onRemoved(id: string): void }) {
  const [q, setQ] = useState("");
  const [sort, setSort] = useState<Sort>("recent");
  const [shown, setShown] = useState(PAGE_SIZE);
  const controls = jobs.length >= SHOW_CONTROLS_AT;
  const active = activeId ? jobs.find((j) => j.id === activeId) : undefined;

  const list = useMemo(() => {
    if (!controls) return jobs;
    const needle = q.trim().toLowerCase();
    const out = jobs.filter((j) => !needle || (displayJobTitle(j) + " " + (j.company || "") + " " + (j.seniority || "")).toLowerCase().includes(needle));
    out.sort((a, b) => {
      switch (sort) {
        case "oldest": return timeOf(a) - timeOf(b);
        case "title": return displayJobTitle(a).localeCompare(displayJobTitle(b));
        case "prep": return (b.prep_progress || 0) - (a.prep_progress || 0);
        case "gaps": return (b.gaps_count || 0) - (a.gaps_count || 0);
        default: return timeOf(b) - timeOf(a);
      }
    });
    return out;
  }, [jobs, q, sort, controls]);

  const visible = controls ? list.slice(0, shown) : list;
  const [dates] = useInterviewDates();

  return (
    <>
      {active && (
        <div className="job-banner">
          <span className="job-banner-label">Current job</span> <strong>{displayJobTitle(active)}</strong> {"·"}{" "}
          <span className="small">this is what Check My Fit, Questions, Defend, and your Dashboard are working on</span>
        </div>
      )}
      {controls && (
        <>
          <div className="jobs-controls">
            <input className="input" type="search" aria-label="Search jobs" placeholder={"Search jobs by title or company…"}
              value={q} onChange={(e) => { setQ(e.target.value); setShown(PAGE_SIZE); }} />
            <label className="jobs-sort">
              <span className="small">Sort</span>
              <select className="input" value={sort} onChange={(e) => { setSort(e.target.value as Sort); setShown(PAGE_SIZE); }}>
                <option value="recent">Most recent</option>
                <option value="oldest">Oldest first</option>
                <option value="title">Title (A{"–"}Z)</option>
                <option value="prep">Prep (high{"→"}low)</option>
                <option value="gaps">Gaps (high{"→"}low)</option>
              </select>
            </label>
          </div>
          <p className="muted small">
            {list.length ? "Showing " + Math.min(shown, list.length) + " of " + list.length + (list.length === 1 ? " job" : " jobs") : ""}
          </p>
        </>
      )}
      <div className="jobs-grid">
        {visible.map((j) => <JobCard key={j.id} job={j} isActive={j.id === activeId} interviewDate={dates[j.id] || ""} onRemoved={onRemoved} />)}
        {controls && !list.length && <p className="hint">No jobs match {"“"}{q}{"”"}.</p>}
      </div>
      {controls && shown < list.length && (
        <div className="center">
          <button type="button" className="btn btn-ghost" onClick={() => setShown((s) => s + PAGE_SIZE)}>Show more</button>
        </div>
      )}
    </>
  );
}

function JobCard({ job: j, isActive, interviewDate, onRemoved }: { job: JobRow; isActive: boolean; interviewDate: string; onRemoved(id: string): void }) {
  const auth = useAuth();
  const navigate = useNavigate();
  // Inline confirmation inside the card (no window.confirm / alert).
  const [confirming, setConfirming] = useState(false);
  const [deleting, setDeleting] = useState(false);
  const [delErr, setDelErr] = useState("");
  const pl = pipeline(j);
  const when = j.created_at ? new Date(j.created_at) : null;

  const remove = async () => {
    setDeleting(true);
    setDelErr("");
    // Fresh token: the list's token may have expired since load.
    const tok = await auth.getAccessToken();
    if (!tok) {
      setDeleting(false);
      setDelErr("Your session has expired. Sign in again, then retry.");
      return;
    }
    const res = await api.deleteJob(tok, j.id);
    if (res.status === 200 || res.status === 404) {
      // 200 = deleted, 404 = already gone. The server cascade-deletes the
      // job's gap analysis, questions, snapshots and practice sessions.
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
      {when && !isNaN(when.getTime()) && <div className="job-date">Analyzed {when.toLocaleDateString()}</div>}
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
            Open &amp; continue
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
