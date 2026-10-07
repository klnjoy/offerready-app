/* Sample Readiness Walkthrough — the "See Example" page (was
 * content/Sample-Walkthrough/index.md + content/assets/walkthrough.js).
 * Guided step-through of Job → Analyze → Readiness → Prepare → Track on
 * clearly labeled sample data. The plan checklist is saved in the browser. */

import { useState, type ReactNode } from "react";
import { docsUrl } from "../config";
import { logActivity } from "../lib/progressStore";
import { ExternalLink, Link } from "../lib/router";
import { readJSON, writeJSON } from "../lib/storage";

const PLAN_KEY = "walkthrough_plan_v1";

interface PlanStep { id: string; label: string; why: string; links: [string, string][] }

const PLAN: PlanStep[] = [
  { id: "p1", label: "Priority 1 — AWS Bedrock + production agents",
    why: "The biggest gap: the role explicitly requires production GenAI on Bedrock and agents.",
    links: [["Bedrock", "GenAI-Topics/bedrock/index.html"], ["Agents deep-dive", "GenAI-Topics/agent-principles/index.html"]] },
  { id: "p2", label: "Priority 2 — System design at Staff level",
    why: "Architect roles are graded on end-to-end design and named trade-offs, not components.",
    links: [["Requirements → Production", "Personal-SourceCode/Interview_Requirements_to_Production.html"]] },
  { id: "p3", label: "Priority 3 — Reliability, cost & operations",
    why: "“Own reliability and cost at scale” is in the JD.",
    links: [["Observability", "GenAI-Topics/observability/index.html"], ["Cost Optimization", "GenAI-Topics/cost-optimization/index.html"]] },
  { id: "p4", label: "Priority 4 — Customer-facing (FDE) + behavioral",
    why: "“Work directly with customers to turn ambiguous needs into shipped solutions.”",
    links: [["FDE path", "Personal-SourceCode/Path_FDE.html"], ["Behavioral / STAR", "Personal-SourceCode/Behavioral_STAR_Interview_QA.html"]] },
];

const READINESS: [string, "strong" | "partial" | "gap", string][] = [
  ["Resume alignment", "partial", "Bedrock/agent production wording, scale metrics"],
  ["Technical skills", "partial", "Bedrock + agent production depth"],
  ["Relevant experience", "strong", "Frame at architect scope"],
  ["System design", "gap", "End-to-end + trade-offs at Staff level"],
  ["Interview preparation", "partial", "Role-specific banks"],
  ["Behavioral / FDE", "partial", "FDE customer framing"],
];
const STATUS_LABEL = { strong: "Strong", partial: "Partial", gap: "Gap" };
const STATUS_PILL = { strong: "ok", partial: "warn", gap: "gap" };

const SIGNALS: [string, string[]][] = [
  ["Core skills", ["Python (production-grade)", "AWS (esp. Bedrock)", "RAG — retrieval design + tuning", "Agents — tool use, orchestration", "System design (GenAI at scale)"]],
  ["Technology signals", ["AWS Bedrock — managed models, guardrails", "Kubernetes — serving / scaling", "Snowflake — governed data (a plus)", "Observability / LLMOps"]],
  ["Experience signals", ["Production AI apps, not prototypes", "Reliability + cost ownership at scale", "Customer-facing delivery (FDE)", "Setting patterns (Staff/Principal)"]],
  ["Interview signals", ["System-design rounds", "“Defend your decisions” follow-ups", "Production-incident troubleshooting", "Behavioral: ambiguity, influence"]],
];

interface Stage { tag: string; title: string; body: ReactNode }

