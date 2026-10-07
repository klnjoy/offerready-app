/* Typed client for the OfferReady API (../api). No DOM here, so it can be
 * reused from React Native as-is.
 *
 * Every call resolves (never throws) to { status, body }. status 0 means the
 * request never reached the server, so screens can show the same
 * status-specific messages the MkDocs scripts did. */

import { API_BASE } from "../config";
import type {
  Analysis, AnswerFeedback, GapResult, GeneratedQuestion, JobDetail, JobRow, Scenario,
} from "../types";

export interface ApiResult<T> {
  status: number;
  body: (T & { error?: string; reason?: string; upgrade?: boolean }) | null;
}

type Method = "GET" | "POST" | "DELETE";

async function call<T>(path: string, opts: { method?: Method; token?: string | null; body?: unknown } = {}): Promise<ApiResult<T>> {
  const headers: Record<string, string> = {};
  if (opts.body !== undefined) headers["Content-Type"] = "application/json";
  if (opts.token) headers.Authorization = "Bearer " + opts.token;
  try {
    const r = await fetch(API_BASE + path, {
      method: opts.method || "GET",
      headers,
      body: opts.body !== undefined ? JSON.stringify(opts.body) : undefined,
    });
    let body: ApiResult<T>["body"] = null;
    try {
      body = await r.json();
    } catch {
      body = null;
    }
    return { status: r.status, body };
  } catch {
    return { status: 0, body: null };
  }
}

// ---- AI router (api/ai.js) ----------------------------------------------

export function analyzeJob(payload: { jobDescription: string; targetRole?: string; resume?: string }) {
  return call<{ analysis: Analysis; model?: string }>("/api/ai", {
    method: "POST",
    body: { action: "analyze_jd", ...payload },
  });
}

export function runGapAnalysis(
  token: string | null,
  p: { jobId: string | null; role: string; jobDescription: string; resumeText: string },
) {
  return call<{ result: GapResult; saved?: boolean; job_id?: string | null }>("/api/ai", {
    method: "POST",
    token,
    body: {
      action: "gap_analysis",
      job_id: p.jobId || null,
      jobTitle: p.role,
      targetRole: p.role,
      jobDescription: p.jobDescription,
      resumeText: p.resumeText,
    },
  });
}

export function generateQuestions(token: string | null, p: { jobId: string | null; role: string; jobDescription: string }) {
  return call<{ questions: GeneratedQuestion[]; counts?: Record<string, number>; saved?: boolean }>("/api/ai", {
    method: "POST",
    token,
    body: {
      action: "generate_questions",
      job_id: p.jobId || null,
      jobTitle: p.role,
      targetRole: p.role,
      jobDescription: p.jobDescription,
    },
  });
}

// ---- jobs (api/jobs) -----------------------------------------------------

export function listJobs(token: string) {
  return call<{ ok: boolean; jobs: JobRow[] }>("/api/jobs", { token });
}

export function getJob(token: string, id: string) {
  return call<{ ok: boolean } & JobDetail>("/api/jobs/" + encodeURIComponent(id), { token });
}

export function createJob(token: string, p: { analysis: Analysis; title: string; jobDescription: string; model: string }) {
  return call<{ ok: boolean; job: JobRow }>("/api/jobs", { method: "POST", token, body: p });
}

export function deleteJob(token: string, id: string) {
  return call<{ ok: boolean; deleted: string }>("/api/jobs/" + encodeURIComponent(id), { method: "DELETE", token });
}

export interface ReadinessSummary {
  overall?: number;
}

export function completePractice(
  token: string,
  jobId: string,
  p: { sessionId: string; category: string; contentSlug: string; score: number; completedAt: string },
) {
  return call<{ ok: boolean; readiness?: ReadinessSummary }>("/api/jobs/" + encodeURIComponent(jobId), {
    method: "POST",
    token,
    body: {
      action: "complete_practice",
      sessionId: p.sessionId,
      category: p.category,
      mode: "scenario",
      contentSlug: p.contentSlug,
      score: p.score,
      completed: true,
      completedAt: p.completedAt,
    },
  });
}

// ---- premium scenarios (api/premium) -----------------------------------

export function listScenarios(token: string | null) {
  return call<{ ok: boolean; signedIn?: boolean; scenarios: Scenario[] }>("/api/premium/scenarios", { token });
}

export function getScenario(token: string | null, slug: string) {
  return call<{ ok: boolean; scenario: Scenario; title?: string; teaser?: Scenario["teaser"] }>(
    "/api/premium/scenarios/" + encodeURIComponent(slug),
    { token },
  );
}

export function generateScenario(
  token: string | null,
  p: { targetRole: string; category: string | null; analysis: Analysis; jobId: string | null },
) {
  return call<{ ok: boolean; scenario: Scenario }>("/api/premium/scenarios/generate", {
    method: "POST",
    token,
    body: { targetRole: p.targetRole, category: p.category, analysis: p.analysis, job_id: p.jobId },
  });
}

export function gradeAnswer(token: string | null, p: { prompt: string; signals: string[]; model: string; answer: string }) {
  return call<{ ok: boolean; feedback: AnswerFeedback }>("/api/premium/grade-answer", {
    method: "POST",
    token,
    body: p,
  });
}

// ---- billing --------------------------------------------------------------

export function startCheckout(token: string) {
  // `app: true` asks the API to send the user back to this app (not the
  // study site) after Stripe checkout.
  return call<{ ok: boolean; url: string }>("/api/billing/checkout", { method: "POST", token, body: { app: true } });
}

// ---- help assistant (api/ask.js, api/areas.js) ------------------------------

export interface AskCitation {
  label?: string;
  url?: string;
}

export function askHelp(question: string, area: string) {
  return call<{ answer: string; citations?: (AskCitation | string)[]; area?: string }>("/api/ask", {
    method: "POST",
    body: { question, area, k: 4 },
  });
}

export function listHelpAreas() {
  return call<{ areas: string[] }>("/api/areas");
}
