/* 12-week AI roadmap (/learn/roadmap): what to study each week to become an
 * AI engineer or a forward deployed engineer, written as interview prep.
 * Every week has three parts: Learn (outside sources from the companies that
 * build the tools), Build (one small project you can talk about), and
 * Practise (questions an interviewer asks about that week, opened in the AI
 * Coach, plus one OfferReady practice mode). Weeks 1-8 are shared; weeks
 * 9-12 depend on the track. Ticks are kept on this device. Reviewed Oct 2026. */

import { useState } from "react";
import { getActiveJob } from "../lib/readiness";
import { ExternalLink, Link } from "../lib/router";
import { readJSON, writeJSON } from "../lib/storage";
import { docsUrl } from "../config";

type L = { name: string; by: string; href: string };
type Week = { t: string; learn: string[]; links: L[]; build: string; ask: string[]; app?: { label: string; to: string } };
type Track = "aie" | "fde";

const KEY = "offerready.roadmap.v1";
const lk = (name: string, by: string, href: string): L => ({ name, by, href });

const SHARED: Week[] = [
  { t: "How LLMs work",
    learn: ["Tokens, context windows and why they decide cost", "Embeddings in one sentence", "Temperature and why answers vary", "Pricing: input, output and cached tokens"],
    links: [lk("LLM Course, chapter 1", "Hugging Face", "https://huggingface.co/learn/llm-course/chapter1/1"), lk("Tiktokenizer", "Playground", "https://tiktokenizer.vercel.app/"), lk("Let’s build the GPT tokenizer", "Andrej Karpathy (video)", "https://www.youtube.com/watch?v=zduSFxRajkE")],
    build: "Call an LLM API from a script. Print the tokens used and the cost of each call.",
    ask: ["Explain tokenization to a non-technical customer.", "Why does a longer prompt cost more, and how would you keep it down?"] },
  { t: "Prompting and structured output",
    learn: ["System prompts, examples (few-shot) and clear instructions", "Getting reliable JSON back", "Why small prompt changes break things"],
    links: [lk("Prompt engineering guide", "Claude docs", "https://docs.claude.com/en/docs/build-with-claude/prompt-engineering/overview"), lk("OpenAI Academy", "OpenAI", "https://academy.openai.com/")],
    build: "Turn messy job posts into clean JSON (title, skills, years). Test it on 10 real posts.",
    ask: ["How do you make an LLM’s output reliable enough for production?", "How do you handle a model that returns invalid JSON?"] },
  { t: "Embeddings and search",
    learn: ["Chunking text and why chunk size matters", "Similarity search and vector databases", "Hybrid search: keywords plus embeddings"],
    links: [lk("Short courses (RAG, embeddings)", "DeepLearning.AI", "https://www.deeplearning.ai/short-courses/"), lk("OpenAI Cookbook", "OpenAI", "https://cookbook.openai.com/")],
    build: "Semantic search over your own notes or docs. Compare it with plain keyword search.",
    ask: ["When would keyword search beat embeddings?", "How do you choose a chunk size?"] },
  { t: "RAG end to end",
    learn: ["Retrieve, add to the prompt, answer with citations", "Why RAG answers go wrong (bad retrieval, stale data)", "Context engineering: what to include and what to leave out"],
    links: [lk("Effective context engineering for agents", "Anthropic", "https://www.anthropic.com/engineering/effective-context-engineering-for-ai-agents"), lk("Short courses", "DeepLearning.AI", "https://www.deeplearning.ai/short-courses/")],
    build: "A Q&A bot over a set of documents that cites the passage it used.",
    ask: ["Your RAG system gives confident wrong answers. How do you debug it?", "RAG or a bigger context window: how do you decide?"],
    app: { label: "Defend a design under follow-ups", to: "/defend" } },
  { t: "Evals: proving it works",
    learn: ["Golden test sets", "LLM-as-judge and its limits", "Catching regressions before users do"],
    links: [lk("OpenAI Cookbook (evals)", "OpenAI", "https://cookbook.openai.com/"), lk("Short courses (evals)", "DeepLearning.AI", "https://www.deeplearning.ai/short-courses/")],
    build: "Write 30 test questions for your week 4 bot, score it, change one thing, score it again.",
    ask: ["How do you know a prompt change made things better?", "How would you evaluate an LLM feature with no labelled data?"] },
  { t: "Agents and tool use",
    learn: ["Tool (function) calling", "Workflows vs agents, and when an agent is the wrong choice", "MCP: connecting models to tools and data", "Guardrails and human approval"],
    links: [lk("Building effective agents", "Anthropic", "https://www.anthropic.com/engineering/building-effective-agents"), lk("Model Context Protocol", "modelcontextprotocol.io", "https://modelcontextprotocol.io/"), lk("Anthropic Academy", "Anthropic", "https://anthropic.com/learn")],
    build: "An agent with two tools (for example search and a calculator) that asks before any action.",
    ask: ["When would you build an agent instead of a simple workflow?", "What is MCP and what problem does it solve?"] },
  { t: "Frameworks: LangChain and LangGraph",
    learn: ["Graphs, state and memory", "Human-in-the-loop steps", "When to skip a framework and write plain code"],
    links: [lk("Introduction to LangGraph", "LangChain Academy", "https://academy.langchain.com/"), lk("LangGraph docs", "LangChain", "https://docs.langchain.com/oss/python/langgraph/overview")],
    build: "Rebuild your week 6 agent as a LangGraph graph with an approval step.",
    ask: ["Framework or plain code: how do you choose?", "How do you give an agent memory without blowing up the context?"] },
  { t: "Production: cost, speed, safety",
    learn: ["Prompt caching and batching", "Latency budgets and streaming", "Logging and tracing every call", "Prompt injection and personal data"],
    links: [lk("Prompt caching", "Claude docs", "https://docs.claude.com/en/docs/build-with-claude/prompt-caching"), lk("Batch processing", "Claude docs", "https://docs.claude.com/en/docs/build-with-claude/batch-processing"), lk("Token counting", "Claude docs", "https://docs.claude.com/en/docs/build-with-claude/token-counting")],
    build: "Add cost per request, caching and a log of every call to your project. Cut its cost and write down by how much.",
    ask: ["How would you cut the cost of an LLM feature in half without hurting quality?", "How do you protect an LLM app from prompt injection?"],
    app: { label: "Defend a design under follow-ups", to: "/defend" } },
];

