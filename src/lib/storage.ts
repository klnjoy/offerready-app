/* Local persistence. Same keys and shapes as the MkDocs scripts so the data
 * model is unchanged. (localStorage is per-origin, so data doesn't carry over
 * between the docs site and this app automatically — the server is the
 * source of truth for jobs/readiness anyway.)
 *
 * All access goes through this file so a React Native port can swap in
 * AsyncStorage/MMKV without touching the screens. It is also where account
 * sync (lib/sync.ts) hooks in: writeString/writeJSON/removeKey notify
 * onStorageWrite listeners, and only the keys whitelisted in
 * lib/syncMerge.ts (SYNC_SPECS) follow the account. */

export const KEYS = {
  analysis: "offerready.analysis.v1",
  feedback: "offerready.feedback.v1",
  defendRole: "offerready.defendRole.v1",
  activeJob: "offerready.activeJob.v1",
  readinessCache: "offerready.readiness.cache.v1",
  history: "ip_history_v1",
  activity: "ip_activity_v1",
  scenarioSessions: "or_scenario_sessions_v1",
  genScenarioPrefix: "offerready.genscenario.v1.",
  /** jobId → interview date "YYYY-MM-DD" */
  interviewDates: "offerready.interviewDates.v1",
  /** jobId → { start, forDate, done: { taskId: "YYYY-MM-DD" } } (the job page's plan) */
  prepPlan: "offerready.prepPlan.v1",
  /** jobId → { [questionKey]: { score, how, at } } — practice on "Questions for this job" (lib/questionProgress.ts) */
  questionProgress: "offerready.questionProgress.v1",
  /** STAR story bank */
  stories: "offerready.stories.v1",
  /** Post-interview debriefs (Debrief[], see lib/debrief.ts) */
  debriefs: "offerready.debriefs.v1",
  /** Job offers being compared (Offer[], see lib/offers.ts) */
  offers: "offerready.offers.v1",
  /** The user's resume text, saved in this browser only so it is entered once
   * and reused by Add a job, the job page's fit check, Tailor and the voice
   * mock ({ text, fileName, updatedAt }, see lib/savedResume.ts). Synced to
   * the account ONLY when the user opts in (KEYS.resumeSync). */
  resume: "offerready.resume.v1",
  /** Help bot chats ({ v: 1, activeId, chats: Chat[] }, see components/HelpBot.tsx). */
  helpChats: "offerready.help.chats.v1",
  /** "1" = this device may sync the saved resume to the account (opt-in, lib/sync.ts). */
  resumeSync: "offerready.resume.sync",
  /** key → { t, s, d, del } bookkeeping for account sync (lib/sync.ts). */
  syncMeta: "offerready.sync.meta.v1",
  /** "1" = account sync paused on this device (lib/sync.ts). */
  syncOff: "offerready.sync.off",
} as const;

/** Fired on window after account sync changed local data
 * (detail: { keys: string[] }). Pages holding data in state re-read. */
export const DATA_CHANGED_EVENT = "offerready:data-changed";

/** Subscribe to sync-driven changes of any of `keys`. Returns the unsubscribe. */
export function onDataChanged(keys: string[], fn: () => void): () => void {
  const on = (e: Event) => {
    const changed = ((e as CustomEvent).detail?.keys || []) as string[];
    if (changed.some((k) => keys.includes(k))) fn();
  };
  try { window.addEventListener(DATA_CHANGED_EVENT, on); } catch { /* non-DOM */ }
  return () => { try { window.removeEventListener(DATA_CHANGED_EVENT, on); } catch { /* ignore */ } };
}

/** sessionStorage hand-off to Tailor (resume text, read once and removed).
 * Kept for old links; Tailor now prefers the saved resume (KEYS.resume). */
export const SESSION_KEYS = {
  tailorHandoff: "offerready.tailor.handoff.v1",
} as const;

// ---- write hooks (account sync listens here; see lib/sync.ts) ---------------
/** Called after every write/remove that changed the stored value. `next` is
 * null for a removal. Listeners must not throw (errors are swallowed). */
export type WriteListener = (key: string, prev: string | null, next: string | null) => void;
const writeListeners: WriteListener[] = [];
export function onStorageWrite(fn: WriteListener): () => void {
  writeListeners.push(fn);
  return () => {
    const i = writeListeners.indexOf(fn);
    if (i >= 0) writeListeners.splice(i, 1);
  };
}
function notify(key: string, prev: string | null, next: string | null) {
  if (prev === next) return;
  for (const fn of writeListeners.slice()) {
    try { fn(key, prev, next); } catch { /* never break a write */ }
  }
}

/** Write without notifying listeners (sync applies pulled data with this). */
export function writeStringQuiet(key: string, value: string | null): void {
  try {
    if (value == null) localStorage.removeItem(key);
    else localStorage.setItem(key, value);
  } catch {
    /* ignore */
  }
}

/** Every key this app keeps in localStorage (export / "Your data"). */
export function allLocalKeys(): string[] {
  const out: string[] = [];
  try {
    for (let i = 0; i < localStorage.length; i++) {
      const k = localStorage.key(i);
      if (k && /^(offerready\.|ip_|or_)/.test(k)) out.push(k);
    }
  } catch {
    /* blocked */
  }
  return out.sort();
}

export function readString(key: string): string | null {
  try {
    return localStorage.getItem(key);
  } catch {
    return null;
  }
}

export function writeString(key: string, value: string): void {
  const prev = writeListeners.length ? readString(key) : null;
  try {
    localStorage.setItem(key, value);
  } catch {
    /* storage full or blocked — non-fatal */
    return;
  }
  if (writeListeners.length) notify(key, prev, value);
}

export function removeKey(key: string): void {
  const prev = writeListeners.length ? readString(key) : null;
  try {
    localStorage.removeItem(key);
  } catch {
    /* ignore */
    return;
  }
  if (writeListeners.length && prev != null) notify(key, prev, null);
}

export function readJSON<T>(key: string, fallback: T): T {
  const raw = readString(key);
  if (raw == null) return fallback;
  try {
    const v = JSON.parse(raw);
    return (v ?? fallback) as T;
  } catch {
    return fallback;
  }
}

export function writeJSON(key: string, value: unknown): void {
  writeString(key, JSON.stringify(value));
}
