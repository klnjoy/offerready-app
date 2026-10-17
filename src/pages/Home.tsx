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

import { useEffect, useState } from "react";
import { DOCS_BASE } from "../config";
import { PASSES, PASS_ORDER, POPULAR } from "../lib/passes";
import { LIMITS } from "../lib/plans";
import { displayJobTitle } from "../lib/roles";
import { ExternalLink, Link, useLocation } from "../lib/router";
import { useAuth } from "../lib/auth";
import { Loading } from "../components/ui";
import { Icon, type IconName } from "../components/Icon";
import { useJobs } from "../lib/useJobs";
import { OutcomeCheckIn } from "../components/OutcomeCheckIn";
import { DemoTour } from "../components/DemoTour";
import { Art } from "../components/Art";
import { AppWelcome } from "../components/AppWelcome";
import { isStandalone } from "../lib/pwa";
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
    text: "It is read in your browser and saved on this device. Its text is sent only with an analysis you ask for, and it is kept on our servers only if you turn on resume sync." },
];

/* Every round you'll face: each card opens the tool that practises it. */
const FORMATS: { icon: IconName; title: string; text: string; to: string }[] = [
  { icon: "chat", title: "Behavioral", text: "STAR stories matched to the job, then practised out loud in a voice mock.", to: "/stories" },
  { icon: "layers", title: "System design", text: "A voice round with a whiteboard to sketch on.", to: "/interview/voice" },
  { icon: "shield", title: "Trade-offs and “why?”", text: "Hold a design call while the interviewer pushes back.", to: "/defend" },
  { icon: "target", title: "Technical deep dive", text: "Questions written from the job’s skills and your gaps.", to: "/questions" },
  { icon: "mic", title: "Phone screen", text: "A quick 3-question voice mock, scored on content and delivery.", to: "/interview/voice" },
  { icon: "search", title: "Concepts: SQL, Python, cloud", text: "Quick reps, flashcards and timed exams by topic.", to: "/practice/bank" },
];

