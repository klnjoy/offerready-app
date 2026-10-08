/* Topic focus for OfferReady Help. Ids match the API's /api/areas list and
 * the study library's assistant, so a focus means the same thing on both. */

export const TOPIC_GROUPS: { label: string; topics: { id: string; label: string }[] }[] = [
  { label: "GenAI foundations", topics: [
    { id: "llm-fundamentals", label: "LLM fundamentals" },
    { id: "prompt-engineering", label: "Prompt & context engineering" },
    { id: "rag", label: "RAG" },
    { id: "retrieval-tuning", label: "Retrieval tuning" },
    { id: "vector-db", label: "Vector databases" },
  ] },
  { label: "Agents & tools", topics: [
    { id: "agents", label: "AI agents" },
    { id: "agent-engineering", label: "Agent engineering" },
    { id: "mcp", label: "MCP" },
    { id: "langchain", label: "LangChain & LangGraph" },
    { id: "bedrock", label: "Amazon Bedrock" },
  ] },
  { label: "Production", topics: [
    { id: "observability", label: "Observability & evals" },
    { id: "llmops", label: "LLMOps & deployment" },
    { id: "reliability", label: "Reliability" },
    { id: "cost-optimization", label: "Cost optimization" },
    { id: "kubernetes", label: "Kubernetes" },
    { id: "devops-ai", label: "DevOps for AI" },
    { id: "security", label: "AI security" },
  ] },
  { label: "Data & cloud", topics: [
    { id: "snowflake", label: "Snowflake & Cortex" },
    { id: "databricks", label: "Databricks" },
    { id: "dbt", label: "dbt" },
    { id: "sql", label: "SQL" },
    { id: "python", label: "Python" },
    { id: "aws", label: "AWS" },
    { id: "data-engineering", label: "Data engineering" },
  ] },
  { label: "Interviews", topics: [
    { id: "system-design", label: "System design" },
    { id: "behavioral", label: "Behavioral (STAR)" },
    { id: "fde", label: "Forward Deployed Engineer" },
  ] },
];

export function topicLabel(id: string): string {
  for (const g of TOPIC_GROUPS) for (const t of g.topics) if (t.id === id) return t.label;
  return "";
}

/** "auto" lets the screen and job decide (sent to the API as "all"). */
export function effectiveTopic(area: string | undefined): string {
  return !area || area === "auto" ? "all" : area;
}
