/* Home: the marketing page for new visitors, plus a "continue where you left
 * off" bar for signed-in users with saved jobs.
 *
 * Sections: continue bar, hero (+ the 3-step journey: Add a job → Practise →
 * Mock interview & readiness), how it works, feature highlights, an honest
 * comparison with general AI chat, Free vs Pro (from lib/plans), the study
 * library, FAQ and a closing CTA. Styles live under "Home (marketing)" in
 * styles.css; every class here is prefixed hm- so nothing leaks. */

import type { ReactNode } from "react";
import { STUDY_URL } from "../config";
import { LIMITS, PLAN_MATRIX } from "../lib/plans";
import { displayJobTitle } from "../lib/roles";
import { ExternalLink, Link } from "../lib/router";
import { Icon, type IconName } from "../components/Icon";
import { useJobs } from "../lib/useJobs";
import type { JobRow } from "../types";

/* ---------- content ---------- */

const STAGES: { n: string; icon: IconName; name: string; line: string; tools: { to: string; label: string; text: string }[] }[] = [
  {
    n: "1", icon: "briefcase", name: "Add a job",
    line: "Paste a job link or the description, and your resume once. See what the role needs and where you stand.",
    tools: [
      { to: "/analyze", label: "Add a job", text: "From a link or the description: skills, gaps and your resume match." },
      { to: "/jobs", label: "Your plan", text: "A day-by-day plan to your interview date, with one next step." },
    ],
  },
  {
    n: "2", icon: "target", name: "Practise",
    line: "Practise what this interview will ask, not generic lists. Four ways, each for a clear moment.",
    tools: [
      { to: "/questions", label: "Questions for this job", text: "Likely questions written from the job and your gaps." },
      { to: "/defend", label: "Trade-off drills", text: "Defend a design call while the interviewer pushes back." },
      { to: "/stories", label: "Your stories", text: "STAR stories for behavioral rounds, matched to the job." },
      { to: "/practice/bank", label: "Question bank", text: "Quick reps: flashcards, timed exams, weak topics." },
    ],
  },
  {
    n: "3", icon: "mic", name: "Mock interview & readiness",
    line: "Rehearse under pressure and see when you are actually ready.",
    tools: [
      { to: "/interview/voice", label: "Voice interview", text: "Answer out loud, get follow-ups and delivery scores." },
      { to: "/simulator", label: "Text interview", text: "A mixed loop of questions across areas and levels." },
      { to: "/dashboard", label: "Readiness", text: "One score per job, from match, practice and prep." },
    ],
  },
];

const FEATURES: { icon: IconName; title: string; text: string; to: string; cta: string; isNew?: boolean }[] = [
  { icon: "link", title: "Add a job from a link", isNew: true, to: "/analyze", cta: "Add a job",
    text: "Paste the job posting’s link and OfferReady reads the description for you. Or paste the description itself. Your resume is added once and reused." },
  { icon: "mic", title: "Voice interview", isNew: true, to: "/mock", cta: "Try a mock interview",
    text: "Answer out loud. The interviewer follows up on what you actually said, then scores your content and your delivery: pace, filler words and structure." },
  { icon: "calendar", title: "Your plan", to: "/jobs", cta: "Plan to your date",
    text: "Set your interview date and get a day-by-day plan, with one clear “do this next” every time you open a job." },
  { icon: "shield", title: "Trade-off drills", to: "/defend", cta: "Start a drill",
    text: "Make the call on a real scenario, then hold it while the interviewer pushes on trade-offs, constraints and incidents." },
  { icon: "book", title: "Your stories", to: "/stories", cta: "Build your stories",
    text: "Keep your STAR stories in one place, matched to what each job asks for, so you know which story answers which question." },
  { icon: "gauge", title: "Readiness score", to: "/dashboard", cta: "See readiness",
    text: "One score per job, blended from your resume match, practice and preparation, so you can watch it move as you work." },
];

