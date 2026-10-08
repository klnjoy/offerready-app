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

/** Public; pass the token when signed in so the run counts toward the plan. */
export function analyzeJob(payload: { jobDescription: string; targetRole?: string; resume?: string }, token?: string | null) {
  return call<{ analysis: Analysis; model?: string }>("/api/ai", {
    method: "POST",
    token,
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

// ---- plan + usage (api/me/plan.js) ----------------------------------------

export interface PlanUsageEntry {
  used: number | null; // null when usage storage is unavailable
  limit: number | null; // null = unlimited
  unknown?: boolean;
}

export interface PlanResponse {
  plan: "free" | "pro";
  usage: Record<string, PlanUsageEntry>;
  usage_known?: boolean;
  plan_known?: boolean;
  limits?: Record<"free" | "pro", Record<string, number | null>>;
  period_start?: string;
  period_end?: string;
}

/** 403 body from any limited endpoint when the user is over quota. */
export interface QuotaError {
  error: string;
  upgrade: boolean;
  feature?: string;
  used?: number;
  limit?: number | null;
  plan?: "free" | "pro";
  resets_at?: string;
}

export function getPlan(token: string) {
  return call<PlanResponse>("/api/me/plan", { token });
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

/** An app screen the answer points to (route is an app path like "/fit"). */
export interface HelpAction {
  label: string;
  route: string;
}

export interface HelpTurn {
  role: "user" | "assistant";
  content: string;
}

/** Where the user is. Sent as untrusted context; the server validates + caps it. */
export interface HelpContextPayload {
  surface: "app" | "study";
  page?: { title?: string; path?: string };
  job?: { title?: string; company?: string; skills?: string[]; readiness?: number };
}

export interface HelpRequest {
  question: string;
  area?: string;
  history?: HelpTurn[];
  context?: HelpContextPayload;
}

export interface HelpExtras {
  citations?: (AskCitation | string)[];
  actions?: HelpAction[];
  followups?: string[];
}

export function askHelp(question: string, area: string, extra?: Omit<HelpRequest, "question" | "area">) {
  return call<{ answer: string; area?: string; used_llm?: boolean } & HelpExtras>("/api/ask", {
    method: "POST",
    body: { question, area, k: 4, ...(extra || {}) },
  });
}

export type HelpStreamOutcome =
  | { kind: "done"; extras: HelpExtras }
  | { kind: "aborted"; gotDelta: boolean }
  | { kind: "error"; status: number; error?: string; gotDelta: boolean };

export interface SseFrame {
  event: string;
  data: string;
}

/** Incremental SSE parser: feed text chunks, get complete frames back.
 * Frames may be split anywhere across chunks. */
export function createSseParser() {
  let buf = "";
  return (chunk: string): SseFrame[] => {
    buf += chunk.replace(/\r\n?/g, "\n");
    const frames: SseFrame[] = [];
    let cut: number;
    while ((cut = buf.indexOf("\n\n")) >= 0) {
      const block = buf.slice(0, cut);
      buf = buf.slice(cut + 2);
      let event = "message";
      const data: string[] = [];
      for (const line of block.split("\n")) {
        if (line.startsWith(":")) continue;
        const i = line.indexOf(":");
        const field = i < 0 ? line : line.slice(0, i);
        const value = i < 0 ? "" : line.slice(i + 1).replace(/^ /, "");
        if (field === "event") event = value;
        else if (field === "data") data.push(value);
      }
      if (data.length) frames.push({ event, data: data.join("\n") });
    }
    return frames;
  };
}

/** Streamed answer: calls onDelta with visible text as it arrives. Resolves
 * (never throws) once the stream ends, fails, or is aborted. A plain JSON 200
 * (an older server) is treated as one big delta. */
export async function streamHelp(
  req: HelpRequest,
  onDelta: (t: string) => void,
  signal: AbortSignal,
): Promise<HelpStreamOutcome> {
  let gotDelta = false;
  let r: Response;
  try {
    r = await fetch(API_BASE + "/api/ask", {
      method: "POST",
      headers: { "Content-Type": "application/json", Accept: "text/event-stream" },
      body: JSON.stringify({ ...req, k: 4, stream: true }),
      signal,
    });
  } catch {
    return signal.aborted ? { kind: "aborted", gotDelta } : { kind: "error", status: 0, gotDelta };
  }
  const type = r.headers.get("Content-Type") || "";
  if (!r.ok || !type.includes("text/event-stream")) {
    let body: ({ answer?: string; error?: string } & HelpExtras) | null = null;
    try { body = await r.json(); } catch { body = null; }
    if (r.ok && body?.answer) {
      onDelta(body.answer);
      return { kind: "done", extras: { citations: body.citations, actions: body.actions, followups: body.followups } };
    }
    return { kind: "error", status: r.ok ? 502 : r.status, error: body?.error, gotDelta };
  }
  if (!r.body) return { kind: "error", status: 200, gotDelta };
  const reader = r.body.getReader();
  const decoder = new TextDecoder();
  const parse = createSseParser();
  try {
    for (;;) {
      const { value, done } = await reader.read();
      const frames = parse(done ? decoder.decode() + "\n\n" : decoder.decode(value, { stream: true }));
      for (const f of frames) {
        let d: { t?: string; error?: string } & HelpExtras;
        try { d = JSON.parse(f.data); } catch { continue; }
        if (f.event === "delta" && typeof d.t === "string") { gotDelta = true; onDelta(d.t); }
        else if (f.event === "done") { reader.cancel().catch(() => {}); return { kind: "done", extras: d }; }
        else if (f.event === "error") return { kind: "error", status: 200, error: d.error, gotDelta };
      }
      if (done) break;
    }
  } catch {
    return signal.aborted ? { kind: "aborted", gotDelta } : { kind: "error", status: 0, gotDelta };
  }
  // Stream closed without a done frame.
  return signal.aborted ? { kind: "aborted", gotDelta } : { kind: "error", status: 200, gotDelta };
}

export function listHelpAreas() {
  return call<{ areas: string[] }>("/api/areas");
}

// ---- voice mock interview (api/premium/mock-turn.js) ------------------------

export type MockType = "behavioral" | "technical" | "system_design" | "mixed";
export type MockStyle = "friendly" | "neutral" | "tough";

export interface MockScores {
  structure: number;
  depth: number;
  relevance: number;
  communication: number;
}

export interface MockFeedback {
  scores: MockScores;
  strengths: string[];
  improve: string[];
  strong_answer_outline: string[];
}

export interface MockTurnRequest {
  session_id: string;
  session_token?: string;
  turn_index: number;
  type: MockType;
  style: MockStyle;
  length: 3 | 5;
  question: string;
  transcript: string;
  is_followup: boolean;
  allow_followup: boolean;
  need_next: boolean;
  history: { question: string; answer: string }[];
  job?: { title?: string; company?: string; seniority?: string; skills?: string[] } | null;
}

export interface MockTurnResponse {
  ok: boolean;
  model?: string;
  session_token?: string;
  feedback: MockFeedback;
  followup?: string;
  next_question?: string;
  /** Turn 0 only: the remaining main questions for the session. */
  questions?: string[];
  quota?: { plan: string; used: number; limit: number | null };
  // 403 over quota / 409 expired session
  feature?: string;
  used?: number;
  limit?: number | null;
  plan?: string;
  restart?: boolean;
  fallback?: boolean;
}

/** One interview turn. Requires sign-in; turn 0 counts one voice_mock session. */
export function mockTurn(token: string | null, req: MockTurnRequest) {
  return call<MockTurnResponse>("/api/premium/mock-turn", { method: "POST", token, body: req });
}
