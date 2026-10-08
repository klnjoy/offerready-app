/* Home: the marketing page for new visitors, plus a "continue where you left
 * off" bar for signed-in users with saved jobs.
 *
 * Sections: continue bar, hero (+ a sample "Today" card drawn in HTML/CSS),
 * how it works (Understand → Prepare → Prove), feature highlights, an honest
 * comparison with general AI chat, Free vs Pro (from lib/plans), the study
 * library, FAQ and a closing CTA. Styles live under "Home (marketing)" in
 * styles.css; every class here is prefixed hm- so nothing leaks. */

import type { ReactNode } from "react";
import { STUDY_URL } from "../config";
import { LIMITS, PLAN_MATRIX } from "../lib/plans";
import { displayJobTitle } from "../lib/roles";
import { ExternalLink, Link } from "../lib/router";
import { useJobs } from "../lib/useJobs";
import type { JobRow } from "../types";

/* ---------- icons (1.6px line icons, inherit currentColor) ---------- */

type IconName =
  | "mic" | "calendar" | "shield" | "book" | "fit" | "gauge" | "check" | "arrow"
  | "lock" | "target" | "layers" | "search" | "spark" | "chat" | "plus" | "ext";

const PATHS: Record<IconName, ReactNode> = {
  mic: <><rect x="9" y="3" width="6" height="11" rx="3" /><path d="M5.5 11a6.5 6.5 0 0 0 13 0M12 17.5V21M8.5 21h7" /></>,
  calendar: <><rect x="3.5" y="5" width="17" height="15.5" rx="2.5" /><path d="M3.5 10h17M8 3v4M16 3v4M8.5 14.5l2 2 4-4" /></>,
  shield: <><path d="M12 3 4.5 6v5.5c0 4.6 3.2 8.3 7.5 9.5 4.3-1.2 7.5-4.9 7.5-9.5V6L12 3Z" /><path d="M9 12.5l2 2 4-4.5" /></>,
  book: <><path d="M4 5.5A2.5 2.5 0 0 1 6.5 3H20v15H6.5A2.5 2.5 0 0 0 4 20.5v-15Z" /><path d="M4 20.5A2.5 2.5 0 0 1 6.5 18H20v3H6.5M9 7.5h7M9 11h5" /></>,
  fit: <><path d="M14.5 3H7a2 2 0 0 0-2 2v14a2 2 0 0 0 2 2h10a2 2 0 0 0 2-2V7.5L14.5 3Z" /><path d="M14 3v5h5M8.5 14l2.2 2.2L15.5 11.5" /></>,
  gauge: <><path d="M4.2 17.5a8.5 8.5 0 1 1 15.6 0" /><path d="M12 13.5 15.5 9" /><circle cx="12" cy="14" r="1.4" /></>,
  check: <path d="M5 12.5l4.2 4.2L19 7" />,
  arrow: <path d="M5 12h14M13 6l6 6-6 6" />,
  lock: <><rect x="4.5" y="10.5" width="15" height="10" rx="2.5" /><path d="M8 10.5V7.5a4 4 0 0 1 8 0v3" /></>,
  target: <><circle cx="12" cy="12" r="8.5" /><circle cx="12" cy="12" r="4.5" /><circle cx="12" cy="12" r="1" /></>,
  layers: <><path d="M12 3 3 8l9 5 9-5-9-5Z" /><path d="M3 13l9 5 9-5" /></>,
  search: <><circle cx="11" cy="11" r="6.5" /><path d="M16 16l4.5 4.5" /></>,
  spark: <path d="M12 3v4M12 17v4M3 12h4M17 12h4M6 6l2.5 2.5M15.5 15.5 18 18M18 6l-2.5 2.5M8.5 15.5 6 18" />,
  chat: <path d="M4 5.5h16v10H9.5L5 19.5v-4H4v-10Z" />,
  plus: <path d="M12 5v14M5 12h14" />,
  ext: <path d="M14 4h6v6M20 4l-9 9M18 14v5a1 1 0 0 1-1 1H5a1 1 0 0 1-1-1V7a1 1 0 0 1 1-1h5" />,
};

