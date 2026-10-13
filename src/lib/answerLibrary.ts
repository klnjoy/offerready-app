/* Your answer library: the best version of each answer you've worked on,
 * saved from the Copilot or from practice. KEYS.answerLibrary (synced list). */

import { useCallback, useEffect, useState } from "react";
import { KEYS, readJSON, writeJSON } from "./storage";

export interface SavedAnswer {
  id: string;
  jobId: string;
  jobTitle: string;
  question: string;
  answer: string;
  /** Latest AI score for this answer, when it was graded. */
  score: number | null;
  source: "copilot" | "practice";
  createdAt: string;
  updatedAt: string;
}

const EVT = "offerready:answers";
const MAX = 300;
const norm = (q: string) => q.toLowerCase().replace(/[^a-z0-9]+/g, " ").trim();

export function loadAnswers(): SavedAnswer[] {
  const v = readJSON<SavedAnswer[]>(KEYS.answerLibrary, []);
  return Array.isArray(v) ? v.filter((x) => x && typeof x.id === "string" && typeof x.answer === "string") : [];
}

function save(list: SavedAnswer[]) {
  writeJSON(KEYS.answerLibrary, list.slice(0, MAX));
  try { window.dispatchEvent(new Event(EVT)); } catch { /* non-DOM */ }
}

/** Save (or replace) the answer for this job + question. */
export function saveAnswer(a: Omit<SavedAnswer, "id" | "createdAt" | "updatedAt">): SavedAnswer {
  const list = loadAnswers();
  const now = new Date().toISOString();
  const i = list.findIndex((x) => x.jobId === a.jobId && norm(x.question) === norm(a.question));
  const entry: SavedAnswer = i >= 0
    ? { ...list[i], ...a, updatedAt: now }
    : { ...a, id: "a" + Date.now().toString(36) + Math.random().toString(36).slice(2, 6), createdAt: now, updatedAt: now };
  const next = i >= 0 ? [entry, ...list.filter((_, k) => k !== i)] : [entry, ...list];
  save(next);
  return entry;
}

export function deleteAnswer(id: string): void {
  save(loadAnswers().filter((x) => x.id !== id));
}

export function useAnswers(): SavedAnswer[] {
  const [list, setList] = useState<SavedAnswer[]>(loadAnswers);
  const on = useCallback(() => setList(loadAnswers()), []);
  useEffect(() => {
    window.addEventListener(EVT, on);
    window.addEventListener("storage", on);
    return () => { window.removeEventListener(EVT, on); window.removeEventListener("storage", on); };
  }, [on]);
  return list;
}

/** Story text the Copilot may quote (title + STAR fields). */
export function storyText(s: { title: string; situation: string; task: string; action: string; result: string; metrics: string }): string {
  return [s.title, s.situation, s.task, s.action, s.result, s.metrics].filter((x) => x && x.trim()).join(" — ");
}
