/* Practice tab: two swipeable rows of cards with our own illustrations.
 *   For you  – the next practice steps for the job you're on.
 *   Learn AI – short reads from the study library, ones your job mentions first.
 * The art is inline SVG in the brand colours (no stock photos). */

import { docsUrl } from "../config";
import { ExternalLink, Link } from "../lib/router";
import { stepHref, usePracticePath } from "../lib/practicePath";
import { weakTopicScores } from "../lib/progressStore";
import { loadStories } from "../lib/stories";
import type { JobRow } from "../types";
import { Art, type ArtKey } from "./Art";

// ---------------------------------------------------------------------------
// Cards

interface Card { key: string; art: ArtKey; tag: string; title: string; line: string; cta: string; to?: string; href?: string; hot?: boolean }

function Row({ id, title, sub, cards }: { id: string; title: string; sub: string; cards: Card[] }) {
  if (!cards.length) return null;
  return (
    <section className="ic-row" aria-labelledby={id}>
      <div className="ic-head">
        <h2 id={id}>{title}</h2>
        <span className="small muted">{sub}</span>
      </div>
      <ul className="ic-track">
        {cards.map((c) => {
          const body = (
            <>
              <Art k={c.art} />
              <span className="ic-body">
                <span className={"ic-tag" + (c.hot ? " hot" : "")}>{c.tag}</span>
                <strong className="ic-title">{c.title}</strong>
                <span className="ic-line">{c.line}</span>
                <span className="ic-cta">{c.cta}{c.href ? " ↗" : " →"}</span>
              </span>
            </>
          );
          return (
            <li key={c.key} className="ic-card">
              {c.to ? <Link className="ic-link" to={c.to}>{body}</Link> : <ExternalLink className="ic-link" href={c.href!}>{body}</ExternalLink>}
            </li>
          );
        })}
      </ul>
    </section>
  );
}

const STEP_ART: Record<string, ArtKey> = { questions: "questions", drill: "drill", stories: "stories", mock: "mock" };

/** Short reads in the study library, with words that tie them to a job. */
const TOPICS: { slug: string; art: ArtKey; title: string; line: string; min: number; words: RegExp }[] = [
  { slug: "llm-fundamentals", art: "llm", title: "How LLMs work", line: "Tokens, context windows and temperature, in plain words.", min: 8, words: /\b(llm|gpt|genai|generative|language model|ai)\b/i },
  { slug: "prompt-engineering", art: "prompt", title: "Prompt engineering", line: "Get reliable, structured answers from a model.", min: 7, words: /prompt/i },
  { slug: "rag", art: "rag", title: "RAG, explained", line: "Answer from your own documents: retrieve, then generate.", min: 10, words: /\b(rag|retrieval|search|knowledge base)\b/i },
  { slug: "vector-db", art: "vector", title: "Embeddings and vector DBs", line: "Search by meaning, and when you need a vector store.", min: 8, words: /\b(vector|embedding|pinecone|pgvector|weaviate|faiss)\b/i },
  { slug: "agent-engineering", art: "agent", title: "AI agents", line: "Models that plan and use tools, and how to keep them safe.", min: 10, words: /\b(agent|agentic|tool use|autonomous)\b/i },
  { slug: "mcp", art: "mcp", title: "MCP in one page", line: "The standard way to plug tools and data into AI apps.", min: 6, words: /\b(mcp|model context protocol|tools?)\b/i },
  { slug: "observability", art: "eval", title: "Evaluating AI apps", line: "How to measure quality, catch regressions and trace calls.", min: 8, words: /\b(eval|evaluation|observability|monitoring|quality)\b/i },
  { slug: "llmops", art: "ops", title: "LLMOps and deployment", line: "Ship models: serving, cost, latency and rollbacks.", min: 9, words: /\b(llmops|mlops|deploy|serving|kubernetes|production)\b/i },
];

export function IdeaCards({ jobId, job }: { jobId: string; job?: JobRow }) {
  const path = usePracticePath(jobId);
  const jq = jobId ? "?job=" + encodeURIComponent(jobId) : "";

  // For you: the steps still open (next first), the weakest topic, a mock.
  const forYou: Card[] = [];
  const open = path.filter((s) => !s.done);
  open.forEach((s, i) => forYou.push({
    key: s.key, art: STEP_ART[s.key] || "questions", tag: (i === 0 ? "Next · " : "") + "Step " + s.n + (s.progress ? " · " + s.progress : ""),
    title: s.label, line: s.goal.charAt(0).toUpperCase() + s.goal.slice(1) + ".", cta: i === 0 ? "Start" : "Open", to: stepHref(s, jobId), hot: i === 0,
  }));
  const weak = Object.entries(weakTopicScores()).sort((a, b) => a[1] - b[1])[0];
  if (weak && weak[1] < 70) forYou.push({ key: "weak", art: "bank", tag: "Weakest topic · " + Math.round(weak[1]) + "%", title: "Practise " + weak[0], line: "Quick reps on the topic you score lowest on.", cta: "Practise it", to: "/practice/bank?topic=" + encodeURIComponent(weak[0]) + (jobId ? "&job=" + encodeURIComponent(jobId) : "") });
  if (!loadStories().length) forYou.push({ key: "story1", art: "stories", tag: "Behavioral", title: "Write your first story", line: "One STAR story covers many “Tell me about a time…” questions.", cta: "Start", to: "/stories?new=1" });
  if (!open.some((s) => s.key === "mock")) forYou.push({ key: "mock", art: "mock", tag: "Any time", title: "Run another mock", line: "Rehearse out loud, closer to the day.", cta: "Open mocks", to: "/mock" });
  forYou.push({ key: "coach", art: "questions", tag: "Any time", title: "Ask the AI Coach", line: "Any question, answered from your resume and stories.", cta: "Ask", to: "/coach" + jq });

  // Learn AI: topics the job mentions first.
  const text = [job?.title, ...(job?.analysis?.coreSkills || []).map((k) => (typeof k === "string" ? k : (k as { name?: string })?.name || "")), ...(job?.analysis?.technologies || [])].join(" ");
  const learn: Card[] = TOPICS
    .map((t, i) => ({ t, i, hit: !!text && t.words.test(text) }))
    .sort((a, b) => Number(b.hit) - Number(a.hit) || a.i - b.i)
    .map(({ t, hit }) => ({ key: t.slug, art: t.art, tag: (hit ? "In your job · " : "") + t.min + " min read", title: t.title, line: t.line, cta: "Read", href: docsUrl("GenAI-Topics/" + t.slug + "/index.html"), hot: hit }));

  return (
    <>
      <Row id="ic-you" title="For you" sub="Your next steps for this job" cards={forYou} />
      <Row id="ic-learn" title="Learn AI" sub="Short reads from the study library" cards={learn} />
    </>
  );
}
