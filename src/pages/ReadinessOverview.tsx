/* Readiness across all your jobs: how many are ready, which interviews are at
 * risk, and a searchable, sortable list that stays fast at hundreds of jobs
 * (one API call for every score, 25 rows at a time). Opening a row shows that
 * job's full readiness (/dashboard?job=…). */

import { useEffect, useMemo, useState } from "react";
import * as api from "../lib/api";
import type { JobReadiness } from "../lib/api";
import { useAuth } from "../lib/auth";
import { READY_LINE } from "../lib/forecast";
import { daysUntil, useInterviewDates } from "../lib/interviewDates";
import { setActiveJob } from "../lib/readiness";
import { displayJobTitle } from "../lib/roles";
import { Link } from "../lib/router";
import { readString, writeString } from "../lib/storage";
import { InterviewChip } from "../components/InterviewChip";
import type { JobRow } from "../types";

type Status = "ready" | "mid" | "low" | "none";
type Filter = "all" | Status | "risk";
type Sort = "interview" | "low" | "high" | "change" | "recent";

const PAGE = 25;
const SORT_KEY = "offerready.readinessSort.v1";
const RISK_DAYS = 14;

/** Shared with the job view: ready at the line, getting there from 50. */
export function statusOf(r: JobReadiness | undefined): Status {
  if (!r) return "none";
  if (r.score >= READY_LINE) return "ready";
  if (r.score >= 50) return "mid";
  return "low";
}

const STATUS_LABEL: Record<Status, string> = { ready: "Ready", mid: "Getting there", low: "Not yet", none: "Not started" };

let cache: { at: number; scores: Record<string, JobReadiness> } | null = null;

function useScores(): { scores: Record<string, JobReadiness> | null; failed: boolean } {
  const auth = useAuth();
  const [scores, setScores] = useState<Record<string, JobReadiness> | null>(cache && Date.now() - cache.at < 60000 ? cache.scores : null);
  const [failed, setFailed] = useState(false);
  useEffect(() => {
    if (scores) return;
    let alive = true;
    (async () => {
      const tok = await auth.getAccessToken();
      if (!tok) { if (alive) setFailed(true); return; }
      const res = await api.getReadinessScores(tok);
      if (!alive) return;
      if (res.status === 200 && res.body?.scores) {
        cache = { at: Date.now(), scores: res.body.scores };
        setScores(res.body.scores);
      } else setFailed(true);
    })();
    return () => { alive = false; };
  }, []); // eslint-disable-line react-hooks/exhaustive-deps
  return { scores, failed };
}

