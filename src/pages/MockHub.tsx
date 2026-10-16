/* Mock interview: pick voice or text. Each card says what you get and what
 * the browser needs; the voice card checks this browser live. */

import { useMemo } from "react";
import { Link } from "../lib/router";
import { useJobs } from "../lib/useJobs";
import { displayJobTitle } from "../lib/roles";
import { detectSupport } from "../lib/voice";
import { Icon } from "../components/Icon";
import { Art } from "../components/Art";

export default function MockHubPage() {
  const support = useMemo(() => detectSupport(), []);
  const voiceOk = support.recognition && support.mic;
  const jobs = useJobs();
  const job = jobs.status === "ready" ? jobs.jobs.find((j) => j.id === jobs.activeId) || jobs.jobs[0] : undefined;

  return (
    <div className="page hub">
      {job ? (
        <p className="hub-job">
          <span className="td-job-label">Interviewing for</span>
          <Link className="td-job-title" to={"/jobs/" + encodeURIComponent(job.id)}>{displayJobTitle(job)}</Link>
          <span className="small muted">The voice interview asks this job{"’"}s questions. You can switch job when you start.</span>
        </p>
      ) : null}
      <ol className="hub-grid hub-grid-2" aria-label="Kinds of mock interview">
        <li className="hub-card is-rec">
          <Link className="hub-link" to="/interview/voice" aria-describedby="mock-voice-get">
            <Art k="mock" className="hub-art" />
            <span className="hub-top"><span className="hub-rec">Recommended</span></span>
            <span className="hub-title">Voice interview</span>
            <span className="hub-when" id="mock-voice-get">You answer out loud. The interviewer asks follow-ups on what you actually said, then scores your content and delivery: pace, filler words and structure.</span>
            <span className={"hub-support" + (voiceOk ? " is-ok" : " is-warn")}>
              {voiceOk ? "Your browser supports voice." : "Voice works best in Chrome or Edge on a computer. Here you can type your answers instead."}
              {" "}Needs microphone access. 3 or 5 questions, about 12 to 20 minutes.
            </span>
            <span className="hub-cta">Start a voice interview <Icon name="arrow" size={16} className="hub-svg" /></span>
          </Link>
        </li>
        <li className="hub-card">
          <Link className="hub-link" to="/simulator" aria-describedby="mock-text-get">
            <Art k="text" className="hub-art" />
            <span className="hub-title">Text interview <span className="hub-tag">General</span></span>
            <span className="hub-when" id="mock-text-get">General practice, not tied to your job: a mixed loop across areas and levels. Answer, compare with a strong answer, then face the follow-up.</span>
            <span className="hub-support is-ok">Works in any browser. No microphone needed.</span>
            <span className="hub-cta">Start a text interview <Icon name="arrow" size={16} className="hub-svg" /></span>
          </Link>
        </li>
      </ol>
      <Link className="hub-real" to="/notes">
        <span className="hub-ico" aria-hidden="true"><Icon name="list" size={20} className="hub-svg" /></span>
        <span className="hub-real-body">
          <span className="hub-real-title">Real interview today? Take notes</span>
          <span className="hub-real-text">Type each question as it’s asked. Afterwards, your notes become a debrief in one click.</span>
        </span>
        <Icon name="arrow" size={16} className="hub-svg" />
      </Link>
      <p className="small muted">A voice interview for a saved job counts toward that job{"’"}s score in <Link to="/dashboard">Readiness</Link>. Text interview scores stay in this browser and feed your weak areas.</p>
    </div>
  );
}
