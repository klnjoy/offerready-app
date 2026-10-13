/* Interview notes: a plain notepad for during a real interview. The user
 * types the questions as they're asked (no AI, no microphone), then turns the
 * notes into a debrief afterwards.
 *
 * Stored per job in KEYS.interviewNotes on this device only (not synced): a
 * draft that lives for one interview and is cleared once it becomes a
 * debrief. The pure helpers below are unit-test friendly. */

import { useCallback, useEffect, useState } from "react";
import { KEYS, readJSON, writeJSON } from "./storage";
import type { DebriefQuestion, RoundType } from "./debrief";

export interface NoteQuestion {
  id: string;
  text: string;
  note: string;
  /** ISO time it was added. */
  at: string;
}

export interface InterviewNotes {
  jobId: string;
  round: RoundType;
  questions: NoteQuestion[];
  notes: string;
  startedAt: string;
  updatedAt: string;
}

const EVT = "offerready:interviewnotes";
const MAX_Q = 60;

type Store = Record<string, InterviewNotes>;

function load(): Store {
  const m = readJSON<Store>(KEYS.interviewNotes, {});
  return m && typeof m === "object" && !Array.isArray(m) ? m : {};
}

function save(m: Store) {
  writeJSON(KEYS.interviewNotes, m);
  try { window.dispatchEvent(new Event(EVT)); } catch { /* non-DOM */ }
}

export function emptyNotes(jobId: string, round: RoundType = "technical"): InterviewNotes {
  const now = new Date().toISOString();
  return { jobId, round, questions: [], notes: "", startedAt: now, updatedAt: now };
}

export function getNotes(jobId: string): InterviewNotes | null {
  const n = load()[jobId];
  return n && Array.isArray(n.questions) ? n : null;
}

export function putNotes(n: InterviewNotes): void {
  const m = load();
  m[n.jobId] = { ...n, questions: n.questions.slice(0, MAX_Q), updatedAt: new Date().toISOString() };
  save(m);
}

export function clearNotes(jobId: string): void {
  const m = load();
  if (!(jobId in m)) return;
  delete m[jobId];
  save(m);
}

/** True when the draft has anything worth keeping. */
export function hasContent(n: InterviewNotes | null): boolean {
  return !!n && (n.questions.some((q) => q.text.trim()) || !!n.notes.trim());
}

/** Add a question typed during the interview (trimmed; blanks ignored). */
export function addQuestion(n: InterviewNotes, text: string, id: string, at = new Date().toISOString()): InterviewNotes {
  const t = text.replace(/\s+/g, " ").trim().slice(0, 400);
  if (!t || n.questions.length >= MAX_Q) return n;
  return { ...n, questions: [...n.questions, { id, text: t, note: "", at }] };
}

/** The debrief questions these notes become (unrated, so the user rates them). */
export function toDebriefQuestions(n: InterviewNotes): DebriefQuestion[] {
  return n.questions
    .filter((q) => q.text.trim())
    .map((q) => ({ id: q.id, text: q.text.trim(), rating: "", note: q.note.trim().slice(0, 600) }));
}

/** Minutes since the notes were started (for the "12 min in" clock). */
export function minutesIn(n: InterviewNotes, now = Date.now()): number {
  const t = Date.parse(n.startedAt);
  return isNaN(t) ? 0 : Math.max(0, Math.floor((now - t) / 60000));
}

export function useInterviewNotes(jobId: string): InterviewNotes | null {
  const [n, setN] = useState<InterviewNotes | null>(() => (jobId ? getNotes(jobId) : null));
  const on = useCallback(() => setN(jobId ? getNotes(jobId) : null), [jobId]);
  useEffect(() => {
    on();
    window.addEventListener(EVT, on);
    window.addEventListener("storage", on);
    return () => { window.removeEventListener(EVT, on); window.removeEventListener("storage", on); };
  }, [on]);
  return n;
}