export default function ReadinessOverview({ jobs }: { jobs: JobRow[] }) {
  const { scores, failed } = useScores();
  const [dates] = useInterviewDates();
  const [q, setQ] = useState("");
  const [filter, setFilter] = useState<Filter>("all");
  const [sort, setSortRaw] = useState<Sort>(() => (readString(SORT_KEY) as Sort) || "interview");
  const setSort = (s: Sort) => { setSortRaw(s); writeString(SORT_KEY, s); };
  const [shown, setShown] = useState(PAGE);
  const sc = scores || {};

  const dayOf = (id: string) => { const d = daysUntil(dates[id] || ""); return d != null && d >= 0 ? d : null; };
  const atRisk = (j: JobRow) => { const d = dayOf(j.id); return d != null && d <= RISK_DAYS && (sc[j.id]?.score ?? 0) < READY_LINE; };

  const counts = useMemo(() => {
    const c: Record<Filter, number> = { all: jobs.length, ready: 0, mid: 0, low: 0, none: 0, risk: 0 };
    for (const j of jobs) { c[statusOf(sc[j.id])]++; if (atRisk(j)) c.risk++; }
    return c;
  }, [jobs, scores, dates]); // eslint-disable-line react-hooks/exhaustive-deps

  const upcoming = useMemo(() => jobs
    .map((j) => ({ j, d: dayOf(j.id) }))
    .filter((x): x is { j: JobRow; d: number } => x.d != null)
    .sort((a, b) => a.d - b.d)
    .slice(0, 3), [jobs, dates]); // eslint-disable-line react-hooks/exhaustive-deps

  const list = useMemo(() => {
    const needle = q.trim().toLowerCase();
    const out = jobs.filter((j) => {
      if (needle && !(displayJobTitle(j) + " " + (j.company || "")).toLowerCase().includes(needle)) return false;
      if (filter === "risk") return atRisk(j);
      if (filter !== "all") return statusOf(sc[j.id]) === filter;
      return true;
    });
    const score = (j: JobRow) => sc[j.id]?.score;
    const change = (j: JobRow) => { const r = sc[j.id]; return r && r.week_ago != null ? r.score - r.week_ago : null; };
    const at = (j: JobRow) => Date.parse(sc[j.id]?.at || "") || 0;
    const last = (v: number | null | undefined, dir: 1 | -1) => (v == null ? Infinity : dir * v);
    out.sort((a, b) => {
      if (sort === "interview") return last(dayOf(a.id), 1) - last(dayOf(b.id), 1) || last(score(a), 1) - last(score(b), 1);
      if (sort === "low") return last(score(a), 1) - last(score(b), 1);
      if (sort === "high") return last(score(a), -1) - last(score(b), -1);
      if (sort === "change") return last(change(a), -1) - last(change(b), -1);
      return at(b) - at(a);
    });
    return out;
  }, [jobs, scores, dates, q, filter, sort]); // eslint-disable-line react-hooks/exhaustive-deps

  const visible = list.slice(0, shown);
  const FILTERS: { key: Filter; label: string }[] = [
    { key: "all", label: "All" },
    { key: "risk", label: "At risk" },
    { key: "ready", label: "Ready" },
    { key: "mid", label: "Getting there" },
    { key: "low", label: "Not yet" },
    { key: "none", label: "Not started" },
  ];
  const pick = (f: Filter) => { setFilter(f); setShown(PAGE); };

  return (
    <div className="rd-stack">
      <section className="card rdo-summary" aria-labelledby="rdo-h">
        <div className="rd-sec-head">
          <h2 id="rdo-h">Readiness across your {jobs.length} jobs</h2>
          <p className="muted small">Ready means {READY_LINE} or more. Open a job to see what to do next.</p>
        </div>
        <div className="rdo-tiles" role="group" aria-label="Jobs by readiness">
          {(["ready", "mid", "low", "none"] as Status[]).map((s) => (
            <button key={s} type="button" className={"rdo-tile rdo-" + s + (filter === s ? " on" : "")} aria-pressed={filter === s} onClick={() => pick(filter === s ? "all" : s)}>
              <span className="rdo-tile-n">{scores ? counts[s] : "–"}</span>
              <span className="rdo-tile-l">{STATUS_LABEL[s]}</span>
            </button>
          ))}
        </div>
        {counts.risk > 0 && (
          <p className="rdo-risk" role="status">
            <strong>{counts.risk} {counts.risk === 1 ? "interview is" : "interviews are"} within {RISK_DAYS} days and not ready yet.</strong>{" "}
            <button type="button" className="jobs-linkbtn" onClick={() => pick("risk")}>Show {counts.risk === 1 ? "it" : "them"}</button>
          </p>
        )}
        {failed && <p className="hint">Scores couldn{"’"}t load right now. Open a job to see its readiness.</p>}
      </section>

      {upcoming.length > 0 && (
        <section className="card rdo-next" aria-labelledby="rdo-next-h">
          <h2 id="rdo-next-h" className="rdo-h3">Next interviews</h2>
          <ul className="rdo-next-list">
            {upcoming.map(({ j, d }) => {
              const r = sc[j.id];
              const st = statusOf(r);
              return (
                <li key={j.id}>
                  <Link className="rdo-next-item" to={"/dashboard?job=" + encodeURIComponent(j.id)} onClick={() => setActiveJob(j.id)}>
                    <span className="rdo-next-when">{d === 0 ? "Today" : d === 1 ? "Tomorrow" : "In " + d + " days"}</span>
                    <strong className="rdo-next-title">{displayJobTitle(j)}</strong>
                    <span className={"rdo-pill rdo-" + st}>{r ? r.score + " · " : ""}{STATUS_LABEL[st]}</span>
                  </Link>
                </li>
              );
            })}
          </ul>
        </section>
      )}

      <section className="card rdo-list" aria-labelledby="rdo-list-h">
        <h2 id="rdo-list-h" className="rdo-h3">All jobs</h2>
        <div className="jobs-toolbar">
          <input className="input jobs-search" type="search" aria-label="Search jobs" placeholder={"Search by title or company…"}
            value={q} onChange={(e) => { setQ(e.target.value); setShown(PAGE); }} />
          <label className="jobs-sort">
            <span className="small">Sort</span>
            <select className="input" value={sort} onChange={(e) => { setSort(e.target.value as Sort); setShown(PAGE); }}>
              <option value="interview">Interview date</option>
              <option value="low">Lowest score first</option>
              <option value="high">Highest score first</option>
              <option value="change">Biggest gain this week</option>
              <option value="recent">Recently practised</option>
            </select>
          </label>
        </div>
        <div className="jobs-filters" role="group" aria-label="Filter jobs">
          {FILTERS.map((f) => (
            <button key={f.key} type="button" aria-pressed={filter === f.key} className={"jobs-filter" + (filter === f.key ? " on" : "")} onClick={() => pick(f.key)}>
              {f.label} <span className="jobs-filter-n">{scores || f.key === "all" ? counts[f.key] : "–"}</span>
            </button>
          ))}
        </div>
        <p className="muted small jobs-count">{list.length ? "Showing " + Math.min(shown, list.length) + " of " + list.length : ""}</p>
        {!list.length ? (
          <p className="hint">No jobs match. <button type="button" className="jobs-linkbtn" onClick={() => { setQ(""); pick("all"); }}>Clear search and filters</button></p>
        ) : (
          <ul className="rdo-rows">
            {visible.map((j) => <Row key={j.id} job={j} r={sc[j.id]} loading={!scores && !failed} date={dates[j.id] || ""} />)}
          </ul>
        )}
        {shown < list.length && (
          <div className="center">
            <button type="button" className="btn btn-ghost" onClick={() => setShown((s) => s + PAGE)}>Show {Math.min(PAGE, list.length - shown)} more</button>
          </div>
        )}
      </section>
    </div>
  );
}