const COMPARE: { topic: string; chat: string; us: string }[] = [
  { topic: "Where you start", chat: "With whatever question you think to ask.", us: "With one job description and one interview date." },
  { topic: "What it keeps", chat: "Context lives in chat threads; you re-explain the role and your background.", us: "Your jobs, gaps, practice and stories, kept across sessions." },
  { topic: "Practice", chat: "Can role-play an interviewer if you set it up each time.", us: "A real interview loop: follow-ups on what you said, scored on content and delivery." },
  { topic: "Progress", chat: "No running measure of how ready you are.", us: "A readiness score per job that you can track over time." },
  { topic: "What to do next", chat: "Waits for your next prompt.", us: "A day-by-day plan to your date, with one next step each day." },
];

const ROLES = ["AI / ML engineering", "Data & platform engineering", "Solutions & forward-deployed", "Architects", "Senior · Staff · Principal"];

const STUDY_TOPICS = ["GenAI foundations", "Agents", "RAG", "Data platforms", "System design", "Interview guides"];

const fmt = (n: number | null) => (n == null ? "unlimited" : String(n));

const FAQ: { q: string; a: ReactNode }[] = [
  { q: "Who is OfferReady for?",
    a: <>Engineers preparing for a specific technical interview: AI/ML engineering, data and platform engineering, solutions and forward-deployed engineering, and architect roles, especially at senior, staff and principal level, where interviewers probe trade-offs and judgment rather than trivia.</> },
  { q: "Is it free?",
    a: <>Yes, there is a free plan. It includes the study library, question banks and practice mode, {fmt(LIMITS.free.saved_jobs)} saved job, {fmt(LIMITS.free.analyses)} job analyses a month, the day-by-day plan to your interview date and {fmt(LIMITS.free.voice_mock)} voice mock interview a month. Pro raises the limits and unlocks the full scenario library. <Link to="/pricing">See pricing</Link>.</> },
  { q: "What happens to my resume and data?",
    a: <>Your resume is read in your browser and saved only on your device, so you add it once. When we compare it with a job, the text is used only for that analysis and is never stored on our servers. Saved jobs, practice and stories belong to your account so you can pick up where you left off; your data stays yours.</> },
  { q: "How is this different from ChatGPT, Claude or Gemini?",
    a: <>General assistants are great at answering the questions you think to ask. OfferReady is organised around one job and one date: it keeps your gaps, practice and stories, runs an interview loop with follow-ups and delivery scoring, tracks readiness, and tells you what to do next. You can still use your favourite assistant alongside it.</> },
  { q: "Which roles and levels does it cover?",
    a: <>Technical roles in AI/ML, data and platform engineering, solutions and forward-deployed engineering, and architecture. Questions, scenarios and scoring take the level into account, from senior through staff and principal.</> },
  { q: "Does the voice interview work in my browser?",
    a: <>It works best in Chrome or Edge on desktop, which have the most reliable speech recognition. Your browser will ask for microphone access when you start. If voice isn’t supported in your browser, every other practice tool still works.</> },
];

/* ---------- continue bar (signed in, has jobs) ---------- */

function pickActive(jobs: JobRow[], activeId: string): JobRow | null {
  if (!jobs.length) return null;
  const byId = activeId ? jobs.find((j) => j.id === activeId) : undefined;
  if (byId) return byId;
  return [...jobs].sort((a, b) => String(b.created_at || "").localeCompare(String(a.created_at || "")))[0];
}

