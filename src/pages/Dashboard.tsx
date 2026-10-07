/* Readiness dashboard — one job-scoped, DB-backed engine (was
 * content/assets/readiness.js on #dashboard-app). localStorage is only an
 * offline cache, never the authority. */

import { useEffect, useState } from "react";
import { API_ENABLED } from "../config";
import * as api from "../lib/api";
import { useAuth } from "../lib/auth";
import { clampInt, setActiveJob, weightedOverall } from "../lib/readiness";
import { displayJobTitle } from "../lib/roles";
import { Link } from "../lib/router";
import { KEYS, readJSON, writeJSON } from "../lib/storage";
import { useJobs } from "../lib/useJobs";
import { SignInCard } from "../components/AuthForm";
import { Card, Chips, Loading, Muted, ScoreBar, ScoreHead, Stat, StatGrid } from "../components/ui";
import type { GapRow, JobDetail, JobRow, PracticeRow, ProgressRow } from "../types";

interface Cached {
  when: number;
  jobTitle?: string;
  gap: GapRow | null;
  progress: ProgressRow[];
  questionCount: number;
  practice: PracticeRow[];
}

export default function DashboardPage() {
  const auth = useAuth();
  const jobsState = useJobs();
  const [jobId, setJobId] = useState("");
  const [detail, setDetail] = useState<JobDetail | null>(null);
  const [error, setError] = useState("");

  // Pick the active job (validated by useJobs) or the newest.
  useEffect(() => {
    if (jobsState.status !== "ready" || !jobsState.jobs.length) return;
    setJobId(jobsState.activeId || jobsState.jobs[0].id);
  }, [jobsState.status, jobsState.activeId, jobsState.jobs]);

  useEffect(() => {
    if (!jobId) return;
    let alive = true;
    setActiveJob(jobId);
    setDetail(null);
    setError("");
    (async () => {
      const tok = await auth.getAccessToken();
      if (!tok) return;
      const res = await api.getJob(tok, jobId);
      if (!alive) return;
      if (res.status === 0) { setError("Couldn’t reach the server."); return; }
      if (res.status !== 200 || !res.body?.job) { setError("Couldn’t load that job’s readiness."); return; }
      const d: JobDetail = { job: res.body.job, gap: res.body.gap || null, questions: res.body.questions || [], progress: res.body.progress || [], practice: res.body.practice || [] };
      writeJSON(KEYS.readinessCache, {
        when: Date.now(), jobTitle: d.job.title, gap: d.gap, progress: d.progress,
        questionCount: d.questions.length, practice: d.practice.slice(0, 10),
      } satisfies Cached);
      setDetail(d);
    })();
    return () => { alive = false; };
  }, [jobId]); // eslint-disable-line react-hooks/exhaustive-deps

  const fromCache = (reason: string) => {
    const c = readJSON<Cached | null>(KEYS.readinessCache, null);
    if (!c) return <SignedOut />;
    return (
      <>
        <Card><Muted>{reason}</Muted></Card>
        <ScoreBlocks gap={c.gap} progress={c.progress || []} questionCount={c.questionCount} jobTitle={displayJobTitle(c.jobTitle || "")} practice={c.practice || []} />
      </>
    );
  };

  let body;
  if (!API_ENABLED) body = fromCache("Live sync isn’t enabled on this site, so this is your last saved snapshot.");
  else if (jobsState.status === "disabled") body = fromCache("Sign-in isn’t available, so this is your last saved snapshot.");
  else if (jobsState.status === "loading") body = <Loading>Loading your readiness{"…"}</Loading>;
  else if (jobsState.status === "signedout") body = <SignedOut />;
  else if (jobsState.status === "error") body = fromCache("Couldn’t reach your account, so this is your last saved snapshot.");
  else if (!jobsState.jobs.length) body = <EmptyJobs />;
  else if (error) body = <Card><Muted>{error}</Muted></Card>;
  else if (!detail) body = <Loading>Loading your readiness{"…"}</Loading>;
  else body = <Live detail={detail} jobs={jobsState.jobs} onSwitch={setJobId} />;

  return <div className="page">{body}</div>;
}

function SignedOut() {
  return (
    <SignInCard title="Your interview readiness">
      <Muted>Sign in to see your readiness across every job you{"’"}re preparing for {"—"} saved to your account and available on any device.</Muted>
    </SignInCard>
  );
}

function EmptyJobs() {
  return (
    <Card>
      <h2>No jobs yet</h2>
      <Muted>Readiness is tracked per job. Add your target role, then analyze the gap and practice {"—"} your score builds here.</Muted>
      <div className="row">
        <Link className="btn btn-primary" to="/analyze">{"🎯"} Analyze a job</Link>
        <Link className="btn" to="/fit">{"⚖️"} Run a gap analysis</Link>
      </div>
    </Card>
  );
}

