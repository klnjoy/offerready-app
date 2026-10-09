/* Role-title derivation and Defend scenario-family classification.
 *
 * Ported from content/assets/analyze.js (deriveRoleTitle, inferScenarioCategory)
 * and content/assets/scenario.js (classifyFamilyFromJob, cleanRoleLabel). The
 * two classifiers were duplicated verbatim in the old scripts; here they share
 * one rule set (classifyFamily). Mirrors the server logic in api/_lib/jobs.js. */

import { docsUrl } from "../config";
import type { Analysis, JobRow } from "../types";

export type ScenarioCategory =
  | "ai-engineer" | "ai-architect" | "data-engineer" | "data-architect"
  | "cloud-platform" | "ai-security" | "fde";

export const CATEGORY_LABELS: Record<ScenarioCategory, string> = {
  "ai-engineer": "AI / GenAI Engineer",
  "ai-architect": "AI Architect",
  "data-engineer": "Data Engineer",
  "data-architect": "Data Architect",
  "cloud-platform": "Cloud / Platform",
  "ai-security": "AI Security",
  fde: "Forward Deployed",
};

export const FAMILY_LABELS: Record<ScenarioCategory, string> = {
  "ai-engineer": "AI / GenAI Engineering",
  "ai-architect": "AI Architecture",
  "data-engineer": "Data Engineering",
  "data-architect": "Data Architecture",
  "cloud-platform": "Cloud / Platform",
  "ai-security": "AI Security",
  fde: "Forward Deployed",
};

export function isCategory(c: unknown): c is ScenarioCategory {
  return typeof c === "string" && Object.prototype.hasOwnProperty.call(CATEGORY_LABELS, c);
}

export function catLabel(c: string | null | undefined): string {
  return isCategory(c) ? CATEGORY_LABELS[c] : c || "General";
}

export function familyLabel(c: string | null | undefined): string {
  return isCategory(c) ? FAMILY_LABELS[c] : catLabel(c);
}

const skillName = (s: unknown): string => {
  if (typeof s === "string") return s;
  if (s && typeof s === "object" && typeof (s as { name?: unknown }).name === "string") return (s as { name: string }).name;
  return "";
};

/** Classify a lowercase haystack of role signals into a scenario family. */
export function classifyFamily(hay: string): ScenarioCategory | null {
  if (!hay.trim()) return null;
  // AI SECURITY = AI/LLM security only. Require an unmistakable AI-security
  // phrase, or the generic security word together with an AI signal, so a
  // plain data-security JD falls through to the data rules.
  const aiSignal = /\b(ai|a\.i\.|genai|gen ai|llm|ml|machine learning|rag|agent|prompt|model|nlp)\b/.test(hay);
  const strongAiSec = /\bprompt injection|jailbreak|guardrail|owasp\s*(llm|top\s*10)?|model (security|poisoning)|adversarial|red.?team(ing)?\b/.test(hay);
  const genericSec = /\bsecurity|threat|zero.?trust\b/.test(hay);
  if (strongAiSec || (genericSec && aiSignal)) return "ai-security";
  if (/\bforward deployed|forward-deployed|\bfde\b|customer-facing|client-facing|solutions engineer\b/.test(hay)) return "fde";
  // Data engineering before data architecture.
  if (/\bdata engineer|data engineering|azure data|data platform engineer|databricks|spark|pipeline|data pipeline|etl|elt|ingestion|streaming|real-?time|data quality|lakehouse|airflow|dbt\b/.test(hay)) return "data-engineer";
  // Data-platform roles follow the ROLE NOUN, not the tech.
  const dataPlatformSignal = /\bsnowflake|warehouse|warehousing|cortex|data platform|redshift|bigquery\b/.test(hay);
  const saysArchitect = /\barchitect|architecture|data model|dimensional\b/.test(hay);
  const saysEngineer = /\bengineer\b/.test(hay);
  if (dataPlatformSignal && saysEngineer && !saysArchitect) return "data-engineer";
  if (/\bdata architect|analytics architect|snowflake|warehouse|warehousing|cortex|data platform|analytics engineer|data modeling|dimensional\b/.test(hay)) return "data-architect";
  // AI engineer vs architect by role noun; runs before cloud/platform.
  const aiEngSignal = /\bai engineer|genai|gen ai|ml engineer|rag|agent|agentic|langchain|langgraph|llm|nlp|prompt\b/.test(hay);
  const archRoleNoun = /\barchitect\b/.test(hay);
  const archScope = /\bsystem design|multi-?tenant|reference architecture\b/.test(hay);
  if (aiEngSignal) return archRoleNoun || archScope ? "ai-architect" : "ai-engineer";
  if (/\bcloud|platform|devops|kubernetes|infrastructure|sre|reliability|terraform\b/.test(hay)) return "cloud-platform";
  if (/\barchitect|architecture|system design|multi-tenant|enterprise\b/.test(hay)) return "ai-architect";
  return null;
}

