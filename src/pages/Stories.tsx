/* Story bank — STAR stories stored locally (KEYS.stories), a completeness
 * meter per story, and a coverage matrix of what the active job needs. */

import { useEffect, useMemo, useRef, useState, type ReactNode } from "react";
import * as api from "../lib/api";
import { useAuth } from "../lib/auth";
import { displayJobTitle } from "../lib/roles";
import { Link, useNavigate, useSearchParams } from "../lib/router";
import {
  COMPETENCIES, coachPrompt, competencyKey, coverage, isCompetency, loadStories, neededCompetencies, normalizeStory,
  practicePrompt, saveStories, starCheck, storiesToMarkdown, tagLabel, type Story,
} from "../lib/stories";
import { useJobs } from "../lib/useJobs";
import { KEYS, onDataChanged } from "../lib/storage";
import { PlanGate, UpgradeCard } from "../components/PlanGate";
import { invalidatePlan } from "../lib/plans";
import { Card, Muted } from "../components/ui";
import type { Analysis, JobRow } from "../types";

type Editing = { mode: "quick" | "full"; story: Story } | null;

export default function StoriesPage() {
  const params = useSearchParams();
  const navigate = useNavigate();
  const jobs = useJobs();
  const auth = useAuth();
  const [stories, setStories] = useState<Story[]>(loadStories);
  const [editing, setEditing] = useState<Editing>(null);
  const [analysis, setAnalysis] = useState<Analysis | null>(null);
  const [flash, setFlash] = useState("");
  const editorRef = useRef<HTMLDivElement | null>(null);

  const activeJob: JobRow | undefined = jobs.status === "ready" ? jobs.jobs.find((j) => j.id === jobs.activeId) || jobs.jobs[0] : undefined;

  // The active job's analysis drives the coverage matrix.
  useEffect(() => {
    if (!activeJob) return;
    let alive = true;
    (async () => {
      if (activeJob.analysis) { setAnalysis(activeJob.analysis); return; }
      const tok = await auth.getAccessToken();
      if (!tok) return;
      const res = await api.getJob(tok, activeJob.id);
      if (alive && res.status === 200 && res.body?.job?.analysis) setAnalysis(res.body.job.analysis);
    })();
    return () => { alive = false; };
  }, [activeJob?.id]); // eslint-disable-line react-hooks/exhaustive-deps

  // ?competency=conflict opens quick capture with that tag.
  useEffect(() => {
    const c = params.get("competency");
    if (c) {
      openNew("quick", [competencyKey(c)]);
      navigate("/stories", { replace: true });
    }
  }, [params]); // eslint-disable-line react-hooks/exhaustive-deps

  useEffect(() => {
    if (editing) editorRef.current?.scrollIntoView({ behavior: "smooth", block: "start" });
  }, [editing?.story.id, editing?.mode]); // eslint-disable-line react-hooks/exhaustive-deps

  // Account sync brought newer stories: re-read.
  useEffect(() => onDataChanged([KEYS.stories], () => setStories(loadStories())), []);

  const persist = (list: Story[]) => { setStories(list); saveStories(list); };

  function openNew(mode: "quick" | "full", tags: string[] = []) {
    setEditing({ mode, story: normalizeStory({ tags, jobIds: activeJob ? [activeJob.id] : [] }) });
  }

  const save = (s: Story) => {
    const now = new Date().toISOString();
    const rec = { ...s, title: s.title.trim() || "Untitled story", updatedAt: now };
    const exists = stories.some((x) => x.id === s.id);
    persist(exists ? stories.map((x) => (x.id === s.id ? rec : x)) : [rec, ...stories]);
    setEditing(null);
    setFlash(exists ? "Story updated." : "Story saved.");
  };

  const remove = (id: string) => persist(stories.filter((s) => s.id !== id));

  const jobTitle = activeJob ? displayJobTitle(activeJob) : "";
  const needed = useMemo(() => neededCompetencies(analysis, activeJob?.title || ""), [analysis, activeJob?.title]);
  const rows = useMemo(() => coverage(needed, stories, activeJob?.id), [needed, stories, activeJob?.id]);
  const missing = rows.filter((r) => !r.stories.length);
  const jobTitles = useMemo(() => Object.fromEntries((jobs.jobs || []).map((j) => [j.id, displayJobTitle(j)])), [jobs.jobs]);

  const exportMd = () => {
    const md = storiesToMarkdown(stories, jobTitles);
    const url = URL.createObjectURL(new Blob([md], { type: "text/markdown;charset=utf-8" }));
    const a = document.createElement("a");
    a.href = url;
    a.download = "offerready-stories.md";
    document.body.appendChild(a);
    a.click();
    a.remove();
    setTimeout(() => URL.revokeObjectURL(url), 1000);
  };

  return (
    <div className="page sb">
      <div className="sb-toolbar">
        <button type="button" className="btn btn-primary" onClick={() => openNew("quick")}>+ Quick capture</button>
        <button type="button" className="btn" onClick={() => openNew("full")}>New full story</button>
        <span className="sb-toolbar-gap" />
        <button type="button" className="btn btn-ghost" onClick={exportMd} disabled={!stories.length}>Export Markdown</button>
      </div>
      {flash && <p className="sb-flash" role="status">{flash}</p>}

      {editing && (
        <div ref={editorRef} className="sb-editor-wrap">
          <StoryEditor key={editing.story.id + editing.mode} initial={editing.story} mode={editing.mode} jobs={jobs.jobs || []}
            onMode={(m) => setEditing({ ...editing, mode: m })} onCancel={() => setEditing(null)} onSave={save} />
        </div>
      )}

      <section className="card sb-matrix" aria-labelledby="sb-matrix-h">
        <div className="sb-sec-head">
          <div>
            <h2 id="sb-matrix-h">Coverage {jobTitle ? <span className="sb-for">for {jobTitle}</span> : null}</h2>
            <p className="muted small">
              {analysis ? "What this job is likely to probe, from its seniority, responsibilities and skills." : jobs.status === "ready" && !jobs.jobs.length ? "Add a job to see what it needs. Until then, these are the competencies most loops ask about." : "The competencies most behavioural rounds ask about."}
            </p>
          </div>
          <div className="sb-score" aria-label={"Covered " + (rows.length - missing.length) + " of " + rows.length}>
            <strong>{rows.length - missing.length}</strong>/{rows.length}<span>covered</span>
          </div>
        </div>
        {missing.length > 0 ? (
          <p className="sb-gapline" role="note"><strong>No story for:</strong> {missing.map((m) => m.label.toLowerCase()).join(", ")}</p>
        ) : (
          <p className="sb-okline">Every competency this job needs has at least one story.</p>
        )}
        <div className="sb-rows" role="table" aria-label="Competency coverage">
          {rows.map((r) => (
            <div key={r.key} role="row" className={"sb-row" + (r.stories.length ? " is-covered" : " is-gap")}>
              <div role="cell" className="sb-row-comp">
                <span className="sb-dot" aria-hidden="true" />
                <div>
                  <strong>{r.label}</strong>
                  <span className="sb-why">{r.why}</span>
                </div>
              </div>
              <div role="cell" className="sb-row-stories">
                {r.stories.length ? r.stories.slice(0, 3).map((s) => (
                  <button key={s.id} type="button" className="sb-chip" onClick={() => setEditing({ mode: "full", story: s })} title="Edit this story">{s.title}</button>
                )) : (
                  <button type="button" className="btn btn-small" onClick={() => openNew("quick", [r.key])}>Add a story</button>
                )}
                {r.stories.length > 3 && <span className="small muted">+{r.stories.length - 3}</span>}
              </div>
            </div>
          ))}
        </div>
      </section>

      <section aria-labelledby="sb-list-h" className="stack">
        <h2 id="sb-list-h" className="sb-list-h">Your stories <span className="muted">({stories.length})</span></h2>
        {!stories.length ? (
          <Card className="sb-empty">
            <p><strong>No stories yet.</strong> Start with one you tell often: a hard deadline, a disagreement, a mistake you fixed.</p>
            <Muted small>Stories are saved in this browser. Export them as Markdown to keep a copy.</Muted>
            <div className="row"><button type="button" className="btn btn-primary" onClick={() => openNew("quick")}>Capture your first story</button></div>
          </Card>
        ) : (
          <div className="sb-grid">
            {stories.map((s) => <StoryCard key={s.id} s={s} jobTitles={jobTitles} onEdit={() => setEditing({ mode: "full", story: s })} onDelete={() => remove(s.id)} />)}
          </div>
        )}
      </section>
    </div>
  );
}