function Icon({ name, size = 20 }: { name: IconName; size?: number }) {
  return (
    <svg className="hm-ico" viewBox="0 0 24 24" width={size} height={size} fill="none" stroke="currentColor"
      strokeWidth={1.7} strokeLinecap="round" strokeLinejoin="round" aria-hidden="true" focusable="false">
      {PATHS[name]}
    </svg>
  );
}

/* ---------- content ---------- */

const STAGES: { n: string; name: string; line: string; tools: { to: string; label: string; text: string }[] }[] = [
  {
    n: "1", name: "Understand",
    line: "Know exactly what this job is testing for, and where you stand.",
    tools: [
      { to: "/analyze", label: "Analyze a job", text: "Paste the JD: required skills, seniority, gaps and a prep plan." },
      { to: "/fit", label: "Check my fit", text: "Your resume against the job, read in your browser and never stored." },
    ],
  },
  {
    n: "2", name: "Prepare",
    line: "Practise the questions this interview will ask, not generic lists.",
    tools: [
      { to: "/questions", label: "Questions for this job", text: "Written for the role and the gaps in your analysis." },
      { to: "/defend", label: "Defend your decisions", text: "Scenario drills that push on trade-offs and incidents." },
      { to: "/stories", label: "Story bank", text: "STAR stories mapped to the competencies the job needs." },
      { to: "/practice", label: "Question bank", text: "Practice mode, flashcards and timed exams." },
    ],
  },
  {
    n: "3", name: "Prove",
    line: "Rehearse under pressure and see when you are actually ready.",
    tools: [
      { to: "/interview/voice", label: "Voice mock interview", text: "Answer out loud, get follow-ups and delivery scores." },
      { to: "/simulator", label: "Mock interview loop", text: "A mixed loop across areas and levels." },
      { to: "/dashboard", label: "Readiness score", text: "One score per job, built from match, practice and prep." },
    ],
  },
];

const FEATURES: { icon: IconName; title: string; text: string; to: string; cta: string; isNew?: boolean }[] = [
  { icon: "mic", title: "Voice mock interview", isNew: true, to: "/interview/voice", cta: "Try a voice mock",
    text: "Answer out loud. The interviewer follows up on what you actually said, then scores your content and your delivery: pace, filler words and structure." },
  { icon: "calendar", title: "Today", isNew: true, to: "/today", cta: "Plan to your date",
    text: "Set your interview date and get a day-by-day plan, with one clear “do this next” every time you open the app." },
  { icon: "shield", title: "Defend your decisions", to: "/defend", cta: "Start a drill",
    text: "Make the call on a real scenario, then hold it while the interviewer pushes on trade-offs, constraints and incidents." },
  { icon: "book", title: "Story bank", to: "/stories", cta: "Build your stories",
    text: "Keep your STAR stories in one place, mapped to the competencies each job asks for, so you know which story covers which question." },
  { icon: "fit", title: "Check my fit", to: "/fit", cta: "Check your resume",
    text: "Compare your resume with the job to see your match and what is missing. It is read in your browser and never stored." },
  { icon: "gauge", title: "Readiness score", to: "/dashboard", cta: "See readiness",
    text: "One score per job, blended from your resume match, practice and preparation, so you can see it move as you work." },
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
    a: <>When you check your fit, your resume is read in your browser and is not stored. Saved jobs, practice and stories belong to your account so you can pick up where you left off; your data stays yours.</> },
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
        <Link className="btn btn-primary" to="/today"><Icon name="calendar" size={18} /> Today</Link>
        <Link className="btn" to="/dashboard"><Icon name="gauge" size={18} /> Readiness</Link>
        {jobs.length > 1 ? <Link className="hm-continue-all" to="/jobs">All {jobs.length} jobs</Link> : null}
      </div>
    </section>
  );
}

/* ---------- hero product visual (sample data, decorative) ---------- */

