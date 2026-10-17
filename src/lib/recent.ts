/* Recently visited pages (shown on More), kept on this device: the last four
 * distinct pages with their titles. */

import { readJSON, writeJSON } from "./storage";

const KEY = "offerready.recent.v1";
export type Visit = { path: string; title: string };

export function rememberVisit(path: string, title: string): void {
  try {
    const list = readJSON<Visit[]>(KEY, []).filter((v) => v && v.path !== path);
    writeJSON(KEY, [{ path, title }, ...list].slice(0, 4));
  } catch { /* storage blocked */ }
}

export function recentVisits(): Visit[] {
  const v = readJSON<Visit[]>(KEY, []);
  return Array.isArray(v) ? v.filter((x) => x && typeof x.path === "string" && typeof x.title === "string") : [];
}
