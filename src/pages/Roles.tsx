/* Open roles (/roles): US jobs for the roles OfferReady prepares people for
 * (forward deployed, AI / ML, data, architect, platform), refreshed daily from
 * the public job boards companies publish (scripts/fetch-roles.mjs writes
 * roles.json and roles-desc/<id>.json at deploy time). "Prepare for this role"
 * adds the posting as your job and checks it against your saved resume, so the
 * listing turns into prep: gaps, likely questions and a daily plan.
 * ?family=fde|ai|data|architect|platform picks the starting filter. */

import { useEffect, useMemo, useState } from "react";
import { ExternalLink, Link, useNavigate, useSearchParams } from "../lib/router";
import { Loading } from "../components/ui";
import { useAuth } from "../lib/auth";
import { addJobInBackground, useBgJob } from "../lib/bgAddJob";

type Family = "fde" | "ai" | "data" | "architect" | "platform";
type Role = { id: string; company: string; title: string; location: string; url: string; posted: string | null; family: Family; region: "us" | "remote"; tags: string[] };
type Feed = { updated: string; count: number; roles: Role[] };

const FAMILIES: { key: Family | "all"; label: string }[] = [
  { key: "all", label: "All" },
  { key: "ai", label: "AI / ML engineer" },
  { key: "data", label: "Data engineer" },
  { key: "fde", label: "Forward deployed" },
  { key: "architect", label: "Architect" },
  { key: "platform", label: "Platform / SRE" },
];
const TECH = ["Snowflake", "Databricks", "dbt", "Spark", "Kafka", "LLMs"];

/** Analyze's pending-job key: signed in, the job is added and analysed right
 * away (JD + your saved resume → resume match, questions, plan); signed out,
 * the form waits filled in behind sign-in. */
const ANALYZE_PENDING_KEY = "offerready.analyze.pending.v1";
const PAGE = 40;

function ago(d: string | null): string {
  if (!d) return "";
  const days = Math.floor((Date.now() - Date.parse(d + "T00:00:00Z")) / 86400000);
  return days <= 0 ? "Today" : days === 1 ? "Yesterday" : days < 30 ? days + "d ago" : days < 60 ? "1 mo ago" : Math.floor(days / 30) + " mo ago";
}