function TodayMock() {
  const pct = 64;
  const r = 34;
  const c = 2 * Math.PI * r;
  return (
    <div className="hm-visual" role="img" aria-label="Sample Today screen: 12 days to the interview, readiness 64 percent, and three tasks for today with the next one highlighted.">
      <div className="hm-mock" aria-hidden="true">
        <div className="hm-mock-top">
          <div>
            <p className="hm-mock-kicker">Today · Day 4 of 16</p>
            <p className="hm-mock-role">Staff AI Engineer</p>
          </div>
          <span className="hm-mock-sample">Sample</span>
        </div>

        <div className="hm-mock-stats">
          <div className="hm-mock-count">
            <span className="hm-mock-days">12</span>
            <span className="hm-mock-dayslabel">days to your<br />interview</span>
          </div>
          <div className="hm-ring">
            <svg viewBox="0 0 80 80" width="88" height="88">
              <circle className="hm-ring-bg" cx="40" cy="40" r={r} />
              <circle className="hm-ring-fg" cx="40" cy="40" r={r} strokeDasharray={c} strokeDashoffset={c * (1 - pct / 100)} transform="rotate(-90 40 40)" />
            </svg>
            <span className="hm-ring-center">
              <span className="hm-ring-num">{pct}<small>%</small></span>
              <span className="hm-ring-label">Readiness</span>
            </span>
          </div>
        </div>

        <div className="hm-mock-next">
          <span className="hm-mock-nextlabel">Do this next</span>
          <p className="hm-mock-nexttitle">Voice mock: design a RAG service</p>
          <p className="hm-mock-nextwhy">Your biggest gap · about 25 min</p>
        </div>

        <ul className="hm-mock-tasks">
          <li className="is-done"><span className="hm-box"><Icon name="check" size={13} /></span>Review gaps from Check my fit</li>
          <li><span className="hm-box" />Defend: vector store trade-offs</li>
          <li><span className="hm-box" />Add a STAR story on an incident</li>
        </ul>
      </div>

      <div className="hm-float" aria-hidden="true">
        <div className="hm-wave"><span /><span /><span /><span /><span /><span /><span /></div>
        <div>
          <p className="hm-float-title">Follow-up</p>
          <p className="hm-float-text">“Why that chunk size? What breaks at 10x traffic?”</p>
          <p className="hm-float-meta"><span>Pace 142 wpm</span><span>2 fillers</span></p>
        </div>
      </div>
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
          <p className="hm-eyebrow"><span className="hm-eyebrow-new">New</span> Voice mock interviews and a daily prep plan</p>
          <h1 id="hm-hero-h" className="hm-h1">Land the offer for <em>the job</em> in front of you.</h1>
          <p className="hm-lede">
            Paste a job description. OfferReady maps what the role demands, finds your gaps, drills you on the questions this interview is likely to ask, and gives you one next step every day until the interview.
          </p>
          <div className="hm-cta-row">
            <Link className="btn btn-lg hm-btn-signal" to="/analyze">Analyze a job, free <Icon name="arrow" size={18} /></Link>
            <Link className="btn btn-lg btn-on-dark" to="/example">See a sample walkthrough</Link>
          </div>
          <ul className="hm-trust" aria-label="Why people trust it">
            <li><Icon name="check" size={16} /> Free plan available</li>
            <li><Icon name="lock" size={16} /> Resume read in your browser, never stored</li>
            <li><Icon name="target" size={16} /> Built for senior technical interviews</li>
          </ul>
        </div>
        <TodayMock />
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
          <h2 id="hm-how-h" className="hm-h2">From job description to ready, in three stages</h2>
          <p className="hm-sub">Every tool works on the job you saved, so each step builds on the last.</p>
        </header>
        <ol className="hm-stages">
          {STAGES.map((s) => (
            <li key={s.n} className={"hm-stage hm-stage-" + s.n}>
              <div className="hm-stage-top">
                <span className="hm-stage-n" aria-hidden="true">{s.n}</span>
                <h3 className="hm-stage-name">{s.name}</h3>
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
        <p>Paste the job description to see what it requires, where you fall short, and a plan to close the gap. Free to start.</p>
        <div className="hm-cta-row hm-cta-center">
          <Link className="btn btn-lg hm-btn-signal" to="/analyze">Analyze a job, free <Icon name="arrow" size={18} /></Link>
          <Link className="btn btn-lg btn-on-dark" to="/example">See a sample walkthrough</Link>
        </div>
      </section>
    </div>
  );
}
