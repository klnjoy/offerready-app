/* Home: the marketing page for new visitors, plus a "continue where you left
 * off" bar for signed-in users with saved jobs.
 *
 * Sections: continue bar, hero (a sample readiness forecast + the 3-step
 * journey: Add a job → Practise → Mock interview & readiness), how it works,
 * every round you'll face (formats grid + role guides),
 * "practice-only, by design", what only OfferReady does (+ an honest
 * comparison with general AI chat), Free vs Pro (from lib/plans), the study
 * library, FAQ and a closing CTA. Styles live under "Home (marketing)" and
 * "Positioning v2" in styles.css; every class here is prefixed hm- so
 * nothing leaks. */

import { useRef, useState, type KeyboardEvent, type ReactNode } from "react";
import { DOCS_BASE, STUDY_URL } from "../config";
import { LIMITS } from "../lib/plans";
import { PASSES, PASS_ORDER, POPULAR } from "../lib/passes";
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

/* What only OfferReady does: a tabbed showcase (tab list + one detail panel). */
const UNIQUE: { id: string; icon: IconName; tab: string; title: string; text: string; points: string[]; to: string; cta: string; isNew?: boolean; forecast?: boolean }[] = [
  { id: "forecast", icon: "gauge", tab: "Readiness forecast", title: "Know your ready date before the interview", forecast: true, to: "/dashboard", cta: "See your readiness",
    text: "Most prep tools tell you how you did today. OfferReady tells you when you’ll be ready, and whether that’s before your interview.",
    points: [
      "A ready date from your pace over the last 14 days of practice",
      "Checked against your interview date: on track, or how many days late",
      "Running late? The extra minutes a day that close the gap",
    ] },
  { id: "coach", icon: "spark", tab: "AI Interview Coach", title: "Answers built from your own experience", isNew: true, to: "/coach", cta: "Open the AI Interview Coach",
    text: "Ask any interview question and get an answer outline from your resume and stories, for the job you’re preparing for.",
    points: [
      "Every point shows where it came from: your resume, a story, or general knowledge",
      "Numbers you never gave it are flagged, never invented",
      "Save your best version of each answer and practise it again",
    ] },
  { id: "voice", icon: "mic", tab: "Voice mock interview", title: "Rehearse out loud, with follow-ups on what you said", to: "/interview/voice", cta: "Try a voice interview",
    text: "The interviewer listens to your answer, then asks about it, the way a real interviewer would.",
    points: [
      "Behavioral, technical and system design rounds, or a mixed loop",
      "Deep mode keeps asking why, up to three times",
      "A whiteboard for system design, and feedback on content and delivery",
    ] },
  { id: "drills", icon: "shield", tab: "Trade-off drills", title: "Defend a design call under pressure", to: "/defend", cta: "Start a drill",
    text: "Make the call on a real scenario, then hold it while the interviewer pushes on cost, limits and incidents.",
    points: [
      "Scenarios matched to the job’s skills and your gaps",
      "Interviewer pushback at every stage, with tips when you need them",
      "Leave at any point; your progress is saved",
    ] },
  { id: "proof", icon: "fit", tab: "Proof you improved", title: "See your answer get better", isNew: true, to: "/questions", cta: "Answer and compare",
    text: "Answer a question, get rubric feedback, then try again and compare the two attempts side by side.",
    points: [
      "Every score is backed by a quote from your own answer",
      "Each criterion shows its change, for example “Vague → Solid”",
      "A “staff upgrade” tip shows what lifts the answer a level",
    ] },
  { id: "debrief", icon: "list", tab: "Interview debrief", title: "Real rounds feed the next one", to: "/debrief", cta: "Write a debrief",
    text: "After a real round, write down what was asked and how it went while it’s fresh.",
    points: [
      "Type questions into the notes pad during the interview; it becomes your debrief in one click",
      "Questions that went badly come back into your plan",
      "Optionally share questions anonymously to help others prepare",
    ] },
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

/* Every round you'll face: each card opens the tool that practises it. */
const FORMATS: { icon: IconName; title: string; text: string; to: string }[] = [
  { icon: "chat", title: "Behavioral", text: "STAR stories matched to the job, then said out loud.", to: "/stories" },
  { icon: "layers", title: "System design", text: "A voice round with a whiteboard to sketch on.", to: "/interview/voice" },
  { icon: "shield", title: "Trade-offs and “why?”", text: "Hold a design call while the interviewer pushes back.", to: "/defend" },
  { icon: "target", title: "Technical deep dive", text: "Questions written from the job’s skills and your gaps.", to: "/questions" },
  { icon: "mic", title: "Phone and recruiter screen", text: "A short voice mock with delivery feedback.", to: "/interview/voice" },
  { icon: "search", title: "Concepts: SQL, Python, cloud", text: "Quick reps, flashcards and timed exams by topic.", to: "/practice/bank" },
];

const ROLE_PAGES: { label: string; path: string }[] = [
  { label: "AI / GenAI Engineers", path: "For/ai-engineers/index.html" },
  { label: "Forward Deployed Engineers", path: "For/forward-deployed-engineers/index.html" },
  { label: "Data Engineers", path: "For/data-engineers/index.html" },
  { label: "Platform / DevOps Engineers", path: "For/platform-engineers/index.html" },
  { label: "Staff / Principal Engineers", path: "For/staff-engineers/index.html" },
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
  { q: "Is OfferReady an AI interview assistant?",
    a: <>Yes, for practice. The <Link to="/coach">AI Interview Coach</Link> answers any interview question with an outline built from your resume and stories, flags anything it couldn’t verify, and lets you rehearse and compare attempts. Unlike live interview assistants, it doesn’t run during the real interview: you go in able to give the answer yourself.</> },
  { q: "Does OfferReady help during a live interview?",
    a: <>No, and that’s on purpose. OfferReady is practice-only: there is no live mode, overlay or answer feed. It prepares you before the interview and helps you debrief after it. The follow-ups you practise are the same kind interviewers use to tell rehearsed or AI-fed answers from real understanding, so what you bring into the room is your own.</> },
  { q: "How is this different from ChatGPT, Claude or Gemini?",
    a: <>General assistants are great at answering the questions you think to ask. OfferReady is organised around one job and one date: it keeps your gaps, practice, stories and debriefs, runs an interview loop with follow-ups on what you said, and forecasts when you’ll be ready. You can still use your favourite assistant alongside it.</> },
  { q: "Which roles and levels does it cover?",
    a: <>Technical roles in AI/ML, data and platform engineering, solutions and forward-deployed engineering, and architecture. Questions, scenarios and scoring take the level into account, from senior through staff and principal.</> },
  { q: "Which interview rounds can I practise?",
    a: <>Behavioral (STAR stories, said out loud), system design (a voice round with a whiteboard), trade-off rounds where the interviewer keeps asking why, technical deep dives written from the job, phone and recruiter screens, and concept reps for SQL, Python and cloud. There is no live coding environment yet; coding concepts are covered in the question bank.</> },
  { q: "Is my data safe?",
    a: <>Your resume stays on your device unless you turn on sync, payments go through Stripe, there are no ads or third-party trackers, and you can download or delete your data any time. <ExternalLink href={DOCS_BASE + "Security/index.html"}>Security and your data</ExternalLink> lists exactly what we do.</> },
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
  const meta = job.company || "";
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

/* ---------- what only OfferReady does: tabbed showcase ---------- */

function FeatureTabs() {
  const [cur, setCur] = useState(0);
  const tabs = useRef<(HTMLButtonElement | null)[]>([]);
  const f = UNIQUE[cur];
  const onKey = (e: KeyboardEvent<HTMLDivElement>) => {
    const k = e.key;
    let n = -1;
    if (k === "ArrowDown" || k === "ArrowRight") n = (cur + 1) % UNIQUE.length;
    else if (k === "ArrowUp" || k === "ArrowLeft") n = (cur - 1 + UNIQUE.length) % UNIQUE.length;
    else if (k === "Home") n = 0;
    else if (k === "End") n = UNIQUE.length - 1;
    if (n < 0) return;
    e.preventDefault();
    setCur(n);
    tabs.current[n]?.focus();
  };
  return (
    <div className="hm-ft">
      <div className="hm-ft-tabs" role="tablist" aria-label="OfferReady features" aria-orientation="vertical" onKeyDown={onKey}>
        {UNIQUE.map((t, i) => (
          <button key={t.id} ref={(el) => { tabs.current[i] = el; }} type="button" role="tab" id={"hm-ft-tab-" + t.id}
            aria-selected={i === cur} aria-controls="hm-ft-panel" tabIndex={i === cur ? 0 : -1}
            className={"hm-ft-tab" + (i === cur ? " on" : "")} onClick={() => setCur(i)}>
            <Icon name={t.icon} size={18} />
            <span>{t.tab}</span>
            {t.isNew ? <span className="hm-new">New</span> : null}
          </button>
        ))}
      </div>
      <div className="hm-ft-panel" id="hm-ft-panel" role="tabpanel" aria-labelledby={"hm-ft-tab-" + f.id} key={f.id}>
        <h3 className="hm-ft-title">{f.title}</h3>
        <p className="hm-ft-text">{f.text}</p>
        <ul className="hm-uniq-points">
          {f.points.map((pt) => <li key={pt}><Icon name="check" size={16} />{pt}</li>)}
        </ul>
        {f.forecast ? (
          <div className="hm-uniq-eg" aria-label="Two example forecasts">
            <p><span className="hm-uniq-pill hm-uniq-ok">On track</span><span>Ready by <b>Oct 18</b>, 4 days before the interview</span></p>
            <p><span className="hm-uniq-pill hm-uniq-late">3 days late</span><span>Add <b>15 minutes a day</b> to be ready in time</span></p>
          </div>
        ) : null}
        <Link className="btn hm-ft-cta" to={f.to}>{f.cta}<Icon name="arrow" size={16} /></Link>
      </div>
    </div>
  );
}

/* ---------- product preview: a sample of the job workspace ---------- */

const PREVIEW_PLAN: { day: string; task: string; done?: boolean }[] = [
  { day: "Today", task: "Trade-off drill: retrieval vs fine-tuning", done: true },
  { day: "Today", task: "Answer 3 questions on evaluation" },
  { day: "Thu", task: "Voice mock: system design with whiteboard" },
  { day: "Sat", task: "Re-drill the answers you rated weakest" },
];

function AppPreview() {
  return (
    <figure className="hm-app" aria-label="A sample of the OfferReady job workspace, with made-up data">
      <div className="hm-app-bar" aria-hidden="true">
        <span className="hm-app-dots"><i /><i /><i /></span>
        <span className="hm-app-url">offerready · Jobs</span>
        <span className="hm-app-sample">Sample data</span>
      </div>
      <div className="hm-app-body" aria-hidden="true">
        <aside className="hm-app-side">
          <p className="hm-app-h">Your jobs</p>
          <div className="hm-app-job on">
            <b>Senior AI Engineer</b><span>Northwind · interview Oct 22</span>
          </div>
          <div className="hm-app-job">
            <b>Data Platform Engineer</b><span>Contoso · interview Nov 4</span>
          </div>
          <div className="hm-app-job">
            <b>Staff ML Engineer</b><span>Fabrikam · no date yet</span>
          </div>
        </aside>
        <div className="hm-app-main">
          <div className="hm-app-top">
            <div>
              <p className="hm-app-kicker">Next interview · Thu, Oct 22</p>
              <p className="hm-app-title">Senior AI Engineer at Northwind</p>
            </div>
            <div className="hm-app-score"><b>72</b><span>readiness</span></div>
          </div>
          <div className="hm-app-cards">
            <div className="hm-app-card">
              <span>Ready by</span><b className="hm-app-green">Oct 18</b><em>4 days to spare</em>
            </div>
            <div className="hm-app-card">
              <span>Resume match</span><b>81%</b><em>2 gaps to back up</em>
            </div>
            <div className="hm-app-card">
              <span>Answers improved</span><b>+19</b><em>42% → 61% on retry</em>
            </div>
          </div>
          <p className="hm-app-h">Your plan</p>
          <ul className="hm-app-plan">
            {PREVIEW_PLAN.map((p) => (
              <li key={p.task} className={p.done ? "done" : ""}>
                <span className="hm-app-check">{p.done ? <Icon name="check" size={13} /> : null}</span>
                <span className="hm-app-day">{p.day}</span>{p.task}
              </li>
            ))}
          </ul>
        </div>
      </div>
    </figure>
  );
}

/* ---------- page ---------- */

export default function HomePage() {
  return (
    <div className="page hm">
      <ContinueBar />

      {/* 1. hero: what OfferReady is, in one line, then the product */}
      <section className="hm-hero hm-band hm-hero-c" aria-labelledby="hm-hero-h">
        <div className="hm-hero-copy">
          <p className="hm-pill"><span className="hm-pill-dot" aria-hidden="true" />AI Interview Coach for engineers</p>
          <h1 id="hm-hero-h" className="hm-h1">Ace your next tech interview with an <mark className="hm-mark">AI interview coach</mark></h1>
          <p className="hm-lede">
            OfferReady reads the job and your resume, practises you on the questions that interview will ask, and shows the day you{"’"}ll be ready. Built for AI, data and platform engineers.
          </p>
          <div className="hm-cta-row hm-cta-center">
            <Link className="btn btn-lg hm-btn-ink" to="/analyze">Start free <Icon name="arrow" size={18} /></Link>
            <Link className="btn btn-lg hm-btn-ghost" to="/example">See how it works</Link>
          </div>
          <p className="hm-hero-note">Free to start. Practice only, never during your live interview.</p>
          <ul className="hm-stats" aria-label="OfferReady in numbers">
            <li><b>6</b> interview rounds to practise</li>
            <li><b>14</b> answer rubrics</li>
            <li><b>$0</b> to start</li>
          </ul>
        </div>
        <AppPreview />
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

      {/* 3b. every round */}
      <section className="hm-section" aria-labelledby="hm-fmt-h">
        <header className="hm-head">
          <p className="hm-kicker">Every round</p>
          <h2 id="hm-fmt-h" className="hm-h2">Practise each round you’ll face</h2>
          <p className="hm-sub">Pick the round that’s coming up. Each one opens the tool built to practise it.</p>
        </header>
        <ul className="hm-fmt">
          {FORMATS.map((f) => (
            <li key={f.title}>
              <Link className="hm-fmt-card" to={f.to}>
                <span className="hm-feature-ico" aria-hidden="true"><Icon name={f.icon} size={20} /></span>
                <span className="hm-fmt-body">
                  <span className="hm-fmt-title">{f.title}</span>
                  <span className="hm-fmt-text">{f.text}</span>
                </span>
                <Icon name="arrow" size={16} />
              </Link>
            </li>
          ))}
        </ul>
        <p className="hm-fmt-roles">
          <span>Guides by role:</span>
          {ROLE_PAGES.map((r) => <ExternalLink key={r.path} href={DOCS_BASE + r.path}>{r.label}</ExternalLink>)}
        </p>
      </section>

      {/* 4. practice-only, by design */}
      <section className="hm-po hm-band" aria-labelledby="hm-po-h">
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
        <p className="hm-po-more">
          <ExternalLink className="hm-link" href={DOCS_BASE + "Security/index.html"}>Security and your data<Icon name="ext" size={15} /><span className="hm-sr"> (opens in a new tab)</span></ExternalLink>
          <ExternalLink className="hm-link" href={DOCS_BASE + "Compare/index.html"}>Compare with live interview assistants<Icon name="ext" size={15} /><span className="hm-sr"> (opens in a new tab)</span></ExternalLink>
        </p>
      </section>

      {/* 5. what only OfferReady does */}
      <section className="hm-section" aria-labelledby="hm-feat-h">
        <header className="hm-head">
          <p className="hm-kicker">What only OfferReady does</p>
          <h2 id="hm-feat-h" className="hm-h2">Plenty of tools can ask you questions. These parts are ours.</h2>
          <p className="hm-sub">Everything runs on the job you added: its requirements, your resume, your stories and your interview date.</p>
        </header>
        <FeatureTabs />
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
        <ul className="hm-tiers" aria-label="Plans">
          <li className="hm-tier">
            <span className="hm-tier-name">Free</span>
            <span className="hm-tier-price">$0</span>
            <span className="hm-tier-fit">One job, the full prep loop to try it</span>
          </li>
          {PASS_ORDER.map((k) => {
            const p = PASSES[k];
            const pick = k === POPULAR;
            return (
              <li key={k} className={"hm-tier" + (pick ? " hm-tier-pick" : "")}>
                {pick ? <span className="hm-tier-tag">Recommended</span> : null}
                <span className="hm-tier-name">{p.name}</span>
                <span className="hm-tier-price">{p.price}<small> once</small></span>
                <span className="hm-tier-fit">{p.fit}</span>
              </li>
            );
          })}
        </ul>
        <p className="hm-tier-more"><Link className="hm-link" to="/pricing">Compare every limit on the pricing page<Icon name="arrow" size={15} /></Link></p>
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
      <section className="hm-final hm-band" aria-labelledby="hm-final-h">
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
