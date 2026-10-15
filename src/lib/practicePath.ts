/* The practice path: the four steps we suggest, in order, for one job.
 *   1. Questions for this job   (done: 5 answered)
 *   2. Trade-off drill          (done: one drill finished)
 *   3. Your stories             (done: one STAR story for this job)
 *   4. Mock interview           (done: one mock finished)
 * It is a suggestion, not a gate: every step can be skipped. "Done" is read
 * from what's already saved on this device, so it updates as you practise. */

import { useEffect, useState } from "react";
import { getHistory } from "./progressStore";
import { KEYS, onDataChanged, onStorageWrite, readJSON } from "./storage";
import { loadStories } from "./stories";

export type StepKey = "questions" | "drill" | "stories" | "mock";

export interface PathStep {
  key: StepKey;
  n: number;
  to: string;
  /** Takes ?job= so the tool opens on this job. */
  job: boolean;
  label: string;
  short: string;
  /** What to do on this step, in a few words. */
  goal: string;
  done: boolean;
  /** Progress on a step that isn't done yet, e.g. "1/5". */
  progress?: string;
}

const BASE: Omit<PathStep, "done">[] = [
  { key: "questions", n: 1, to: "/questions", job: true, label: "Questions for this job", short: "Questions", goal: "answer 5 questions out loud" },
  { key: "drill", n: 2, to: "/defend", job: true, label: "Trade-off drill", short: "Drill", goal: "hold one design call under push-back" },
  { key: "stories", n: 3, to: "/stories", job: false, label: "Your stories", short: "Stories", goal: "write one STAR story for the behavioral round" },
  { key: "mock", n: 4, to: "/mock", job: false, label: "Mock interview", short: "Mock", goal: "run one mock interview, start to finish" },
];

export const QUESTIONS_GOAL = 5;

function doneMap(jobId: string): Record<StepKey, boolean> {
  const qp = readJSON<Record<string, Record<string, unknown>>>(KEYS.questionProgress, {});
  const answered = jobId ? Object.keys(qp[jobId] || {}).length : 0;
  const drills = readJSON<{ completed?: boolean }[]>(KEYS.scenarioSessions, []);
  const hist = getHistory();
  const stories = loadStories();
  return {
    questions: answered >= QUESTIONS_GOAL,
    drill: (Array.isArray(drills) && drills.some((d) => d && d.completed)) || hist.some((h) => h.mode === "scenario" && !h.partial),
    stories: stories.some((s) => (jobId ? s.jobIds.includes(jobId) || s.jobIds.length === 0 : true)),
    mock: hist.some((h) => h.mode === "mock" && !h.partial),
  };
}

export function practicePath(jobId: string): PathStep[] {
  const d = doneMap(jobId);
  const qp = readJSON<Record<string, Record<string, unknown>>>(KEYS.questionProgress, {});
  const answered = jobId ? Object.keys(qp[jobId] || {}).length : 0;
  return BASE.map((s) => ({
    ...s, done: d[s.key],
    progress: s.key === "questions" && !d.questions && answered > 0 ? answered + "/" + QUESTIONS_GOAL : undefined,
  }));
}

/** Link to a step, keeping the job. */
export function stepHref(s: Pick<PathStep, "to" | "job">, jobId: string): string {
  return s.job && jobId ? s.to + "?job=" + encodeURIComponent(jobId) : s.to;
}

/** The step after `cur`, or null after the last one. */
export function nextStep(path: PathStep[], cur: StepKey | null): PathStep | null {
  if (!cur) return path.find((s) => !s.done) || null;
  const i = path.findIndex((s) => s.key === cur);
  return path[i + 1] || null;
}

const WATCH: string[] = [KEYS.questionProgress, KEYS.scenarioSessions, KEYS.history, KEYS.stories];

export function usePracticePath(jobId: string): PathStep[] {
  const [path, setPath] = useState(() => practicePath(jobId));
  useEffect(() => {
    const refresh = () => setPath(practicePath(jobId));
    refresh();
    const offSync = onDataChanged(WATCH, refresh);
    // Local writes (an answer scored, a story saved) update the path too.
    const offWrite = onStorageWrite((key) => { if (WATCH.includes(key)) setTimeout(refresh, 0); });
    return () => { offSync(); offWrite(); };
  }, [jobId]);
  return path;
}