// Readable labels for Recent practice — never raw slugs or enum keys.
const MODE_LABEL: Record<string, string> = {
  practice: "Practice", flashcard: "Flashcards", exam: "Timed Exam",
  why: "Keep Asking Why", scenario: "Defend Decisions", weak: "Weak Areas",
};
const humanize = (v: unknown) =>
  String(v == null ? "" : v).trim().replace(/[-_]+/g, " ").replace(/\s+/g, " ").trim().replace(/\b\w/g, (c) => c.toUpperCase());
const modeLabel = (m: unknown) => {
  const k = String(m == null ? "" : m).trim().toLowerCase();
  return !k ? "Practice" : MODE_LABEL[k] || humanize(k);
};
const activityLabel = (s: PracticeRow) => humanize(s.category) || humanize(s.content_slug) || "Practice";

const completed = (practice: PracticeRow[]) => practice.filter((s) => s && s.completed !== false && s.score != null);

function Live({ detail: p, jobs, onSwitch }: { detail: JobDetail; jobs: JobRow[]; onSwitch(id: string): void }) {
  const qCount = p.questions.length;
  const done = completed(p.practice);
  const jobQ = p.job.id ? "?job=" + encodeURIComponent(p.job.id) : "";

  let next: { to: string; label: string; why: string };
  if (!p.gap) next = { to: "/fit", label: "Check My Fit", why: "Compare your resume to this role to see your match and gaps." };
  else if (!qCount) next = { to: "/questions", label: "Prepare Practice Questions", why: "Generate role-specific questions from your job and gaps." };
  else next = {
    to: "/defend" + jobQ,
    label: done.length ? "Continue Practice" : "Practice Decision Defense",
    why: done.length ? "Keep defending decisions under follow-ups to raise readiness." : "Defend your decisions under pressure to raise Interview Readiness.",
  };

  return (
    <div className="stack">
      <Card className="job-switch">
        <span className="job-banner-label">Current job</span>
        {jobs.length > 1 ? (
          <select className="input" aria-label="Current job" value={p.job.id} onChange={(e) => onSwitch(e.target.value)}>
            {jobs.map((j) => <option key={j.id} value={j.id}>{displayJobTitle(j)}</option>)}
          </select>
        ) : (
          <strong>{displayJobTitle(p.job)}</strong>
        )}
      </Card>
      <div className="context-chips">
        <span className={"chip" + (p.gap ? " chip-ok" : "")}>{p.gap ? "✓ " + (p.gap.match_score || 0) + "% match" : "No gap analysis yet"}</span>
        <span className={"chip" + (qCount ? " chip-ok" : "")}>{qCount ? "✓ " + qCount + " questions ready" : "No questions yet"}</span>
        <span className={"chip" + (done.length ? " chip-ok" : "")}>{done.length ? "✓ " + done.length + " practice done" : "Practice not started"}</span>
      </div>
      <div className="next-action">
        <div className="next-action-label">Next recommended action</div>
        <div className="next-action-row">
          <Link className="btn btn-primary" to={next.to}>{next.label}</Link>
          <span className="next-action-why">{next.why}</span>
        </div>
      </div>
      <ScoreBlocks gap={p.gap} progress={p.progress} questionCount={qCount} jobTitle={displayJobTitle(p.job)} practice={p.practice} />
      <div className="row">
        <Link className="btn" to="/fit">{p.gap ? "Re-check my fit" : "Check my fit"}</Link>
        <Link className="btn" to="/questions">{qCount ? "Review questions" : "Prepare questions"}</Link>
      </div>
    </div>
  );
}

function Sparkline({ scores }: { scores: number[] }) {
  const W = 220, H = 46, P = 4, n = scores.length;
  const x = (i: number) => P + (i * (W - 2 * P)) / (n - 1);
  const y = (v: number) => H - P - (v / 100) * (H - 2 * P);
  return (
    <svg viewBox={`0 0 ${W} ${H}`} className="spark" role="img" aria-label="Readiness trend">
      <polyline points={scores.map((v, i) => x(i) + "," + y(v)).join(" ")} fill="none" stroke="var(--primary)" strokeWidth="2.5" />
      <circle cx={x(n - 1)} cy={y(scores[n - 1])} r="3.2" fill="var(--accent)" />
    </svg>
  );
}