// ---------------------------------------------------------------------------

function Meter({ s }: { s: Story }) {
  const c = starCheck(s);
  const tone = c.score >= 80 ? "good" : c.score >= 50 ? "mid" : "weak";
  return (
    <div className="sb-meter" aria-label={"STAR completeness " + c.score + "%"}>
      <div className="sb-meter-top">
        <span className="sb-meter-label">STAR completeness</span>
        <span className={"sb-meter-num band-" + tone}>{c.score}%</span>
      </div>
      <div className="sb-meter-track"><span className={"bar-fill band-" + tone} style={{ width: Math.max(4, c.score) + "%" }} /></div>
      <div className="sb-parts">
        {c.parts.map((p) => <span key={p.key} className={"sb-part" + (p.ok ? " ok" : "")} title={p.label + (p.ok ? ": done" : ": needs work")}>{p.key}</span>)}
      </div>
      {c.issues.length > 0 && (
        <ul className="sb-issues">{c.issues.slice(0, 3).map((i) => <li key={i}>{i}</li>)}</ul>
      )}
    </div>
  );
}

function StoryCard({ s, jobTitles, onEdit, onDelete }: { s: Story; jobTitles: Record<string, string>; onEdit(): void; onDelete(): void }) {
  const [confirm, setConfirm] = useState(false);
  const [prompt, setPrompt] = useState("");
  const [copied, setCopied] = useState(false);
  const suits = [s.roles, ...s.jobIds.map((id) => jobTitles[id]).filter(Boolean)].filter(Boolean).join(", ");

  const practice = async () => {
    const p = practicePrompt(s);
    setPrompt(p);
    try { await navigator.clipboard.writeText(p); setCopied(true); } catch { setCopied(false); }
  };

  return (
    <article className="card sb-card">
      <div className="sb-card-head">
        <h3>{s.title || "Untitled story"}</h3>
        <button type="button" className="btn btn-ghost btn-small" onClick={onEdit}>Edit</button>
      </div>
      {s.tags.length > 0 && (
        <div className="chips">{s.tags.map((t) => <span key={t} className={"chip" + (isCompetency(t) ? " sb-tag" : "")}>{tagLabel(t)}</span>)}</div>
      )}
      {s.situation && <p className="sb-snippet">{s.situation}</p>}
      {suits && <p className="small muted">Suits: {suits}</p>}
      <Meter s={s} />

      {prompt && (
        <div className="sb-prompt" role="status">
          <span className="small">{copied ? "Prompt copied" : "Practice prompt"}</span>
          <p>{"“"}{prompt}{"”"}</p>
          <Link className="btn btn-primary btn-small" to="/simulator">Open mock interview {"→"}</Link>
        </div>
      )}

      <div className="sb-actions">
        <button type="button" className="btn btn-small" onClick={practice}>Practice this story</button>
        {!confirm ? (
          <button type="button" className="btn btn-ghost btn-small sb-del" onClick={() => setConfirm(true)}>Delete</button>
        ) : (
          <span className="sb-confirm" role="alertdialog" aria-label="Confirm delete">
            Delete?
            <button type="button" className="btn btn-danger btn-small" onClick={onDelete}>Delete</button>
            <button type="button" className="btn btn-ghost btn-small" onClick={() => setConfirm(false)}>Keep</button>
          </span>
        )}
      </div>
      <Coach s={s} />
    </article>
  );
}

