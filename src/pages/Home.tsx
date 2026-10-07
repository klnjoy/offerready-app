/* Home — content from the MkDocs landing (sync_docs.py write_index): hero,
 * how it works, why not just ChatGPT, start with your job, worked example,
 * plus the practice tools and a pointer to the study notes. */

import { STUDY_URL } from "../config";
import { ExternalLink, Link } from "../lib/router";

const STEPS = [
  { n: "01", title: "Add the job", text: "Paste the job description.", to: "/analyze" },
  { n: "02", title: "Analyze the gap", text: "See what the role expects and where you fall short.", to: "/fit" },
  { n: "03", title: "Practice & defend", text: "Defend your decisions as the interviewer keeps asking why.", to: "/defend" },
  { n: "04", title: "Track readiness", text: "Watch your readiness build, with your next drill.", to: "/dashboard", goal: true },
];

const THEM = [
  "Answers the question you type, then forgets it",
  "No memory of the job you’re targeting",
  "You have to know what to ask",
  "Agrees with you — won’t pin you down",
  "No sense of your progress or readiness",
];

const US: [string, string][] = [
  ["Job-anchored", "maps a specific job description to its real requirements"],
  ["Gap-aware", "finds where you fall short and what to study first"],
  ["Adversarial Defend drills", "keeps asking “why” until your reasoning holds"],
  ["Role & level aware", "scoring tuned to Senior / Staff / Principal, AI, data, platform, FDE"],
  ["Readiness that persists", "tracks practice and gaps across sessions"],
];

const TOOLS = [
  { to: "/questions", icon: "❓", title: "Practice Questions", text: "Role-specific technical, behavioral, system design and leadership questions for your saved job." },
  { to: "/practice", icon: "📝", title: "Interview Practice", text: "Question bank with practice, flashcards, timed exam and weak-area modes." },
  { to: "/simulator", icon: "🎯", title: "Mock Simulator", text: "A mixed mock loop across areas and levels — answer out loud, then face the follow-up." },
];

export default function HomePage() {
  return (
    <div className="page home">
      <section className="hero">
        <h1 className="wordmark">
          Offer<span>Ready</span>
        </h1>
        <p className="hero-eyebrow">Job description {"→"} interview readiness</p>
        <p className="hero-lede">
          <strong>Interview readiness for the job you{"’"}re actually applying for.</strong> Paste a job description, see your gaps, and practice what matters.
        </p>
        <div className="row wrap">
          <Link className="btn btn-accent btn-lg" to="/analyze">{"📋"} Analyze a Job</Link>
          <Link className="btn btn-lg btn-on-dark" to="/example">See Example</Link>
        </div>
      </section>

      <section className="home-section">
        <h2>How OfferReady works</h2>
        <p className="muted">Start with the job you{"’"}re targeting and move through four steps:</p>
        <ol className="flow">
          {STEPS.map((s) => (
            <li key={s.n}>
              <Link className={"flow-card" + (s.goal ? " flow-goal" : "")} to={s.to}>
                <span className="flow-n">{s.n}</span>
                <span className="flow-title">{s.title}</span>
                <span className="flow-text">{s.text}</span>
              </Link>
            </li>
          ))}
        </ol>
      </section>

      <section className="home-section">
        <h2>Why OfferReady, not just ChatGPT?</h2>
        <p className="muted">
          ChatGPT, Claude, Gemini, Copilot, and Perplexity are great at answering a question you type. But interview prep isn{"’"}t one question {"—"} it{"’"}s knowing which questions <em>this</em> job will ask, finding your weak spots, and rehearsing under pressure until you{"’"}re ready. A chat window forgets all of that the moment you close the tab.
        </p>
        <div className="compare">
          <div className="compare-col compare-them">
            <p className="compare-head">A general AI chat</p>
            <ul>
              {THEM.map((t) => (
                <li key={t}><span className="compare-mark" aria-hidden="true">{"×"}</span>{t}</li>
              ))}
            </ul>
          </div>
          <div className="compare-col compare-us">
            <p className="compare-head">OfferReady</p>
            <ul>
              {US.map(([b, t]) => (
                <li key={b}><span className="compare-mark" aria-hidden="true">{"✓"}</span><span><strong>{b}:</strong> {t}</span></li>
              ))}
            </ul>
          </div>
        </div>
        <p className="pull">
          In short: a chatbot is a smart answer engine. OfferReady is a prep system built around the one job you{"’"}re trying to land.
        </p>
      </section>

      <section className="home-split">
        <div className="cta-card">
          <h2>Start with your job</h2>
          <p>
            Paste a job description to see the role requirements, likely gaps, and a preparation plan {"—"} free. Save it to <Link to="/jobs">My Jobs</Link> to track your readiness over time.
          </p>
          <Link className="btn btn-primary" to="/analyze">{"📋"} Start on Analyze a Job</Link>
        </div>
        <div className="cta-card">
          <h2>See a worked example</h2>
          <p>Prefer to see it first? The sample walkthrough maps a real job to a preparation plan, end to end.</p>
          <Link className="btn" to="/example">{"✅"} See a sample walkthrough</Link>
        </div>
      </section>

      <section className="home-section">
        <h2>Practice tools</h2>
        <div className="tools-grid">
          {TOOLS.map((t) => (
            <Link key={t.to} className="tool-card" to={t.to}>
              <span className="tool-icon" aria-hidden="true">{t.icon}</span>
              <span className="flow-title">{t.title}</span>
              <span className="flow-text">{t.text}</span>
            </Link>
          ))}
        </div>
      </section>

      <section className="study-band">
        <div>
          <h2>Study the concepts behind the questions</h2>
          <p>GenAI foundations, RAG, agents, MCP, Bedrock, Snowflake, Databricks and more {"—"} deep-dive notes in the OfferReady study library.</p>
        </div>
        <ExternalLink className="btn" href={STUDY_URL}>Open study notes {"↗"}</ExternalLink>
      </section>
    </div>
  );
}
