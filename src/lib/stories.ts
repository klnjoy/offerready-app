/* STAR story bank (local only, KEYS.stories) + the pure helpers the Story
 * bank and Today screens share: competency derivation from a job analysis,
 * coverage, a STAR completeness check and Markdown export. */

import { KEYS, readJSON, writeJSON } from "./storage";
import type { Analysis } from "../types";

export interface Story {
  id: string;
  title: string;
  situation: string;
  task: string;
  action: string;
  result: string;
  metrics: string;
  /** Competency keys (see COMPETENCIES) and custom tags. */
  tags: string[];
  /** Saved job ids this story suits. */
  jobIds: string[];
  /** Free-text roles ("Data engineer, Tech lead"). */
  roles: string;
  createdAt: string;
  updatedAt: string;
}

export const COMPETENCIES = [
  { key: "leadership", label: "Leadership", prompt: "led a team or an effort without being asked" },
  { key: "conflict", label: "Conflict", prompt: "disagreed with a colleague or stakeholder and worked it out" },
  { key: "failure", label: "Failure", prompt: "failed or made a mistake, and what you changed afterwards" },
  { key: "ambiguity", label: "Ambiguity", prompt: "made progress when the goal or the requirements were unclear" },
  { key: "influence", label: "Influence", prompt: "changed someone's mind without authority over them" },
  { key: "delivery", label: "Delivery under pressure", prompt: "delivered against a hard deadline or during an incident" },
  { key: "technical", label: "Technical depth", prompt: "solved the hardest technical problem you've worked on" },
  { key: "customer", label: "Customer focus", prompt: "put a customer's or user's need first" },
] as const;

export type CompetencyKey = (typeof COMPETENCIES)[number]["key"];

const LABEL: Record<string, string> = Object.fromEntries(COMPETENCIES.map((c) => [c.key, c.label]));
export const tagLabel = (t: string) => LABEL[t] || t;
export const isCompetency = (t: string) => t in LABEL;

/** Accepts a key ("delivery") or a label ("Delivery under pressure"). */
export function competencyKey(s: string): string {
  const t = String(s || "").trim().toLowerCase();
  const hit = COMPETENCIES.find((c) => c.key === t || c.label.toLowerCase() === t);
  return hit ? hit.key : t;
}

export function practicePrompt(tagOrStory: string | Story): string {
  if (typeof tagOrStory !== "string") {
    const comp = COMPETENCIES.find((c) => tagOrStory.tags.includes(c.key));
    const base = comp ? "Tell me about a time you " + comp.prompt + "." : "Tell me about a time you " + (tagOrStory.title ? "worked on: " + tagOrStory.title.replace(/[.]+$/, "") : "made a real difference") + ".";
    return base + " Walk me through the situation, what you personally did, and the result.";
  }
  const comp = COMPETENCIES.find((c) => c.key === competencyKey(tagOrStory));
  return "Tell me about a time you " + (comp ? comp.prompt : "showed " + tagOrStory) + ".";
}

// ---------- storage ----------
export function loadStories(): Story[] {
  const v = readJSON<Story[]>(KEYS.stories, []);
  return Array.isArray(v) ? v.filter((s) => s && typeof s.id === "string").map(normalizeStory) : [];
}

export function saveStories(list: Story[]): void {
  writeJSON(KEYS.stories, list);
}

export function normalizeStory(s: Partial<Story>): Story {
  const now = new Date().toISOString();
  return {
    id: s.id || "s" + Date.now().toString(36) + Math.random().toString(36).slice(2, 6),
    title: s.title || "", situation: s.situation || "", task: s.task || "", action: s.action || "",
    result: s.result || "", metrics: s.metrics || "",
    tags: Array.isArray(s.tags) ? s.tags.filter(Boolean) : [],
    jobIds: Array.isArray(s.jobIds) ? s.jobIds.filter(Boolean) : [],
    roles: s.roles || "", createdAt: s.createdAt || now, updatedAt: s.updatedAt || now,
  };
}

// ---------- completeness ----------
export interface StarCheck {
  score: number;
  issues: string[];
  parts: { key: "S" | "T" | "A" | "R" | "M"; label: string; ok: boolean }[];
}

