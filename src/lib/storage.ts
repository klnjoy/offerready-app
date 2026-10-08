/* Local persistence. Same keys and shapes as the MkDocs scripts so the data
 * model is unchanged. (localStorage is per-origin, so data doesn't carry over
 * between the docs site and this app automatically — the server is the
 * source of truth for jobs/readiness anyway.)
 *
 * All access goes through this file so a React Native port can swap in
 * AsyncStorage/MMKV without touching the screens. */

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
  /** jobId → { start, forDate, done: { taskId: "YYYY-MM-DD" } } (Today plan) */
  prepPlan: "offerready.prepPlan.v1",
  /** STAR story bank */
  stories: "offerready.stories.v1",
} as const;

export function readString(key: string): string | null {
  try {
    return localStorage.getItem(key);
  } catch {
    return null;
  }
}

export function writeString(key: string, value: string): void {
  try {
    localStorage.setItem(key, value);
  } catch {
    /* storage full or blocked — non-fatal */
  }
}

export function removeKey(key: string): void {
  try {
    localStorage.removeItem(key);
  } catch {
    /* ignore */
  }
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
