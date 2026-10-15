/* Questions you were asked: every question from your real interviews, across
 * all your jobs and rounds, kept for next time. They come from your debriefs
 * (Log a round, or Interview notes turned into a debrief), so they stay even
 * after a job is deleted. Practise any of them with the AI Interview Coach. */

import { useMemo, useState } from "react";
import { ROUND_LABELS, type Debrief, type Rating } from "../lib/debrief";
import { useDebriefs } from "../lib/debriefStore";
import { getNotes, hasContent } from "../lib/interviewNotes";
import { getActiveJob } from "../lib/readiness";
import { displayJobTitle } from "../lib/roles";
import { Link, useSearchParams } from "../lib/router";
import { downloadText } from "../lib/tailoredResume";
import { useJobs } from "../lib/useJobs";
import { Card } from "../components/ui";

interface Asked {
  key: string;
  text: string;
  /** Every time it was asked, newest first. */
  times: { debrief: Debrief; rating: Rating | ""; note: string }[];
}

const RATING: Record<string, string> = { good: "Went well", ok: "OK", bad: "Went badly", "": "Not rated" };
const norm = (s: string) => s.toLowerCase().replace(/[^a-z0-9]+/g, " ").trim();
const fmt = (d: string) => (d ? new Date(d + "T12:00:00").toLocaleDateString(undefined, { day: "numeric", month: "short", year: "numeric" }) : "");