const words = (s: string) => (String(s || "").trim().match(/\S+/g) || []).length;
const count = (s: string, re: RegExp) => (String(s || "").match(re) || []).length;

/** Client-side STAR heuristics. */
export function starCheck(s: Pick<Story, "situation" | "task" | "action" | "result" | "metrics">): StarCheck {
  const issues: string[] = [];
  const S = words(s.situation) >= 8;
  const T = words(s.task) >= 5;
  const A = words(s.action) >= 15;
  const R = words(s.result) >= 5;
  const hasNumber = /\d/.test(s.metrics || "") || /\d/.test(s.result || "");
  const M = words(s.metrics) >= 1 || hasNumber;
  const we = count(s.action, /\b(we|our|us|we're|we've)\b/gi);
  const me = count(s.action, /\b(I|my|me|I'm|I've|I'd)\b/g);
  const weHeavy = words(s.action) > 0 && (me === 0 || we > me);

  if (!S) issues.push("Add the situation: where, when, and what was at stake.");
  if (!T) issues.push("Say what your task or goal was.");
  if (!words(s.action)) issues.push("Describe the actions you took.");
  else if (!A) issues.push("The action is thin. Add two or three concrete steps you took.");
  if (weHeavy) issues.push("The action says “we” more than “I”. Say what you did.");
  if (!words(s.result)) issues.push("Missing a result: how did it end?");
  else if (!R) issues.push("Expand the result: what changed because of you?");
  if (!M) issues.push("No metrics. Add a number: time saved, %, cost, users, incidents.");
  else if (!hasNumber) issues.push("Metrics have no number. Quantify if you can.");

  let score = (S ? 15 : words(s.situation) ? 7 : 0) + (T ? 15 : words(s.task) ? 7 : 0)
    + (A ? 25 : words(s.action) ? 12 : 0) + (R ? 20 : words(s.result) ? 10 : 0) + (M ? (hasNumber ? 15 : 8) : 0)
    + (words(s.action) && !weHeavy ? 10 : 0);
  score = Math.max(0, Math.min(100, score));
  return {
    score,
    issues,
    parts: [
      { key: "S", label: "Situation", ok: S },
      { key: "T", label: "Task", ok: T },
      { key: "A", label: "Action (I)", ok: A && !weHeavy },
      { key: "R", label: "Result", ok: R },
      { key: "M", label: "Metrics", ok: M && hasNumber },
    ],
  };
}

// ---------- competencies a job needs ----------
export interface NeededCompetency {
  key: string;
  label: string;
  why: string;
}

const textOf = (v: unknown): string => {
  if (v == null) return "";
  if (typeof v === "string") return v;
  if (Array.isArray(v)) return v.map(textOf).join(" ");
  if (typeof v === "object") return Object.values(v as Record<string, unknown>).map(textOf).join(" ");
  return String(v);
};

const RULES: { key: CompetencyKey; re: RegExp; why: string }[] = [
  { key: "leadership", re: /\b(lead|leads|leading|led|mentor\w*|manag\w+|own(s|ing|ership)?|head of|staff|principal)\b/i, why: "The role asks you to lead or own work" },
  { key: "influence", re: /\b(stakeholder\w*|cross[- ]functional|partner\w*|influenc\w*|align\w*|advocat\w*|executive\w*)\b/i, why: "You'll work across teams and stakeholders" },
  { key: "customer", re: /\b(customer\w*|client\w*|user\w*|consult\w*|forward[- ]deployed|field|onsite)\b/i, why: "The work is close to customers or users" },
  { key: "delivery", re: /\b(deadline\w*|fast[- ]paced|on[- ]call|incident\w*|sla\w*|production|deliver\w*|ship\w*|outage\w*)\b/i, why: "Delivery and production pressure come up" },
  { key: "ambiguity", re: /\b(ambigu\w*|greenfield|0 to 1|zero to one|startup|undefined|evolving|prototype\w*|self[- ]starter|autonom\w*)\b/i, why: "The scope is open-ended" },
  { key: "technical", re: /\b(architect\w*|design\w*|scal\w+|performance|optimi[sz]\w*|pipeline\w*|system\w*)\b/i, why: "Expect a deep technical round" },
];

/** Competencies the job needs, most important first. */
export function neededCompetencies(a: Analysis | null | undefined, title = ""): NeededCompetency[] {
  const out: NeededCompetency[] = [];
  const add = (key: string, why: string) => { if (!out.some((o) => o.key === key)) out.push({ key, label: tagLabel(key), why }); };
  if (!a) {
    COMPETENCIES.forEach((c) => add(c.key, "Common in behavioural rounds"));
    return out;
  }
  const seniority = (a.seniority || "") + " " + title;
  const senior = /\b(senior|sr\.?|lead|staff|principal|manager|head|director|architect)\b/i.test(seniority);
  const text = [a.roleSummary, a.responsibilities, a.experienceRequirements, a.interviewSignals, a.coreSkills, a.preferredSkills, a.technologies, title].map(textOf).join(" \n ");
  const skills = (a.coreSkills || []).length + (a.technologies || []).length;

  if (skills) add("technical", "Core skills: " + (a.coreSkills || []).slice(0, 3).map((s) => (typeof s === "string" ? s : s.name)).join(", "));
  if (senior) add("leadership", (a.seniority || "Senior") + " level: you'll be asked how you lead");
  for (const r of RULES) if (r.re.test(text)) add(r.key, r.why);
  if (senior) { add("influence", "Senior roles are tested on influence"); add("ambiguity", "Senior roles are tested on ambiguity"); }
  // Asked in almost every behavioural loop.
  add("conflict", "Asked in almost every behavioural round");
  add("failure", "Asked in almost every behavioural round");
  return out.slice(0, 7);
}

export interface CoverageRow extends NeededCompetency {
  stories: Story[];
}

export function coverage(needed: NeededCompetency[], stories: Story[], jobId?: string): CoverageRow[] {
  return needed.map((n) => ({
    ...n,
    stories: stories
      .filter((s) => s.tags.map(competencyKey).includes(n.key))
      // Stories tagged for this job first.
      .sort((a, b) => Number(!!jobId && b.jobIds.includes(jobId)) - Number(!!jobId && a.jobIds.includes(jobId))),
  }));
}

/** Labels of needed competencies with no story. */
export function storyGaps(needed: NeededCompetency[], stories: Story[]): string[] {
  return coverage(needed, stories).filter((r) => !r.stories.length).map((r) => r.label);
}

// ---------- export ----------
export function storiesToMarkdown(list: Story[], jobTitles: Record<string, string> = {}): string {
  const out = ["# My STAR stories", "", "_Exported from OfferReady on " + new Date().toLocaleDateString() + "._", ""];
  for (const s of list) {
    out.push("## " + (s.title || "Untitled story"), "");
    const tags = s.tags.map(tagLabel).join(", ");
    if (tags) out.push("**Competencies:** " + tags, "");
    const suits = [s.roles, ...s.jobIds.map((id) => jobTitles[id]).filter(Boolean)].filter(Boolean).join(", ");
    if (suits) out.push("**Suits:** " + suits, "");
    const sec = (h: string, v: string) => { if (v.trim()) out.push("**" + h + "**  ", v.trim(), ""); };
    sec("Situation", s.situation); sec("Task", s.task); sec("Action", s.action); sec("Result", s.result); sec("Metrics", s.metrics);
  }
  return out.join("\n");
}

/** Prompt for the help assistant's coaching. */
export function coachPrompt(s: Story): string {
  const cut = (v: string, n: number) => { const t = String(v || "").replace(/\s+/g, " ").trim(); return t.length > n ? t.slice(0, n - 1) + "\u2026" : t || "(empty)"; };
  return [
    "Coach my interview story (STAR). Give numbered, specific fixes for Situation, Task, Action, Result: what to cut or add, where to say I not we, which metric to add. Then a tight 2-minute version.",
    "Title: " + cut(s.title, 60) + ". Competencies: " + cut(s.tags.map(tagLabel).join(", "), 60),
    "S: " + cut(s.situation, 110),
    "T: " + cut(s.task, 70),
    "A: " + cut(s.action, 170),
    "R: " + cut(s.result, 90),
    "Metrics: " + cut(s.metrics, 50),
  ].join("\n");
}
