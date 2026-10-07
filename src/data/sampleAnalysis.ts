/* Sample analysis for a fictional AI Solutions Architect (demo mode).
 * Extracted verbatim from content/assets/analyze.js. */

import type { Analysis } from "../types";

export const SAMPLE_ANALYSIS: Analysis = {
  roleSummary: "Design and ship production GenAI systems for enterprise customers \u2014 RAG and agent applications on AWS, owning reliability and cost at scale, working directly with customers.",
  seniority: "Staff / Principal \u00b7 Forward-Deployed",
  coreSkills: [
    { name: "Python", type: "EXPLICIT" }, { name: "AWS", type: "EXPLICIT" },
    { name: "RAG", type: "EXPLICIT" }, { name: "Agents", type: "EXPLICIT" },
    { name: "System design", type: "EXPLICIT" },
  ],
  technologies: ["AWS Bedrock", "Kubernetes", "Snowflake"],
  experienceRequirements: ["Production AI applications", "Reliability + cost at scale", "Customer-facing delivery"],
  responsibilities: ["Architect RAG/agent apps", "Own reliability and cost", "Set patterns for teams"],
  interviewSignals: [
    { area: "System design (production RAG/agent platform)", type: "INFERRED", note: "expect an end-to-end design round" },
    { area: "Defend-your-decisions follow-ups", type: "INFERRED", note: "why this model / retrieval / tool" },
  ],
  resumeProvided: false,
  alignment: [],
  readiness: [
    { dimension: "Technical Skills", status: "PARTIAL_MATCH", roleRequires: "Python, AWS Bedrock, RAG, agents", candidateHas: "(sample) Python, AWS, RAG", gap: "Bedrock + agent production depth" },
    { dimension: "System Design", status: "PREPARATION_NEEDED", roleRequires: "Design GenAI platforms at scale", candidateHas: "component-level design", gap: "end-to-end + trade-offs at Staff level" },
    { dimension: "Resume Alignment", status: "INSUFFICIENT_INFO", roleRequires: "GenAI architect outcomes", candidateHas: "(no resume provided)", gap: "add a resume to see alignment" },
  ],
  potentialGaps: [
    { requirement: "AWS Bedrock agent development", whatIsMissing: "Evidence of production Bedrock agent implementation.",
      whyItMatters: "The role explicitly requires production GenAI and agent experience.",
      whatToStudy: ["Agent architecture", "Tool calling", "Security controls"], whatToBuild: ["A small agent workflow with guardrails"],
      whatToPractice: ["Architecture explanation", "Production troubleshooting"], interviewExpectation: "Expect to design and defend an agent architecture." },
  ],
  preparationPlan: [
    { priority: 1, title: "AWS Bedrock + production agents", why: "Biggest gap vs the JD's explicit GenAI/agent requirement.", skills: ["AWS Bedrock", "Agents"], resource: { label: "Amazon Bedrock", path: "GenAI-Topics/bedrock/index.html" } },
    { priority: 2, title: "System design at Staff level", why: "Architect roles are graded on end-to-end design + trade-offs.", skills: ["System Design"], resource: { label: "Requirements \u2192 Production", path: "Personal-SourceCode/Interview_Requirements_to_Production.html" } },
  ],
  offerReadyResources: [
    { label: "Amazon Bedrock", path: "GenAI-Topics/bedrock/index.html" },
    { label: "Building Agents \u2014 Deep Dive", path: "GenAI-Topics/agent-principles/index.html" },
    { label: "RAG", path: "GenAI-Topics/rag/index.html" },
  ],
  nextStep: "Start with: Amazon Bedrock + production agents (Priority 1).",
};