/** Analyze page: best-matching Defend family for an analysis. */
export function inferScenarioCategory(analysis: Analysis | null | undefined, role?: string): ScenarioCategory | null {
  const a = analysis || ({} as Analysis);
  const hay = [
    role || "",
    a.seniority || "",
    a.roleSummary || "",
    (a.coreSkills || []).map(skillName).join(" "),
    (a.technologies || []).join(" "),
  ].join(" ").toLowerCase();
  return classifyFamily(hay);
}

/** Defend page: family from a saved job's own context. */
export function classifyFamilyFromJob(job: (JobRow & { roleSummary?: string }) | null | undefined): ScenarioCategory | null {
  if (!job) return null;
  const hay = [job.title || "", job.seniority || "", job.roleSummary || "", job.analysis?.roleSummary || ""]
    .join(" ")
    .toLowerCase();
  return classifyFamily(hay);
}

// ---- role title derivation ----------------------------------------------

const JUNK_ROLES = new Set(["", "not specified", "unspecified", "n/a", "na", "none", "unknown", "untitled"]);

export function cleanRole(v: unknown): string {
  const s = (v == null ? "" : String(v)).trim();
  if (!s) return "";
  return JUNK_ROLES.has(s.toLowerCase()) ? "" : s;
}

const ROLE_NOUNS = new Set([
  "engineer", "architect", "developer", "scientist", "analyst", "administrator", "consultant",
  "designer", "specialist", "manager", "lead", "director", "programmer", "strategist", "researcher",
]);
const COMPANY_HINT = /\b(is a|is an|we are|we're|company|startup|founded|headquarter|our mission|our team|about us|organization|organisation)\b/i;
const ROLE_STOP = new Set([
  "a", "an", "the", "our", "their", "your", "this", "that", "for", "of", "to", "and", "or", "as", "with",
  "is", "are", "be", "seeking", "hiring", "seeks", "looking", "need", "needs", "wants", "want", "join",
  "company", "startup", "team", "role", "position", "who", "experienced", "strong",
]);
const SENIORITY_WORDS = new Set(["senior", "junior", "staff", "principal", "lead", "head", "chief", "mid"]);

function isQualifier(tok: string): boolean {
  if (!tok) return false;
  const bare = tok.replace(/[^A-Za-z0-9+/.#-]/g, "");
  if (!bare) return false;
  if (ROLE_STOP.has(bare.toLowerCase())) return false;
  if (/^[A-Z]/.test(bare)) return true;
  return SENIORITY_WORDS.has(bare.toLowerCase());
}

/** Find a role noun, walk left over qualifiers, skip company-blurb clauses. */
export function extractRoleFromSummary(summary: unknown): string {
  const text = (summary == null ? "" : String(summary)).trim();
  if (!text) return "";
  const fromClause = (clause: string): string => {
    const raw = clause.trim();
    if (!raw) return "";
    const tokens = raw.split(/\s+/);
    for (let i = 0; i < tokens.length; i++) {
      const bare = tokens[i].replace(/[^A-Za-z]/g, "").toLowerCase();
      const singular = bare.replace(/s$/, "");
      if (ROLE_NOUNS.has(bare) || ROLE_NOUNS.has(singular)) {
        let start = i;
        while (start - 1 >= 0 && isQualifier(tokens[start - 1])) start--;
        if (start === i) continue;
        const phrase = tokens.slice(start, i + 1).join(" ").replace(/[^A-Za-z0-9+/.#\- ]/g, "").trim();
        const cand = cleanRole(phrase);
        if (cand) return cand.slice(0, 120);
      }
    }
    return "";
  };
  const clauses = text.split(/[.;:\n—]|,\s(?=[A-Z])/);
  for (const c of clauses) {
    if (COMPANY_HINT.test(c)) continue;
    const r = fromClause(c);
    if (r) return r;
  }
  for (const c of clauses) {
    const r = fromClause(c);
    if (r) return r;
  }
  return "";
}

export function hasRoleNoun(s: unknown): boolean {
  return String(s == null ? "" : s)
    .toLowerCase()
    .split(/[^a-z]+/)
    .some((w) => !!w && (ROLE_NOUNS.has(w) || ROLE_NOUNS.has(w.replace(/s$/, ""))));
}

/** Every word is a seniority level ("Senior", "Lead / Principal"). */
export function isLevelOnly(s: unknown): boolean {
  const words = String(s == null ? "" : s).trim().split(/[\s/]+/).filter(Boolean);
  return words.length > 0 && words.every((w) => SENIORITY_WORDS.has(w.toLowerCase()));
}

function bareSeniority(s: unknown): string {
  if (!isLevelOnly(s)) return "";
  const lvl = String(s).trim().split(/[\s/]+/).filter(Boolean)[0];
  return lvl.charAt(0).toUpperCase() + lvl.slice(1).toLowerCase();
}

function signalText(a: Analysis): string {
  const parts: string[] = [];
  (a.technologies || []).forEach((t) => parts.push(String(t || "")));
  (a.coreSkills || []).forEach((s) => parts.push(skillName(s)));
  (a.preferredSkills || []).forEach((s) => parts.push(skillName(s)));
  (a.responsibilities || []).forEach((r) =>
    parts.push(typeof r === "string" ? r : (r && (r.title || r.requirement)) || ""),
  );
  if (a.roleSummary) parts.push(String(a.roleSummary));
  return parts.join(" ").toLowerCase();
}

function deriveTitleFromSignals(a: Analysis, levelPrefix: string): string {
  const hay = signalText(a);
  if (!hay.trim()) return "";
  let roleNoun = "";
  if (/\bdata engineer|etl|elt|data pipeline|pipeline|ingestion|data warehous|warehousing|lakehouse|spark|databricks\b/.test(hay)) roleNoun = "Data Engineer";
  else if (/\bdata architect|dimensional model|data modeling\b/.test(hay)) roleNoun = "Data Architect";
  else if (/\banalytics|tableau|power bi|looker|bi\b/.test(hay) && /\bsql|warehouse|etl|elt\b/.test(hay)) roleNoun = "Analytics Engineer";
  else if (/\brag|llm|genai|gen ai|agent|prompt|embedding|vector\b/.test(hay)) roleNoun = "AI Engineer";
  else if (/\bml engineer|machine learning|model training|mlops\b/.test(hay)) roleNoun = "ML Engineer";
  else if (/\bkubernetes|terraform|devops|infrastructure|sre|ci\/cd|platform\b/.test(hay)) roleNoun = "Platform Engineer";
  else if (/\bsql|snowflake|bigquery|redshift|analytics|reporting\b/.test(hay)) roleNoun = "Data Engineer";
  if (!roleNoun) return "";
  let qualifier = "";
  if (/data engineer|data architect/i.test(roleNoun)) {
    if (/\bsnowflake\b/.test(hay)) qualifier = "Snowflake";
    else if (/\bdatabricks\b/.test(hay)) qualifier = "Databricks";
    else if (/\bazure\b/.test(hay)) qualifier = "Azure";
    else if (/\baws\b/.test(hay)) qualifier = "AWS";
  }
  return [levelPrefix, qualifier, roleNoun].filter(Boolean).join(" ");
}

/** Full role title (e.g. "Senior Snowflake Data Engineer"), never a bare level. */
export function deriveRoleTitle(targetRole: string | undefined, analysis: Analysis | null | undefined): string {
  const a = analysis || ({} as Analysis);
  const explicit = cleanRole(targetRole);
  if (explicit && hasRoleNoun(explicit) && !isLevelOnly(explicit)) return explicit.slice(0, 200);
  const parsed = cleanRole(a.seniority);
  if (parsed && hasRoleNoun(parsed) && !isLevelOnly(parsed)) return parsed.slice(0, 200);
  const levelPrefix = bareSeniority(explicit) || bareSeniority(a.seniority);
  const role = extractRoleFromSummary(a.roleSummary);
  if (role) {
    const alreadyLeveled = !!levelPrefix && role.toLowerCase().indexOf(levelPrefix.toLowerCase()) === 0;
    return (levelPrefix && !alreadyLeveled ? levelPrefix + " " + role : role).slice(0, 120);
  }
  const fromSignals = deriveTitleFromSignals(a, levelPrefix);
  return fromSignals ? fromSignals.slice(0, 120) : "";
}

/** Defend page label guard: rejects junk AND bare seniority ("Senior"). */
export function cleanRoleLabel(v: unknown): string {
  const s = cleanRole(v);
  if (!s) return "";
  const words = s.split(/[\s/]+/).filter(Boolean);
  const bare = words.length > 0 && words.every((w) => SENIORITY_WORDS.has(w.toLowerCase()) || w.toLowerCase() === "mid-level");
  return bare ? "" : s;
}

// ---- job card titles ----------------------------------------------------

const COMPANY_TITLE_HINT = /\b(is a|is an|we are|we're|company|startup|provides|focuses|founded|headquarter)\b/i;

/** A stored value usable as a title: present, short, not a company blurb, not
 * a placeholder, and not a bare seniority level ("Senior", "Lead"). */
export function usableTitle(v: unknown): string {
  const s = (v == null ? "" : String(v)).trim();
  if (!s || s.length > 80) return "";
  if (COMPANY_TITLE_HINT.test(s)) return "";
  if (JUNK_ROLES.has(s.toLowerCase())) return "";
  if (isLevelOnly(s)) return "";
  return s;
}

/** The one title rule every screen uses: title, else seniority, else "Untitled role". */
export function displayJobTitle(j: Pick<JobRow, "title" | "seniority"> | string | null | undefined): string {
  if (typeof j === "string") return usableTitle(j) || "Untitled role";
  return usableTitle(j?.title) || usableTitle(j?.seniority) || "Untitled role";
}

// ---- role guides ----------------------------------------------------------

export interface RoleGuide { label: string; url: string }

/* Study-site role guides (personal-docs/Path_*.md, published under
 * Personal-SourceCode/). Matched on the job TITLE only, not the JD body, so a
 * Product Manager posting that mentions LLMs doesn't get an engineering guide. */
const GUIDE_PAGES = {
  fde: ["Forward Deployed Engineer", "Path_FDE.html"],
  aiPlatform: ["AI Platform Engineer", "Path_AI_Platform_Engineer.html"],
  data: ["Data Platform Engineer", "Path_Data_Platform.html"],
  staff: ["Staff / Principal AI Architect", "Path_Staff_Principal_Architect.html"],
  aiEngineer: ["AI Engineer", "Path_AI_Engineer.html"],
} as const;

/** Which guide a role title points to, or null when none fits. Pure. */
export function roleGuideKey(title: string): keyof typeof GUIDE_PAGES | null {
  const t = " " + String(title || "").toLowerCase().replace(/[-_/,()]+/g, " ").replace(/\s+/g, " ") + " ";
  if (!t.trim()) return null;
  if (/\b(forward deployed|fde|fdse)\b/.test(t)) return "fde";
  // Engineering roles only: managers, recruiters, designers etc. get no guide.
  if (!/\b(engineer|engineering|developer|architect|sre|mlops|llmops)\b/.test(t)) return null;
  const ai = /\b(ai|a\.i\.|genai|gen ai|generative|llm|llms|ml|machine learning|applied ai|agentic|agents?|rag|nlp|model)\b/.test(t);
  if (/\b(mlops|llmops|inference|model serving)\b/.test(t) || (ai && /\b(platform|infrastructure|infra)\b/.test(t))) return "aiPlatform";
  if (/\b(data|analytics|etl|dbt|snowflake|databricks|warehouse|lakehouse)\b/.test(t)) return "data";
  if (!ai) return null;
  if (/\b(staff|principal|distinguished|architect)\b/.test(t)) return "staff";
  return "aiEngineer";
}

/** The study-site role guide for a job, or null when no guide matches. */
export function roleGuideFor(
  job: (Partial<Pick<JobRow, "title" | "seniority">> & { analysis?: Analysis | null }) | null | undefined,
): RoleGuide | null {
  if (!job) return null;
  const title = usableTitle(job.title) || deriveRoleTitle(undefined, job.analysis || null);
  if (!title) return null;
  // A bare level stored separately ("Staff") still counts toward the level.
  const level = isLevelOnly(job.seniority) ? String(job.seniority) : "";
  const key = roleGuideKey((level && !title.toLowerCase().includes(level.toLowerCase()) ? level + " " : "") + title);
  if (!key) return null;
  const [label, page] = GUIDE_PAGES[key];
  return { label, url: docsUrl("Personal-SourceCode/" + page) };
}
