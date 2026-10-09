/* Which of a job's questions you've practised, and how it went. Stored per
 * job (KEYS.questionProgress, synced to the account), keyed by a short hash of
 * the question text so a regenerated set starts fresh. */

import { useEffect, useState } from "react";
import { KEYS, onDataChanged, readJSON, writeJSON } from "./storage";

export interface QProgress { score: number; how: "ai" | "self"; at: string }
type Store = Record<string, Record<string, QProgress>>;

/** Short, stable key for a question's text (FNV-1a). */
export function qKey(prompt: string): string {
  let h = 0x811c9dc5;
  const s = String(prompt || "").trim().toLowerCase();
  for (let i = 0; i < s.length; i++) { h ^= s.charCodeAt(i); h = Math.imul(h, 0x01000193); }
  return (h >>> 0).toString(36);
}

export function useQuestionProgress(jobId: string): [Record<string, QProgress>, (prompt: string, p: QProgress) => void] {
  const read = () => (readJSON<Store>(KEYS.questionProgress, {})[jobId] || {});
  const [map, setMap] = useState<Record<string, QProgress>>(read);
  useEffect(() => { setMap(read()); return onDataChanged([KEYS.questionProgress], () => setMap(read())); }, [jobId]); // eslint-disable-line react-hooks/exhaustive-deps
  const save = (prompt: string, p: QProgress) => {
    if (!jobId) return;
    const all = readJSON<Store>(KEYS.questionProgress, {});
    const cur = all[jobId] || {};
    const k = qKey(prompt);
    // Keep the better score; a newer AI grade replaces a self-rating.
    const prev = cur[k];
    const keep = prev && prev.score > p.score && !(p.how === "ai" && prev.how === "self") ? { ...prev, at: p.at } : p;
    all[jobId] = { ...cur, [k]: keep };
    writeJSON(KEYS.questionProgress, all);
    setMap(all[jobId]);
  };
  return [map, save];
}