export default function AskedQuestionsPage() {
  const debriefs = useDebriefs();
  const jobs = useJobs();
  const params = useSearchParams();
  const current = params.get("job") || getActiveJob();
  const [scope, setScope] = useState<"job" | "all">(current ? "job" : "all");
  const [q, setQ] = useState("");
  const [rating, setRating] = useState<"any" | Rating | "none">("any");

  const jobName = (id: string, d?: Debrief) => {
    const j = jobs.jobs.find((x) => x.id === id);
    return j ? displayJobTitle(j) + (j.company ? " · " + j.company : "") : d?.company || "A deleted job";
  };

  const list = useMemo(() => {
    const by = new Map<string, Asked>();
    const sorted = [...debriefs].sort((a, b) => (b.date || "").localeCompare(a.date || ""));
    for (const d of sorted) {
      if (scope === "job" && d.jobId !== current) continue;
      for (const qq of d.questions) {
        const t = qq.text.trim();
        if (!t) continue;
        const k = norm(t);
        const e = by.get(k) || { key: k, text: t, times: [] };
        e.times.push({ debrief: d, rating: qq.rating, note: qq.note });
        by.set(k, e);
      }
    }
    const needle = norm(q);
    return [...by.values()].filter((a) => {
      if (needle && !norm(a.text + " " + a.times.map((t) => t.note).join(" ")).includes(needle)) return false;
      // Matches if it went that way in any interview ("Not rated": the latest).
      if (rating === "any") return true;
      if (rating === "none") return !a.times[0].rating;
      return a.times.some((t) => t.rating === rating);
    });
  }, [debriefs, scope, current, q, rating]);

  const total = useMemo(() => debriefs.reduce((n, d) => n + d.questions.filter((x) => x.text.trim()).length, 0), [debriefs]);
  const unsaved = current ? getNotes(current) : null;

  const download = () => {
    const lines = ["# Questions I was asked", ""];
    for (const a of list) {
      lines.push("## " + a.text);
      for (const t of a.times) {
        lines.push("- " + [fmt(t.debrief.date), ROUND_LABELS[t.debrief.round], jobName(t.debrief.jobId, t.debrief), RATING[t.rating || ""]].filter(Boolean).join(" · ") + (t.note ? ": " + t.note : ""));
      }
      lines.push("");
    }
    downloadText("interview-questions.md", lines.join("\n"));
  };

  return (
    <div className="page aq">
      {unsaved && hasContent(unsaved) ? (
        <div className="aq-notes" role="status">
          You have interview notes for this job that aren{"’"}t saved here yet.{" "}
          <Link to={"/notes?job=" + encodeURIComponent(current)}>Open Interview notes</Link> and choose to turn them into a debrief.
        </div>
      ) : null}

      <div className="aq-bar">
        {current ? (
          <div className="seg" role="group" aria-label="Which interviews">
            <button type="button" className={"seg-btn" + (scope === "job" ? " on" : "")} aria-pressed={scope === "job"} onClick={() => setScope("job")}>This job</button>
            <button type="button" className={"seg-btn" + (scope === "all" ? " on" : "")} aria-pressed={scope === "all"} onClick={() => setScope("all")}>All jobs</button>
          </div>
        ) : null}
        <input className="input aq-search" type="search" placeholder="Search questions and notes" aria-label="Search questions and notes" value={q} onChange={(e) => setQ(e.target.value)} />
        <select className="input aq-filter" aria-label="Filter by how it went" value={rating} onChange={(e) => setRating(e.target.value as typeof rating)}>
          <option value="any">Any result</option>
          <option value="bad">Went badly</option>
          <option value="ok">OK</option>
          <option value="good">Went well</option>
          <option value="none">Not rated</option>
        </select>
      </div>

      {!total ? (
        <Card>
          <h2 className="aq-empty-h">No interview questions yet</h2>
          <p className="muted">After each real interview, write down what they asked: <strong>Log a round</strong>, or type them into <strong>Interview notes</strong> during the interview and turn the notes into a debrief. They{"’"}re kept here for every job, so you can see what comes up again and practise it.</p>
          <div className="row wrap">
            <Link className="btn btn-primary" to={"/debrief" + (current ? "?job=" + encodeURIComponent(current) : "")}>Log a round</Link>
            <Link className="btn" to={"/notes" + (current ? "?job=" + encodeURIComponent(current) : "")}>Interview notes</Link>
          </div>
        </Card>
      ) : (
        <>
          <div className="aq-count">
            <span className="small muted">{list.length} {list.length === 1 ? "question" : "questions"}{scope === "job" ? " for this job" : " across all jobs"}</span>
            {list.length ? <button type="button" className="link-btn small" onClick={download}>Download as .md</button> : null}
          </div>
          {!list.length ? (
            <Card><p className="muted">No questions match. {scope === "job" ? <button type="button" className="link-btn" onClick={() => setScope("all")}>Show all jobs</button> : null}</p></Card>
          ) : (
            <ul className="aq-list">
              {list.map((a) => {
                const last = a.times[0];
                return (
                  <li key={a.key} className="card aq-item">
                    <div className="aq-top">
                      <p className="aq-q">{a.text}</p>
                      <span className={"aq-r aq-r-" + (last.rating || "none")}>{RATING[last.rating || ""]}</span>
                    </div>
                    <ul className="aq-times">
                      {a.times.map((t, i) => (
                        <li key={t.debrief.id + i}>
                          <span className="small muted">{[fmt(t.debrief.date), ROUND_LABELS[t.debrief.round], scope === "all" ? jobName(t.debrief.jobId, t.debrief) : ""].filter(Boolean).join(" · ")}</span>
                          {t.note ? <p className="aq-note">{t.note}</p> : null}
                        </li>
                      ))}
                    </ul>
                    {a.times.length > 1 ? <p className="small aq-again">Asked {a.times.length} times</p> : null}
                    <div className="row wrap">
                      <Link className="btn btn-small btn-primary" to={"/coach?job=" + encodeURIComponent(last.debrief.jobId) + "&q=" + encodeURIComponent(a.text)}>Practise with AI Coach</Link>
                      <Link className="btn btn-small btn-ghost" to={"/debrief?job=" + encodeURIComponent(last.debrief.jobId)}>Edit in the debrief</Link>
                    </div>
                  </li>
                );
              })}
            </ul>
          )}
        </>
      )}
    </div>
  );
}
