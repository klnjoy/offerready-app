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

import { DOCS_BASE } from "../config";
import { PASSES, PASS_ORDER, POPULAR } from "../lib/passes";
import { displayJobTitle } from "../lib/roles";
import { ExternalLink, Link } from "../lib/router";
import { Icon, type IconName } from "../components/Icon";
import { useJobs } from "../lib/useJobs";
import { OutcomeCheckIn } from "../components/OutcomeCheckIn";
import { DemoTour } from "../components/DemoTour";
import { HOME_FAQ } from "../content/faq";
import type { JobRow } from "../types";

/* ---------- content ---------- */


/* What only OfferReady does: a tabbed showcase (tab list + one detail panel). */
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

/* ---------- page ---------- */

export default function HomePage() {
  return (
    <div className="page hm">
      <ContinueBar />

      {/* 1. hero: the brand line, what it is, and the ready-date forecast */}
      <section className="hm-hero hm-band hm-hero-b" aria-labelledby="hm-hero-h">
        <div className="hm-hero-copy">
          <h1 id="hm-hero-h" className="hm-h1">One job. One date. <span className="hm-h1-2">Ready on time.</span></h1>
          <p className="hm-lede">
            <strong>OfferReady is an AI interview coach for AI, data and platform engineers.</strong> Add the job you{"’"}re interviewing for and its date: it practises you on what that interview will ask and forecasts the day you{"’"}ll be ready.
          </p>
          <div className="hm-cta-row">
            <Link className="btn btn-lg hm-btn-signal" to="/analyze">Add a job, free <Icon name="arrow" size={18} /></Link>
            <Link className="btn btn-lg hm-btn-ghost" to="/try">Try a sample question</Link>
          </div>
          <p className="hm-try"><a className="hm-link" href="#hm-demo-h">Watch the 1-minute demo<Icon name="arrow" size={15} /></a><Link className="hm-link" to="/sample-report">See a sample report<Icon name="arrow" size={15} /></Link></p>
          <ul className="hm-trust" aria-label="Good to know">
            <li><Icon name="check" size={16} /> Free, no card needed</li>
            <li><Icon name="shield" size={16} /> Practice only, never live</li>
            <li><Icon name="lock" size={16} /> Resume stays on your device</li>
          </ul>
        </div>
        <div className="hm-visual hm-hero-fc"><ForecastSample /></div>
      </section>

      {/* roles strip */}
      <section className="hm-roles" aria-label="Roles OfferReady is built for">
        <p className="hm-roles-label">Built for technical interviews in</p>
        <ul>
          {ROLE_PAGES.map((r) => <li key={r.path}><ExternalLink href={DOCS_BASE + r.path}>{r.label}</ExternalLink></li>)}
        </ul>
      </section>

      {/* 3. how it works: the three-step demo */}
      <section className="hm-section" aria-labelledby="hm-demo-h">
        <header className="hm-head">
          <h2 id="hm-demo-h" className="hm-h2">How it works, in three steps</h2>
          <p className="hm-sub">Prepare, practise, interview: every feature in one minute, with where to find it. Choose any chapter to jump to it.</p>
        </header>
        <DemoTour />
        <p className="hm-demo-more"><Link className="hm-link" to="/demo#demo-video-h">Watch it as a video<Icon name="arrow" size={15} /></Link><Link className="hm-link" to="/sample-report">See a sample report<Icon name="arrow" size={15} /></Link></p>
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

      {/* 8. FAQ */}
      <section className="hm-section hm-faq-wrap" aria-labelledby="hm-faq-h">
        <header className="hm-head">
          <p className="hm-kicker">FAQ</p>
          <h2 id="hm-faq-h" className="hm-h2">Questions, answered</h2>
        </header>
        <div className="hm-faq">
          {HOME_FAQ.map((f) => (
            <details key={f.q} className="hm-qa">
              <summary><span>{f.q}</span><span className="hm-qa-ico" aria-hidden="true"><Icon name="plus" size={18} /></span></summary>
              <div className="hm-qa-body"><p>{f.a}</p></div>
            </details>
          ))}
        </div>
        <p className="hm-faq-more"><Link className="hm-link" to="/faq">All questions, plus the free study notes<Icon name="arrow" size={15} /></Link></p>
      </section>

      {/* 9. final CTA */}
      <section className="hm-final hm-band" aria-labelledby="hm-final-h">
        <h2 id="hm-final-h" className="hm-final-h">Your interview has a date. Now you’ll know your ready date too.</h2>
        <p>Add the job: paste its link or description to see what it requires, where you fall short, and a plan to close the gap before the day. Free to start.</p>
        <div className="hm-cta-row hm-cta-center">
          <Link className="btn btn-lg hm-btn-signal" to="/analyze">Add a job, free <Icon name="arrow" size={18} /></Link>
          <Link className="btn btn-lg btn-on-dark" to="/sample-report">See a sample report</Link>
        </div>
      </section>
    </div>
  );
}
