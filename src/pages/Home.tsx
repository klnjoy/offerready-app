/* Home: the marketing page for new visitors, plus a "continue where you left
 * off" bar for signed-in users with saved jobs.
 *
 * Sections: continue bar, hero (a sample readiness forecast + the 3-step
 * journey: Add a job → Practise → Mock interview & readiness), how it works,
 * "practice-only, by design", what only OfferReady does (+ an honest
 * comparison with general AI chat), Free vs Pro (from lib/plans), the study
 * library, FAQ and a closing CTA. Styles live under "Home (marketing)" and
 * "Positioning v2" in styles.css; every class here is prefixed hm- so
 * nothing leaks. */

import type { ReactNode } from "react";
import { DOCS_BASE, STUDY_URL } from "../config";
import { LIMITS, PLAN_MATRIX } from "../lib/plans";
import { PASSES } from "../lib/passes";
import { displayJobTitle } from "../lib/roles";
import { ExternalLink, Link } from "../lib/router";
import { Icon, type IconName } from "../components/Icon";
import { useJobs } from "../lib/useJobs";
import { OutcomeCheckIn } from "../components/OutcomeCheckIn";
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

/* What only OfferReady does: the forecast leads (it gets the wide card). */
const UNIQUE: { icon: IconName; title: string; text: string; to: string; cta: string; isNew?: boolean; lead?: boolean; ext?: boolean; points?: string[] }[] = [
  { icon: "gauge", title: "A forecast of your ready date", lead: true, isNew: true, to: "/dashboard", cta: "See your readiness",
    text: "Most prep tools tell you how you did today. OfferReady tells you when you’ll be ready, and whether that’s before your interview.",
    points: [
      "A ready date from your pace over the last 14 days of practice",
      "Checked against your interview date: on track, or how many days late",
      "Running late? The extra minutes a day that close the gap",
    ] },
  { icon: "calendar", title: "A plan to one job’s interview date", to: "/jobs", cta: "Plan to your date",
    text: "Built from the job description and your gaps: a day-by-day plan to the date, with one clear “do this next” each time you open the job." },
  { icon: "mic", title: "Follow-ups on what you actually said", isNew: true, to: "/interview/voice", cta: "Try a voice interview",
    text: "The voice interviewer listens, then asks about your answer. Deep mode keeps asking why, up to three times, and system design rounds come with a whiteboard to sketch on." },
  { icon: "shield", title: "Trade-off drills", to: "/defend", cta: "Start a drill",
    text: "Make the call on a real scenario, then hold it while the interviewer pushes on cost, limits and incidents." },
  { icon: "list", title: "Debriefs that feed the plan", to: "/debrief", cta: "Write a debrief",
    text: "After a real round, note what was asked and how it went. Questions that went badly come back into your plan for the next round." },
  { icon: "book", title: "Depth on AI and data roles", ext: true, to: DOCS_BASE, cta: "Open the study library",
    text: "Role guides for AI engineer, forward-deployed engineer and AI platform roles, with deep notes on RAG, agents and data platforms behind them." },
];

const COMPARE: { topic: string; chat: string; us: string }[] = [
  { topic: "Where you start", chat: "With whatever question you think to ask.", us: "With one job, one interview date and a plan to it." },
  { topic: "Knowing when you’re ready", chat: "No running measure; you guess.", us: "A forecast ready date, checked against your interview date." },
  { topic: "Practice", chat: "Can role-play an interviewer if you set it up each time.", us: "Follow-ups on what you said, scored on content and delivery." },
  { topic: "What it keeps", chat: "Context lives in chat threads; you re-explain the role.", us: "Your jobs, gaps, practice, stories and debriefs, across sessions." },
  { topic: "Live-interview help", chat: "General purpose: it answers whatever it’s asked.", us: "Never. Practice only, by design." },
];