function Row({ job: j, r, loading, date }: { job: JobRow; r: JobReadiness | undefined; loading: boolean; date: string }) {
  const st = statusOf(r);
  const delta = r && r.week_ago != null ? r.score - r.week_ago : null;
  const to = "/dashboard?job=" + encodeURIComponent(j.id);
  const hasDate = daysUntil(date) != null;
  return (
    <li className="rdo-row">
      <Link className="rdo-row-main" to={to} onClick={() => setActiveJob(j.id)}>
        <span className="rdo-row-title">
          <strong>{displayJobTitle(j)}</strong>
          {j.company && <span className="muted small">{j.company}</span>}
        </span>
        <span className="rdo-row-score" aria-label={r ? "Readiness " + r.score + " of 100" : loading ? "Loading" : "Not started"}>
          <span className="rdo-bar" aria-hidden="true">
            <span className={"rdo-bar-fill rdo-" + st} style={{ width: (r ? r.score : 0) + "%" }} />
            <span className="rdo-bar-ready" style={{ left: READY_LINE + "%" }} />
          </span>
          <span className="rdo-num">{r ? r.score : loading ? "…" : "–"}</span>
        </span>
        <span className={"rdo-pill rdo-" + st}>{STATUS_LABEL[st]}</span>
        <span className={"rdo-delta" + (delta == null ? "" : delta > 0 ? " up" : delta < 0 ? " down" : "")} aria-label={delta == null ? "No change data" : (delta >= 0 ? "Up " : "Down ") + Math.abs(delta) + " this week"}>
          {delta == null ? "" : delta > 0 ? "▲ " + delta : delta < 0 ? "▼ " + Math.abs(delta) : "–"}
        </span>
        <span className="rdo-row-iv">{hasDate ? <InterviewChip date={date} /> : <span className="muted small">No date</span>}</span>
      </Link>
    </li>
  );
}
