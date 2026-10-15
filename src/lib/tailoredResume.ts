/* A resume tailored for one job. Tailoring never changes your main resume
 * (lib/savedResume.ts): the accepted bullets are applied to a copy, saved
 * with the job. The job's fit check uses that copy, and you can copy or
 * download it, or delete it to go back to the main resume for that job.
 *
 * PRIVACY: like the main resume, it lives in this browser only
 * (KEYS.tailoredResumes) and is sent only with the one request that needs it. */

import { useEffect, useState } from "react";
import { KEYS, readJSON, writeJSON } from "./storage";
import { MAX_RESUME_CHARS } from "./resumeExtract";

export interface TailoredResume {
  text: string;
  /** The main resume's file name it was made from ("" if pasted). */
  fileName: string;
  /** ms since epoch */
  updatedAt: number;
  /** How many bullets were rewritten. */
  replaced: number;
}

const EVT = "offerready:tailored";

function all(): Record<string, TailoredResume> {
  const v = readJSON<Record<string, TailoredResume>>(KEYS.tailoredResumes, {});
  return v && typeof v === "object" && !Array.isArray(v) ? v : {};
}

export function getTailoredResume(jobId: string): TailoredResume | null {
  if (!jobId) return null;
  const r = all()[jobId];
  if (!r || typeof r.text !== "string" || r.text.trim().length < 40) return null;
  return { text: r.text.slice(0, MAX_RESUME_CHARS), fileName: typeof r.fileName === "string" ? r.fileName : "", updatedAt: Number(r.updatedAt) || 0, replaced: Number(r.replaced) || 0 };
}

export function saveTailoredResume(jobId: string, text: string, fileName: string, replaced: number): void {
  if (!jobId) return;
  const m = all();
  m[jobId] = { text: String(text).slice(0, MAX_RESUME_CHARS), fileName: fileName || "", updatedAt: Date.now(), replaced };
  writeJSON(KEYS.tailoredResumes, m);
  try { window.dispatchEvent(new Event(EVT)); } catch { /* non-DOM */ }
}

export function deleteTailoredResume(jobId: string): void {
  const m = all();
  if (!(jobId in m)) return;
  delete m[jobId];
  writeJSON(KEYS.tailoredResumes, m);
  try { window.dispatchEvent(new Event(EVT)); } catch { /* non-DOM */ }
}

export function useTailoredResume(jobId: string): TailoredResume | null {
  const [r, setR] = useState<TailoredResume | null>(() => getTailoredResume(jobId));
  useEffect(() => {
    const on = () => setR(getTailoredResume(jobId));
    on();
    window.addEventListener(EVT, on);
    window.addEventListener("storage", on);
    return () => { window.removeEventListener(EVT, on); window.removeEventListener("storage", on); };
  }, [jobId]);
  return r;
}

/** Download text as a .txt file. */
export function downloadText(name: string, text: string): void {
  const url = URL.createObjectURL(new Blob([text], { type: "text/plain;charset=utf-8" }));
  const a = document.createElement("a");
  a.href = url;
  a.download = name;
  document.body.appendChild(a);
  a.click();
  a.remove();
  setTimeout(() => URL.revokeObjectURL(url), 1000);
}
