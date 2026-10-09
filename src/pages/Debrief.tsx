/* Interview debrief — log each round while it's fresh (local only,
 * KEYS.debriefs). Questions rated "bad" flow into the job's plan as reviews
 * (lib/debrief.ts → prepPlan debriefTopics); a next round with a date moves
 * the job's interview date, so the plan rolls forward to it. */

import { useEffect, useMemo, useRef, useState, type KeyboardEvent } from "react";
import { API_ENABLED } from "../config";
import {
  FEELINGS, OUTCOME_LABELS, ROUND_LABELS, dateAfterDebrief, debriefReviewTopics, debriefStats, debriefsForJob, statsLine,
  type Debrief, type DebriefQuestion, type Outcome, type Rating, type RoundType,
} from "../lib/debrief";
import { deleteDebrief, newId, upsertDebrief, useDebriefs } from "../lib/debriefStore";
import { syncSharedDebrief, unshareDebrief } from "../lib/communityShare";
import { getOutcomes } from "../lib/jobOutcomes";
import { useAuth } from "../lib/auth";
import { track } from "../lib/track";
import { submitOutcome } from "../components/OutcomeCheckIn";
import { formatDay, getInterviewDate, localDay, setInterviewDate } from "../lib/interviewDates";
import { setActiveJob } from "../lib/readiness";
import { displayJobTitle } from "../lib/roles";
import { Link, useNavigate, useSearchParams } from "../lib/router";
import { useJobs } from "../lib/useJobs";
import { SignInCard } from "../components/AuthForm";
import { DebriefCard } from "../components/DebriefHistory";
import { Card, Loading, Muted } from "../components/ui";
import type { JobRow } from "../types";

const ROUNDS = Object.keys(ROUND_LABELS) as RoundType[];
const OUTCOMES = Object.keys(OUTCOME_LABELS) as Outcome[];
const RATINGS: { key: Rating; label: string }[] = [
  { key: "good", label: "Good" },
  { key: "ok", label: "OK" },
  { key: "bad", label: "Bad" },
];

export default function DebriefPage() {
  const jobs = useJobs();
  const params = useSearchParams();

  if (!API_ENABLED || jobs.status === "disabled") return <div className="page"><Card><Muted>Debriefs attach to saved jobs, which aren{"’"}t enabled on this site yet.</Muted></Card></div>;
  if (jobs.status === "loading") return <div className="page"><Loading /></div>;
  if (jobs.status === "signedout") return (
    <div className="page">
      <SignInCard title="Sign in to log your interviews">
        <Muted>Debriefs attach to a saved job, so the questions that went badly go back into its plan.</Muted>
      </SignInCard>
    </div>
  );
  if (jobs.status === "error") return <div className="page"><Card><p>Couldn{"’"}t load your jobs right now.</p><div className="row"><button type="button" className="btn" onClick={jobs.reload}>Retry</button></div></Card></div>;
  if (!jobs.jobs.length) return (
    <div className="page">
      <Card>
        <h2>Save a job first</h2>
        <Muted>A debrief belongs to the job you interviewed for. Add the job, then log each round here.</Muted>
        <div className="row"><Link className="btn btn-primary" to="/analyze">Add a job</Link></div>
      </Card>
    </div>
  );
  const want = params.get("job") || "";
  const initial = jobs.jobs.some((j) => j.id === want) ? want : jobs.activeId || jobs.jobs[0].id;
  return <DebriefForJobs jobs={jobs.jobs} initialJob={initial} openNew={params.get("new") === "1"} />;
}