function Coach({ s }: { s: Story }) {
  const auth = useAuth();
  const [open, setOpen] = useState(false);
  const [text, setText] = useState("");
  const [busy, setBusy] = useState(false);
  const [err, setErr] = useState<ReactNode>("");
  const [overLimit, setOverLimit] = useState(false);
  const ctrl = useRef<AbortController | null>(null);
  useEffect(() => () => ctrl.current?.abort(), []);

  const run = async () => {
    ctrl.current?.abort();
    const c = new AbortController();
    ctrl.current = c;
    setOpen(true); setBusy(true); setErr(""); setText(""); setOverLimit(false);
    // Story coaching is metered (story_ai): it needs the signed-in user's token.
    const tok = auth.session ? await auth.getAccessToken() : null;
    if (c.signal.aborted) return;
    if (!tok) {
      setBusy(false);
      setErr(<>Please <Link to="/account">sign in</Link> to get AI coaching on your stories. It{"’"}s free.</>);
      return;
    }
    const out = await api.streamHelp(
      { question: coachPrompt(s), area: "all", purpose: "story_coach", context: { surface: "app", page: { title: "Your stories", path: "/stories" } } },
      (t) => setText((x) => x + t),
      c.signal,
      tok,
    );
    if (c.signal.aborted) return;
    setBusy(false);
    if (out.kind === "done") { invalidatePlan(); return; } // one use counted: refresh the meters
    if (out.kind === "error" && !out.gotDelta) {
      if (out.status === 403) { invalidatePlan(); setOverLimit(true); return; }
      if (out.status === 401) { setErr(<>Your session ended. Please <Link to="/account">sign in</Link> again.</>); return; }
      setErr(out.status === 429 ? "Too many requests right now. Try again in a minute." : "Coaching isn't available right now. Please try again.");
    }
  };

  if (overLimit) {
    return (
      <div className="sb-coach">
        <UpgradeCard feature="story_ai" title="You’ve used this month’s story coaching" message="Pro gives you far more AI coaching on your STAR stories." />
      </div>
    );
  }

  return (
    <div className="sb-coach">
      <PlanGate feature="story_ai" title="Coach this story with AI" message="Get specific STAR fixes for this story.">
        {!open ? (
          <button type="button" className="btn btn-ghost btn-small sb-coach-btn" onClick={run}>Coach this story with AI</button>
        ) : (
          <div className="sb-coach-out" aria-live="polite">
            <div className="sb-coach-head">
              <strong>AI coaching</strong>
              <span className="row">
                {busy ? <button type="button" className="btn btn-ghost btn-small" onClick={() => { ctrl.current?.abort(); setBusy(false); }}>Stop</button>
                  : <button type="button" className="btn btn-ghost btn-small" onClick={run}>Again</button>}
                <button type="button" className="btn btn-ghost btn-small" onClick={() => { ctrl.current?.abort(); setOpen(false); setBusy(false); }}>Close</button>
              </span>
            </div>
            {err ? <p className="error">{err}</p> : <div className="sb-coach-text">{text ? <CoachMd text={text} /> : <span className="muted">Reading your story{"…"}</span>}</div>}
          </div>
        )}
      </PlanGate>
    </div>
  );
}

