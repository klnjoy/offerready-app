/* Your resume, entered once: shows the saved resume ("Using your saved
 * resume · Replace · Remove") or an upload / paste editor. Uploading saves it
 * straight away; pasted text is saved with "Save resume" (or by the parent
 * on submit via onPaste). See lib/savedResume.ts for the privacy model. */

import { useState } from "react";
import { extractResume } from "../lib/resumeExtract";
import { resumeLabel, useSavedResume } from "../lib/savedResume";

export const RESUME_PRIVACY =
  "Read in your browser and saved only on this device, so you add it once. When we compare it with a job, the text is used only for that analysis and never stored on our servers.";

export function ResumeField({ onPaste, compact }: {
  /** Pasted (not yet saved) text, so a parent form can save it on submit. */
  onPaste?(text: string): void;
  compact?: boolean;
}) {
  const [saved, save, clear] = useSavedResume();
  const [editing, setEditing] = useState(false);
  const [pasted, setPasted] = useState("");
  const [status, setStatus] = useState("");
  const [err, setErr] = useState("");

  const setPaste = (t: string) => { setPasted(t); onPaste?.(t); };

  const onFile = async (f: File | undefined) => {
    if (!f) return;
    setErr("");
    setStatus("Reading " + f.name + "…");
    try {
      const res = await extractResume(f);
      save(res.text, res.meta.fileName);
      setStatus("");
      setPaste("");
      setEditing(false);
    } catch (e) {
      setStatus("");
      setErr((e as Error).message || "Couldn’t read that file.");
    }
  };

  const savePaste = () => {
    if (pasted.trim().length < 40) { setErr("Paste a bit more of your resume (at least a few lines)."); return; }
    save(pasted, "");
    setPaste("");
    setErr("");
    setEditing(false);
  };

  if (saved && !editing) {
    return (
      <div className={"rf rf-saved" + (compact ? " rf-compact" : "")}>
        <span className="rf-ico" aria-hidden="true">
          <svg viewBox="0 0 24 24" width="20" height="20" fill="none" stroke="currentColor" strokeWidth="1.7" strokeLinecap="round" strokeLinejoin="round"><path d="M14.5 3H7a2 2 0 0 0-2 2v14a2 2 0 0 0 2 2h10a2 2 0 0 0 2-2V7.5L14.5 3Z" /><path d="M14 3v5h5M8.5 14l2.2 2.2L15.5 11.5" /></svg>
        </span>
        <div className="rf-text">
          <strong>Using your saved resume</strong>
          <span className="small muted">{resumeLabel(saved)}</span>
        </div>
        <div className="rf-actions">
          <button type="button" className="btn btn-small" onClick={() => { setEditing(true); setErr(""); }}>Replace</button>
          <button type="button" className="link-btn small" onClick={() => { clear(); setPaste(""); }}>Remove</button>
        </div>
      </div>
    );
  }

  return (
    <div className={"rf rf-edit" + (compact ? " rf-compact" : "")}>
      <div className="rf-upload">
        <label className="btn rf-file-btn">
          <input className="rf-file" type="file" accept=".pdf,.docx,.doc,.txt,.md,application/pdf" aria-label="Upload your resume (PDF, DOCX or TXT)"
            onChange={(e) => { onFile(e.target.files?.[0]); e.target.value = ""; }} />
          Upload PDF, DOCX or TXT
        </label>
        <span className="small muted" aria-live="polite">{status || "or paste the text below"}</span>
      </div>
      <textarea className="input textarea" rows={compact ? 4 : 5} maxLength={16000} aria-label="Resume text"
        placeholder="Paste your resume text here…" value={pasted} onChange={(e) => setPaste(e.target.value)} />
      {err && <p className="error" role="alert">{err}</p>}
      <div className="row wrap">
        {pasted.trim() && <button type="button" className="btn btn-small" onClick={savePaste}>Save resume</button>}
        {saved && <button type="button" className="btn btn-ghost btn-small" onClick={() => { setEditing(false); setPaste(""); setErr(""); }}>Keep the saved one</button>}
      </div>
    </div>
  );
}
