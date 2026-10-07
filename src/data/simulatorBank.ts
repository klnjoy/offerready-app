/* Master Interview Simulator question bank. Extracted verbatim from
 * content/assets/simulator.js. */

export interface SimItem {
  area: string; topic: string; level: "Senior" | "Staff" | "Principal" | "FDE";
  q: string; tested: string; strong: string[]; weak: string[]; followup: string; depth: string;
}

export const SIM_BANK: SimItem[] = [
  { area: "AI fundamentals & LLMs", topic: "LLMs", level: "Senior",
    q: "RAG vs fine-tuning — when do you use each?",
    tested: "Grounding vs training judgment.",
    strong: [
      "RAG for factual / fresh / cited knowledge — you update the index, not the weights.",
      "Fine-tune for behavior, format, or style, not for adding knowledge.",
      "Names the freshness / provenance trade-off; knows they can be combined.",
    ],
    weak: ['"Fine-tune to add knowledge"; no trade-off; treats them as interchangeable.'],
    followup: "Docs change hourly — which do you pick? → RAG + incremental re-index.",
    depth: "Should reach eval: how you'd measure which is better." },

  { area: "AI fundamentals & LLMs", topic: "LLMs", level: "Staff",
    q: "How do you choose a model per request in production?",
    tested: "Cost / quality / latency trade-off at scale.",
    strong: [
      "Model routing — cheap model for easy requests, strong model for hard ones.",
      "Justified by an eval set per request class; fallback on failure.",
      "Safe upgrades: pin → eval → canary before flipping traffic.",
    ],
    weak: ['"Use the best model" (ignores cost/latency); no eval.'],
    followup: "How do you classify a request as 'hard'? → cheap classifier / heuristic validated against outcomes.",
    depth: "Ties routing to measured cost/quality, not vibes." },

  { area: "RAG", topic: "RAG", level: "Senior",
    q: "Design a RAG assistant over internal docs.",
    tested: "The full retrieval pipeline.",
    strong: [
      "Chunk (semantic) → embed → hybrid search → rerank → assemble within budget.",
      "Answer only from context, with citations; per-user access enforced at retrieval.",
      "An eval set covering recall@k + faithfulness.",
    ],
    weak: ['"Embed and search" with no hybrid/rerank/eval; no citations; no access control.'],
    followup: "It cites the wrong doc — where do you look? → retrieval problem first; log the top-k.",
    depth: "Separates retrieval eval from answer eval." },

  { area: "RAG", topic: "RAG", level: "Staff",
    q: "Retrieval quality dropped after an ingestion change. Diagnose it.",
    tested: "Operating RAG in production.",
    strong: [
      "Correlate the drop with the change; inspect top-k for affected queries.",
      "Check chunking / embedding / index; roll back the change.",
      "Add retrieval eval in CI so it can't regress silently again.",
    ],
    weak: ["Tweaks the prompt (it's a retrieval bug); no eval gate."],
    followup: "Answers are grounded but wrong — cause? → retrieval miss, not prompting.",
    depth: "Names recall@k as the gating metric." },

  { area: "Agents & MCP", topic: "Agents", level: "Senior",
    q: "When do you use an agent vs a fixed pipeline?",
    tested: "Knowing agents add cost and risk.",
    strong: [
      "Agent when the path depends on intermediate results.",
      "Fixed chain when the steps are known — cheaper and more reliable.",
      "Always bound the loop.",
    ],
    weak: ['"Agents for everything"; no bounds.'],
    followup: "How do you stop a runaway loop? → step cap + repeated-action detection + budget.",
    depth: "Should mention eval (outcome + trajectory)." },

  { area: "Agents & MCP", topic: "Agents", level: "Staff",
    q: "Design an agent that can take destructive actions safely.",
    tested: "Least privilege + gating.",
    strong: [
      "Read tools open; write tools go propose → validate (server-side) → approve.",
      "Idempotency keys; bounded loop; full audit trail.",
      "Treat tool output text as data, never as instructions.",
    ],
    weak: ["A broad tool with a `mode` arg; trusts the model to self-limit."],
    followup: "Tool output says 'ignore instructions' — what now? → injection; it's gated regardless.",
    depth: "The LLM proposes, a deterministic layer executes." },

  { area: "Agents & MCP", topic: "MCP / Security", level: "Staff",
    q: "How do you secure third-party MCP servers?",
    tested: "AI supply-chain security.",
    strong: [
      "Allowlist; pin/sign and re-review on change (rug pull / tool poisoning).",
      "Least-privilege short-lived creds inside the server; sandbox + egress allowlist.",
      "Audit everything; treat tool descriptions as untrusted.",
    ],
    weak: ['"Just connect trusted servers"; no version pinning; creds in the prompt.'],
    followup: "How would you detect exfiltration? → egress allowlist + audit + DLP.",
    depth: "Distinguishes tool-poisoning from a malicious server." },

  { area: "Security", topic: "AI Security", level: "Staff",
    q: "What's your top security concern for an agent, and how do you contain it?",
    tested: "Prompt-injection understanding.",
    strong: [
      "Indirect prompt injection via retrieved / tool content is the top risk.",
      "Contain with architecture: least-privilege gated tools, output guardrails, egress control.",
      "Not with prompt wording — that's not a control.",
    ],
    weak: ['Only mentions direct injection; "tell the model to ignore bad input."'],
    followup: "Why gate even with guardrails? → defense in depth; guardrails have false negatives.",
    depth: "Reaches detect / respond (audit, kill switch)." },

  { area: "Data & cloud", topic: "Snowflake", level: "Senior",
    q: "A dashboard got slow after data grew 10x (Snowflake). Diagnose it.",
    tested: "Query performance.",
    strong: [
      "Read the Query Profile: poor pruning (cluster on the filter column).",
      "Spill to disk (size up the warehouse); exploding joins (check grain).",
      "Verify from QUERY_HISTORY, don't guess.",
    ],
    weak: ['"Add an index" (Snowflake has none); guesses without the profile.'],
    followup: "Why cluster, not index? → micro-partition pruning is the mechanism.",
    depth: "Knows clustering has a cost and when it doesn't pay off." },

  { area: "Data & cloud", topic: "Spark", level: "Senior",
    q: "A Spark job passes on a sample but hangs at scale.",
    tested: "Distributed-data debugging.",
    strong: [
      "Data skew in a shuffle; Spark UI shows one lagging task.",
      "Fix with AQE skew-join / broadcast / salting.",
      "Check partition sizing and spill.",
    ],
    weak: ['"Add more memory/executors" without diagnosing skew.'],
    followup: "What is a shuffle? → cross-network redistribution; the expensive part.",
    depth: "Picks the cheapest fix first (AQE/broadcast before salt)." },

  { area: "Data & cloud", topic: "Pipelines", level: "Staff",
    q: "Design a near-real-time Oracle → warehouse pipeline with history.",
    tested: "Pipeline system design.",
    strong: [
      "Log-based CDC → staging → idempotent MERGE to current + timestamped history (SCD2).",
      "Quality gates; dead-letter queue; lookback window for late data.",
    ],
    weak: ["Query-based CDC (misses deletes); blind inserts (dupes on retry)."],
    followup: "No reliable updated_at column? → log-based CDC.",
    depth: "Idempotency + late-arriving data handled explicitly." },

  { area: "Production, ops & reliability", topic: "Reliability", level: "Staff",
    q: "One model provider goes down at peak. What happens?",
    tested: "Reliability design.",
    strong: [
      "Timeouts stop hangs; circuit breaker fails fast.",
      "Fallback to an alternate provider/region or a cheaper/cached answer.",
      "Backoff + jitter on retries; multi-provider config to prevent it.",
    ],
    weak: ['"Retry until it works" (thundering herd, no jitter, no fallback).'],
    followup: "Why jitter? → avoid a synchronized retry storm.",
    depth: "Distinguishes mitigate (now) from prevent (failover)." },

  { area: "Production, ops & reliability", topic: "AI CI/CD", level: "Staff",
    q: "A prompt change passed unit tests but answers got worse. How does CI catch it?",
    tested: "AI CI/CD.",
    strong: [
      "Unit tests can't see quality — you need a golden + regression eval as a gate.",
      "Plus an injection suite; canary + rollback.",
    ],
    weak: ['"Add more unit tests"; treats tests-pass as safe.'],
    followup: "Why regression on top of golden? → absolute scores can look fine while worse than prod.",
    depth: "Knows prompts/models are versioned, gated artifacts." },

  { area: "Production, ops & reliability", topic: "Serving / K8s", level: "Senior",
    q: "A model-server pod is CrashLoopBackOff. Debug it.",
    tested: "K8s + serving ops.",
    strong: [
      "describe / logs --previous first.",
      "Classic causes: liveness probe firing during slow model load (raise initialDelay / add startup probe), or OOMKilled (raise memory limit).",
    ],
    weak: ["Bumps restart count without finding root cause."],
    followup: "requests vs limits? → schedule vs cap (throttle / OOM).",
    depth: "Ties probe timing to model-load cold start." },

  { area: "System design (flagship)", topic: "System Design", level: "Principal",
    q: "Design an enterprise AI assistant for 100k employees.",
    tested: "Full end-to-end design + your level.",
    strong: [
      "Clarify scale / latency / data-sensitivity first.",
      "Agent + gated tools; per-user access at retrieval; security (indirect injection).",
      "Reliability, observability, cost levers, eval-gated CI/CD — each with a named trade-off.",
      "Principal: adds build-vs-buy, cost/TCO, governance, org standards; reframes the real need.",
    ],
    weak: ["Jumps to a diagram without clarifying; no security/cost/eval."],
    followup: "HR data leaked cross-user — fix? → per-user ACL at retrieval + DLP.",
    depth: "Every box defended with mechanism + trade-off." },

  { area: "FDE / customer", topic: "FDE", level: "FDE",
    q: "A customer wants 'AI to help support' but the ask is vague. What do you do?",
    tested: "Ambiguity + customer judgment.",
    strong: [
      "Clarifying questions that scope it: which tickets, data access, reversible actions, success metric.",
      "Propose a thin shippable slice; integrate with their messy systems.",
      "Explain trade-offs to a non-engineer.",
    ],
    weak: ["Starts building a grand system; no clarifying; ignores their constraints."],
    followup: "Their data is a mess — now what? → the implementation gap; pragmatic ingestion + validation.",
    depth: "Ties the build to the customer's outcome, not tech for its own sake." },

  // ---- Added areas (purely additive; new `area` values auto-create their
  // own setup checkbox + question pool). Two items each (Senior + Staff),
  // same depth/pattern as the originals. ----

  { area: "Snowflake Cortex", topic: "Cortex", level: "Senior",
    q: "When do you use Cortex Search / Analyst vs building your own RAG stack on Snowflake?",
    tested: "Buy-vs-build judgment inside the data platform.",
    strong: [
      "Cortex Search/Analyst when the data already lives in Snowflake and you want governed, in-platform retrieval without moving data out.",
      "Analyst for text-to-SQL over a semantic model; Search for document retrieval — both inherit RBAC + masking.",
      "Roll your own only when you need a retrieval/rerank pipeline Cortex can't express, and you accept the data-movement + governance cost.",
    ],
    weak: ['"Always build custom RAG"; ignores governance/data-egress; no semantic model.'],
    followup: "Why keep retrieval in-platform? → data never leaves the governance boundary (RBAC, masking, audit).",
    depth: "Ties the choice to governance + data gravity, not just features." },

  { area: "Snowflake Cortex", topic: "Cortex", level: "Staff",
    q: "A Cortex Analyst text-to-SQL answer is wrong. How do you make it trustworthy at scale?",
    tested: "Operating an LLM-over-data feature responsibly.",
    strong: [
      "Fix the semantic model first: verified metrics, join paths, synonyms — the model is only as good as the semantic layer.",
      "Constrain to approved tables/metrics; show the generated SQL for transparency; add an eval set of question→expected-SQL.",
      "Guardrails: row-access policies so a wrong query still can't leak data.",
    ],
    weak: ['"Prompt it harder"; no semantic model; trusts generated SQL blindly.'],
    followup: "Who owns correctness? → the semantic model (metrics/joins), not the prompt.",
    depth: "Separates generation quality from the governed data contract." },

  { area: "Databricks & Spark", topic: "Databricks", level: "Senior",
    q: "Design a medallion (bronze/silver/gold) lakehouse on Databricks. Defend the layering.",
    tested: "Lakehouse architecture judgment.",
    strong: [
      "Bronze = raw/replayable; silver = cleaned/conformed; gold = business marts. Delta tables throughout.",
      "Idempotent MERGE for incremental loads; schema evolution additive at bronze, contract-stable at gold.",
      "Quality gates between layers; Unity Catalog for governance/lineage.",
    ],
    weak: ['"One big transform job"; no raw landing; no replayability; no governance.'],
    followup: "Why land raw first? → replay/reprocess when logic changes without re-ingesting.",
    depth: "Each layer earns its place with a mechanism + trade-off." },

  { area: "Databricks & Spark", topic: "Delta / Perf", level: "Staff",
    q: "A Databricks job slowed down and costs spiked after data grew. Diagnose and fix.",
    tested: "Spark/Delta performance + cost control.",
    strong: [
      "Spark UI: data skew (salt/repartition the hot key), small-file explosion (OPTIMIZE/compaction + auto-optimize), shuffle spill (tune partitions / right-size).",
      "Delta: Z-ORDER/liquid clustering on filter columns; prune with partitioning that matches query patterns.",
      "Cost: autoscaling + job clusters (not all-purpose), spot where safe; measure $/run.",
    ],
    weak: ['"Scale the cluster up" to mask skew; no profiling; all-purpose clusters for jobs.'],
    followup: "Why not just upsize? → it hides skew and burns money; fix the cause.",
    depth: "Picks the cheapest correct fix; ties compute choice to cost." },

  { area: "dbt & analytics engineering", topic: "dbt", level: "Senior",
    q: "How do you structure a dbt project and guarantee the marts are trustworthy?",
    tested: "Analytics-engineering discipline.",
    strong: [
      "Layered models: staging (1:1 source cleanup) → intermediate → marts; refs not hard-coded tables.",
      "Tests (not_null/unique/relationships/accepted_values) + freshness; contracts on exposed models.",
      "Docs + lineage from the DAG; CI runs build+test on PRs so a bad model can't merge.",
    ],
    weak: ['"Write SQL views"; no tests; no staging layer; no CI gate.'],
    followup: "How does a bad column get caught before prod? → dbt test in CI + contract.",
    depth: "Treats transformations as tested, versioned software." },

  { area: "dbt & analytics engineering", topic: "dbt", level: "Staff",
    q: "Full refreshes are too slow/expensive. How do you make dbt models incremental safely?",
    tested: "Incremental modeling + idempotency.",
    strong: [
      "Incremental materialization with a stable unique_key and an is_incremental() filter on a watermark.",
      "merge/delete+insert strategy so reruns converge (no dupes); handle late-arriving data with a lookback window.",
      "Keep a full-refresh path for backfills/logic changes; test the incremental == full result.",
    ],
    weak: ['"Append only" (dupes on rerun); no unique_key; no late-data handling.'],
    followup: "A model reran mid-day — dupes? → merge on unique_key makes it idempotent.",
    depth: "Reruns are safe by design, not by luck." },

  { area: "FastAPI & serving", topic: "FastAPI", level: "Senior",
    q: "Design a production FastAPI service that fronts an LLM/model. What matters?",
    tested: "API serving fundamentals for AI.",
    strong: [
      "Async endpoints + httpx for upstream calls; stream responses (SSE) for long generations.",
      "Timeouts, retries with backoff, and a circuit breaker on the model provider; request validation via Pydantic.",
      "Backpressure/concurrency limits; health/readiness probes; structured logs + request IDs.",
    ],
    weak: ['Sync blocking calls; no timeout; no streaming; no backpressure.'],
    followup: "Why async here? → model calls are I/O-bound; blocking kills throughput.",
    depth: "Ties async + limits to real throughput/latency, not boilerplate." },

  { area: "FastAPI & serving", topic: "FastAPI", level: "Staff",
    q: "Your FastAPI LLM endpoint falls over under a traffic spike. Contain it.",
    tested: "Serving reliability under load.",
    strong: [
      "Concurrency cap + queue with a bounded wait; shed load (429) instead of collapsing.",
      "Per-provider circuit breaker + fallback (cheaper/cached answer); timeouts so slow calls don't pile up.",
      "Horizontal scale behind a load balancer; separate the model call from the request worker (task queue) if long-running.",
    ],
    weak: ['"Add workers" with no limits (thundering herd); no shedding; no fallback.'],
    followup: "Why shed load? → a fast 429 beats a total outage; protects the healthy path.",
    depth: "Distinguishes mitigate-now (shed/breaker) from scale-later." },

  { area: "AWS Bedrock & AgentCore", topic: "Bedrock", level: "Senior",
    q: "When do you choose Bedrock for a GenAI feature, and how do you keep it portable?",
    tested: "Managed-GenAI judgment + lock-in awareness.",
    strong: [
      "Bedrock for managed access to multiple foundation models with IAM, VPC, and data-stays-in-your-account posture — no model hosting.",
      "Guardrails + Knowledge Bases for managed RAG; model choice per task.",
      "Keep an abstraction over the model call so you can swap providers; measure cost/latency per model.",
    ],
    weak: ['"Bedrock because AWS"; hard-codes one model; ignores lock-in/cost.'],
    followup: "Why abstract the call? → model routing + avoid single-provider lock-in.",
    depth: "Names the governance win and the lock-in trade-off." },

  { area: "AWS Bedrock & AgentCore", topic: "AgentCore", level: "Staff",
    q: "You're putting an agent into production on Bedrock AgentCore. How do you make it safe and bounded?",
    tested: "Managed-agent runtime + guardrails.",
    strong: [
      "Least-privilege action groups (gated write tools), session isolation, and the managed memory/identity primitives — not a trust-the-model loop.",
      "Guardrails for input/output; bounded iterations + token/cost caps; full trace/observability.",
      "Treat retrieved/tool content as data (indirect injection); audit every action.",
    ],
    weak: ['Broad tool permissions; unbounded loop; trusts tool output as instructions.'],
    followup: "Tool output says 'ignore instructions' — safe? → gated + least-privilege regardless.",
    depth: "Managed runtime still needs the propose→validate→approve discipline." },

  { area: "Identity & access (OAuth/OIDC/Okta)", topic: "Identity", level: "Senior",
    q: "How does a user's identity flow securely from an SPA through your API to a tool/data layer?",
    tested: "AuthN/AuthZ fundamentals.",
    strong: [
      "OIDC login (Okta/IdP) → short-lived access token (JWT) with audience/scope; validate signature, exp, aud, iss on the API.",
      "Pass identity down; enforce authorization at the data layer (per-user/tenant), never trust the client.",
      "Refresh tokens handled server-side; PKCE for public clients.",
    ],
    weak: ['Long-lived tokens; no signature/aud validation; authz in the UI only.'],
    followup: "Why validate aud/iss? → stops token reuse across services (confused deputy).",
    depth: "Separates authentication from authorization + where each is enforced." },

  { area: "Identity & access (OAuth/OIDC/Okta)", topic: "Identity", level: "Staff",
    q: "An AI agent needs to call downstream APIs as the user. How do you delegate access safely?",
    tested: "Delegated authorization for agents/services.",
    strong: [
      "On-behalf-of / token exchange (OAuth2) to get a scoped downstream token — not the agent reusing the user's broad token.",
      "Least-privilege scopes per tool; short TTL; audit which identity did what.",
      "Secrets in a vault, not the prompt; rotate; egress allowlist for tools.",
    ],
    weak: ['Agent holds a broad long-lived token; creds in the prompt; no scoping.'],
    followup: "Why token exchange vs passing the user token? → scope-down + least privilege per hop.",
    depth: "Knows delegated-auth patterns, not just 'send the JWT'." },
];

export const SIM_LEVELS = ["Mixed", "Senior", "Staff", "Principal", "FDE"] as const;