const PRACTICE_ONLY: { icon: IconName; title: string; text: string }[] = [
  { icon: "shield", title: "We prepare you. We never sit in your interview.",
    text: "There is no live-interview mode, no overlay and no answer feed. OfferReady works before the interview and after it, never during." },
  { icon: "target", title: "Practise the questions that catch rehearsed answers",
    text: "Interviewers spot scripted or AI-fed answers by asking why, then why again. That is exactly what the follow-ups train, so the reasoning in the room is yours." },
  { icon: "lock", title: "Your resume stays on your device",
    text: "It is read in your browser and saved only on this device. Its text goes with an analysis you ask for and is never stored on our servers." },
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
    a: <>Your resume is read in your browser and saved on your device, so you add it once; it syncs to your account only if you turn that on. Jobs, plans, practice and stories sync to your account so you can pick up on any device. You can download or delete your data any time from Account.</> },
  { q: "Does OfferReady help during a live interview?",
    a: <>No, and that’s on purpose. OfferReady is practice-only: there is no live mode, overlay or answer feed. It prepares you before the interview and helps you debrief after it. The follow-ups you practise are the same kind interviewers use to tell rehearsed or AI-fed answers from real understanding, so what you bring into the room is your own.</> },
  { q: "How is this different from ChatGPT, Claude or Gemini?",
    a: <>General assistants are great at answering the questions you think to ask. OfferReady is organised around one job and one date: it keeps your gaps, practice, stories and debriefs, runs an interview loop with follow-ups on what you said, and forecasts when you’ll be ready. You can still use your favourite assistant alongside it.</> },
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
    <>
    <OutcomeCheckIn jobs={jobs} />
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
    </>
  );
}

/* ---------- hero visual: the 3-step journey ---------- */

const JOURNEY: { icon: IconName; title: string; line: string; chips: string[] }[] = [
  { icon: "briefcase", title: "Add a job", line: "Paste a job link or the description. Add your resume once.", chips: ["Your match", "Your gaps", "Your plan"] },
  { icon: "target", title: "Practise", line: "Questions, trade-off drills and stories written for this job.", chips: ["Questions", "Trade-off drills", "Stories"] },
  { icon: "mic", title: "Mock interview & readiness", line: "Rehearse out loud and watch one score rise to ready.", chips: ["Voice", "Follow-ups", "Readiness"] },
];

/* A static sample: Today (58) → Ready Oct 18 (80) → Interview Oct 22.
 * 10 days to ready, then a 4-day buffer, so Ready sits at 10/14 of the track. */
function ForecastSample() {
  return (
    <figure className="hm-fc" aria-labelledby="hm-fc-cap">
      <figcaption id="hm-fc-cap" className="hm-sr">Sample readiness forecast: ready by Oct 18, 4 days before an interview on Oct 22.</figcaption>
      <div className="hm-fc-top" aria-hidden="true">
        <span className="hm-fc-kicker"><Icon name="gauge" size={16} /> Readiness forecast</span>
        <span className="hm-fc-sample">Sample</span>
      </div>
      <div aria-hidden="true">
        <p className="hm-fc-job">Senior AI Engineer · interview Thu, Oct 22</p>
        <p className="hm-fc-big">Ready by Oct 18</p>
        <p className="hm-fc-margin"><Icon name="check" size={15} /> 4 days before your interview</p>
      </div>
      <div className="hm-fc-tl" aria-hidden="true">
        <span className="hm-fc-flag" style={{ left: "71.4%" }}>Ready · 80</span>
        <div className="hm-fc-track">
          <span className="hm-fc-run" style={{ width: "71.4%" }} />
          <span className="hm-fc-buf" style={{ left: "71.4%" }} />
          <span className="hm-fc-dot hm-fc-dot-now" style={{ left: "0%" }} />
          <span className="hm-fc-dot hm-fc-dot-ready" style={{ left: "71.4%" }} />
          <span className="hm-fc-dot hm-fc-dot-int" style={{ left: "100%" }} />
        </div>
        <div className="hm-fc-ends">
          <span><b>Today</b> 58 now</span>
          <span><b>Interview</b> Oct 22</span>
        </div>
      </div>
      <p className="hm-fc-foot" aria-hidden="true">From your last 14 days of practice: about +2 points a day.</p>
    </figure>
  );
}