const TRACK_END: Record<Track, Week[]> = {
  aie: [
    { t: "Fine-tuning vs RAG vs prompting",
      learn: ["What fine-tuning changes and what it can’t", "Smaller, cheaper models for narrow jobs", "Choosing with data, not taste"],
      links: [lk("LLM Course", "Hugging Face", "https://huggingface.co/learn/llm-course/chapter1/1"), lk("Claude developer docs", "Anthropic", "https://docs.claude.com/")],
      build: "Try one task three ways (prompt only, RAG, a smaller model). Compare quality, cost and speed in a table.",
      ask: ["When would you fine-tune instead of using RAG?", "How do you pick a model for a new feature?"] },
    { t: "System design for AI",
      learn: ["Design an AI support assistant end to end", "Data flow, evals, fallbacks and monitoring", "Trade-offs you must be able to defend"],
      links: [lk("Building effective agents", "Anthropic", "https://www.anthropic.com/engineering/building-effective-agents")],
      build: "Draw the design of your project: components, data, evals, costs, what fails and what happens then.",
      ask: ["Design an AI assistant for customer support.", "How would your design change at 100 times the traffic?"],
      app: { label: "Defend a design under follow-ups", to: "/defend" } },
    { t: "Portfolio and your stories",
      learn: ["A README that shows the problem, the result and the numbers", "Turning projects into STAR stories"],
      links: [],
      build: "Publish one project with a short demo, your eval results and your cost numbers.",
      ask: ["Walk me through a project you’re proud of.", "Tell me about a time an AI feature didn’t work as planned."],
      app: { label: "Write your STAR stories", to: "/stories" } },
    { t: "Interview sprint",
      learn: ["Mock interviews, out loud", "Fix your weakest area", "Questions to ask them"],
      links: [],
      build: "Two voice mocks this week. Retry every answer that scored under 70.",
      ask: ["Tell me about yourself.", "Why this role, and why now?"],
      app: { label: "Take a voice mock interview", to: "/interview/voice" } },
  ],
  fde: [
    { t: "Customer discovery",
      learn: ["Understanding a customer’s workflow and pain", "Finding the data and systems involved", "Turning a vague ask into a scoped plan"],
      links: [],
      build: "Interview a friend about a repetitive task at work. Write a one-page scope: problem, data, success measure.",
      ask: ["Tell me about a time you turned a vague request into a clear plan.", "How do you find out what a customer actually needs?"],
      app: { label: "Write your STAR stories", to: "/stories" } },
    { t: "Solution architecture and integration",
      learn: ["Connecting to enterprise systems and APIs", "Permissions, security and data access", "Rolling out safely: pilot, monitor, expand"],
      links: [lk("Model Context Protocol", "modelcontextprotocol.io", "https://modelcontextprotocol.io/"), lk("Building effective agents", "Anthropic", "https://www.anthropic.com/engineering/building-effective-agents")],
      build: "Design how your week 6 agent would plug into a company’s tools (CRM, tickets, docs), including who can see what.",
      ask: ["Design an AI assistant that works inside a customer’s existing systems.", "A customer’s data is messy and siloed. What do you do first?"],
      app: { label: "Defend a design under follow-ups", to: "/defend" } },
    { t: "Communication and ownership",
      learn: ["Explaining trade-offs to non-technical people", "Short design docs and demos", "Handling pushback and owning outcomes"],
      links: [],
      build: "Record a 5-minute demo of your project for a non-technical manager. Write a one-page design doc.",
      ask: ["Explain a technical trade-off to a non-technical stakeholder.", "Tell me about a time a customer pushed back on your approach."] },
    { t: "Interview sprint",
      learn: ["Customer scenario questions", "System design out loud", "Your stories, tight"],
      links: [],
      build: "Two voice mocks this week. Retry every answer that scored under 70.",
      ask: ["Why forward deployed engineering?", "Tell me about yourself."],
      app: { label: "Take a voice mock interview", to: "/interview/voice" } },
  ],
};

