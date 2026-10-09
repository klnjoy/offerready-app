/* The user's resume, entered once and reused everywhere (Add a job, the job
 * page's fit check, Tailor, the voice mock).
 *
 * PRIVACY: the text lives in this browser's localStorage only (KEYS.resume).
 * It is sent to the API only for the one request that needs it (job analysis,
 * fit check, tailoring), and the server does not store it. Remove clears it. */

import { useCallback, useEffect, useState } from "react";
import { KEYS, readJSON, removeKey, writeJSON } from "./storage";
import { MAX_RESUME_CHARS } from "./resumeExtract";

export interface SavedResume {
  text: string;
  /** Uploaded file name, or "" when the text was pasted. */
  fileName: string;
  /** ms since epoch */
  updatedAt: number;
}

const EVT = "offerready:resume";
const MIN_CHARS = 40;

export function getSavedResume(): SavedResume | null {
  const v = readJSON<SavedResume | null>(KEYS.resume, null);
  if (!v || typeof v.text !== "string" || v.text.trim().length < MIN_CHARS) return null;
  return { text: v.text.slice(0, MAX_RESUME_CHARS), fileName: typeof v.fileName === "string" ? v.fileName : "", updatedAt: Number(v.updatedAt) || 0 };
}

export function saveResume(text: string, fileName = ""): SavedResume | null {
  const t = String(text || "").trim().slice(0, MAX_RESUME_CHARS);
  if (t.length < MIN_CHARS) return null;
  const rec: SavedResume = { text: t, fileName: fileName || "", updatedAt: Date.now() };
  writeJSON(KEYS.resume, rec);
  try { window.dispatchEvent(new Event(EVT)); } catch { /* non-DOM */ }
  return rec;
}

export function clearSavedResume(): void {
  removeKey(KEYS.resume);
  try { window.dispatchEvent(new Event(EVT)); } catch { /* non-DOM */ }
}

/** "resume.pdf · updated 8 Oct" (or "Pasted text · updated …"). */
export function resumeLabel(r: SavedResume): string {
  const when = r.updatedAt ? new Date(r.updatedAt).toLocaleDateString(undefined, { day: "numeric", month: "short", year: "numeric" }) : "";
  return (r.fileName || "Pasted text") + (when ? " · updated " + when : "");
}

/** Live saved resume + setters, kept in sync across mounted screens/tabs. */
export function useSavedResume(): [SavedResume | null, (text: string, fileName?: string) => SavedResume | null, () => void] {
  const [r, setR] = useState<SavedResume | null>(getSavedResume);
  useEffect(() => {
    const on = () => setR(getSavedResume());
    window.addEventListener(EVT, on);
    window.addEventListener("storage", on);
    return () => {
      window.removeEventListener(EVT, on);
      window.removeEventListener("storage", on);
    };
  }, []);
  const save = useCallback((text: string, fileName?: string) => saveResume(text, fileName), []);
  return [r, save, clearSavedResume];
}

/** Skills from `skills` that appear in the resume text (whole word, case-insensitive). */
export function skillsInResume(skills: string[], text: string): string[] {
  const hay = String(text || "").toLowerCase();
  return skills.filter((s) => {
    const t = String(s || "").trim().toLowerCase();
    if (t.length < 2) return false;
    const e = t.replace(/[.*+?^${}()|[\]\\]/g, "\\$&");
    return new RegExp("(^|[^a-z0-9])" + e + "([^a-z0-9]|$)", "i").test(hay);
  });
}
