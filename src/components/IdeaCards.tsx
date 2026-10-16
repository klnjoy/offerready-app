/* Practice tab: "Learn AI", a swipeable row of short reads from the study
 * library, the ones your job mentions first. (Your practice steps are the
 * list above it on the Practice page, so they aren't repeated here.)
 * The art is inline SVG in the brand colours (no stock photos). */

import { docsUrl } from "../config";
import { ExternalLink, Link } from "../lib/router";
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

export function LearnCards({ job }: { job?: JobRow }) {
  // Learn AI: topics the job mentions first.
  const text = [job?.title, ...(job?.analysis?.coreSkills || []).map((k) => (typeof k === "string" ? k : (k as { name?: string })?.name || "")), ...(job?.analysis?.technologies || [])].join(" ");
  const learn: Card[] = TOPICS
    .map((t, i) => ({ t, i, hit: !!text && t.words.test(text) }))
    .sort((a, b) => Number(b.hit) - Number(a.hit) || a.i - b.i)
    .map(({ t, hit }) => ({ key: t.slug, art: t.art, tag: (hit ? "In your job · " : "") + t.min + " min read", title: t.title, line: t.line, cta: "Read", href: docsUrl("GenAI-Topics/" + t.slug + "/index.html"), hot: hit }));

  return (
    <>
      <Link className="tdy-group tdy-grow lrn-entry rm-entry" to="/learn/roadmap">
        <span className="tdy-text"><strong>12-week AI roadmap</strong><span>What to learn, build and practise each week, for AI engineer or FDE</span></span>
        <span className="tdy-chev" aria-hidden="true">›</span>
      </Link>
      <Row id="ic-learn" title="Learn AI" sub="Short reads from the study library" cards={learn} />
      <Link className="tdy-group tdy-grow lrn-entry" to="/learn">
        <span className="tdy-text"><strong>Keep up with AI</strong><span>News and free courses from Anthropic, OpenAI, LangChain and more</span></span>
        <span className="tdy-chev" aria-hidden="true">›</span>
      </Link>
    </>
  );
}