const PHASES = [
  { from: 0, title: "Foundations", sub: "Weeks 1 to 4" },
  { from: 4, title: "Build like a pro", sub: "Weeks 5 to 8" },
  { from: 8, title: "Get hired", sub: "Weeks 9 to 12" },
];

type Saved = { track: Track; done: Record<string, boolean> };
const load = (): Saved => {
  const v = readJSON<Saved>(KEY, { track: "aie", done: {} });
  return { track: v && v.track === "fde" ? "fde" : "aie", done: (v && v.done) || {} };
};

export default function RoadmapPage() {
  const [s, setS] = useState<Saved>(load);
  const save = (n: Saved) => { setS(n); writeJSON(KEY, n); };
  const job = getActiveJob() || "";
  const weeks = [...SHARED, ...TRACK_END[s.track]];
  const id = (i: number) => (i < 8 ? "w" + (i + 1) : s.track + (i + 1));
  const doneN = weeks.filter((_, i) => s.done[id(i)]).length;
  const current = Math.max(0, weeks.findIndex((_, i) => !s.done[id(i)]));
  const allDone = doneN === weeks.length;
  const coach = (q: string) => "/coach?" + (job ? "job=" + encodeURIComponent(job) + "&" : "") + "q=" + encodeURIComponent(q);

  return (
    <div className="page rm">
      <section className="tses rm-hero" aria-labelledby="rm-h">
        <span className="tses-eyebrow">12 weeks · about 1 hour a day</span>
        <h2 id="rm-h">{allDone ? "Roadmap done. Keep your answers sharp." : "Week " + (current + 1) + ": " + weeks[current].t}</h2>
        <div className="tses-segs" aria-hidden="true">{weeks.map((_, i) => <span key={i} className={s.done[id(i)] ? "on" : ""} />)}</div>
        <p className="rm-hero-p">Each week: learn it, build one small thing, then practise the questions interviewers ask about it. What you build becomes your interview stories.</p>
        <div className="rm-track" role="radiogroup" aria-label="Your target role">
          {([["aie", "AI engineer"], ["fde", "Forward deployed engineer"]] as const).map(([k, label]) => (
            <button key={k} type="button" role="radio" aria-checked={s.track === k} className={s.track === k ? "on" : ""} onClick={() => save({ ...s, track: k })}>{label}</button>
          ))}
        </div>
      </section>

      {s.track === "fde" && (
        <section className="tdy rm-about" aria-labelledby="rm-fde-h">
          <div className="tdy-head"><h2 id="rm-fde-h">What a forward deployed engineer does</h2></div>
          <ul className="tdy-group rm-facts">
            <li><strong>The job.</strong> Take a vague customer problem, build working software inside the customer{"’"}s systems, and explain it to people who don{"’"}t write code. Part engineer, part architect, part consultant.</li>
            <li><strong>The interviews.</strong> Discovery questions, practical coding against messy data, a customer scenario design, live debugging, a demo, and behavioral rounds. <ExternalLink href={docsUrl("For/forward-deployed-engineers/index.html")}>How FDE interviews work</ExternalLink></li>
            <li><strong>Who{"’"}s hiring.</strong> AI labs, data and AI platform companies, and enterprise software firms. Openings change weekly. <Link to="/roles?family=fde">See open FDE roles, updated daily ›</Link></li>
            <li><strong>Pay.</strong> It varies widely by company, level and location. Treat {"“"}$500K to $1M{"”"} posts as the very top of the market, not the norm.</li>
          </ul>
        </section>
      )}

      {PHASES.map((ph, pi) => (
        <section key={ph.title} className="tdy rm-phase" aria-labelledby={"rm-p" + pi}>
          <div className="tdy-head"><h2 id={"rm-p" + pi}>{ph.title}</h2><span className="small muted">{ph.sub}{pi === 2 ? (s.track === "fde" ? " · FDE track" : " · AI engineer track") : ""}</span></div>
          <ol className="rm-weeks">
            {weeks.slice(ph.from, ph.from + 4).map((w, k) => {
              const i = ph.from + k; const done = !!s.done[id(i)];
              return (
                <li key={id(i)}>
                  <details className={"rm-week" + (done ? " is-done" : "")} open={i === current && !allDone}>
                    <summary>
                      <span className="rm-n" aria-hidden="true">{done ? "✓" : i + 1}</span>
                      <span className="rm-t"><span className="rm-wk">Week {i + 1}</span><strong>{w.t}</strong></span>
                      {i === current && !allDone ? <span className="tdy-pill">This week</span> : null}
                    </summary>
                    <div className="rm-body">
                      <div className="rm-part">
                        <span className="field-label">Learn</span>
                        <ul className="rm-learn">{w.learn.map((x) => <li key={x}>{x}</li>)}</ul>
                        {w.links.length > 0 && (
                          <ul className="rm-links">
                            {w.links.map((l) => <li key={l.href + l.name}><ExternalLink href={l.href}>{l.name}</ExternalLink> <span className="small muted">· {l.by}</span></li>)}
                          </ul>
                        )}
                      </div>
                      <div className="rm-part">
                        <span className="field-label">Build</span>
                        <p>{w.build}</p>
                      </div>
                      <div className="rm-part">
                        <span className="field-label">Practise</span>
                        <ul className="rm-ask">
                          {w.ask.map((q) => <li key={q}><Link to={coach(q)}>{q}</Link></li>)}
                          {w.app && <li className="rm-app"><Link to={w.app.to}>{w.app.label} ›</Link></li>}
                        </ul>
                      </div>
                      <button type="button" className={"btn " + (done ? "btn-ghost" : "btn-primary")} onClick={() => save({ ...s, done: { ...s.done, [id(i)]: !done } })}>
                        {done ? "Mark as not done" : "Mark week " + (i + 1) + " done"}
                      </button>
                    </div>
                  </details>
                </li>
              );
            })}
          </ol>
        </section>
      ))}

      <p className="small muted lrn-foot">
        {doneN} of 12 weeks done. Ticks are saved on this device. Behind? Keep going at your own pace; finishing beats speed.
        Courses and docs are outside sources, reviewed October 2026. No course or roadmap guarantees a job or a salary.
        Practice only, never during a live interview.
      </p>
    </div>
  );
}