const ROLE_PAGES: { label: string; path: string }[] = [
  { label: "AI / GenAI Engineers", path: "For/ai-engineers/index.html" },
  { label: "Forward Deployed Engineers", path: "For/forward-deployed-engineers/index.html" },
  { label: "Data Engineers", path: "For/data-engineers/index.html" },
  { label: "Platform / DevOps Engineers", path: "For/platform-engineers/index.html" },
  { label: "Staff / Principal Engineers", path: "For/staff-engineers/index.html" },
  { label: "Architects", path: "For/architects/index.html" },
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

/* A sample: Today (58) → Ready in 11 days (80, at +2 a day as lib/forecast
 * projects) → Interview in 15 days. Ready sits at 11/15 of the track. */
/** Sample dates stay realistic on any day: interview in 15 days, ready in 11
 * (58 now, +2 points a day: ceil((80 − 58) / 2) = 11). */
function sampleDates() {
  const day = (n: number) => { const d = new Date(); d.setHours(12, 0, 0, 0); d.setDate(d.getDate() + n); return d; };
  const md = (d: Date) => d.toLocaleDateString("en-US", { month: "short", day: "numeric" });
  const wd = (d: Date) => d.toLocaleDateString("en-US", { weekday: "short" });
  const ready = day(11), interview = day(15);
  return { ready: md(ready), interview: md(interview), interviewFull: wd(interview) + ", " + md(interview) };
}

function ForecastSample() {
  const d = sampleDates();
  return (
    <figure className="hm-fc" aria-labelledby="hm-fc-cap">
      <figcaption id="hm-fc-cap" className="hm-sr">{"Sample readiness forecast: ready by " + d.ready + ", 4 days before an interview on " + d.interview + "."}</figcaption>
      <div className="hm-fc-top" aria-hidden="true">
        <span className="hm-fc-kicker"><Icon name="gauge" size={16} /> Readiness forecast</span>
        <span className="hm-fc-sample">Sample</span>
      </div>
      <div aria-hidden="true">
        <p className="hm-fc-job">Senior AI Engineer · interview {d.interviewFull}</p>
        <p className="hm-fc-big">Ready by {d.ready}</p>
        <p className="hm-fc-margin"><Icon name="check" size={15} /> 4 days before your interview</p>
      </div>
      <div className="hm-fc-tl" aria-hidden="true">
        <span className="hm-fc-flag" style={{ left: "73.3%" }}>Ready · 80</span>
        <div className="hm-fc-track">
          <span className="hm-fc-run" style={{ width: "73.3%" }} />
          <span className="hm-fc-buf" style={{ left: "73.3%" }} />
          <span className="hm-fc-dot hm-fc-dot-now" style={{ left: "0%" }} />
          <span className="hm-fc-dot hm-fc-dot-ready" style={{ left: "73.3%" }} />
          <span className="hm-fc-dot hm-fc-dot-int" style={{ left: "100%" }} />
        </div>
        <div className="hm-fc-ends">
          <span><b>Today</b> 58 now</span>
          <span><b>Interview</b> {d.interview}</span>
        </div>
      </div>
      <p className="hm-fc-foot" aria-hidden="true">From your last 14 days of practice: about +2 points a day.</p>
    </figure>
  );
}


/* ---------- sample result, right after the hero ----------
 * What one job looks like after it's added and practised once, on the same
 * sample data as /sample-report (Senior AI Engineer at Northwind). Each panel
 * mirrors a real output: the job analysis (skills found / gaps), a question
 * written for the job, the interviewer's follow-up with rubric feedback that
 * quotes the answer, and the next plan task. */
const PV_REQS: { skill: string; found: boolean }[] = [
  { skill: "Python", found: true }, { skill: "RAG", found: true }, { skill: "AWS", found: true },
  { skill: "Evaluation", found: false }, { skill: "Guardrails / PII", found: false },
];

function SamplePreview() {
  return (
    <section className="hm-section hm-pv-wrap" aria-labelledby="hm-pv-h">
      <header className="hm-head">
        <h2 id="hm-pv-h" className="hm-h2">Prepared for this job, then pushed like a real interviewer</h2>
        <p className="hm-sub">General AI chat answers what you ask. OfferReady starts from the job description, finds your gaps, then keeps asking “why?” until your answer holds. Here’s one job, on sample data.</p>
      </header>
      <div className="hm-pv" role="group" aria-label="Sample result for one job">
        <div className="hm-pv-top">
          <span className="hm-pv-job"><b>Senior AI Engineer</b> · Northwind (sample)</span>
          <span className="hm-fc-sample">Sample data</span>
        </div>
        <div className="hm-pv-grid">
          <div className="hm-pv-card">
            <p className="hm-pv-k"><Icon name="target" size={15} /> What the job asks</p>
            <ul className="hm-pv-reqs">
              {PV_REQS.map((r) => (
                <li key={r.skill} className={r.found ? "found" : "gap"}>
                  <span aria-hidden="true">{r.found ? <Icon name="check" size={13} /> : "!"}</span>{r.skill}<span className="hm-sr">{r.found ? ": found in your resume" : ": a gap"}</span>
                </li>
              ))}
            </ul>
            <p className="hm-pv-note">3 of 5 found in your resume.</p>
          </div>
          <div className="hm-pv-card">
            <p className="hm-pv-k"><Icon name="search" size={15} /> Your top gap</p>
            <p className="hm-pv-strong">Guardrails and PII in production</p>
            <p className="hm-pv-note">Not shown on your resume. The role handles customer data, so expect “how do you keep PII out of prompts?”</p>
          </div>
          <div className="hm-pv-card hm-pv-wide">
            <p className="hm-pv-k"><Icon name="chat" size={15} /> A question written for this job</p>
            <p className="hm-pv-q">“Design a RAG assistant for a support team with 40,000 articles.”</p>
            <p className="hm-pv-k hm-pv-k2"><Icon name="shield" size={15} /> The follow-up</p>
            <p className="hm-pv-q hm-pv-fu">“What happens when retrieval returns nothing useful?”</p>
            <div className="hm-pv-fb">
              <span><b>Structure</b> <span className="pill pill-ok">Strong</span></span>
              <span><b>Evidence</b> <span className="pill pill-warn">Needs work</span></span>
              <span className="hm-pv-quote">Quoted from your answer: “top five for the model”. Name the evaluation set you’d gate releases on.</span>
            </div>
          </div>
          <div className="hm-pv-card hm-pv-next">
            <p className="hm-pv-k"><Icon name="calendar" size={15} /> Added to your plan</p>
            <p className="hm-pv-strong">Today, 5 min: re-answer “PII in prompts” out loud</p>
            <p className="hm-pv-note">Then a trade-off drill on retrieval vs fine-tuning. Weak answers come back before the interview.</p>
          </div>
        </div>
        <div className="hm-pv-foot">
          <Link className="hm-link" to="/sample-report">See the full sample report<Icon name="arrow" size={15} /></Link>
          <Link className="hm-link" to="/try">Try a sample question yourself<Icon name="arrow" size={15} /></Link>
        </div>
      </div>
    </section>
  );
}

/* ---------- readiness, worked out ----------
 * Only what the app computes: readiness = 50% resume match + 30% practice +
 * 20% plan progress (lib/readiness weightedOverall); "ready" is 80 and the
 * ready date comes from the last 14 days of scores (lib/forecast). */
function ReadinessWorked() {
  const d = sampleDates();
  const parts: { label: string; value: number; weight: number }[] = [
    { label: "Resume match", value: 72, weight: 50 },
    { label: "Practice scores", value: 51, weight: 30 },
    { label: "Plan done", value: 31, weight: 20 },
  ];
  const skills: { name: string; pct: number }[] = [
    { name: "RAG", pct: 78 }, { name: "Evaluation", pct: 52 }, { name: "Guardrails / PII", pct: 35 },
  ];
  return (
    <section className="hm-section" aria-labelledby="hm-rw-h">
      <header className="hm-head">
        <h2 id="hm-rw-h" className="hm-h2">Know what to do today, and when you’ll be ready</h2>
        <p className="hm-sub">Each job page shows your interview date, today’s plan with your weakest areas first, and one score that moves as you practise.</p>
      </header>
      <div className="hm-rw">
        <div className="hm-rw-card">
          <div className="hm-pv-top"><span className="hm-pv-job"><b>Interview</b> {d.interviewFull} · in 15 days</span><span className="hm-fc-sample">Sample</span></div>
          <p className="hm-pv-k"><Icon name="list" size={15} /> Today’s plan, weakest first</p>
          <ul className="hm-rw-tasks">
            <li className="done"><Icon name="check" size={13} /> Trade-off drill: retrieval vs fine-tuning</li>
            <li><span className="hm-float-box" aria-hidden="true" /> Study: guardrails and PII · 30 min</li>
            <li><span className="hm-float-box" aria-hidden="true" /> Answer 3 questions out loud · 20 min</li>
          </ul>
          <p className="hm-pv-k"><Icon name="gauge" size={15} /> Your skills for this job</p>
          <ul className="hm-rw-skills">
            {skills.map((k) => (
              <li key={k.name}><span>{k.name}</span><span className="hm-rw-bar" aria-hidden="true"><span style={{ width: k.pct + "%" }} className={k.pct < 50 ? "low" : k.pct < 75 ? "mid" : ""} /></span><b>{k.pct}%</b></li>
            ))}
          </ul>
          <p className="hm-pv-note">Streak: 4 days · Tasks this week: 6</p>
        </div>
        <div className="hm-rw-card">
          <p className="hm-pv-k"><Icon name="gauge" size={15} /> How the score is worked out</p>
          <p className="hm-rw-score"><b>58</b><span> / 100 today · ready at 80</span></p>
          <ul className="hm-rw-parts">
            {parts.map((x) => (
              <li key={x.label}><span>{x.label} <small>{x.weight}%</small></span><b>{x.value}</b></li>
            ))}
          </ul>
          <p className="hm-pv-note">50% resume match + 30% practice + 20% plan progress. At your pace over the last 14 days (about +2 a day), you reach 80 by <b>{d.ready}</b>, 4 days before the interview.</p>
          <p className="hm-rw-next"><span>Do this next</span>Study: guardrails and PII</p>
        </div>
      </div>
    </section>
  );
}

/* ---------- page ---------- */

export default function HomePage() {
  const auth = useAuth();
  const jobs = useJobs();
  const { search } = useLocation();
  // Signed in with a job: LandOnJob opens it. Show a short loading state
  // meanwhile instead of flashing the sample screens. "/?home=1" opts out.
  const wantsHome = /[?&]home\b/.test(search);
  if (!wantsHome && ((auth.configured && !auth.ready) || (auth.session && (jobs.status === "loading" || (jobs.status === "ready" && jobs.jobs.length > 0))))) {
    return <div className="page"><Loading /></div>;
  }
  // The installed app opens on an app-style welcome, not the marketing site.
  if (isStandalone() && !/[?&]site=1/.test(search)) return <div className="page"><AppWelcome signedIn={!!auth.session} /></div>;
  return (
    <div className="page hm">
      <ContinueBar />

      {/* 1. hero: the brand line, what it is, and the ready-date forecast */}
      <section className="hm-hero hm-band hm-hero-b" aria-labelledby="hm-hero-h">
        <div className="hm-hero-copy">
          <h1 id="hm-hero-h" className="hm-h1">One job. One date. <span className="hm-h1-2">Ready on time.</span></h1>
          <p className="hm-lede"><strong>Interview prep built around the one job you’re interviewing for.</strong> For AI, data and platform engineers and architects.</p>
          <ul className="hm-what">
            <li><Icon name="target" size={18} /><span><b>See what the job asks</b> and where your resume falls short</span></li>
            <li><Icon name="mic" size={18} /><span><b>Practise its questions</b>, with follow-ups and a voice mock interview</span></li>
            <li><Icon name="calendar" size={18} /><span><b>Know the day you’ll be ready</b>, checked against your interview date</span></li>
          </ul>
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
        <div className="hm-visual hm-hero-fc">
          <ForecastSample />
          <div className="hm-float hm-float-score" aria-hidden="true">
            <span className="hm-float-ico"><Icon name="mic" size={16} /></span>
            <span><span className="hm-float-k">Voice mock, 2nd try</span><b>42% <Icon name="arrow" size={13} /> 61%</b></span>
          </div>
          <div className="hm-float hm-float-plan" aria-hidden="true">
            <span className="hm-float-k"><Icon name="calendar" size={14} /> Today’s plan · 25 min</span>
            <ul>
              <li className="done"><Icon name="check" size={13} /> Trade-off drill: RAG vs fine-tuning</li>
              <li><span className="hm-float-box" /> Re-answer “PII in prompts” out loud</li>
            </ul>
          </div>
        </div>
      </section>

      {/* 2. a sample result for one job, right after the hero */}
      <SamplePreview />

      {/* roles strip */}
      <section className="hm-roles" aria-label="Roles OfferReady is built for">
        <p className="hm-roles-label">Built for technical interviews in</p>
        <ul>
          {ROLE_PAGES.map((r) => <li key={r.path}><ExternalLink href={DOCS_BASE + r.path}>{r.label}</ExternalLink></li>)}
        </ul>
      </section>

      {/* 2b. free, no sign-in: live open roles and the 12-week roadmap */}
      <FreeStart />

      {/* 3. how it works: the three-step demo */}
      <section className="hm-section" aria-labelledby="hm-demo-h">
        <header className="hm-head">
          <h2 id="hm-demo-h" className="hm-h2">How it works</h2>
          <p className="hm-sub">Set up once, practise every day, then the interview day. Every feature in one minute, with where to find it. Steps marked Optional you can skip.</p>
        </header>
        <DemoTour />
        <p className="hm-demo-more"><Link className="hm-link" to="/demo#coach">The AI Interview Coach, step by step<Icon name="arrow" size={15} /></Link><Link className="hm-link" to="/demo#demo-video-h">Watch it as a video<Icon name="arrow" size={15} /></Link><Link className="hm-link" to="/sample-report">See a sample report<Icon name="arrow" size={15} /></Link></p>
      </section>

      {/* 3a. readiness, worked out */}
      <ReadinessWorked />

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
          <p className="hm-po-more">
            <ExternalLink className="hm-link" href={DOCS_BASE + "Security/index.html"}>Security and your data<Icon name="ext" size={15} /><span className="hm-sr"> (opens in a new tab)</span></ExternalLink>
            <ExternalLink className="hm-link" href={DOCS_BASE + "Compare/index.html"}>Compare with live interview assistants<Icon name="ext" size={15} /><span className="hm-sr"> (opens in a new tab)</span></ExternalLink>
          </p>
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

      {/* 6. free vs pro */}
      <section className="hm-section hm-plans" aria-labelledby="hm-plan-h">
        <div className="hm-plans-intro">
          <p className="hm-kicker">Plans</p>
          <h2 id="hm-plan-h" className="hm-h2">Start free. Pay once when your interview is real.</h2>
          <p className="hm-sub">The free plan covers a full prep loop for one job. When an interview is booked, a one-time pass covers your search: {PASSES.job.price} for one job, up to {PASSES.pass365.price} for a year. No subscription, nothing to cancel. Pass amounts are for the whole pass.</p>
        </div>
        <ul className="hm-tiers" aria-label="Plans">
          <li className="hm-tier">
            <span className="hm-tier-name">Free</span>
            <span className="hm-tier-price">$0</span>
            <span className="hm-tier-fit">One job, the full prep loop to try it</span>
            <ul className="hm-tier-lim">
              <li>Resets every month</li>
              <li>{LIMITS.free.saved_jobs} saved job</li>
              <li>{LIMITS.free.voice_mock} voice mock a month</li>
              <li>{LIMITS.free.ai_grading} AI feedback a month</li>
            </ul>
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
                <ul className="hm-tier-lim">
                  <li>{p.days} days of access</li>
                  <li>{p.limits.saved_jobs} saved {p.limits.saved_jobs === 1 ? "job" : "jobs"}</li>
                  <li>{p.limits.voice_mock} voice mocks</li>
                  <li>{(p.limits.ai_grading ?? 0).toLocaleString("en-US")} AI feedback</li>
                </ul>
              </li>
            );
          })}
        </ul>
        <div className="hm-cta-row hm-plans-cta">
          <Link className="btn btn-primary btn-lg" to="/analyze">Start free</Link>
          <Link className="btn btn-lg" to="/pricing">Compare every limit</Link>
        </div>
      </section>

      {/* 8. FAQ */}
      <section className="hm-section hm-faq-wrap" aria-labelledby="hm-faq-h">
        <header className="hm-head">
          <p className="hm-kicker">FAQ</p>
          <h2 id="hm-faq-h" className="hm-h2">Questions, answered</h2>
          <p className="hm-sub">The ones people ask before they sign up.</p>
          <p className="hm-faq-more"><Link className="hm-link" to="/faq">All questions, plus the free study notes<Icon name="arrow" size={15} /></Link></p>
        </header>
        <div className="hm-faq">
          {HOME_FAQ.map((f) => (
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
          <Link className="btn btn-lg btn-on-dark" to="/sample-report">See a sample report</Link>
        </div>
      </section>
    </div>
  );
}

/** Free, no sign-in: today's open roles (a live preview from roles.json) and
 * the 12-week roadmap. Prepare on a role asks for sign-in, so this is the
 * natural first step for a new visitor. */
type FreeRole = { company: string; title: string; location: string; region?: string };
function FreeStart() {
  const [roles, setRoles] = useState<{ n: number; top: FreeRole[] } | null>(null);
  useEffect(() => {
    let alive = true;
    fetch(import.meta.env.BASE_URL + "roles.json", { cache: "no-cache" })
      .then((r) => (r.ok ? r.json() : null))
      .then((d: { roles?: FreeRole[] } | null) => {
        if (!alive || !d || !Array.isArray(d.roles) || !d.roles.length) return;
        const us = d.roles.filter((x) => x.region !== "intl");
        setRoles({ n: us.length, top: us.slice(0, 3) });
      })
      .catch(() => {});
    return () => { alive = false; };
  }, []);
  return (
    <section className="hm-section hm-free" aria-labelledby="hm-free-h">
      <header className="hm-head">
        <h2 id="hm-free-h" className="hm-h2">Start free, no sign-in</h2>
        <p className="hm-sub">Find a real role, follow a plan for it, then sign in when you want OfferReady to prepare you for that exact job.</p>
      </header>
      <div className="hm-free-grid">
        <Link className="hm-free-card" to="/roles">
          <Art k="jobs" className="hm-free-art" />
          <span className="hm-free-k">Updated daily</span>
          <strong>{roles ? roles.n + " open roles in the USA" : "Open roles in the USA"}</strong>
          <span className="hm-free-line">AI / ML, data, forward deployed, architect and platform jobs, from companies{"’"} own job boards.</span>
          {roles && (
            <ul className="hm-free-list">
              {roles.top.map((r, i) => <li key={i}><b>{r.company}</b> · {r.title}</li>)}
            </ul>
          )}
          <span className="hm-free-cta">Browse open roles <Icon name="arrow" size={15} /></span>
        </Link>
        <Link className="hm-free-card" to="/learn/roadmap">
          <Art k="llm" className="hm-free-art" />
          <span className="hm-free-k">12 weeks · about 1 hour a day</span>
          <strong>Become an AI engineer or forward deployed engineer</strong>
          <span className="hm-free-line">Each week: what to learn, one thing to build, and the interview questions about it.</span>
          <ul className="hm-free-list">
            <li><b>Weeks 1 to 4</b> · How LLMs work, prompting, RAG</li>
            <li><b>Weeks 5 to 8</b> · Evals, agents, LangGraph, production</li>
            <li><b>Weeks 9 to 12</b> · System design, portfolio, interviews</li>
          </ul>
          <span className="hm-free-cta">See the roadmap <Icon name="arrow" size={15} /></span>
        </Link>
      </div>
      <p className="hm-free-note"><Icon name="check" size={15} /> Free to browse. Sign in (free) to save a job and get its resume match, questions and daily plan.</p>
    </section>
  );
}
