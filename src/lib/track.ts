/* First-party product events (no third-party analytics).
 *
 * A small, fixed set of steps (page views and key actions) inserted into the
 * Supabase table public.product_events (migration 0015: insert-only for
 * clients). Used only to see where beta users drop off.
 *
 * Privacy: no content is ever sent (no job text, answers, resumes or emails).
 * Props are ids/counts/short labels only and are scrubbed. The route is the
 * path only, with ids masked. Respects "Do Not Track". At most 200 events per
 * browser session; page views are counted once per route per session.
 * Every failure is silent: tracking must never break the app. */

import { getSupabaseClient } from "./auth";
import { RELEASE } from "./pwa";
import { currentRoute, scrub } from "./errorReport";

export type TrackEvent =
  | "page_view"
  | "signed_in"
  | "job_added"
  | "questions_generated"
  | "question_practised"
  | "drill_completed"
  | "mock_completed"
  | "checkout_started"
  | "feedback_sent"
  | "debrief_saved"
  | "outcome_reported";

type Props = Record<string, string | number | boolean | null | undefined>;

const ANON_KEY = "offerready.anon.v1";
const SESSION_KEY = "offerready.session.v1";
const COUNT_KEY = "offerready.events.sent.v1";
const MAX_PER_SESSION = 200;

const viewed = new Set<string>();
let memoryCount = 0;
let memAnon = "";
let memSession = "";

/** The app route without the deploy base ("/offerready-app/jobs/:id" → "/jobs/:id"). */
function appRoute(): string {
  const r = currentRoute();
  let base = "/";
  try {
    base = (import.meta.env.BASE_URL as string) || "/";
  } catch {
    base = "/";
  }
  const b = base.endsWith("/") ? base.slice(0, -1) : base;
  const out = b && r.startsWith(b) ? r.slice(b.length) || "/" : r;
  return out.slice(0, 300);
}

function rid(): string {
  try {
    if (typeof crypto !== "undefined" && "randomUUID" in crypto) return crypto.randomUUID().replace(/-/g, "").slice(0, 24);
  } catch {
    /* fall through */
  }
  return (Math.random().toString(36).slice(2) + Date.now().toString(36)).slice(0, 24).padEnd(12, "0");
}

function stored(store: () => Storage, key: string, mem: string): string {
  try {
    const s = store();
    let v = s.getItem(key) || "";
    if (v.length < 8 || v.length > 40) {
      v = mem || rid();
      s.setItem(key, v);
    }
    return v;
  } catch {
    return mem || rid();
  }
}

function ids(): { anon: string; session: string } {
  memAnon = stored(() => localStorage, ANON_KEY, memAnon);
  memSession = stored(() => sessionStorage, SESSION_KEY, memSession);
  return { anon: memAnon, session: memSession };
}

function sentCount(): number {
  try {
    const n = Number(sessionStorage.getItem(COUNT_KEY) || "0");
    return Number.isFinite(n) ? Math.max(n, memoryCount) : memoryCount;
  } catch {
    return memoryCount;
  }
}

function bump(): void {
  memoryCount = sentCount() + 1;
  try {
    sessionStorage.setItem(COUNT_KEY, String(memoryCount));
  } catch {
    /* in-memory count still applies */
  }
}

function disabled(): boolean {
  try {
    if (typeof navigator === "undefined") return true;
    if (navigator.doNotTrack === "1" || (window as unknown as { doNotTrack?: string }).doNotTrack === "1") return true;
    if (navigator.webdriver && !(window as unknown as { __trackInTests?: boolean }).__trackInTests) return true;
    return false;
  } catch {
    return true;
  }
}

function cleanProps(p: Props | undefined): Record<string, string | number | boolean | null> {
  const out: Record<string, string | number | boolean | null> = {};
  if (!p) return out;
  let n = 0;
  for (const [k, v] of Object.entries(p)) {
    if (n >= 8 || !/^[a-z][a-z0-9_]{0,23}$/.test(k) || v === undefined) continue;
    if (typeof v === "string") out[k] = scrub(v).slice(0, 60);
    else if (typeof v === "number") out[k] = Number.isFinite(v) ? Math.round(v * 100) / 100 : null;
    else out[k] = v;
    n++;
  }
  return out;
}

/** Record one product step. Safe anywhere; never throws. */
export function track(event: TrackEvent, props?: Props): void {
  try {
    if (disabled()) return;
    const route = appRoute();
    // Page views count once per route, sign-ins once per session.
    if (event === "page_view" || event === "signed_in") {
      const k = event === "page_view" ? route : "#signed_in";
      if (viewed.has(k)) return;
      viewed.add(k);
    }
    if (sentCount() >= MAX_PER_SESSION) return;
    bump();
    const { anon, session } = ids();
    void send({ anon_id: anon, session_id: session, event, route, props: cleanProps(props), release: RELEASE.slice(0, 64) });
  } catch {
    /* silent */
  }
}

async function userId(): Promise<string | null> {
  const client = getSupabaseClient();
  if (!client) return null;
  try {
    const r = await client.auth.getSession();
    const u = r?.data?.session?.user as { id?: string } | undefined;
    return u && typeof u.id === "string" ? u.id : null;
  } catch {
    return null;
  }
}

async function send(row: Record<string, unknown>) {
  const client = getSupabaseClient();
  if (!client) return;
  try {
    await client.from("product_events").insert({ ...row, user_id: await userId() });
  } catch {
    /* silent */
  }
}

/** Send in-app feedback. Resolves true when it was stored. */
export async function sendFeedback(input: { rating: number | null; message: string; contactOk: boolean }): Promise<boolean> {
  const client = getSupabaseClient();
  if (!client) return false;
  const message = input.message.trim().slice(0, 2000);
  if (!message) return false;
  const uid = await userId();
  try {
    const { error } = await client.from("feedback").insert({
      user_id: uid,
      route: appRoute() || null,
      rating: input.rating && input.rating >= 1 && input.rating <= 5 ? Math.round(input.rating) : null,
      message,
      contact_ok: uid ? !!input.contactOk : false,
      release: RELEASE.slice(0, 64),
      ua: typeof navigator !== "undefined" ? navigator.userAgent.slice(0, 400) : null,
    });
    if (error) return false;
    track("feedback_sent", { rating: input.rating ?? null });
    return true;
  } catch {
    return false;
  }
}
