/* The job's Settings tab: a plain form with Save changes / Cancel for the
 * job's title, company and interview date, the saved resume (saved only when
 * you choose Save resume), and deleting the job. Nothing here changes until
 * you press a button. */

import { useEffect, useState } from "react";
import * as api from "../lib/api";
import { useAuth } from "../lib/auth";
import { formatDay, localDay, useInterviewDate } from "../lib/interviewDates";
import { displayJobTitle } from "../lib/roles";
import { Link } from "../lib/router";
import { RESUME_PRIVACY, ResumeField } from "../components/ResumeField";
import type { JobDetail } from "../types";

export function SettingsTab({ data, onSaved, onDeleted }: {
  data: JobDetail;
  onSaved(title: string, company: string): void;
  onDeleted(): void;
}) {
  const auth = useAuth();
  const jobId = data.job.id;
  const savedTitle = displayJobTitle(data.job) === "Untitled role" ? "" : (data.job.title || "");
  const savedCompany = data.job.company || "";
  const [savedDate, setSavedDate] = useInterviewDate(jobId);

  const [title, setTitle] = useState(savedTitle);
  const [company, setCompany] = useState(savedCompany);
  const [date, setDate] = useState(savedDate);
  const [busy, setBusy] = useState(false);
  const [msg, setMsg] = useState<{ text: string; err?: boolean } | null>(null);

  // Saved values changed (another device, the Overview date card): show them.
  useEffect(() => { setTitle(savedTitle); setCompany(savedCompany); }, [savedTitle, savedCompany]);
  useEffect(() => { setDate(savedDate); }, [savedDate]);

  const nameDirty = title.replace(/\s+/g, " ").trim() !== savedTitle.trim() || company.trim() !== savedCompany.trim();
  const dateDirty = date !== savedDate;
  const dirty = nameDirty || dateDirty;

  // Leaving the page with unsaved changes asks first.
  useEffect(() => {
    if (!dirty) return;
    const warn = (e: BeforeUnloadEvent) => { e.preventDefault(); e.returnValue = ""; };
    window.addEventListener("beforeunload", warn);
    return () => window.removeEventListener("beforeunload", warn);
  }, [dirty]);

  const cancel = () => { setTitle(savedTitle); setCompany(savedCompany); setDate(savedDate); setMsg(null); };

  const save = async () => {
    const nt = title.replace(/\s+/g, " ").trim();
    if (nameDirty && nt.length < 2) { setMsg({ text: "Give the job a title.", err: true }); return; }
    if (dateDirty && date && date < localDay()) { setMsg({ text: "Pick today or a later date for the interview.", err: true }); return; }
    setBusy(true);
    setMsg({ text: "Saving…" });
    if (nameDirty) {
      const tok = await auth.getAccessToken();
      const res = tok ? await api.renameJob(tok, jobId, { title: nt, company: company.trim() }) : null;
      if (!res || res.status !== 200) {
        setBusy(false);
        setMsg({
          text: !res || res.status === 401 ? "Your session expired. Sign in again, then save."
            : res.status === 0 ? "Couldn’t reach the server. Check your connection and save again."
            : res.body?.error || "Couldn’t save the job details. Please try again.",
          err: true,
        });
        return;
      }
      onSaved(nt, company.trim());
    }
    if (dateDirty) setSavedDate(date || null);
    setBusy(false);
    setMsg({ text: "Saved." });
  };

  return (
    <div className="stack js">
      <form className="card js-card" aria-labelledby="js-h" onSubmit={(e) => { e.preventDefault(); void save(); }}>
        <div>
          <h2 id="js-h">Job details</h2>
          <p className="muted small">Change what you need, then choose <strong>Save changes</strong>. Nothing changes until you save.</p>
        </div>
        <div className="js-grid">
          <div className="js-field">
            <label className="field-label" htmlFor="js-title">Job title</label>
            <input id="js-title" className="input" value={title} maxLength={200} placeholder="e.g. Senior AI Engineer"
              onChange={(e) => { setTitle(e.target.value); setMsg(null); }} />
          </div>
          <div className="js-field">
            <label className="field-label" htmlFor="js-company">Company <span className="muted">(optional)</span></label>
            <input id="js-company" className="input" value={company} maxLength={200} placeholder="e.g. Acme"
              onChange={(e) => { setCompany(e.target.value); setMsg(null); }} />
          </div>
          <div className="js-field">
            <label className="field-label" htmlFor="js-date">Interview date <span className="muted">(optional)</span></label>
            <div className="js-date-row">
              <input id="js-date" className="input" type="date" value={date}
                onChange={(e) => { setDate(e.target.value); setMsg(null); }} />
              {date ? <button type="button" className="link-btn small" onClick={() => { setDate(""); setMsg(null); }}>Clear</button> : null}
            </div>
            <p className="muted small">{savedDate ? "Saved: " + formatDay(savedDate, { weekday: "short", month: "short", day: "numeric", year: "numeric" }) + ". " : ""}Your plan fits the days you have.</p>
          </div>
        </div>
        <div className="js-actions">
          <button type="submit" className="btn btn-primary" disabled={!dirty || busy}>{busy ? "Saving…" : "Save changes"}</button>
          <button type="button" className="btn btn-ghost" disabled={!dirty || busy} onClick={cancel}>Cancel</button>
          {msg ? <span className={"js-msg small" + (msg.err ? " error" : " ok")} role={msg.err ? "alert" : "status"}>{msg.text}</span>
            : dirty ? <span className="js-msg small muted" role="status">You have unsaved changes.</span> : null}
        </div>
      </form>

      <section className="card js-card" aria-labelledby="js-res-h">
        <div>
          <h2 id="js-res-h">Your resume</h2>
          <p className="muted small">One resume for every job. A new file or pasted text is saved only when you choose <strong>Save resume</strong>. To see how it matches this job, open the <Link to={"/jobs/" + encodeURIComponent(jobId) + "?tab=resume"}>Resume</Link> tab.</p>
        </div>
        <ResumeField compact confirm />
        <p className="small muted">{RESUME_PRIVACY}</p>
      </section>

      <DeleteJob jobId={jobId} title={displayJobTitle(data.job)} onDeleted={onDeleted} />
    </div>
  );
}

