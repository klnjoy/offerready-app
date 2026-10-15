/* Interview notes (/notes?job=): a plain notepad for during a real interview.
 * Type each question as it's asked (Enter adds it), add a word or two under
 * it, keep other notes below. Everything autosaves on this device. Afterwards,
 * "Turn into a debrief" opens the debrief with the questions filled in.
 *
 * Deliberately nothing else: no AI, no microphone, no answers. */

import { useEffect, useRef, useState, type FormEvent } from "react";
import { ROUND_LABELS, type RoundType } from "../lib/debrief";
import { newId } from "../lib/debriefStore";
import {
  addQuestion, clearNotes, emptyNotes, hasContent, minutesIn, putNotes, useInterviewNotes, type InterviewNotes,
} from "../lib/interviewNotes";
import { Link, useNavigate, useSearchParams } from "../lib/router";
import { useJobs } from "../lib/useJobs";
import { track } from "../lib/track";
import { SignInCard } from "../components/AuthForm";
import { Card, Loading, Muted } from "../components/ui";

export default function InterviewNotesPage() {
  const jobs = useJobs();
  const params = useSearchParams();
  if (jobs.status === "loading") return <div className="page"><Loading /></div>;
  if (jobs.status === "signedout") return (
    <div className="page">
      <SignInCard title="Sign in to take interview notes">
        <Muted>Notes belong to the job you’re interviewing for, so they can become a debrief afterwards.</Muted>
      </SignInCard>
    </div>
  );
  if (jobs.status !== "ready" || !jobs.jobs.length) return (
    <div className="page">
      <Card>
        <h2>Add the job first</h2>
        <Muted>Notes attach to the job you’re interviewing for.</Muted>
        <div className="row"><Link className="btn btn-primary" to="/analyze">Add a job</Link></div>
      </Card>
    </div>
  );
  const want = params.get("job") || "";
  const initial = jobs.jobs.some((j) => j.id === want) ? want : jobs.activeId || jobs.jobs[0].id;
  return <NotesPad key={initial} initialJob={initial} />;
}

function NotesPad({ initialJob }: { initialJob: string }) {
  const navigate = useNavigate();
  const jobId = initialJob;
  const stored = useInterviewNotes(jobId);
  const n: InterviewNotes = stored || emptyNotes(jobId);
  const [draft, setDraft] = useState("");
  const [, tick] = useState(0);
  const inputRef = useRef<HTMLInputElement | null>(null);
  const listEnd = useRef<HTMLLIElement | null>(null);

  // Keep the "N min in" clock moving.
  useEffect(() => {
    const t = window.setInterval(() => tick((x) => x + 1), 30000);
    return () => window.clearInterval(t);
  }, []);
  useEffect(() => { inputRef.current?.focus(); }, [jobId]);

  const update = (next: InterviewNotes) => putNotes(next);

  const add = (e?: FormEvent) => {
    e?.preventDefault();
    const text = draft.trim();
    if (!text) return;
    const base = stored || emptyNotes(jobId, n.round);
    if (!base.questions.length) track("notes_started");
    update(addQuestion(base, text, newId("q")));
    setDraft("");
    setTimeout(() => listEnd.current?.scrollIntoView({ block: "nearest" }), 0);
    inputRef.current?.focus();
  };


  const finish = () => {
    track("notes_to_debrief", { questions: n.questions.length });
    navigate("/debrief?job=" + encodeURIComponent(jobId) + "&new=1&from=notes");
  };

  const started = !!stored && hasContent(stored);
  const mins = started ? minutesIn(n) : 0;

  return (
    <div className="page inn">
      <div className="inn-bar">
        {/* The job is in the trail and the left panel; only the round is set here. */}
        <label className="inn-field inn-round">
          <span className="td-job-label">Round</span>
          <select className="input" value={n.round} onChange={(e) => update({ ...n, round: e.target.value as RoundType })} aria-label="Interview round">
            {(Object.keys(ROUND_LABELS) as RoundType[]).map((r) => <option key={r} value={r}>{ROUND_LABELS[r]}</option>)}
          </select>
        </label>
        <span className="inn-status" aria-live="polite">
          {started ? <>{mins < 1 ? "Started just now" : mins + " min in"} · saved on this device</> : "Saves on this device as you type"}
        </span>
      </div>

      <form className="inn-add" onSubmit={add}>
        <label htmlFor="inn-q" className="hm-sr">Question you were asked</label>
        <input id="inn-q" ref={inputRef} className="input inn-input" value={draft} onChange={(e) => setDraft(e.target.value)}
          placeholder="Type the question they just asked, then press Enter" autoComplete="off" maxLength={400} />
        <button type="submit" className="btn btn-primary" disabled={!draft.trim()}>Add</button>
      </form>

      {n.questions.length ? (
        <ol className="inn-list" aria-label="Questions so far">
          {n.questions.map((q, i) => (
            <li key={q.id} className="inn-q">
              <span className="inn-num" aria-hidden="true">{i + 1}</span>
              <div className="inn-q-body">
                <input className="inn-q-text" value={q.text} aria-label={"Question " + (i + 1)}
                  onChange={(e) => update({ ...n, questions: n.questions.map((x) => (x.id === q.id ? { ...x, text: e.target.value } : x)) })} />
                <input className="inn-q-note" value={q.note} placeholder="A word or two: what you said, what they pushed on"
                  aria-label={"Note for question " + (i + 1)}
                  onChange={(e) => update({ ...n, questions: n.questions.map((x) => (x.id === q.id ? { ...x, note: e.target.value } : x)) })} />
              </div>
              <button type="button" className="inn-del" aria-label={"Remove question " + (i + 1)}
                onClick={() => update({ ...n, questions: n.questions.filter((x) => x.id !== q.id) })}>×</button>
            </li>
          ))}
          <li ref={listEnd} className="inn-end" aria-hidden="true" />
        </ol>
      ) : (
        <p className="inn-empty">No questions yet. Each one you add shows up here, numbered, with room for a short note.</p>
      )}

      <label className="inn-other">
        <span className="field-label">Other notes</span>
        <textarea className="input" rows={4} value={n.notes} maxLength={4000}
          placeholder="Interviewer names, things to follow up on, questions you asked them, next steps they mentioned"
          onChange={(e) => update({ ...n, notes: e.target.value })} />
      </label>

      <div className="inn-actions">
        <button type="button" className="btn btn-primary" disabled={!started} onClick={finish}>Done: turn into a debrief</button>
        {started ? (
          <button type="button" className="btn btn-ghost" onClick={() => { if (window.confirm("Clear these notes? This can’t be undone.")) clearNotes(jobId); }}>Clear notes</button>
        ) : null}
      </div>

      <p className="inn-tip small muted">
        Tip: it’s fine to ask “Do you mind if I take a few notes?” at the start. Notes stay on this device until you turn them into a debrief, where you rate how each question went.
      </p>
    </div>
  );
}
