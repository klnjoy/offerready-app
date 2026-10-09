/* Debrief storage (local only, KEYS.debriefs = Debrief[]). A window event
 * keeps the job page and the Debrief screen in sync. */

import { useCallback, useEffect, useState } from "react";
import { KEYS, readJSON, writeJSON } from "./storage";
import { normalizeDebrief, type Debrief } from "./debrief";

const EVT = "offerready:debriefs";
const MAX = 200;

export function loadDebriefs(): Debrief[] {
  const raw = readJSON<unknown[]>(KEYS.debriefs, []);
  return (Array.isArray(raw) ? raw : []).map(normalizeDebrief).filter((d): d is Debrief => !!d);
}

function save(list: Debrief[]) {
  writeJSON(KEYS.debriefs, list.slice(0, MAX));
  try { window.dispatchEvent(new Event(EVT)); } catch { /* non-DOM */ }
}

export function upsertDebrief(d: Debrief): Debrief[] {
  const list = loadDebriefs();
  const i = list.findIndex((x) => x.id === d.id);
  const next = i >= 0 ? list.map((x) => (x.id === d.id ? d : x)) : [d, ...list];
  save(next);
  return next;
}

export function deleteDebrief(id: string): Debrief[] {
  const next = loadDebriefs().filter((x) => x.id !== id);
  save(next);
  return next;
}

export function newId(prefix = "d"): string {
  return prefix + Date.now().toString(36) + Math.random().toString(36).slice(2, 7);
}

/** Live list of every debrief. */
export function useDebriefs(): Debrief[] {
  const [list, setList] = useState<Debrief[]>(loadDebriefs);
  const on = useCallback(() => setList(loadDebriefs()), []);
  useEffect(() => {
    window.addEventListener(EVT, on);
    window.addEventListener("storage", on);
    return () => {
      window.removeEventListener(EVT, on);
      window.removeEventListener("storage", on);
    };
  }, [on]);
  return list;
}
