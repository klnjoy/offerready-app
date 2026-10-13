/* /sample-report: what you get after a voice mock interview, on sample data.
 * No account needed. Everything here is a fixed example and the page says so;
 * the layout mirrors the real report (criteria, quotes from your answer,
 * follow-ups, delivery, what changed on retry, and what goes into the plan). */

import { Link } from "../lib/router";
import { Icon } from "../components/Icon";

type Level = "Strong" | "Good" | "Needs work";
const PILL: Record<Level, string> = { Strong: "pill-ok", Good: "pill-info", "Needs work": "pill-warn" };

const OVERALL: { label: string; level: Level; note: string }[] = [
  { label: "Content", level: "Good", note: "Right building blocks; one trade-off left unexplained" },
  { label: "Structure", level: "Strong", note: "Requirements first, then design, then risks" },
  { label: "Evidence", level: "Needs work", note: "Only one number from your own work" },
  { label: "Delivery", level: "Good", note: "Clear pace; a few fillers when pushed" },
];

interface Q {
  q: string;
  said: string;
  worked: string;
  fix: string;
  followUp: string;
  levels: [string, Level][];
  better: string[];
}

const QUESTIONS: Q[] = [
  {
    q: "Design a RAG assistant for a support team with 40,000 articles.",
    said: "I’d chunk the articles, embed them, put them in OpenSearch and retrieve the top five for the model.",
    worked: "You started with requirements (freshness, latency, cost) before naming any tools.",
    fix: "You never said how you’d know it works. Name the evaluation set and the metric you’d gate releases on.",
    followUp: "“What happens when retrieval returns nothing useful?”",
    levels: [["Content", "Good"], ["Structure", "Strong"], ["Evidence", "Needs work"]],
    better: [
      "Requirements: freshness, latency budget, cost per question",
      "Ingest, chunk, embed; re-index when an article changes",
      "Retrieve, re-rank, answer with citations",
      "Evaluation set from real tickets gates every release (yours: 61% → 84%)",
    ],
  },
  {
    q: "You chose retrieval over fine-tuning. Why?",
    said: "Fine-tuning is expensive and the articles change every week, so retrieval keeps answers fresh.",
    worked: "Clear reason tied to the data changing, said in one breath.",
    fix: "Add when you would fine-tune after all (tone, format, a small fixed domain). Showing the other side is what the follow-ups test.",
    followUp: "“So when would fine-tuning be the right call?”",
    levels: [["Content", "Strong"], ["Structure", "Good"], ["Evidence", "Good"]],
    better: [
      "Articles change weekly, so retrieval stays current without retraining",
      "Fine-tune when the problem is style or format, not knowledge",
      "Could combine: a small tuned model for format, retrieval for facts",
    ],
  },
  {
    q: "How would you stop the assistant leaking customer PII?",
    said: "Um, we’d probably add a guardrail, and, like, filter the output.",
    worked: "You knew guardrails belong on both input and output.",
    fix: "Too vague under pressure. Name where PII is removed (at ingestion), what checks the output, and who is alerted.",
    followUp: "“What if the PII is in the article itself?”",
    levels: [["Content", "Needs work"], ["Structure", "Needs work"], ["Evidence", "Needs work"]],
    better: [
      "Strip PII at ingestion so it never reaches the index",
      "Output check before the answer is shown; block and log on a match",
      "Alert an owner; review blocked answers weekly",
    ],
  },
];

const NEXT = [
  { when: "Today", what: "Re-answer “PII in prompts” out loud (5 min)" },
  { when: "Thu", what: "Trade-off drill: retrieval vs fine-tuning, with push-back" },
  { when: "Sat", what: "Add one number to each of your three main stories" },
];