function ScoreBlocks({
  gap, progress, questionCount, jobTitle, practice,
}: { gap: GapRow | null; progress: ProgressRow[]; questionCount: number; jobTitle?: string; practice: PracticeRow[] }) {
  const latest = progress[0] || null; // newest first from the API
  const done = completed(practice);
  const hasGap = !!gap;
  const hasPractice = done.length > 0;
  const practiceAvg = latest ? latest.avg_answer_score || 0 : 0;
  const completion = Math.min(latest?.questions_practiced || 0, 10) * 10;
  // Respect a persisted 0 (presence check, not truthiness).
  const overall = latest && latest.overall_readiness != null ? latest.overall_readiness : weightedOverall(gap, practiceAvg, completion);

  const sub = (b?: number) => {
    if (!gap && !latest) return 0;
    const base = b || 0;
    return clampInt(practiceAvg ? 0.7 * base + 0.3 * practiceAvg : base, 0, 100);
  };
  const pick = (persisted: number | null | undefined, fromGap?: number) => (latest && persisted != null ? persisted : sub(fromGap));
  const technical = pick(latest?.technical_score, gap?.technical_score);
  const behavioral = pick(latest?.behavioral_score, gap?.behavioral_score);
  const architecture = pick(latest?.architecture_score, gap?.architecture_score);
  const domain = pick(latest?.domain_score, gap?.domain_score);
  const practiced = (latest?.questions_practiced || 0) > 0;

  const res = gap?.result;
  const gapList = [...(res?.missingSkills || []), ...(res?.missingKeywords || [])].slice(0, 12);

  let lastTs: Date | null = null;
  if (latest?.recorded_at) lastTs = new Date(latest.recorded_at);
  else if (practice[0]?.completed_at) lastTs = new Date(practice[0].completed_at);
  else if (gap?.created_at) lastTs = new Date(gap.created_at);

  return (
    <>
      <Card>
        <ScoreHead pct={overall} title="Interview readiness" sub={jobTitle ? "For: " + jobTitle : "A blended score"} />
        <div className="factors">
          <div className="field-label">Based on</div>
          <Factor on={hasGap} label="Resume match" detail={hasGap ? gap!.match_score + "% — how your resume lines up with the job" : "Not assessed — run a gap analysis"} />
          <Factor on={hasPractice} label="Practice activity" detail={hasPractice ? done.length + " completed · avg " + practiceAvg + "%" : "Practice: Not assessed"} />
          <Factor on={practiced} label="Preparation completion" detail={practiced ? completion + "% of a 10-rep target" : "Preparation completion: Not assessed"} />
          {!hasPractice && (
            <Muted small>Practice hasn{"’"}t been completed yet, so it isn{"’"}t counting toward readiness. <Link to="/defend">Start practice</Link> to raise this score.</Muted>
          )}
        </div>
      </Card>
      <Card>
        <StatGrid>
          <Stat value={hasGap ? gap!.match_score + "%" : "—"} label="Resume match" />
          <Stat value={overall + "%"} label="Interview readiness" />
        </StatGrid>
        <Muted small>
          <strong>Resume match</strong> is how closely the evidence in your resume aligns with this job. <strong>Interview readiness</strong> is a blended measure based on the preparation inputs currently available for this job. Interview readiness can differ from resume match because it also reflects supported practice and preparation activity.
        </Muted>
      </Card>
      <Card>
        <h3>Readiness by area</h3>
        <ScoreBar label="Technical" pct={technical} />
        <ScoreBar label="Behavioral" pct={behavioral} />
        <ScoreBar label="Architecture" pct={architecture} />
        <ScoreBar label="Domain" pct={domain} />
        {!gap && <Muted small>Run a gap analysis for this job to sharpen these area scores.</Muted>}
      </Card>
      <StatGrid>
        <Stat value={gap ? gap.match_score + "%" : "—"} label="Resume match" />
        <Stat value={questionCount || 0} label="Questions ready" />
        <Stat value={done.length} label="Practice sessions" />
        <Stat value={progress.length} label="Readiness snapshots" />
      </StatGrid>
      <Card>
        <h3>Recent practice</h3>
        {!practice.length ? (
          <>
            <Muted>No completed practice yet.</Muted>
            <Link className="btn btn-primary" to="/defend">Start practice</Link>
          </>
        ) : (
          <div className="table-wrap">
            <table>
              <thead><tr><th>Activity</th><th>Mode</th><th>Score</th><th>When</th></tr></thead>
              <tbody>
                {practice.slice(0, 8).map((s, i) => {
                  const when = s.completed_at ? new Date(s.completed_at) : null;
                  return (
                    <tr key={i}>
                      <td>{activityLabel(s)}</td>
                      <td>{modeLabel(s.mode)}</td>
                      <td>{s.score != null ? s.score + "%" : "—"}</td>
                      <td>{when && !isNaN(when.getTime()) ? when.toLocaleDateString() : ""}</td>
                    </tr>
                  );
                })}
              </tbody>
            </table>
          </div>
        )}
      </Card>
      <Card>
        <div className="field-label">Readiness trend</div>
        {progress.length > 1 ? (
          <Sparkline scores={progress.slice().reverse().map((s) => s.overall_readiness || 0)} />
        ) : (
          <Muted small>Complete more readiness activities to build your trend.</Muted>
        )}
      </Card>
      {gapList.length > 0 && (
        <Card>
          <h3>Top skill gaps</h3>
          <Chips items={gapList} tone="warn" />
        </Card>
      )}
      {lastTs && !isNaN(lastTs.getTime()) && <Muted small>Last updated {lastTs.toLocaleString()}</Muted>}
    </>
  );
}

function Factor({ on, label, detail }: { on: boolean; label: string; detail: string }) {
  return (
    <div className={"factor " + (on ? "factor-on" : "factor-off")}>
      <span className="factor-mark">{on ? "✓" : "—"}</span> <strong>{label}</strong> <span className="muted small">{detail}</span>
    </div>
  );
}
