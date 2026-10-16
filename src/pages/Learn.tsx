/* Keep up with AI: a short, curated list of OUTSIDE sources (news, free
 * courses from the companies that build the tools, and the topics
 * interviewers ask about), plus a weekly habit that turns reading into an
 * interview answer with the AI Coach. None of this is our content: every
 * link goes to the original source. Reviewed: October 2026. */

import { getActiveJob } from "../lib/readiness";
import { ExternalLink, Link } from "../lib/router";
import { Art, type ArtKey } from "../components/Art";

type Res = { name: string; by: string; line: string; href: string; tag?: string };

const NEWS: Res[] = [
  { name: "Anthropic news", by: "Anthropic", line: "Claude model releases, research and product updates.", href: "https://www.anthropic.com/news" },
  { name: "OpenAI news", by: "OpenAI", line: "GPT model releases, research and product updates.", href: "https://openai.com/news/" },
  { name: "Google DeepMind", by: "Google", line: "Gemini models and research news from Google.", href: "https://deepmind.google/" },
  { name: "LangChain blog", by: "LangChain", line: "What teams are building with agents, and LangGraph releases.", href: "https://blog.langchain.com/" },
  { name: "Hugging Face blog", by: "Hugging Face", line: "Open models, datasets and how-tos from the open-source side.", href: "https://huggingface.co/blog" },
  { name: "Simon Willison’s weblog", by: "Independent", line: "Hands-on, plain-English notes on every big LLM release.", href: "https://simonwillison.net/" },
];

const COURSES: Res[] = [
  { name: "Anthropic Academy", by: "Anthropic", line: "Free courses on Claude, the API, MCP and Claude Code.", href: "https://anthropic.com/learn", tag: "Free" },
  { name: "OpenAI Academy", by: "OpenAI", line: "Free courses and workshops on using and building with OpenAI models.", href: "https://academy.openai.com/", tag: "Free" },
  { name: "Introduction to LangGraph", by: "LangChain Academy", line: "Build agents as graphs: state, memory, human-in-the-loop. About 6 to 8 hours.", href: "https://academy.langchain.com/", tag: "Free" },
  { name: "LLM Course", by: "Hugging Face", line: "Transformers, tokenizers and fine-tuning, chapter by chapter.", href: "https://huggingface.co/learn/llm-course/chapter1/1", tag: "Free" },
  { name: "Short courses", by: "DeepLearning.AI", line: "One-hour courses on agents, RAG, evals and more, often with the tool makers.", href: "https://www.deeplearning.ai/short-courses/", tag: "Free" },
];

const TOPICS: { key: string; art: ArtKey; title: string; why: string; ask: string; links: Res[] }[] = [
  { key: "tokens", art: "llm", title: "Tokenization", why: "Why cost, context limits and odd model mistakes all come back to tokens.",
    ask: "Explain tokenization and why it matters for cost and context length in an LLM app.",
    links: [
      { name: "Let’s build the GPT tokenizer", by: "Andrej Karpathy (video)", line: "Builds byte-pair encoding from scratch, about 2 hours.", href: "https://www.youtube.com/watch?v=zduSFxRajkE" },
      { name: "Tokenizers chapter", by: "Hugging Face", line: "BPE, WordPiece and Unigram, with code.", href: "https://huggingface.co/learn/llm-course/chapter6/1" },
      { name: "Tiktokenizer", by: "Playground", line: "Paste text and see exactly how a model splits it.", href: "https://tiktokenizer.vercel.app/" },
    ] },
  { key: "agents", art: "agent", title: "Agentic AI", why: "The fastest-growing skill employers ask for: models that plan, use tools and act.",
    ask: "When would you build an agent instead of a simple workflow, and how do you keep it reliable?",
    links: [
      { name: "Building effective agents", by: "Anthropic", line: "When to use workflows vs agents, and the patterns that work.", href: "https://www.anthropic.com/engineering/building-effective-agents" },
      { name: "Effective context engineering for agents", by: "Anthropic", line: "What to put in an agent’s context, and what to leave out.", href: "https://www.anthropic.com/engineering/effective-context-engineering-for-ai-agents" },
      { name: "LangGraph docs", by: "LangChain", line: "Graphs, state, memory and human-in-the-loop for agents.", href: "https://docs.langchain.com/oss/python/langgraph/overview" },
      { name: "OpenAI Cookbook", by: "OpenAI", line: "Worked examples: tool calling, agents, evals.", href: "https://cookbook.openai.com/" },
    ] },
  { key: "mcp", art: "mcp", title: "MCP", why: "The open standard for connecting AI apps to tools and data. Comes up in agent interviews.",
    ask: "What is the Model Context Protocol and what problem does it solve?",
    links: [
      { name: "Model Context Protocol", by: "modelcontextprotocol.io", line: "The spec, concepts and quick-starts.", href: "https://modelcontextprotocol.io/" },
    ] },
  { key: "prompt", art: "prompt", title: "Prompting and Claude", why: "Clear instructions, examples and structure: the base skill for every AI role.",
    ask: "How do you make an LLM’s output reliable enough for production?",
    links: [
      { name: "Prompt engineering guide", by: "Claude docs", line: "Anthropic’s own techniques, with examples.", href: "https://docs.claude.com/en/docs/build-with-claude/prompt-engineering/overview" },
      { name: "Claude developer docs", by: "Anthropic", line: "Models, tool use, prompt caching and more.", href: "https://docs.claude.com/" },
    ] },
];

