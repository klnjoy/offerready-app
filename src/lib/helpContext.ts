/* Context for OfferReady Help: which screen the user is on, the job they're
 * preparing for (from data the app already cached locally — no extra API
 * calls), and starter questions that fit the screen. */

import { matchPath } from "./router";
import { displayJobTitle } from "./roles";
import { getActiveJob } from "./readiness";
import { KEYS, readJSON } from "./storage";
import type { HelpContextPayload } from "./api";

/** Same titles as App.tsx's ROUTES table. */
const ROUTE_TITLES: { path: string; title: string }[] = [
  { path: "/", title: "Home" },
  { path: "/analyze", title: "Analyze a job" },
  { path: "/jobs", title: "My jobs" },
  { path: "/jobs/:id", title: "Job" },
  { path: "/fit", title: "Check my fit" },
  { path: "/questions", title: "Practice questions" },
  { path: "/defend", title: "Defend your decisions" },
  { path: "/dashboard", title: "Interview readiness" },
  { path: "/practice", title: "Interview practice" },
  { path: "/simulator", title: "Mock interview" },
  { path: "/account", title: "Account" },
  { path: "/example", title: "Sample walkthrough" },
];

export function routePattern(pathname: string): string {
  for (const r of ROUTE_TITLES) if (matchPath(r.path, pathname)) return r.path;
  return "";
}

export function routeTitle(pathname: string): string {
  const p = routePattern(pathname);
  return ROUTE_TITLES.find((r) => r.path === p)?.title || "OfferReady";
}

export interface HelpJob {
  title?: string;
  company?: string;
  skills?: string[];
  readiness?: number;
}

interface ReadinessCache {
  when?: number;
  jobTitle?: string;
  gap?: { match_score?: number } | null;
  progress?: { overall_readiness?: number | null; recorded_at?: string }[];
}

interface DefendRole {
  role?: string;
  technologies?: string[];
}

const MAX_AGE_MS = 30 * 24 * 3600 * 1000;

const clean = (s: unknown, max = 120) => (typeof s === "string" ? s.replace(/\s+/g, " ").trim().slice(0, max) : "");

/** The job the user is preparing for, from local caches only. */
export function readJobContext(): HelpJob | null {
  const cache = readJSON<ReadinessCache | null>(KEYS.readinessCache, null);
  const defend = readJSON<DefendRole | null>(KEYS.defendRole, null);
  const fresh = !!cache && (!cache.when || Date.now() - cache.when < MAX_AGE_MS);
  const job: HelpJob = {};

  const cachedTitle = fresh && cache?.jobTitle ? displayJobTitle(cache.jobTitle) : "";
  const defendTitle = defend?.role ? displayJobTitle(defend.role) : "";
  const title = [cachedTitle, defendTitle].find((t) => t && t !== "Untitled role");
  if (title) job.title = clean(title);

  if (fresh && cache) {
    const rows = (cache.progress || []).filter((p) => typeof p?.overall_readiness === "number");
    rows.sort((a, b) => String(b.recorded_at || "").localeCompare(String(a.recorded_at || "")));
    if (rows.length) job.readiness = Math.round(rows[0].overall_readiness as number);
    else if (typeof cache.gap?.match_score === "number") job.readiness = Math.round(cache.gap.match_score);
  }
  const skills = (defend?.technologies || []).map((s) => clean(s, 60)).filter(Boolean);
  if (skills.length) job.skills = Array.from(new Set(skills)).slice(0, 15);

  // Only claim an "active job" when there is one, or when the user has
  // analyzed something in this browser.
  if (!job.title && !getActiveJob()) return null;
  return Object.keys(job).length ? job : null;
}

export function buildAppContext(pathname: string, job: HelpJob | null): HelpContextPayload {
  const ctx: HelpContextPayload = { surface: "app", page: { title: routeTitle(pathname), path: pathname } };
  if (job) ctx.job = job;
  return ctx;
}

/** "Check my fit · Senior AI Engineer @ Acme" */
export function contextLabel(pathname: string, job: HelpJob | null): string {
  const parts = [routeTitle(pathname)];
  if (job?.title) parts.push(job.company ? `${job.title} @ ${job.company}` : job.title);
  return parts.join(" · ");
}

const STARTERS: Record<string, string[]> = {
  "/": ["What does OfferReady do?", "Where should I start?", "How is readiness scored?"],
  "/analyze": ["What should I paste here?", "How do I read the gap analysis?", "What happens after I analyze a job?"],
  "/jobs": ["Which job should I prepare first?", "What does prep progress mean?", "How do I add another job?"],
  "/jobs/:id": ["What should I do next for this job?", "Summarize the gaps for this role", "How do I raise readiness here?"],
  "/fit": ["How do I raise my match score?", "Which missing keywords matter most?", "Is my resume stored anywhere?"],
  "/questions": ["How should I practice these questions?", "Give me a 2-minute answer structure", "Which questions should I do first?"],
  "/defend": ["How do I hold a trade-off under pushback?", "What do interviewers look for here?", "Walk me through a strong answer"],
  "/dashboard": ["How is my readiness score calculated?", "What will raise my score fastest?", "What should I do next?"],
  "/practice": ["Make me a 20-minute practice plan", "Flashcards or timed exam: which first?", "How do I find my weakest topics?"],
  "/simulator": ["How do I handle the follow-up question?", "Give me a mock interview warm-up", "How long should each answer be?"],
  "/account": ["What's included in Pro?", "Free vs Pro: which do I need?", "How do I manage my plan?"],
  "/example": ["Walk me through this example", "How would this work for my job?", "Where do I start with my own job?"],
};

export function startersFor(pathname: string, job: HelpJob | null): string[] {
  const base = STARTERS[routePattern(pathname)] || STARTERS["/"];
  const out = job?.title ? [`What should I study first for ${job.title}?`, ...base] : [...base];
  return out.slice(0, 4);
}
