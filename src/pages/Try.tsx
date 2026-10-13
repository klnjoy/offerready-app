/* /try: try the AI Interview Coach with no account. A sample resume and four
 * sample questions; choosing one shows the kind of answer the coach builds
 * (outline with source labels, a speakable answer, likely follow-ups).
 * The answers are prepared in advance from the sample resume shown on the
 * page, and the page says so. To get answers from your own resume, sign up. */

import { useState } from "react";
import { Link } from "../lib/router";
import { Icon } from "../components/Icon";

const RESUME = [
  "Senior Data & AI Engineer, 7 years",
  "Built a RAG assistant over 40k support articles on AWS (Bedrock, OpenSearch); answer accuracy on our eval set rose from 61% to 84%",
  "Led migration of 120 nightly ETL jobs to dbt and Airflow with no missed SLAs",
  "Added data quality checks that stopped bad records reaching finance dashboards",
];

type Src = "Resume" | "General" | "Suggestion";
interface Sample { q: string; kind: string; outline: { p: string; src: Src; quote?: string }[]; say: string; follow: string[] }

const SAMPLES: Sample[] = [
  {
    q: "Tell me about a time you improved an AI system’s quality.",
    kind: "Behavioral",
    outline: [
      { p: "Situation: a support assistant giving wrong answers on a large knowledge base", src: "Resume", quote: "RAG assistant over 40k support articles" },
      { p: "Action: built an eval set first, then tuned retrieval against it", src: "General" },
      { p: "Result: accuracy on the eval set from 61% to 84%", src: "Resume", quote: "rose from 61% to 84%" },
      { p: "Mention how many users or tickets it served, if you know it", src: "Suggestion" },
    ],
    say: "Our support assistant answered from 40,000 articles and was often wrong. Before changing anything, I built an evaluation set from real questions so we could measure it. Then I tuned retrieval against that set, and accuracy went from 61% to 84%. The lesson I took: measure first, then change one thing at a time.",
    follow: ["How did you build the eval set?", "What did you change in retrieval?", "How did you know it held up in production?"],
  },
  {
    q: "How would you design a RAG system for a support team?",
    kind: "System design",
    outline: [
      { p: "Requirements: answer quality, freshness, latency, cost", src: "General" },
      { p: "Ingest articles, chunk, embed, store in a vector index", src: "General" },
      { p: "You’ve done this on AWS with Bedrock and OpenSearch", src: "Resume", quote: "on AWS (Bedrock, OpenSearch)" },
      { p: "Evaluate with a fixed set before every release", src: "Resume", quote: "answer accuracy on our eval set" },
    ],
    say: "I’d start with requirements: how fresh the answers must be, the latency budget and the cost per question. Then ingestion: chunk the articles, embed them and store them in a vector index, re-indexing when an article changes. At question time, retrieve, re-rank and answer with citations. I’ve built this on AWS with Bedrock and OpenSearch, and the part I’d insist on is an evaluation set that gates every release.",
    follow: ["How would you keep the index fresh?", "What happens when retrieval finds nothing?", "How would you control cost?"],
  },
  {
    q: "Tell me about a migration you led.",
    kind: "Leadership",
    outline: [
      { p: "Scope: 120 nightly ETL jobs moved to dbt and Airflow", src: "Resume", quote: "120 nightly ETL jobs to dbt and Airflow" },
      { p: "Constraint: no missed SLAs during the move", src: "Resume", quote: "no missed SLAs" },
      { p: "How you sequenced it: lowest-risk jobs first, run old and new side by side", src: "Suggestion" },
      { p: "Say how long it took and how many people were involved [timeline], [team size]", src: "Suggestion" },
    ],
    say: "I led the move of 120 nightly ETL jobs to dbt and Airflow, with one hard rule: no missed SLAs. We started with the lowest-risk jobs, ran old and new side by side until the outputs matched, then switched over. It took [timeline] with a team of [team size], and we didn’t miss a single SLA.",
    follow: ["How did you prove old and new matched?", "What went wrong along the way?", "How did you get other teams on board?"],
  },
  {
    q: "How do you make sure data is trustworthy?",
    kind: "Technical",
    outline: [
      { p: "Checks at the source, not only at the dashboard", src: "General" },
      { p: "Your example: checks that stopped bad records reaching finance dashboards", src: "Resume", quote: "stopped bad records reaching finance dashboards" },
      { p: "Ownership and alerts: who gets paged when a check fails", src: "General" },
    ],
    say: "I put checks where data enters, not where it’s shown. In my last role I added quality checks that stopped bad records before they reached the finance dashboards, so problems were caught upstream instead of in a meeting. Each check has an owner and an alert, so a failure gets fixed the same day.",
    follow: ["Which checks matter most?", "How do you avoid alert fatigue?", "What about data you don’t own?"],
  },
];

export default function TryPage() {
  const [i, setI] = useState<number | null>(null);
  const s = i == null ? null : SAMPLES[i];
  return (
    <div className="page try">
      <div className="try-grid">
        <aside className="try-resume card" aria-labelledby="try-res-h">
          <h2 id="try-res-h">Sample resume</h2>
          <p className="small muted">Answers below are built only from these lines. With an account, the coach uses your own resume and stories.</p>
          <ul>{RESUME.map((r) => <li key={r}>{r}</li>)}</ul>
        </aside>

        <section className="try-main" aria-labelledby="try-q-h">
          <h2 id="try-q-h">Pick a question</h2>
          <div className="try-qs" role="group" aria-label="Sample questions">
            {SAMPLES.map((x, n) => (
              <button key={x.q} type="button" className={"try-q" + (n === i ? " on" : "")} aria-pressed={n === i} onClick={() => setI(n)}>
                <span className="try-kind">{x.kind}</span>{x.q}
              </button>
            ))}
          </div>

          {s ? (
            <div className="try-result card" aria-live="polite">
              <h3>Answer outline</h3>
              <ul className="try-outline">
                {s.outline.map((o) => (
                  <li key={o.p}>
                    <span className={"dt-src dt-src-" + (o.src === "Resume" ? "resume" : o.src === "General" ? "general" : "story")}>{o.src}</span>
                    <span>{o.p}{o.quote ? <em className="try-quote"> “{o.quote}”</em> : null}</span>
                  </li>
                ))}
              </ul>
              <h3>Say it like this</h3>
              <p className="try-say">{s.say}</p>
              <h3>Likely follow-ups</h3>
              <ul className="try-follow">{s.follow.map((f) => <li key={f}>{f}</li>)}</ul>
              <div className="try-cta">
                <p><strong>Want this from your own resume?</strong> Add your job and resume free, no card needed.</p>
                <div className="row">
                  <Link className="btn btn-primary" to="/analyze">Start free <Icon name="arrow" size={16} /></Link>
                  <Link className="btn" to="/demo">Watch the 1-minute demo</Link>
                </div>
              </div>
            </div>
          ) : (
            <p className="try-empty">Choose a question to see the answer the coach builds: points labelled with where they came from, a version to say out loud, and the follow-ups to expect.</p>
          )}
        </section>
      </div>
    </div>
  );
}
