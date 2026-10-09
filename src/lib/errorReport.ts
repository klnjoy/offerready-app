/* First-party error reporting (no third-party SDK).
 *
 * Captures uncaught errors (window "error"), unhandled promise rejections and
 * React render errors (ErrorBoundary → reportError) and inserts them into the
 * Supabase table public.client_errors (migration 0013: insert-only for
 * clients, nobody can read rows back through the API).
 *
 * Privacy: before anything is sent, query strings and #fragments are cut from
 * every URL, and anything that looks like an email address, a token, a key or
 * a password is replaced. The route is the path only, with ids masked.
 * Limits: identical errors are sent once; at most 10 reports per browser
 * session. Every failure here is silent: reporting must never break the app. */

import { getSupabaseClient } from "./auth";
import { RELEASE } from "./pwa";

const MAX_PER_SESSION = 10;
const SESSION_KEY = "offerready.errors.sent.v1";
const LIMITS = { message: 1000, stack: 8000, route: 300, ua: 400, release: 64 } as const;

const seen = new Set<string>();
let memoryCount = 0;
let installed = false;

// ---- scrubbing -----------------------------------------------------------------

const EMAIL_RE = /[A-Za-z0-9._%+-]+@[A-Za-z0-9-]+(?:\.[A-Za-z0-9-]+)*\.[A-Za-z]{2,}/g;
const JWT_RE = /\beyJ[A-Za-z0-9_-]{5,}\.[A-Za-z0-9_-]{5,}\.[A-Za-z0-9_-]{5,}/g;
const BEARER_RE = /\b(Bearer|Basic)\s+[A-Za-z0-9._~+/=-]+/gi;
const KV_SECRET_RE = /\b(access_token|refresh_token|id_token|token|api[_-]?key|apikey|secret|password|passwd|pwd|code|session|auth|authorization|key)(["']?\s*[:=]\s*["']?)[^\s"'&,;)}\]]+/gi;
const PREFIXED_KEY_RE = /\b(?:sk|pk|rk|sb|whsec|ghp|gho|github_pat|xox[abp])_[A-Za-z0-9_-]{8,}/g;
const LONG_SECRET_RE = /\b[A-Za-z0-9_-]{32,}\b/g;
// URL with a query and/or fragment: keep scheme://host/path only.
const URL_QUERY_RE = /((?:https?|wss?|blob):\/\/[^\s?#"'<>()]+)[?#][^\s"'<>()]*/gi;
// Relative paths with a query ("/jobs?id=…").
const REL_QUERY_RE = /((?:^|[\s("'])\/[^\s?#"'<>()]*)[?#][^\s"'<>()]*/g;

/** Remove query strings, fragments, emails and anything token-like. */
export function scrub(input: string): string {
  let s = String(input || "");
  s = s.replace(URL_QUERY_RE, "$1");
  s = s.replace(REL_QUERY_RE, "$1");
  s = s.replace(EMAIL_RE, "[email]");
  s = s.replace(JWT_RE, "[token]");
  s = s.replace(BEARER_RE, "$1 [token]");
  s = s.replace(PREFIXED_KEY_RE, "[token]");
  s = s.replace(KV_SECRET_RE, "$1$2[redacted]");
  s = s.replace(LONG_SECRET_RE, (m) => (/^\d+$/.test(m) ? m : "[token]"));
  return s;
}

const UUID_RE = /[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}/gi;

/** The current page as a path only ("/jobs/:id"), never the query or hash. */
export function currentRoute(): string {
  try {
    return scrub(window.location.pathname).replace(UUID_RE, ":id").replace(/\/\d{3,}(?=\/|$)/g, "/:id");
  } catch {
    return "";
  }
}

function clip(s: string | null | undefined, n: number): string | null {
  if (s == null) return null;
  const t = String(s);
  return t.length > n ? t.slice(0, n - 1) + "…" : t;
}

// ---- limits ------------------------------------------------------------------

function sentCount(): number {
  try {
    const n = Number(sessionStorage.getItem(SESSION_KEY) || "0");
    return Number.isFinite(n) ? Math.max(n, memoryCount) : memoryCount;
  } catch {
    return memoryCount;
  }
}

function bumpCount(): void {
  memoryCount = sentCount() + 1;
  try {
    sessionStorage.setItem(SESSION_KEY, String(memoryCount));
  } catch {
    /* blocked storage: the in-memory count still applies */
  }
}

/** Errors we can't act on, or that come from the browser or an extension. */
function isNoise(message: string, stack: string): boolean {
  if (!message) return true;
  if (/^Script error\.?$/i.test(message)) return true; // cross-origin, no details
  if (/ResizeObserver loop/i.test(message)) return true;
  if (/(chrome|moz|safari(-web)?)-extension:\/\//i.test(stack + " " + message)) return true;
  return false;
}

// ---- reporting -----------------------------------------------------------------

export interface ReportExtra {
  /** "error" | "unhandledrejection" | "boundary" — kept in the message prefix. */
  kind?: string;
  componentStack?: string | null;
}

function describe(err: unknown): { message: string; stack: string } {
  if (err instanceof Error) return { message: (err.name && err.name !== "Error" ? err.name + ": " : "") + err.message, stack: err.stack || "" };
  if (typeof err === "string") return { message: err, stack: "" };
  try {
    return { message: JSON.stringify(err).slice(0, 500), stack: "" };
  } catch {
    return { message: String(err), stack: "" };
  }
}

/** Report one error. Safe to call anywhere; never throws. */
export function reportError(err: unknown, extra: ReportExtra = {}): void {
  try {
    const d = describe(err);
    let stack = d.stack;
    if (extra.componentStack) stack = (stack ? stack + "\n\nComponent stack:" : "Component stack:") + extra.componentStack;
    if (isNoise(d.message, stack)) return;
    const message = scrub((extra.kind && extra.kind !== "error" ? "[" + extra.kind + "] " : "") + d.message);
    const key = message + "|" + (stack.split("\n").find((l) => /\bat\b|@/.test(l)) || "");
    if (seen.has(key)) return;
    seen.add(key);
    if (sentCount() >= MAX_PER_SESSION) return;
    bumpCount();
    void send({
      route: clip(currentRoute(), LIMITS.route),
      message: clip(message, LIMITS.message) || "(no message)",
      stack: clip(scrub(stack), LIMITS.stack),
      ua: clip(typeof navigator !== "undefined" ? navigator.userAgent : "", LIMITS.ua),
      release: clip(RELEASE, LIMITS.release),
    });
  } catch {
    /* silent */
  }
}

async function send(row: { route: string | null; message: string; stack: string | null; ua: string | null; release: string | null }) {
  const client = getSupabaseClient();
  if (!client) return;
  try {
    let userId: string | null = null;
    try {
      const r = await client.auth.getSession();
      const user = r?.data?.session?.user as { id?: string } | undefined;
      userId = user && typeof user.id === "string" ? user.id : null;
    } catch {
      userId = null;
    }
    // insert() without select(): needs INSERT only (no read-back).
    await client.from("client_errors").insert({ ...row, user_id: userId });
  } catch {
    /* silent: a failed insert is swallowed here, so it can't trigger another report */
  }
}

/** Install the global listeners once (main.tsx). */
export function initErrorReporting(): void {
  if (installed || typeof window === "undefined") return;
  installed = true;
  window.addEventListener("error", (e: ErrorEvent) => {
    // Resource load failures (img/script) fire "error" without an ErrorEvent message.
    if (!e || (!e.message && !e.error)) return;
    reportError(e.error || e.message, { kind: "error" });
  });
  window.addEventListener("unhandledrejection", (e: PromiseRejectionEvent) => {
    reportError(e ? e.reason : "unhandled rejection", { kind: "unhandledrejection" });
  });
}
