/* Open forward deployed engineer roles (/roles), refreshed daily from the
 * public job boards AI companies publish (scripts/fetch-roles.mjs writes
 * roles.json at deploy time). "Prepare for this role" opens Add a job with the
 * posting filled in, so the listing turns into prep: questions, resume match
 * and a plan for that exact role. Apply on the company's own site. */

import { useEffect, useMemo, useState } from "react";
import { ExternalLink, Link, useNavigate } from "../lib/router";
import { Loading } from "../components/ui";

type Role = { company: string; title: string; location: string; url: string; posted: string | null; desc: string; source: string };
type Feed = { updated: string; count: number; roles: Role[] };

/** Analyze's pending-job key: signed in, the job is added and analysed right
 * away (JD + your saved resume → resume match, questions, plan); signed out,
 * the form waits filled in behind sign-in. */
const ANALYZE_PENDING_KEY = "offerready.analyze.pending.v1";

function ago(d: string | null): string {
  if (!d) return "";
  const days = Math.floor((Date.now() - Date.parse(d + "T00:00:00Z")) / 86400000);
  return days <= 0 ? "Posted today" : days === 1 ? "Posted yesterday" : days < 30 ? "Posted " + days + " days ago" : days < 60 ? "Posted a month ago" : "Posted " + Math.floor(days / 30) + " months ago";
}

export default function RolesPage() {
  const [feed, setFeed] = useState<Feed | null | "none">(null);
  const [q, setQ] = useState("");
  const navigate = useNavigate();

  useEffect(() => {
    let alive = true;
    fetch(import.meta.env.BASE_URL + "roles.json", { cache: "no-cache" })
      .then((r) => (r.ok ? r.json() : null))
      .then((d: Feed | null) => { if (alive) setFeed(d && Array.isArray(d.roles) ? d : "none"); })
      .catch(() => { if (alive) setFeed("none"); });
    return () => { alive = false; };
  }, []);

  const shown = useMemo(() => {
    if (!feed || feed === "none") return [];
    const t = q.trim().toLowerCase();
    return t ? feed.roles.filter((r) => (r.company + " " + r.title + " " + r.location).toLowerCase().includes(t)) : feed.roles;
  }, [feed, q]);

  const prepare = (r: Role) => {
    try {
      sessionStorage.setItem(ANALYZE_PENDING_KEY, JSON.stringify({
        targetRole: r.title.slice(0, 200),
        jobDescription: (r.title + " · " + r.company + (r.location ? " · " + r.location : "") + "\n\n" + r.desc).slice(0, 12000),
        sourceUrl: r.url.slice(0, 2000), interviewDate: "", company: r.company, at: Date.now(),
      }));
    } catch { /* blocked storage: Add a job still opens */ }
    navigate("/analyze");
  };

  if (feed === null) return <div className="page"><Loading /></div>;
  const companies = feed === "none" ? 0 : new Set(feed.roles.map((r) => r.company)).size;

  return (
    <div className="page ro">
      <p className="small muted ro-meta">
        {feed === "none" ? "The list is being set up and appears after the next daily update." :
          feed.roles.length + " roles at " + companies + " companies · updated " + new Date(feed.updated).toLocaleDateString(undefined, { month: "short", day: "numeric" })}
      </p>

      {feed !== "none" && feed.roles.length > 0 && (
        <input className="input" type="search" placeholder="Filter by company, title or place" value={q} onChange={(e) => setQ(e.target.value)} aria-label="Filter roles" />
      )}

      {feed !== "none" && shown.length > 0 ? (
        <ul className="ro-list">
          {shown.map((r) => (
            <li key={r.url} className="ro-card">
              <div className="ro-top">
                <span className="ro-co">{r.company}</span>
                {r.posted && <span className="small muted">{ago(r.posted)}</span>}
              </div>
              <strong className="ro-title">{r.title}</strong>
              {r.location && <span className="small muted">{r.location}</span>}
              <span className="small muted ro-what">Adds it as your job: resume match, likely questions and a daily practice plan.</span>
              <div className="ro-actions">
                <button type="button" className="btn btn-primary btn-small" onClick={() => prepare(r)} disabled={!r.desc}>Prepare for this role</button>
                <ExternalLink className="btn btn-ghost btn-small" href={r.url}>View and apply ↗</ExternalLink>
              </div>
            </li>
          ))}
        </ul>
      ) : feed !== "none" ? (
        <p className="muted">{q ? "No roles match that filter." : "No open roles right now. The list updates every day."}</p>
      ) : null}

      <div className="ro-how">
        <strong>How this works</strong>
        <span>We check the public job boards of AI companies once a day for forward deployed engineer roles. {"“"}Prepare for this role{"”"} adds the posting as your job and checks it against your saved resume, so you get the gaps, the likely questions and a daily practice plan for that exact role. Always apply on the company{"’"}s own site.</span>
        <Link to="/learn/roadmap">See the 12-week roadmap ›</Link>
      </div>
    </div>
  );
}