const coach = (q: string, job: string) => "/coach?" + (job ? "job=" + encodeURIComponent(job) + "&" : "") + "q=" + encodeURIComponent(q);

function List({ items }: { items: Res[] }) {
  return (
    <ul className="tdy-group lrn-list">
      {items.map((r) => (
        <li key={r.href}>
          <ExternalLink className="tdy-grow" href={r.href}>
            <span className="tdy-text">
              <strong>{r.name}</strong>
              <span className="lrn-by">{r.by}</span>
              <span className="lrn-line">{r.line}</span>
            </span>
            {r.tag ? <span className="tdy-pill">{r.tag}</span> : null}
            <span className="tdy-chev" aria-hidden="true">↗</span>
          </ExternalLink>
        </li>
      ))}
    </ul>
  );
}

export default function LearnPage() {
  const job = getActiveJob() || "";
  return (
    <div className="page lrn">
      <section className="tses lrn-hero" aria-labelledby="lrn-why">
        <span className="tses-eyebrow">Why it matters</span>
        <h2 id="lrn-why">Interviewers ask what’s new. Ten minutes a week keeps you ready.</h2>
        <p className="lrn-hero-p">
          Employers mostly want people who use AI well in the job they already do, and agentic AI is the
          fastest-growing skill they ask for (<ExternalLink href="https://oodaloop.com/briefs/technology/the-ai-skills-employers-actually-want-in-2026/">Forbes, Aug 2026</ExternalLink>).
          For the bigger picture, see the <ExternalLink href="https://hai.stanford.edu/ai-index">Stanford AI Index</ExternalLink>.
        </p>
        <Link className="btn tses-btn" to={coach("What’s a recent development in AI that you find interesting, and why does it matter for this role?", job)}>
          Practise “What’s new in AI?” <span aria-hidden="true">→</span>
        </Link>
      </section>

      <section className="tdy" aria-labelledby="lrn-habit">
        <div className="tdy-head"><h2 id="lrn-habit">Your weekly habit</h2><span className="small muted">10 to 15 minutes</span></div>
        <ol className="lrn-steps">
          <li><strong>Read one thing</strong><span>Pick one post from the news below.</span></li>
          <li><strong>Say it in two minutes</strong><span>What changed, why it matters, what you’d do with it.</span></li>
          <li><strong>Practise it with the Coach</strong><span>Turn it into an answer built from your own experience.</span></li>
        </ol>
      </section>

      <section className="tdy" aria-labelledby="lrn-news">
        <div className="tdy-head"><h2 id="lrn-news">News from the source</h2><span className="small muted">Follow weekly</span></div>
        <List items={NEWS} />
      </section>

      <section className="tdy" aria-labelledby="lrn-courses">
        <div className="tdy-head"><h2 id="lrn-courses">Free courses from the makers</h2></div>
        <List items={COURSES} />
      </section>

      <section className="tdy" aria-labelledby="lrn-topics">
        <div className="tdy-head"><h2 id="lrn-topics">Topics interviewers ask about</h2></div>
        {TOPICS.map((t) => (
          <article key={t.key} className="lrn-topic" aria-labelledby={"lrn-t-" + t.key}>
            <div className="lrn-topic-head">
              <Art k={t.art} className="pl-art" />
              <div>
                <h3 id={"lrn-t-" + t.key}>{t.title}</h3>
                <p className="small muted">{t.why}</p>
              </div>
            </div>
            <List items={t.links} />
            <Link className="lrn-ask" to={coach(t.ask, job)}>Practise: “{t.ask}” <span aria-hidden="true">→</span></Link>
          </article>
        ))}
      </section>

      <p className="small muted lrn-foot">
        These are outside sources we picked because they come from the people building the tools. Reviewed October 2026.
        Learning is for interview practice, never for use during a live interview.
      </p>
    </div>
  );
}