function ContinueBar() {
  const { status, jobs, activeId } = useJobs();
  if (status !== "ready") return null;
  const job = pickActive(jobs, activeId);
  if (!job) return null;
  const prep = typeof job.prep_progress === "number" ? Math.max(0, Math.min(100, Math.round(job.prep_progress))) : null;
  const meta = [job.company, job.seniority].filter(Boolean).join(" · ");
  return (
    <section className="hm-continue" aria-labelledby="hm-continue-h">
      <div className="hm-continue-job">
        <p className="hm-continue-label" id="hm-continue-h">Continue where you left off</p>
        <p className="hm-continue-title">
          <Link to={"/jobs/" + encodeURIComponent(job.id)}>{displayJobTitle(job)}</Link>
          {meta ? <span className="hm-continue-meta">{meta}</span> : null}
        </p>
        {prep != null ? (
          <div className="hm-continue-prog" aria-label={`Preparation ${prep}% complete`}>
            <span className="hm-continue-track"><span style={{ width: prep + "%" }} /></span>
            <span className="hm-continue-pct">{prep}% prepared</span>
          </div>
        ) : null}
      </div>
      <div className="hm-continue-actions">
        <Link className="btn btn-primary" to={"/jobs/" + encodeURIComponent(job.id)}><Icon name="calendar" size={18} /> Open your plan</Link>
        <Link className="btn" to="/dashboard"><Icon name="gauge" size={18} /> Readiness</Link>
        {jobs.length > 1 ? <Link className="hm-continue-all" to="/jobs">All {jobs.length} jobs</Link> : null}
      </div>
    </section>
  );
}

/* ---------- hero visual: the 3-step journey ---------- */

const JOURNEY: { icon: IconName; title: string; line: string; chips: string[] }[] = [
  { icon: "briefcase", title: "Add a job", line: "Paste a job link or the description. Add your resume once.", chips: ["Your match", "Your gaps", "Your plan"] },
  { icon: "target", title: "Practise", line: "Questions, trade-off drills and stories written for this job.", chips: ["Questions", "Trade-off drills", "Stories"] },
  { icon: "mic", title: "Mock interview & readiness", line: "Rehearse out loud and watch one score rise to ready.", chips: ["Voice", "Follow-ups", "Readiness"] },
];

function Journey() {
  return (
    <div className="hm-visual hm-journey-wrap">
      <ol className="hm-journey" aria-label="How OfferReady works, in three steps">
        {JOURNEY.map((j, i) => (
          <li key={j.title} className={"hm-jstep hm-jstep-" + (i + 1)}>
            <span className="hm-jmark" aria-hidden="true">
              <Icon name={j.icon} size={22} />
              <span className="hm-jnum">{i + 1}</span>
            </span>
            <div className="hm-jbody">
              <p className="hm-jtitle">{j.title}</p>
              <p className="hm-jline">{j.line}</p>
              <p className="hm-jchips" aria-hidden="true">{j.chips.map((c) => <span key={c}>{c}</span>)}</p>
            </div>
          </li>
        ))}
      </ol>
      <p className="hm-jend"><Icon name="check" size={16} /> Walk in ready, with a plan behind every answer.</p>
    </div>
  );
}

/* ---------- page ---------- */

