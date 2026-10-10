/* Practice: one hub for the four ways to practise, each saying when to use
 * it. The active job is preselected (and can be switched here); a gap from
 * the job page arrives as ?topic= and is carried into the modes.
 *
 * Old links: /practice?mode=… (the question bank's modes) redirect to
 * /practice/bank?mode=…, where the bank now lives. */

import { useEffect, useState } from "react";
import { setActiveJob } from "../lib/readiness";
import { displayJobTitle } from "../lib/roles";
import { Link, useNavigate, useSearchParams } from "../lib/router";
import { useJobs } from "../lib/useJobs";
import { Icon, type IconName } from "../components/Icon";

interface Mode { key: string; icon: IconName; title: string; when: string; get: string; to: (job: string, topic: string) => string; cta: string; needsJob?: boolean }

const enc = encodeURIComponent;
const MODES: Mode[] = [
  { key: "questions", icon: "list", title: "Questions for this job",
    when: "Use it first, to see what this interview will probably ask you.",
    get: "Likely questions written from the job and your gaps, saved to the job.",
    to: (j) => "/questions" + (j ? "?job=" + enc(j) : ""), cta: "Open questions", needsJob: true },
  { key: "drills", icon: "shield", title: "Trade-off drills",
    when: "Use it when you need to explain why you chose a design and hold your ground when the interviewer pushes back.",
    get: "Real scenarios with follow-ups on trade-offs, constraints and incidents.",
    to: (j) => "/defend" + (j ? "?job=" + enc(j) : ""), cta: "Start a drill" },
  { key: "stories", icon: "book", title: "Your stories",
    when: "Use it before behavioral rounds, for every “Tell me about a time when…” question.",
    get: "Your STAR stories, matched to what the job asks for, so nothing is left uncovered.",
    to: () => "/stories", cta: "Open your stories" },
  { key: "bank", icon: "layers", title: "Question bank",
    when: "Use it for quick daily reps on any topic, with or without a job.",
    get: "Broad drills, flashcards and timed exams by topic. Scores find your weak areas.",
    to: (_j, t) => "/practice/bank" + (t ? "?topic=" + enc(t) : ""), cta: "Open the bank" },
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

      <ol className="hub-grid" aria-label="Ways to practise">
        {MODES.map((m, i) => {
          const to = m.to(jobId, topic);
          const recommended = topic ? m.key === "bank" : i === 0 && !!jobId;
          return (
            <li key={m.key} className={"hub-card" + (recommended ? " is-rec" : "")}>
              <Link className="hub-link" to={to} aria-describedby={"hub-" + m.key + "-when"}>
                <span className="hub-top">
                  <span className="hub-ico"><Icon name={m.icon} size={22} className="hub-svg" /></span>
                  {recommended && <span className="hub-rec">{topic ? "Best for " + topic : "Start here"}</span>}
                </span>
                <span className="hub-title">{m.title}</span>
                <span className="hub-when" id={"hub-" + m.key + "-when"}>{m.when}</span>
                <span className="hub-get">{m.get}</span>
                <span className="hub-cta">{m.cta} <Icon name="arrow" size={16} className="hub-svg" /></span>
              </Link>
            </li>
          );
        })}
      </ol>
      <section className="hub-mock-note" aria-labelledby="hub-mock-h">
        <h2 id="hub-mock-h">You don{"’"}t need all four before a mock interview</h2>
        <p>
          A mock is open any time. The quickest useful route: <strong>practise 5 questions for this job</strong> and <strong>one trade-off drill</strong>, then do a mock.
          Use stories when you have behavioral rounds, and the question bank for extra reps.
        </p>
        <div className="row"><Link className="btn" to="/mock">Go to mock interview {"→"}</Link></div>
      </section>
    </div>
  );
}
