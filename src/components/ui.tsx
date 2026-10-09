/* Small presentational building blocks shared by every screen. */

import type { ReactNode } from "react";
import { band } from "../lib/readiness";
import { Link } from "../lib/router";

export function Card({ children, className = "", tone }: { children: ReactNode; className?: string; tone?: "ok" | "warn" }) {
  return <div className={"card" + (tone ? " card-" + tone : "") + (className ? " " + className : "")}>{children}</div>;
}

export function Section({ title, children }: { title: string; children: ReactNode }) {
  return (
    <section className="card section">
      <h2 className="section-title">{title}</h2>
      {children}
    </section>
  );
}

export function PageHeader({ title, intro }: { title: string; intro?: ReactNode }) {
  return (
    <header className="page-header">
      <h1>{title}</h1>
      {intro ? <p className="muted">{intro}</p> : null}
    </header>
  );
}

export function Muted({ children, small }: { children: ReactNode; small?: boolean }) {
  return <p className={"muted" + (small ? " small" : "")}>{children}</p>;
}

export function ErrorText({ children }: { children: ReactNode }) {
  return (
    <p className="error" role="alert">
      {children}
    </p>
  );
}

export function Stat({ value, label }: { value: ReactNode; label: string }) {
  return (
    <div className="stat">
      <div className="stat-num">{value}</div>
      <div className="stat-label">{label}</div>
    </div>
  );
}

export function StatGrid({ children }: { children: ReactNode }) {
  return <div className="stat-grid">{children}</div>;
}

export function ScoreBar({ label, pct }: { label: string; pct: number }) {
  return (
    <div className="bar-row">
      <div className="bar-label">{label}</div>
      <div className="bar-track">
        <div className={"bar-fill band-" + band(pct)} style={{ width: Math.max(3, pct) + "%" }} />
      </div>
      <div className="bar-pct">{pct}%</div>
    </div>
  );
}

export function ScoreHead({ pct, title, sub }: { pct: number; title: string; sub?: ReactNode }) {
  return (
    <div className="score-head">
      <div className={"score-num band-" + band(pct)}>{pct}%</div>
      <div>
        <strong>{title}</strong>
        {sub ? <div className="muted">{sub}</div> : null}
      </div>
    </div>
  );
}

export function Chips({ label, items, tone }: { label?: string; items: ReactNode[]; tone?: "ok" | "warn" }) {
  if (!items.length) return null;
  return (
    <div className="chips-block">
      {label ? <div className="field-label">{label}</div> : null}
      <div className="chips">
        {items.map((it, i) => (
          <span key={i} className={"chip" + (tone ? " chip-" + tone : "")}>
            {it}
          </span>
        ))}
      </div>
    </div>
  );
}

export function Bullets({ label, items }: { label?: string; items: ReactNode[] }) {
  if (!items.length) return null;
  return (
    <div>
      {label ? <div className="field-label">{label}</div> : null}
      <ul>
        {items.map((it, i) => (
          <li key={i}>{it}</li>
        ))}
      </ul>
    </div>
  );
}

const PILL_TONE: Record<string, string> = {
  MATCHED: "ok", STRONG_MATCH: "ok",
  PARTIAL: "warn", PARTIAL_MATCH: "warn",
  POTENTIAL_GAP: "gap", PREPARATION_NEEDED: "gap",
  NOT_ENOUGH_INFO: "info", INSUFFICIENT_INFO: "info",
};

/** When no resume was compared, "insufficient info" reads as "Resume not compared". */
export function StatusPill({ status, resumeProvided }: { status: string; resumeProvided?: boolean }) {
  const insufficient = status === "INSUFFICIENT_INFO" || status === "NOT_ENOUGH_INFO";
  if (insufficient && !resumeProvided) return <span className="pill pill-info">Resume not compared</span>;
  return <span className={"pill pill-" + (PILL_TONE[status] || "info")}>{String(status || "").replace(/_/g, " ")}</span>;
}

/** One labeled primary next step + a one-line reason. */
export function NextAction({ label, to, cta, why }: { label: string; to: string; cta: string; why: string }) {
  return (
    <div className="next-action">
      <div className="next-action-label">{label}</div>
      <div className="next-action-row">
        <Link className="btn btn-primary" to={to}>
          {cta}
        </Link>
        <span className="next-action-why">{why}</span>
      </div>
    </div>
  );
}

/** "Current job: <title>" — the active job that follows the user across screens. */
export function JobBanner({ title, hasJobs, note }: { title?: string; hasJobs?: boolean; note?: ReactNode }) {
  return (
    <div className="job-banner">
      {title ? (
        <>
          <span className="job-banner-label">Current job</span> <strong>{title}</strong>
          {note ? <span className="small"> {"·"} {note}</span> : null}
        </>
      ) : hasJobs ? (
        <>
          <span className="job-banner-label">No active job selected</span> {"—"} pick one below.
        </>
      ) : (
        <>
          <span className="job-banner-label">No active job selected</span>{" "}
          <Link className="btn btn-small" to="/analyze">
            Add a job
          </Link>
        </>
      )}
    </div>
  );
}

export function Loading({ children = "Loading…" }: { children?: ReactNode }) {
  return (
    <Card>
      <p className="muted" aria-live="polite">
        {children}
      </p>
    </Card>
  );
}

export function Disclaimer() {
  return <Muted small>Preparation guidance only {"—"} not a prediction of interview or offer outcomes.</Muted>;
}