function Journey() {
  return (
    <div className="hm-visual hm-journey-wrap">
      <ForecastSample />
      <p className="hm-jhow" aria-hidden="true">How you get there</p>
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
          <p className="hm-eyebrow"><span className="hm-eyebrow-new">New</span> A forecast of your ready date, before the interview</p>
          <h1 id="hm-hero-h" className="hm-h1 hm-h1-pos">One job. One date. <em>Know when you’ll be ready.</em></h1>
          <p className="hm-lede">
            Add the job you’re interviewing for and its date. OfferReady plans every day up to it, practises you on what this interview will ask, and forecasts the day you’ll be ready, so you find out you’re behind while there’s still time to fix it.
          </p>
          <div className="hm-cta-row">
            <Link className="btn btn-lg hm-btn-signal" to="/analyze">Add a job, free <Icon name="arrow" size={18} /></Link>
            <Link className="btn btn-lg btn-on-dark" to="/example">See a sample walkthrough</Link>
          </div>
          <ul className="hm-trust" aria-label="Why people trust it">
            <li className="hm-trust-chip"><a href="#hm-po-h"><Icon name="shield" size={15} /> Practice-only</a></li>
            <li><Icon name="check" size={16} /> Free plan available</li>
            <li><Icon name="lock" size={16} /> Resume stays on your device</li>
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

      {/* 4. practice-only, by design */}
      <section className="hm-po" aria-labelledby="hm-po-h">
        <header className="hm-po-head">
          <p className="hm-kicker">Practice-only, by design</p>
          <h2 id="hm-po-h" className="hm-h2">Ready on your own, in any interview room</h2>
          <p className="hm-sub">More interviewers now watch for AI-fed answers, and some companies have brought back in-person rounds. OfferReady prepares you for exactly that.</p>
        </header>
        <ul className="hm-po-list">
          {PRACTICE_ONLY.map((p) => (
            <li key={p.title} className="hm-po-item">
              <span className="hm-po-ico"><Icon name={p.icon} size={20} /></span>
              <div>
                <h3 className="hm-po-title">{p.title}</h3>
                <p className="hm-po-text">{p.text}</p>
              </div>
            </li>
          ))}
        </ul>
      </section>

      {/* 5. what only OfferReady does */}
      <section className="hm-section" aria-labelledby="hm-feat-h">
        <header className="hm-head">
          <p className="hm-kicker">What only OfferReady does</p>
          <h2 id="hm-feat-h" className="hm-h2">Plenty of tools can ask you questions. These parts are ours.</h2>
        </header>
        <div className="hm-features hm-uniq">
          {UNIQUE.map((f) => (
            <article key={f.title} className={"hm-feature" + (f.lead ? " hm-uniq-lead" : "")}>
              <div className="hm-feature-top">
                <span className="hm-feature-ico"><Icon name={f.icon} size={22} /></span>
                {f.isNew ? <span className="hm-new">New</span> : null}
              </div>
              <h3 className="hm-feature-title">{f.title}</h3>
              <p className="hm-feature-text">{f.text}</p>
              {f.points ? (
                <ul className="hm-uniq-points">
                  {f.points.map((pt) => <li key={pt}><Icon name="check" size={16} />{pt}</li>)}
                </ul>
              ) : null}
              {f.lead ? (
                <div className="hm-uniq-eg" aria-label="Two example forecasts">
                  <p><span className="hm-uniq-pill hm-uniq-ok">On track</span><span>Ready by <b>Oct 18</b>, 4 days before the interview</span></p>
                  <p><span className="hm-uniq-pill hm-uniq-late">3 days late</span><span>Add <b>15 minutes a day</b> to be ready in time</span></p>
                </div>
              ) : null}
              {f.ext ? (
                <ExternalLink className="hm-link" href={f.to}>{f.cta}<Icon name="ext" size={15} /><span className="hm-sr"> (opens in a new tab)</span></ExternalLink>
              ) : (
                <Link className="hm-link" to={f.to}>{f.cta}<Icon name="arrow" size={15} /><span className="hm-sr"> ({f.title})</span></Link>
              )}
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
            General assistants are excellent at answering the questions you think to ask. Interview prep is a different job: one role, one date, and weeks of practice that should add up.
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
          <h2 id="hm-plan-h" className="hm-h2">Start free. Pay once when your interview is real.</h2>
          <p className="hm-sub">The free plan covers a full prep loop for one job. When an interview is booked, a one-time pass covers your search: {PASSES.job.price} for one job, up to {PASSES.pass365.price} for a year. No subscription, nothing to cancel.</p>
          <div className="hm-cta-row">
            <Link className="btn btn-primary btn-lg" to="/analyze">Start free</Link>
            <Link className="btn btn-lg" to="/pricing">See pricing</Link>
          </div>
        </div>
        <div className="hm-plan-table">
          <table>
            <caption className="hm-sr">Free and the 90-day pass compared</caption>
            <thead>
              <tr><th scope="col">Feature</th><th scope="col">Free</th><th scope="col" className="hm-pro-col">90-day pass ({PASSES.pass90.price} once)</th></tr>
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
        <h2 id="hm-final-h" className="hm-final-h">Your interview has a date. Now you’ll know your ready date too.</h2>
        <p>Add the job: paste its link or description to see what it requires, where you fall short, and a plan to close the gap before the day. Free to start.</p>
        <div className="hm-cta-row hm-cta-center">
          <Link className="btn btn-lg hm-btn-signal" to="/analyze">Add a job, free <Icon name="arrow" size={18} /></Link>
          <Link className="btn btn-lg btn-on-dark" to="/example">See a sample walkthrough</Link>
        </div>
      </section>
    </div>
  );
}
