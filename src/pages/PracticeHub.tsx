/* Practice: one list of the five ways to practise, each saying when to use
 * it and where you are with it (Next, progress, Done), then Learn AI reads.
 * Each way appears once; the suggested next one is marked in the list. The active job is preselected (and can be switched here); a gap from
 * the job page arrives as ?topic= and is carried into the modes.
 *
 * Old links: /practice?mode=… (the question bank's modes) redirect to
 * /practice/bank?mode=…, where the bank now lives. */

import { useEffect, useState } from "react";
import { setActiveJob } from "../lib/readiness";
import { displayJobTitle } from "../lib/roles";
import { Link, useNavigate, useSearchParams } from "../lib/router";
import { useJobs } from "../lib/useJobs";
import { usePracticePath, type StepKey } from "../lib/practicePath";
import { weakTopicScores } from "../lib/progressStore";
import { LearnCards } from "../components/IdeaCards";
import { Art, type ArtKey } from "../components/Art";

interface Mode { key: StepKey | "bank"; art: ArtKey; title: string; when: string; to: (job: string, topic: string) => string }

const enc = encodeURIComponent;
const MODES: Mode[] = [
  { key: "questions", art: "questions", title: "Questions for this job", when: "What this interview will probably ask you",
    to: (j) => "/questions" + (j ? "?job=" + enc(j) : "") },
  { key: "drill", art: "drill", title: "Trade-off drills", when: "Defend a design call when the interviewer pushes back",
    to: (j) => "/defend" + (j ? "?job=" + enc(j) : "") },
  { key: "stories", art: "stories", title: "Your stories", when: "STAR stories for “Tell me about a time…”",
    to: () => "/stories" },
  { key: "mock", art: "mock", title: "Mock interview", when: "The full interview, by voice or text",
    to: () => "/mock" },
  { key: "bank", art: "bank", title: "Question bank", when: "Quick reps on any topic, with or without a job",
    to: (_j, t) => "/practice/bank" + (t ? "?topic=" + enc(t) : "") },
];

export default function PracticeHubPage() {
  const params = useSearchParams();
  const navigate = useNavigate();
  const jobs = useJobs();
  const topic = (params.get("topic") || "").slice(0, 80);
  const want = params.get("job") || "";
  const [jobId, setJobId] = useState("");

  // Old /practice?mode=flashcard links → the bank, which owns the modes.
  const legacyMode = params.get("mode");
  useEffect(() => {
    if (legacyMode) navigate("/practice/bank" + window.location.search, { replace: true });
  }, [legacyMode]); // eslint-disable-line react-hooks/exhaustive-deps

  useEffect(() => {
    if (jobs.status !== "ready" || !jobs.jobs.length) return;
    const id = [want, jobs.activeId].find((x) => x && jobs.jobs.some((j) => j.id === x)) || jobs.jobs[0].id;
    setJobId(id);
    if (id !== jobs.activeId) setActiveJob(id);
  }, [jobs.status, jobs.activeId]); // eslint-disable-line react-hooks/exhaustive-deps

  const job = jobs.jobs.find((j) => j.id === jobId);
  const path = usePracticePath(jobId);
  const next = path.find((x) => !x.done);
  const doneN = path.filter((x) => x.done).length;
  const weak = Object.entries(weakTopicScores()).filter((w) => w[1] < 70).sort((a, b) => a[1] - b[1])[0];
  const pick = (id: string) => { setJobId(id); setActiveJob(id); };

  return (
    <div className="page hub">
      <div className="hub-job" aria-live="polite">
        {jobs.status === "ready" && jobs.jobs.length > 0 ? (
          <>
            <span className="td-job-label">Practising for</span>
            {jobs.jobs.length > 1 ? (
              <select className="input td-job-select" aria-label="Job you’re practising for" value={jobId} onChange={(e) => pick(e.target.value)}>
                {jobs.jobs.map((j) => <option key={j.id} value={j.id}>{displayJobTitle(j)}</option>)}
              </select>
            ) : <Link className="td-job-title" to={"/jobs/" + enc(jobId)}>{job ? displayJobTitle(job) : ""}</Link>}
          </>
        ) : jobs.status === "loading" ? (
          <span className="small muted">Loading your jobs{"…"}</span>
        ) : (
          <span className="small muted">
            No job yet. <Link to="/analyze">Add a job</Link> and practice is written for it. The question bank, drills and stories work without one.
          </span>
        )}
      </div>

      {topic && (
        <div className="hub-topic" role="status">
          <span className="hub-topic-label">Focus</span>
          <strong>{topic}</strong>
          <span className="small muted">A gap from your resume match. Start with the question bank on it, then the questions for this job.</span>
          <Link className="link-btn small" to={"/practice" + (jobId ? "?job=" + enc(jobId) : "")}>Clear</Link>
        </div>
      )}

      <section className="pl" aria-labelledby="pl-h">
        <div className="pl-head">
          <h2 id="pl-h">Ways to practise</h2>
          {jobId ? <span className="small muted">{doneN} of 4 steps done</span> : null}
        </div>
        <ul className="pl-list">
          {MODES.map((m) => {
            const step = path.find((x) => x.key === m.key);
            const isNext = !topic && !!jobId && !!next && next.key === m.key;
            const isFocus = !!topic && m.key === "bank";
            let to = m.to(jobId, topic);
            let status = "";
            let tone = "";
            if (step && jobId) {
              status = step.done ? "Done" : isNext ? "Next" + (step.progress ? " · " + step.progress : "") : "Step " + step.n + (step.progress ? " · " + step.progress : "");
              tone = step.done ? "done" : isNext ? "next" : "";
            } else if (m.key === "bank") {
              if (isFocus) { status = "Best for " + topic; tone = "next"; }
              else if (weak) { status = "Weakest: " + weak[0] + " " + Math.round(weak[1]) + "%"; tone = "warn"; to = "/practice/bank?topic=" + enc(weak[0]) + (jobId ? "&job=" + enc(jobId) : ""); }
              else status = "Any time";
            }
            return (
              <li key={m.key} className={"pl-item" + (isNext || isFocus ? " is-next" : "")}>
                <Link className="pl-row" to={to}>
                  <Art k={m.art} className="pl-art" />
                  <span className="pl-text">
                    <strong>{m.title}</strong>
                    <span className="pl-when">{m.when}</span>
                    {status ? <span className={"pl-status" + (tone ? " is-" + tone : "")}>{tone === "done" ? "✓ " : ""}{status}</span> : null}
                  </span>
                  <span className="pl-chev" aria-hidden="true">›</span>
                </Link>
              </li>
            );
          })}
        </ul>
        <p className="small muted pl-tip">You don{"’"}t need every step before a mock. Five questions for this job and one drill is a good start.</p>
      </section>

      <LearnCards job={job} />
    </div>
  );
}