function DebriefForJobs({ jobs, initialJob, openNew }: { jobs: JobRow[]; initialJob: string; openNew: boolean }) {
  const navigate = useNavigate();
  const auth = useAuth();
  const all = useDebriefs();
  const today = localDay();
  const [jobId, setJobId] = useState(initialJob);
  const [editing, setEditing] = useState<Debrief | null>(null);
  const [flash, setFlash] = useState<string[]>([]);
  const editorRef = useRef<HTMLDivElement | null>(null);
  const job = jobs.find((j) => j.id === jobId) || jobs[0];
  const title = displayJobTitle(job);

  const list = useMemo(() => debriefsForJob(all, jobId), [all, jobId]);
  const stats = useMemo(() => debriefStats(all, jobId, today), [all, jobId, today]);
  const revisit = useMemo(() => debriefReviewTopics(all, jobId, today), [all, jobId, today]);

  const startNew = () => {
    const iv = getInterviewDate(jobId);
    const date = iv && iv <= today ? iv : today;
    setEditing({
      id: newId(), jobId, date, round: list[0]?.nextRound || "technical", interviewers: "", questions: [], feeling: 0,
      outcome: "waiting", nextDate: "", nextRound: "", notes: "", createdAt: new Date().toISOString(), updatedAt: "",
      company: job?.company || all.find((x) => x.jobId === jobId && x.company)?.company || "",
      // Keep the user's last choice about sharing.
      share: !!all.slice().sort((a, b) => (b.updatedAt || "").localeCompare(a.updatedAt || ""))[0]?.share,
    });
    setFlash([]);
  };

  useEffect(() => { if (openNew) startNew(); }, []); // eslint-disable-line react-hooks/exhaustive-deps
  useEffect(() => {
    if (editing) setTimeout(() => editorRef.current?.scrollIntoView({ behavior: "smooth", block: "start" }), 0);
  }, [editing?.id]); // eslint-disable-line react-hooks/exhaustive-deps

  const switchJob = (id: string) => {
    setJobId(id);
    setActiveJob(id);
    setEditing(null);
    setFlash([]);
    navigate("/debrief?job=" + encodeURIComponent(id), { replace: true });
  };

  const save = (d: Debrief) => {
    const saved = { ...d, updatedAt: new Date().toISOString() };
    const before = all.find((x) => x.id === d.id);
    const next = upsertDebrief(saved);
    track("debrief_saved", { round: saved.round, outcome: saved.outcome, questions: saved.questions.length, shared: !!saved.share });
    if (saved.share || before?.share) void syncSharedDebrief(saved, job);
    // A final result logged here answers the "How did it go?" check-in too.
    if ((saved.outcome === "offer" || saved.outcome === "rejected") && getOutcomes()[jobId]?.outcome !== saved.outcome) {
      void submitOutcome(job, saved.outcome, getInterviewDate(jobId) || saved.date, auth.getAccessToken);
    }
    const msgs = ["Saved your " + ROUND_LABELS[d.round].toLowerCase() + " debrief."];
    const cur = getInterviewDate(jobId);
    const eff = dateAfterDebrief(saved, cur, today);
    if (eff.action === "set") {
      setInterviewDate(jobId, eff.date);
      msgs.push("Interview date moved to " + formatDay(eff.date, { weekday: "long", month: "short", day: "numeric" }) + ". Your plan now runs to the next round.");
    }
    const bad = debriefReviewTopics(next, jobId, today).length;
    if (bad) msgs.push(bad + (bad === 1 ? " question that went badly is" : " questions that went badly are") + " now in your plan for review.");
    setFlash(msgs);
    setEditing(null);
  };

  return (
    <div className="page dto">
      <div className="dto-toolbar">
        {jobs.length > 1 ? (
          <label className="dto-jobpick">
            <span className="td-job-label">Job</span>
            <select className="input" value={jobId} onChange={(e) => switchJob(e.target.value)} aria-label="Job you interviewed for">
              {jobs.map((j) => <option key={j.id} value={j.id}>{displayJobTitle(j)}</option>)}
            </select>
          </label>
        ) : (
          <div className="dto-jobpick"><span className="td-job-label">Job</span><Link className="td-job-title" to={"/jobs/" + encodeURIComponent(jobId)}>{title}</Link></div>
        )}
        {!editing && <button type="button" className="btn btn-primary dto-new" onClick={startNew}>+ Log an interview</button>}
      </div>

      {flash.length > 0 && (
        <div className="dto-flash" role="status">
          {flash.map((m, i) => <p key={i}>{m}</p>)}
          <div className="row"><Link className="btn btn-small" to={"/jobs/" + encodeURIComponent(jobId)}>See your plan</Link></div>
        </div>
      )}

      {stats.rounds > 0 && (
        <div className="td-strip dto-strip" role="group" aria-label="Interview rounds">
          <div className="td-metric">
            <span className="td-metric-num">{stats.rounds}</span>
            <span className="td-metric-label">{stats.rounds === 1 ? "Round logged" : "Rounds logged"}</span>
          </div>
          <div className="td-metric">
            <span className="td-metric-num">{stats.nextInDays != null ? stats.nextInDays : "—"}{stats.nextInDays != null && <small> {stats.nextInDays === 1 ? "day" : "days"}</small>}</span>
            <span className="td-metric-label">{stats.nextInDays != null ? "To the next round" : stats.latest ? OUTCOME_LABELS[stats.latest.outcome] : "Next round"}</span>
          </div>
          <div className="td-metric">
            <span className="td-metric-num">{revisit.length}</span>
            <span className="td-metric-label">To revisit</span>
          </div>
        </div>
      )}

      {editing && (
        <div ref={editorRef} className="dto-editor-wrap">
          <DebriefEditor key={editing.id} initial={editing} jobTitle={title} today={today} onCancel={() => setEditing(null)} onSave={save} />
        </div>
      )}

      {revisit.length > 0 && (
        <section className="card dto-revisit" aria-labelledby="dto-rev-h">
          <div className="td-sec-head">
            <div>
              <h2 id="dto-rev-h">Questions to revisit</h2>
              <p className="muted small">These went badly. They{"’"}re scheduled as reviews in your plan before the next round.</p>
            </div>
          </div>
          <ul className="dto-qlist">
            {revisit.map((t) => (
              <li key={t.topic} className="dto-q dto-q-bad">
                <i className="dto-dot dto-bad" aria-hidden="true" />
                <div>
                  <span className="dto-q-text">{t.topic}</span>
                  <span className="dto-q-note">{ROUND_LABELS[t.round]} · {formatDay(t.date)}{t.note ? " · " + t.note : ""}</span>
                </div>
              </li>
            ))}
          </ul>
        </section>
      )}

      <section className="stack" aria-labelledby="dto-hist-h">
        <div className="dto-hist-bar">
          <h2 id="dto-hist-h" className="dto-h">Debrief history</h2>
          {stats.rounds > 0 && <span className="small muted">{statsLine(stats)}</span>}
        </div>
        {list.length === 0 && !editing ? (
          <div className="card dto-empty">
            <div className="td-empty-mark" aria-hidden="true">{"✎"}</div>
            <div className="stack-sm">
              <h3>No rounds logged for this job yet</h3>
              <p className="muted">Right after each interview, note what they asked and how each answer went. It takes two minutes, and the answers that went badly come back in your plan.</p>
              <div className="row"><button type="button" className="btn btn-primary" onClick={startNew}>Log your first interview</button></div>
            </div>
          </div>
        ) : (
          list.map((d) => (
            <DebriefCard key={d.id} d={d} job={{ title, company: job.company }} onEdit={(x) => { setEditing(x); setFlash([]); }} onDelete={(x) => { deleteDebrief(x.id); if (x.share) void unshareDebrief(x.id); }} />
          ))
        )}
      </section>
    </div>
  );
}