function DeleteJob({ jobId, title, onDeleted }: { jobId: string; title: string; onDeleted(): void }) {
  const auth = useAuth();
  const [confirming, setConfirming] = useState(false);
  const [busy, setBusy] = useState(false);
  const [err, setErr] = useState("");
  const remove = async () => {
    setBusy(true);
    setErr("");
    const tok = await auth.getAccessToken();
    const res = tok ? await api.deleteJob(tok, jobId) : null;
    if (res && (res.status === 200 || res.status === 404)) { onDeleted(); return; }
    setBusy(false);
    setErr(!res || res.status === 401 ? "Your session expired. Sign in again and retry."
      : res.status === 0 ? "Couldn’t reach the server. Check your connection and try again."
      : res.body?.error || "Couldn’t delete this job. Please try again.");
  };
  return (
    <section className="card js-card js-danger" aria-labelledby="js-del-h">
      <div>
        <h2 id="js-del-h">Delete this job</h2>
        <p className="muted small">Deletes the job with its analysis, plan, questions and practice for it. Your resume and stories stay.</p>
      </div>
      {confirming ? (
        <div className="js-actions" role="group" aria-label="Confirm delete">
          <span className="small">Delete <strong>{title}</strong>? This can{"’"}t be undone.</span>
          <button type="button" className="btn btn-danger" disabled={busy} onClick={remove}>{busy ? "Deleting…" : "Delete job"}</button>
          <button type="button" className="btn btn-ghost" disabled={busy} onClick={() => { setConfirming(false); setErr(""); }}>Keep it</button>
        </div>
      ) : (
        <div className="js-actions"><button type="button" className="btn" onClick={() => setConfirming(true)}>Delete this job…</button></div>
      )}
      {err ? <p className="error small" role="alert">{err}</p> : null}
    </section>
  );
}