export default function ExamplePage() {
  const [i, setI] = useState(0);
  const [done, setDone] = useState<Record<string, boolean>>(() => readJSON(PLAN_KEY, {}));

  const toggle = (id: string, on: boolean) => {
    const d = { ...done, [id]: on };
    setDone(d);
    writeJSON(PLAN_KEY, d);
    logActivity({
      type: "walkthrough", label: "Sample readiness walkthrough", role: "AI Solutions Architect",
      gaps: PLAN.filter((p) => !d[p.id]).map((p) => p.label),
    });
  };
  const doneCount = PLAN.filter((p) => done[p.id]).length;

  const STAGES: Stage[] = [
    { tag: "1 · The job", title: "Start with the job, not the content", body: (
      <>
        <p><strong>Sample role {"—"} AI Solutions Architect (Staff/Principal, Forward-Deployed).</strong></p>
        <blockquote className="jd-quote">
          Design and ship production GenAI systems for enterprise customers. Architect RAG and agent applications on <strong>AWS (Bedrock)</strong>, own reliability and cost at scale, work directly with customers to turn ambiguous needs into shipped solutions. Requires <strong>Python, AWS, RAG/agents, system design</strong>, and production experience. Snowflake and Kubernetes a plus.
        </blockquote>
        <p className="muted">The idea: most prep starts with {"“"}study everything.{"”"} OfferReady starts with <em>this</em> role {"—"} what it requires, where the gaps are, and what to prepare specifically.</p>
      </>
    ) },
    { tag: "2 · Job analysis", title: "Extract what the description actually signals", body: (
      <div className="signal-grid">
        {SIGNALS.map(([h, items]) => (
          <div key={h} className="signal-card">
            <h4>{h}</h4>
            <ul>{items.map((x) => <li key={x}>{x}</li>)}</ul>
          </div>
        ))}
      </div>
    ) },
    { tag: "3 · Readiness", title: "Score honestly across six dimensions", body: (
      <>
        <p className="muted">Descriptive, not predictive {"—"} it shows what a strong candidate for <em>this</em> role demonstrates, so you know where to focus. Sample profile: strong Python + AWS + RAG; lighter on Bedrock production, K8s serving, Staff-level system design.</p>
        <div className="table-wrap">
          <table>
            <thead><tr><th>Dimension</th><th>Status</th><th>Likely gap</th></tr></thead>
            <tbody>
              {READINESS.map(([d, s, g]) => (
                <tr key={d}><td>{d}</td><td><span className={"pill pill-" + STATUS_PILL[s]}>{STATUS_LABEL[s]}</span></td><td>{g}</td></tr>
              ))}
            </tbody>
          </table>
        </div>
      </>
    ) },
    { tag: "4 · Prepare", title: "Turn gaps into an ordered plan", body: (
      <>
        <p className="muted">Tick these off as you go {"—"} saved in this browser. Each links to real study material. <strong>{doneCount} of {PLAN.length}</strong> done.</p>
        <div className="plan-list">
          {PLAN.map((p) => (
            <div key={p.id} className={"plan-item" + (done[p.id] ? " plan-done" : "")}>
              <label className="check plan-check">
                <input type="checkbox" checked={!!done[p.id]} onChange={(e) => toggle(p.id, e.target.checked)} />
                <span>{p.label}</span>
              </label>
              <p className="muted small">{p.why}</p>
              <p className="small">
                {p.links.map(([l, href], k) => (
                  <span key={href}>{k > 0 && " · "}<ExternalLink href={docsUrl(href)}>{l}</ExternalLink></span>
                ))}
              </p>
            </div>
          ))}
        </div>
      </>
    ) },
    { tag: "5 · Track", title: "Watch readiness move as you work the plan", body: (
      <>
        <p>In this sample, readiness moves from mostly Partial and Gap to Strong as you complete the plan. For your own job, readiness is tracked per job on your <Link to="/dashboard">Readiness dashboard</Link>.</p>
        <p className="muted">This walkthrough uses fixed <strong>sample data</strong>. To do it for real, paste your own job description into <Link to="/analyze">Analyze a Job</Link> {"—"} it generates your readiness and plan automatically.</p>
      </>
    ) },
  ];

  const s = STAGES[i];
  const last = i === STAGES.length - 1;

  return (
    <div className="page">
      <div className="demo-banner">
        <strong>Sample walkthrough {"—"} demonstration only.</strong> A worked example showing how OfferReady maps a real job to a focused preparation plan. The job, profile and readiness are illustrative; nothing here analyzes <em>your</em> resume.
      </div>

      <ol className="wt-steps" aria-label="Walkthrough steps">
        {STAGES.map((st, k) => (
          <li key={st.tag}>
            <button type="button" className={"wt-step" + (k === i ? " active" : "") + (k < i ? " done" : "")}
              aria-current={k === i ? "step" : undefined} onClick={() => setI(k)}>
              <span className="wt-dot">{k < i ? "✓" : k + 1}</span>
              <span className="wt-label">{st.tag.replace(/^\d+ · /, "")}</span>
            </button>
          </li>
        ))}
      </ol>

      <div className="card wt-card">
        <span className="topic">{s.tag}</span>
        <h2>{s.title}</h2>
        {s.body}
      </div>

      <div className="row">
        {i > 0 && <button type="button" className="btn btn-ghost" onClick={() => setI(i - 1)}>{"←"} Back</button>}
        {!last ? (
          <button type="button" className="btn btn-primary" onClick={() => setI(i + 1)}>Next {"→"}</button>
        ) : (
          <>
            <Link className="btn btn-primary" to="/analyze">Analyze your own job {"→"}</Link>
            <button type="button" className="btn btn-ghost" onClick={() => setI(0)}>Restart walkthrough</button>
          </>
        )}
      </div>
    </div>
  );
}