function DebriefEditor({ initial, jobTitle, today, onCancel, onSave }: {
  initial: Debrief; jobTitle: string; today: string; onCancel(): void; onSave(d: Debrief): void;
}) {
  const [d, setD] = useState<Debrief>(initial);
  const [draftQ, setDraftQ] = useState("");
  const [err, setErr] = useState("");
  const set = <K extends keyof Debrief>(k: K, v: Debrief[K]) => setD((x) => ({ ...x, [k]: v }));
  const setQ = (id: string, patch: Partial<DebriefQuestion>) => setD((x) => ({ ...x, questions: x.questions.map((q) => (q.id === id ? { ...q, ...patch } : q)) }));
  const isNew = !initial.updatedAt;

  /** Add one question, or several when a list is pasted (one per line). */
  const addQuestions = (raw: string) => {
    const parts = raw.split(/\n+/).map((s) => s.replace(/^\s*(?:[-*•]|\d+[.)])\s*/, "").trim()).filter(Boolean);
    if (!parts.length) return;
    setD((x) => ({ ...x, questions: [...x.questions, ...parts.map((text) => ({ id: newId("q"), text: text.slice(0, 400), rating: "" as const, note: "" }))].slice(0, 40) }));
    setDraftQ("");
  };
  const onKey = (e: KeyboardEvent<HTMLInputElement>) => {
    if (e.key === "Enter") { e.preventDefault(); addQuestions(draftQ); }
  };

  const submit = () => {
    if (!d.date) return setErr("Add the interview date.");
    if (d.outcome === "next" && d.nextDate && d.nextDate < today && d.nextDate !== initial.nextDate) return setErr("The next round date is in the past. Pick a future date or leave it empty.");
    if (d.share && (d.company || "").trim().length < 2) return setErr("Add the company name to share this round, or untick sharing.");
    setErr("");
    // Include a question still sitting in the input.
    const pending = draftQ.trim() ? draftQ.split(/\n+/).map((s) => s.trim()).filter(Boolean).map((text) => ({ id: newId("q"), text, rating: "" as const, note: "" })) : [];
    onSave({ ...d, questions: [...d.questions, ...pending].slice(0, 40), nextDate: d.outcome === "next" ? d.nextDate : "", nextRound: d.outcome === "next" ? d.nextRound : "" });
  };

  return (
    <section className="card dto-editor" aria-labelledby="dto-ed-h">
      <div className="td-sec-head">
        <div>
          <span className="td-eyebrow">{isNew ? "New debrief" : "Edit debrief"}</span>
          <h2 id="dto-ed-h">How did it go?</h2>
          <p className="muted small">{jobTitle}</p>
        </div>
      </div>
      {err && <p className="error" role="alert">{err}</p>}
      <form className="dto-form" onSubmit={(e) => { e.preventDefault(); submit(); }}>
        <div className="dto-grid2">
          <label className="dto-field">
            <span className="field-label">Interview date</span>
            <input className="input" type="date" value={d.date} max={today} onChange={(e) => set("date", e.target.value)} required />
          </label>
          <label className="dto-field">
            <span className="field-label">Interviewers <span className="muted">(optional)</span></span>
            <input className="input" type="text" value={d.interviewers} maxLength={200} placeholder="e.g. Priya (EM), Tom" onChange={(e) => set("interviewers", e.target.value)} />
          </label>
        </div>

        <fieldset className="dto-field dto-fs">
          <legend className="field-label">Round</legend>
          <div className="dto-chips" role="radiogroup" aria-label="Round type">
            {ROUNDS.map((r) => (
              <button key={r} type="button" role="radio" aria-checked={d.round === r} className={"dto-chip" + (d.round === r ? " on" : "")} onClick={() => set("round", r)}>{ROUND_LABELS[r]}</button>
            ))}
          </div>
        </fieldset>

        <div className="dto-field">
          <span className="field-label" id="dto-q-label">Questions they asked</span>
          <div className="dto-qadd">
            <input className="input" type="text" value={draftQ} aria-labelledby="dto-q-label" placeholder="Type a question and press Enter (or paste a list)"
              onChange={(e) => setDraftQ(e.target.value)} onKeyDown={onKey}
              onPaste={(e) => { const t = e.clipboardData.getData("text"); if (/\n/.test(t.trim())) { e.preventDefault(); addQuestions(t); } }} />
            <button type="button" className="btn" onClick={() => addQuestions(draftQ)} disabled={!draftQ.trim()}>Add</button>
          </div>
          {d.questions.length > 0 ? (
            <ol className="dto-edit-qs">
              {d.questions.map((q, i) => (
                <li key={q.id} className={"dto-edit-q dto-q-" + (q.rating || "none")}>
                  <div className="dto-edit-q-top">
                    <span className="dto-edit-n" aria-hidden="true">{i + 1}</span>
                    <input className="input dto-q-input" value={q.text} aria-label={"Question " + (i + 1)} onChange={(e) => setQ(q.id, { text: e.target.value })} />
                    <button type="button" className="dto-x" aria-label={"Remove question " + (i + 1)} onClick={() => setD((x) => ({ ...x, questions: x.questions.filter((y) => y.id !== q.id) }))}>{"×"}</button>
                  </div>
                  <div className="dto-edit-q-bottom">
                    <div className="dto-rate" role="radiogroup" aria-label={"How question " + (i + 1) + " went"}>
                      {RATINGS.map((r) => (
                        <button key={r.key} type="button" role="radio" aria-checked={q.rating === r.key}
                          className={"dto-rate-btn dto-rate-" + r.key + (q.rating === r.key ? " on" : "")}
                          onClick={() => setQ(q.id, { rating: q.rating === r.key ? "" : r.key })}>{r.label}</button>
                      ))}
                    </div>
                    <input className="input dto-note-input" value={q.note} maxLength={600} aria-label={"Note for question " + (i + 1)}
                      placeholder={q.rating === "bad" ? "What went wrong? What would you say now?" : "Note (optional)"} onChange={(e) => setQ(q.id, { note: e.target.value })} />
                  </div>
                </li>
              ))}
            </ol>
          ) : <p className="small muted">Add each question as you remember it, then rate how your answer went. Bad ones get reviewed in your plan.</p>}
        </div>

        <fieldset className="dto-field dto-fs">
          <legend className="field-label">Overall, how did it feel?</legend>
          <div className="dto-feelpick" role="radiogroup" aria-label="Overall feeling">
            {FEELINGS.map((f, i) => (
              <button key={f} type="button" role="radio" aria-checked={d.feeling === i + 1} className={"dto-feel-btn" + (d.feeling === i + 1 ? " on" : "")} data-f={i + 1} onClick={() => set("feeling", d.feeling === i + 1 ? 0 : i + 1)}>
                <span className="dto-feel-n" aria-hidden="true">{i + 1}</span>{f}
              </button>
            ))}
          </div>
        </fieldset>

        <fieldset className="dto-field dto-fs">
          <legend className="field-label">Outcome</legend>
          <div className="dto-seg dto-seg-grid" role="radiogroup" aria-label="Outcome">
            {OUTCOMES.map((o) => (
              <button key={o} type="button" role="radio" aria-checked={d.outcome === o} className={"dto-seg-btn dto-out-" + o + (d.outcome === o ? " on" : "")} onClick={() => set("outcome", o)}>{OUTCOME_LABELS[o]}</button>
            ))}
          </div>
        </fieldset>

        {d.outcome === "next" && (
          <div className="dto-next">
            <div className="dto-grid2">
              <label className="dto-field">
                <span className="field-label">Next round date</span>
                <input className="input" type="date" min={today} value={d.nextDate} onChange={(e) => set("nextDate", e.target.value)} />
              </label>
              <label className="dto-field">
                <span className="field-label">Next round type</span>
                <select className="input" value={d.nextRound || ""} onChange={(e) => set("nextRound", (e.target.value || "") as RoundType | "")}>
                  <option value="">Not sure yet</option>
                  {ROUNDS.map((r) => <option key={r} value={r}>{ROUND_LABELS[r]}</option>)}
                </select>
              </label>
            </div>
            <p className="small muted">{d.nextDate ? "Saving moves this job’s interview date to " + formatDay(d.nextDate, { weekday: "short", month: "short", day: "numeric" }) + " and re-plans up to it." : "Add the date when you have it and your plan will roll forward to it."}</p>
          </div>
        )}

        <label className="dto-field">
          <span className="field-label">Anything else to remember <span className="muted">(optional)</span></span>
          <textarea className="input sb-textarea" rows={2} maxLength={2000} value={d.notes} placeholder="Team, scope, what they seemed to care about, follow-ups you promised" onChange={(e) => set("notes", e.target.value)} />
        </label>

        <fieldset className="dto-field dto-fs dto-share">
          <legend className="field-label">Help others prepare <span className="muted">(optional)</span></legend>
          <label className="dto-share-check">
            <input type="checkbox" checked={!!d.share} onChange={(e) => set("share", e.target.checked)} />
            <span>Share the questions from this round anonymously</span>
          </label>
          {d.share && (
            <label className="dto-field">
              <span className="field-label">Company</span>
              <input className="input" type="text" value={d.company || ""} maxLength={80} placeholder="e.g. Stripe" onChange={(e) => set("company", e.target.value)} />
            </label>
          )}
          <p className="small muted">
            Shared: the company, round type, month, your questions and how each went, and the outcome. Never shared: your name, the interviewers, your notes or the exact date.
            Other users will only see a company{"’"}s questions once at least 3 people have shared for it. You can un-share any time.
          </p>
        </fieldset>

        <div className="row">
          <button type="submit" className="btn btn-primary">Save debrief</button>
          <button type="button" className="btn btn-ghost" onClick={onCancel}>Cancel</button>
          <span className="small muted">Interviewers and notes stay private to you.</span>
        </div>
      </form>
    </section>
  );
}