export default function RolesPage() {
  const params = useSearchParams();
  const startFam = params.get("family") as Family | null;
  const [feed, setFeed] = useState<Feed | null | "none">(null);
  const [fam, setFam] = useState<Family | "all">(startFam && FAMILIES.some((f) => f.key === startFam) ? startFam : "all");
  const [tech, setTech] = useState("");
  const [remote, setRemote] = useState(false);
  const [q, setQ] = useState("");
  const [limit, setLimit] = useState(PAGE);
  const [busy, setBusy] = useState("");
  const navigate = useNavigate();
  const auth = useAuth();
  const bg = useBgJob();
  const [addedIds, setAddedIds] = useState<string[]>([]);

  useEffect(() => {
    let alive = true;
    fetch(import.meta.env.BASE_URL + "roles.json", { cache: "no-cache" })
      .then((r) => (r.ok ? r.json() : null))
      .then((d: Feed | null) => { if (alive) setFeed(d && Array.isArray(d.roles) ? d : "none"); })
      .catch(() => { if (alive) setFeed("none"); });
    return () => { alive = false; };
  }, []);
  useEffect(() => setLimit(PAGE), [fam, tech, remote, q]);

  const roles = feed && feed !== "none" ? feed.roles.filter((r) => r.family) : [];
  const shown = useMemo(() => {
    const t = q.trim().toLowerCase();
    return roles.filter((r) => (fam === "all" || r.family === fam) && (!tech || (r.tags || []).includes(tech)) && (!remote || r.region === "remote" || /remote/i.test(r.location))
      && (!t || (r.company + " " + r.title + " " + r.location).toLowerCase().includes(t)));
  }, [roles, fam, tech, remote, q]);
  const count = (f: Family | "all") => roles.filter((r) => f === "all" || r.family === f).length;

  /** Prepare: signed in, the job is added in the background while you keep
   * browsing (a status pill says when it's ready); signed out, Add a job
   * opens filled in behind sign-in. */
  const prepare = async (r: Role) => {
    setBusy(r.id);
    let desc = "";
    try {
      const res = await fetch(import.meta.env.BASE_URL + "roles-desc/" + r.id + ".json");
      if (res.ok) desc = String((await res.json())?.desc || "");
    } catch { /* offline: the posting link still goes through */ }
    const jd = (r.title + " · " + r.company + (r.location ? " · " + r.location : "") + (desc ? "\n\n" + desc : "\n\nPosting: " + r.url)).slice(0, 12000);
    const tok = auth.session ? await auth.getAccessToken() : null;
    setBusy("");
    if (tok) {
      setAddedIds((ids) => [...ids, r.id]);
      void addJobInBackground(tok, { title: r.title.slice(0, 200), company: r.company, jd, url: r.url });
      return;
    }
    try {
      sessionStorage.setItem(ANALYZE_PENDING_KEY, JSON.stringify({ targetRole: r.title.slice(0, 200), jobDescription: jd, sourceUrl: r.url.slice(0, 2000), interviewDate: "", company: r.company, at: Date.now() }));
    } catch { /* blocked storage: Add a job still opens */ }
    navigate("/analyze");
  };

  if (feed === null) return <div className="page"><Loading /></div>;
  if (feed === "none" || !roles.length) return (
    <div className="page ro"><p className="muted">The list is being set up and appears after the next daily update.</p></div>
  );

  return (
    <div className="page ro">
      <p className="ro-intro">
        <strong>{roles.length} open roles in the USA</strong> at {new Set(roles.map((r) => r.company)).size} companies · updated {new Date(feed.updated).toLocaleDateString(undefined, { month: "short", day: "numeric" })}.
        {" "}Tap <b>Prepare</b> to add one as your job (it keeps going while you browse): resume match, likely questions and a daily plan for it.
      </p>

      <div className="ro-chips" role="radiogroup" aria-label="Role">
        {FAMILIES.map((f) => (
          <button key={f.key} type="button" role="radio" aria-checked={fam === f.key} className={"cp-chip" + (fam === f.key ? " on" : "")} onClick={() => setFam(f.key)}>
            {f.label} <span className="ro-n">{count(f.key)}</span>
          </button>
        ))}
      </div>
      <div className="ro-chips ro-chips-2" aria-label="Narrow down">
        {TECH.map((t) => (
          <button key={t} type="button" aria-pressed={tech === t} className={"cp-chip" + (tech === t ? " on" : "")} onClick={() => setTech(tech === t ? "" : t)}>{t}</button>
        ))}
        <button type="button" aria-pressed={remote} className={"cp-chip" + (remote ? " on" : "")} onClick={() => setRemote(!remote)}>Remote</button>
      </div>
      <input className="input ro-search" type="search" placeholder="Search company, title or city" value={q} onChange={(e) => setQ(e.target.value)} aria-label="Search roles" />

      {shown.length ? (
        <ul className="ro-list">
          {shown.slice(0, limit).map((r) => (
            <li key={r.id} className="ro-card">
              <div className="ro-main">
                <span className="ro-co">{r.company}<em>{r.posted ? " · " + ago(r.posted) : ""}</em></span>
                <strong className="ro-title">{r.title}</strong>
                <span className="ro-loc">{r.location || "USA"}{(r.tags || []).length ? <> · {(r.tags || []).slice(0, 3).join(", ")}</> : null}</span>
              </div>
              <div className="ro-actions">
                {addedIds.includes(r.id)
                  ? <span className="ro-added">{bg.state === "busy" && bg.title === r.title.slice(0, 200) ? "Adding…" : "Added ✓"}</span>
                  : <button type="button" className="btn btn-primary btn-small" onClick={() => void prepare(r)} disabled={!!busy || bg.state === "busy"}>{busy === r.id ? "…" : "Prepare"}</button>}
                <ExternalLink className="btn btn-ghost btn-small" href={r.url} aria-label={"View and apply: " + r.title + " at " + r.company}>Apply ↗</ExternalLink>
              </div>
            </li>
          ))}
        </ul>
      ) : <p className="muted">No roles match. Try another filter.</p>}
      {shown.length > limit && (
        <button type="button" className="btn ro-more" onClick={() => setLimit((n) => n + PAGE)}>Show more ({shown.length - limit} left)</button>
      )}

      <p className="small muted ro-how">
        From companies{"’"} own public job boards, checked once a day. Always apply on the company{"’"}s site.
        {" "}New to AI roles? <Link to="/learn/roadmap">See the 12-week roadmap</Link>.
      </p>
    </div>
  );
}