/** Minimal, safe Markdown for coaching output: headings, lists, paragraphs,
 * **bold** and `code`. Built from React elements (never raw HTML). */
function inline(t: string): ReactNode[] {
  return t.split(/(\*\*[^*]+\*\*|`[^`]+`)/g).filter(Boolean).map((p, i) =>
    p.startsWith("**") && p.endsWith("**") && p.length > 4 ? <strong key={i}>{p.slice(2, -2)}</strong>
    : p.startsWith("`") && p.endsWith("`") && p.length > 2 ? <code key={i}>{p.slice(1, -1)}</code>
    : p.replace(/(^|\s)\*([^*\s][^*]*)\*(?=\s|$|[.,;:])/g, "$1$2"));
}

function CoachMd({ text }: { text: string }) {
  const out: ReactNode[] = [];
  let list: { ordered: boolean; items: string[] } | null = null;
  let para: string[] = [];
  const flush = () => {
    if (para.length) { out.push(<p key={out.length}>{inline(para.join(" "))}</p>); para = []; }
    if (list) {
      const items = list.items.map((it, i) => <li key={i}>{inline(it)}</li>);
      out.push(list.ordered ? <ol key={out.length}>{items}</ol> : <ul key={out.length}>{items}</ul>);
      list = null;
    }
  };
  for (const raw of text.replace(/<[^>]*>/g, "").split("\n")) {
    const line = raw.trim();
    if (!line || /^\|?[-:| ]+\|?$/.test(line)) { flush(); continue; }
    const h = line.match(/^#{1,6}\s+(.*)$/);
    const ul = line.match(/^[-*•]\s+(.*)$/);
    const ol = line.match(/^\d+[.)]\s+(.*)$/);
    if (h) { flush(); out.push(<h4 key={out.length}>{inline(h[1])}</h4>); }
    else if (ul || ol) {
      if (para.length || (list && list.ordered !== !!ol)) flush();
      if (!list) list = { ordered: !!ol, items: [] };
      list.items.push((ul || ol)![1]);
    } else {
      if (list) flush();
      para.push(line.replace(/^\||\|$/g, "").replace(/\s*\|\s*/g, " · "));
    }
  }
  flush();
  return <>{out}</>;
}

// ---------------------------------------------------------------------------

function StoryEditor({ initial, mode, jobs, onMode, onCancel, onSave }: {
  initial: Story; mode: "quick" | "full"; jobs: JobRow[];
  onMode(m: "quick" | "full"): void; onCancel(): void; onSave(s: Story): void;
}) {
  const [s, setS] = useState<Story>(initial);
  const [custom, setCustom] = useState("");
  const set = <K extends keyof Story>(k: K, v: Story[K]) => setS((x) => ({ ...x, [k]: v }));
  const toggleTag = (t: string) => set("tags", s.tags.includes(t) ? s.tags.filter((x) => x !== t) : [...s.tags, t]);
  const addCustom = () => {
    const t = custom.trim().toLowerCase();
    if (t && !s.tags.includes(t)) set("tags", [...s.tags, t]);
    setCustom("");
  };
  const isNew = !initial.title && !initial.action;
  const check = starCheck(s);
  const canSave = !!(s.title.trim() || s.situation.trim() || s.action.trim());

  const area = (k: "situation" | "task" | "action" | "result" | "metrics", label: string, hint: string, rows = 3) => (
    <label className="sb-field">
      <span className="field-label">{label}</span>
      <textarea className="input sb-textarea" rows={rows} value={s[k]} placeholder={hint} onChange={(e) => set(k, e.target.value)} />
    </label>
  );

  return (
    <section className="card sb-editor" aria-labelledby="sb-ed-h">
      <div className="sb-sec-head">
        <h2 id="sb-ed-h">{isNew ? (mode === "quick" ? "Quick capture" : "New story") : "Edit story"}</h2>
        <div className="sb-seg" role="group" aria-label="Form size">
          <button type="button" className={mode === "quick" ? "on" : ""} aria-pressed={mode === "quick"} onClick={() => onMode("quick")}>Quick</button>
          <button type="button" className={mode === "full" ? "on" : ""} aria-pressed={mode === "full"} onClick={() => onMode("full")}>Full STAR</button>
        </div>
      </div>
      <form className="sb-form" onSubmit={(e) => { e.preventDefault(); if (canSave) onSave(s); }}>
        <label className="sb-field">
          <span className="field-label">Title</span>
          <input className="input" value={s.title} placeholder="e.g. Cut the nightly pipeline from 6h to 40m" onChange={(e) => set("title", e.target.value)} />
        </label>

        <div className="sb-field">
          <span className="field-label">Competencies</span>
          <div className="sb-tagpick">
            {COMPETENCIES.map((c) => (
              <button key={c.key} type="button" className={"sb-tagbtn" + (s.tags.includes(c.key) ? " on" : "")} aria-pressed={s.tags.includes(c.key)} onClick={() => toggleTag(c.key)}>{c.label}</button>
            ))}
            {s.tags.filter((t) => !isCompetency(t)).map((t) => (
              <button key={t} type="button" className="sb-tagbtn on" aria-pressed="true" onClick={() => toggleTag(t)} title="Remove tag">{t} {"×"}</button>
            ))}
          </div>
          {mode === "full" && (
            <div className="sb-custom">
              <input className="input" value={custom} placeholder="Custom tag, e.g. mentoring" aria-label="Custom tag"
                onChange={(e) => setCustom(e.target.value)} onKeyDown={(e) => { if (e.key === "Enter") { e.preventDefault(); addCustom(); } }} />
              <button type="button" className="btn btn-small" onClick={addCustom} disabled={!custom.trim()}>Add tag</button>
            </div>
          )}
        </div>

        {mode === "quick" ? (
          <>
            {area("situation", "What happened?", "The context in a sentence or two: team, project, what was at stake.", 2)}
            {area("action", "What did you do?", "Steps you took. Use “I”, not “we”.", 3)}
            {area("result", "How did it end?", "The outcome, with a number if you have one.", 2)}
          </>
        ) : (
          <>
            {area("situation", "Situation", "Where and when; what was at stake.")}
            {area("task", "Task", "Your goal or responsibility.", 2)}
            {area("action", "Action", "What you did, step by step. Say “I”.", 4)}
            {area("result", "Result", "What changed because of you.", 2)}
            {area("metrics", "Metrics", "e.g. 6h → 40m, -30% cost, 0 incidents in 90 days", 1)}
            {jobs.length > 0 && (
              <div className="sb-field">
                <span className="field-label">Suits these jobs</span>
                <div className="sb-jobs">
                  {jobs.map((j) => (
                    <label key={j.id} className="check">
                      <input type="checkbox" checked={s.jobIds.includes(j.id)} onChange={(e) => set("jobIds", e.target.checked ? [...s.jobIds, j.id] : s.jobIds.filter((x) => x !== j.id))} />
                      <span>{displayJobTitle(j)}</span>
                    </label>
                  ))}
                </div>
              </div>
            )}
            <label className="sb-field">
              <span className="field-label">Roles it suits</span>
              <input className="input" value={s.roles} placeholder="e.g. Data engineer, Tech lead" onChange={(e) => set("roles", e.target.value)} />
            </label>
          </>
        )}

        <div className="sb-live" aria-live="polite">
          <span className="small">STAR check: <strong>{check.score}%</strong></span>
          {check.issues[0] && <span className="small muted">{check.issues[0]}</span>}
        </div>

        <div className="row">
          <button type="submit" className="btn btn-primary" disabled={!canSave}>Save story</button>
          <button type="button" className="btn btn-ghost" onClick={onCancel}>Cancel</button>
        </div>
      </form>
    </section>
  );
}