export default function HomePage() {
  return (
    <div className="page hm">
      <ContinueBar />

      {/* 1. hero */}
      <section className="hm-hero" aria-labelledby="hm-hero-h">
        <div className="hm-hero-copy">
          <p className="hm-eyebrow"><span className="hm-eyebrow-new">New</span> Add a job from its link, then practise out loud</p>
          <h1 id="hm-hero-h" className="hm-h1">Land the offer for <em>the job</em> in front of you.</h1>
          <p className="hm-lede">
            Add the job you want. OfferReady shows what the role demands and where your resume falls short, practises you on what this interview will ask, and gives you one next step every day until the interview.
          </p>
          <div className="hm-cta-row">
            <Link className="btn btn-lg hm-btn-signal" to="/analyze">Add a job, free <Icon name="arrow" size={18} /></Link>
            <Link className="btn btn-lg btn-on-dark" to="/example">See a sample walkthrough</Link>
          </div>
          <ul className="hm-trust" aria-label="Why people trust it">
            <li><Icon name="check" size={16} /> Free plan available</li>
            <li><Icon name="lock" size={16} /> Resume never stored on our servers</li>
            <li><Icon name="target" size={16} /> Built for senior technical interviews</li>
          </ul>
        </div>
        <Journey />
      </section>

      {/* roles strip */}
      <section className="hm-roles" aria-label="Roles OfferReady is built for">
        <p className="hm-roles-label">Built for technical interviews in</p>
        <ul>
          {ROLES.map((r) => <li key={r}>{r}</li>)}
        </ul>
      </section>

      {/* 3. how it works */}
      <section className="hm-section" aria-labelledby="hm-how-h">
        <header className="hm-head">
          <p className="hm-kicker">How it works</p>
          <h2 id="hm-how-h" className="hm-h2">From job posting to ready, in three steps</h2>
          <p className="hm-sub">Everything works on the job you added, so each step builds on the last.</p>
        </header>
        <ol className="hm-stages">
          {STAGES.map((s) => (
            <li key={s.n} className={"hm-stage hm-stage-" + s.n}>
              <div className="hm-stage-top">
                <span className="hm-stage-n" aria-hidden="true"><Icon name={s.icon} size={18} /></span>
                <h3 className="hm-stage-name"><span className="hm-sr">Step {s.n}: </span>{s.name}</h3>
              </div>
              <p className="hm-stage-line">{s.line}</p>
              <ul className="hm-tools">
                {s.tools.map((t) => (
                  <li key={t.to}>
                    <Link to={t.to} className="hm-tool">
                      <span className="hm-tool-label">{t.label}<Icon name="arrow" size={15} /></span>
                      <span className="hm-tool-text">{t.text}</span>
                    </Link>
                  </li>
                ))}
              </ul>
            </li>
          ))}
        </ol>
      </section>

      {/* 4. features */}
      <section className="hm-section" aria-labelledby="hm-feat-h">
        <header className="hm-head">
          <p className="hm-kicker">Highlights</p>
          <h2 id="hm-feat-h" className="hm-h2">The parts of interview prep a chat window can’t keep track of</h2>
        </header>
        <div className="hm-features">
          {FEATURES.map((f) => (
            <article key={f.title} className="hm-feature">
              <div className="hm-feature-top">
                <span className="hm-feature-ico"><Icon name={f.icon} size={22} /></span>
                {f.isNew ? <span className="hm-new">New</span> : null}
              </div>
              <h3 className="hm-feature-title">{f.title}</h3>
              <p className="hm-feature-text">{f.text}</p>
              <Link className="hm-link" to={f.to}>{f.cta}<Icon name="arrow" size={15} /><span className="hm-sr"> ({f.title})</span></Link>
            </article>
          ))}
        </div>
        <p className="hm-helpnote">
          <Icon name="chat" size={18} />
          <span>Stuck on a screen? <strong>Ask OfferReady</strong>, the help assistant in the bottom-right corner, knows which screen and which job you are on.</span>
        </p>
      </section>

      {/* 5. comparison */}
      <section className="hm-section" aria-labelledby="hm-cmp-h">
        <header className="hm-head">
          <p className="hm-kicker">An honest comparison</p>
          <h2 id="hm-cmp-h" className="hm-h2">Why not just use ChatGPT, Claude or Gemini?</h2>
          <p className="hm-sub">
            General assistants are excellent at answering the questions you think to ask. Interview prep is a different job: it is one role, one date, and weeks of practice that should add up.
          </p>
        </header>
        <div className="hm-cmp" role="table" aria-label="General AI chat compared with OfferReady">
          <div className="hm-cmp-row hm-cmp-headrow" role="row">
            <span className="hm-cmp-topic" role="columnheader"><span className="hm-sr">Topic</span></span>
            <span className="hm-cmp-chat" role="columnheader">General AI chat</span>
            <span className="hm-cmp-us" role="columnheader">OfferReady</span>
          </div>
          {COMPARE.map((r) => (
            <div key={r.topic} className="hm-cmp-row" role="row">
              <span className="hm-cmp-topic" role="rowheader">{r.topic}</span>
              <span className="hm-cmp-chat" role="cell"><span className="hm-cmp-mlabel">General AI chat</span>{r.chat}</span>
              <span className="hm-cmp-us" role="cell"><span className="hm-cmp-mlabel">OfferReady</span><Icon name="check" size={16} />{r.us}</span>
            </div>
          ))}
        </div>
        <p className="hm-cmp-note">
          <strong>Use both.</strong> Keep your favourite assistant for explaining a concept or polishing a draft, and let OfferReady run the prep: the plan, the practice and the score.
        </p>
      </section>

      {/* 6. free vs pro */}
      <section className="hm-section hm-plans" aria-labelledby="hm-plan-h">
        <div className="hm-plans-intro">
          <p className="hm-kicker">Plans</p>
          <h2 id="hm-plan-h" className="hm-h2">Start free. Upgrade when your interview gets close.</h2>
          <p className="hm-sub">The free plan covers a full prep loop for one job. Pro raises the limits for heavy practice weeks and unlocks the full scenario library.</p>
          <div className="hm-cta-row">
            <Link className="btn btn-primary btn-lg" to="/analyze">Start free</Link>
            <Link className="btn btn-lg" to="/pricing">See pricing</Link>
          </div>
        </div>
        <div className="hm-plan-table">
          <table>
            <caption className="hm-sr">Free and Pro plans compared</caption>
            <thead>
              <tr><th scope="col">Feature</th><th scope="col">Free</th><th scope="col" className="hm-pro-col">Pro</th></tr>
            </thead>
            <tbody>
              {PLAN_MATRIX.map((row) => (
                <tr key={row.feature}>
                  <th scope="row">{row.label}</th>
                  <td>{row.free === "—" ? <span className="hm-dash" aria-label="Not included">{"—"}</span> : row.free}</td>
                  <td className="hm-pro-col">{row.pro}</td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      </section>

      {/* 7. study library */}
      <section className="hm-study" aria-labelledby="hm-study-h">
        <div className="hm-study-copy">
          <p className="hm-kicker">Free study library</p>
          <h2 id="hm-study-h" className="hm-h2">Study the concepts behind the questions</h2>
          <p className="hm-sub">Deep notes written for interviews, free and open to everyone, no account needed.</p>
          <ul className="hm-chips">
            {STUDY_TOPICS.map((t) => <li key={t}>{t}</li>)}
          </ul>
        </div>
        <ExternalLink className="btn btn-lg hm-study-btn" href={STUDY_URL}>
          Open the study notes <Icon name="ext" size={17} /><span className="hm-sr"> (opens in a new tab)</span>
        </ExternalLink>
      </section>

      {/* 8. FAQ */}
      <section className="hm-section hm-faq-wrap" aria-labelledby="hm-faq-h">
        <header className="hm-head">
          <p className="hm-kicker">FAQ</p>
          <h2 id="hm-faq-h" className="hm-h2">Questions, answered</h2>
        </header>
        <div className="hm-faq">
          {FAQ.map((f) => (
            <details key={f.q} className="hm-qa">
              <summary><span>{f.q}</span><span className="hm-qa-ico" aria-hidden="true"><Icon name="plus" size={18} /></span></summary>
              <div className="hm-qa-body"><p>{f.a}</p></div>
            </details>
          ))}
        </div>
      </section>

      {/* 9. final CTA */}
      <section className="hm-final" aria-labelledby="hm-final-h">
        <h2 id="hm-final-h" className="hm-final-h">Your interview has a date. Your prep should too.</h2>
        <p>Add the job: paste its link or description to see what it requires, where you fall short, and a plan to close the gap. Free to start.</p>
        <div className="hm-cta-row hm-cta-center">
          <Link className="btn btn-lg hm-btn-signal" to="/analyze">Add a job, free <Icon name="arrow" size={18} /></Link>
          <Link className="btn btn-lg btn-on-dark" to="/example">See a sample walkthrough</Link>
        </div>
      </section>
    </div>
  );
}