export default function SampleReportPage() {
  return (
    <div className="page sr">
      <div className="demo-banner">
        <strong>Sample report, sample data.</strong> This is the report you get after a voice mock interview. The job, answers and scores below are made up to show the format; nothing here is about you.
      </div>

      <section className="card sr-head" aria-labelledby="sr-h">
        <div>
          <p className="sr-kicker">Voice mock · System design · 24 min</p>
          <h2 id="sr-h">Senior AI Engineer at Northwind</h2>
          <p className="muted">Interview on Thu, Oct 22 · this was your 3rd mock for this job</p>
        </div>
        <div className="sr-ready">
          <span className="sr-ring"><b>72</b></span>
          <div>
            <span className="sr-label">Readiness after this mock</span>
            <strong>Ready by Oct 18</strong>
            <span className="muted small">4 days before your interview · up from 64</span>
          </div>
        </div>
      </section>

      <section aria-labelledby="sr-sum-h">
        <h3 id="sr-sum-h" className="sr-h">How it went</h3>
        <div className="sr-grid">
          {OVERALL.map((o) => (
            <div key={o.label} className="card sr-crit">
              <div className="sr-crit-top"><span>{o.label}</span><span className={"pill " + PILL[o.level]}>{o.level}</span></div>
              <p className="small muted">{o.note}</p>
            </div>
          ))}
        </div>
      </section>

      <section aria-labelledby="sr-q-h">
        <h3 id="sr-q-h" className="sr-h">Question by question</h3>
        <ol className="sr-qs">
          {QUESTIONS.map((x, i) => (
            <li key={x.q} className="card sr-q">
              <p className="sr-qn">Question {i + 1}</p>
              <h4>{x.q}</h4>
              <div className="sr-levels">{x.levels.map(([k, v]) => <span key={k}>{k} <span className={"pill " + PILL[v]}>{v}</span></span>)}</div>
              <blockquote className="sr-said"><span className="sr-label">What you said</span>“{x.said}”</blockquote>
              <div className="sr-two">
                <div><span className="sr-label sr-ok">What worked</span><p>{x.worked}</p></div>
                <div><span className="sr-label sr-warn">What to fix</span><p>{x.fix}</p></div>
              </div>
              <p className="sr-follow"><span className="sr-label">Follow-up they asked</span> {x.followUp}</p>
              <details className="sr-better">
                <summary>A stronger outline</summary>
                <ul>{x.better.map((b) => <li key={b}>{b}</li>)}</ul>
              </details>
            </li>
          ))}
        </ol>
      </section>

      <section className="sr-row2">
        <div className="card">
          <h3 className="sr-h">Delivery</h3>
          <ul className="sr-stats">
            <li><b>142</b><span>words a minute (comfortable)</span></li>
            <li><b>6</b><span>filler words, 5 of them in question 3</span></li>
            <li><b>1:48</b><span>average answer length</span></li>
          </ul>
        </div>
        <div className="card">
          <h3 className="sr-h">Since your last try</h3>
          <p className="sr-big">42% <Icon name="arrow" size={18} /> 61%</p>
          <p className="small muted">Criteria met across the same questions. Structure improved most; evidence is still the gap.</p>
        </div>
      </section>

      <section className="card" aria-labelledby="sr-next-h">
        <h3 id="sr-next-h" className="sr-h">Added to your plan</h3>
        <ul className="sr-next">
          {NEXT.map((n) => <li key={n.what}><span className="sr-when">{n.when}</span>{n.what}</li>)}
        </ul>
        <p className="small muted">Weak answers come back in your plan before the interview, so you practise them again rather than forget them.</p>
      </section>

      <p className="small muted sr-note">
        How the report is made: from the transcript of your spoken answers, scored against what this job asks for. Feedback quotes your own words. It is AI feedback, so treat it as a strong second opinion, not a verdict.
      </p>

      <div className="card sr-cta">
        <div>
          <h3>Get this report for your own interview</h3>
          <p className="muted">Add the job and its date. Free to start, no card needed.</p>
        </div>
        <div className="row">
          <Link className="btn btn-primary" to="/analyze">Add a job, free <Icon name="arrow" size={16} /></Link>
          <Link className="btn" to="/try">Try a sample question</Link>
        </div>
      </div>
    </div>
  );
}
