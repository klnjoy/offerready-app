/* Trade-off drills (route /defend) — scenario practice engine (was
 * content/assets/scenario.js on #scenario-app).
 *
 * Teasers come from the public list endpoint; the FULL tree only from the
 * authorized endpoint with the user's token. Authorization is enforced
 * server-side — this client just reflects 401/403/200 and fails closed. With
 * no backend, bundled scenarios run fully client-side. */

import { useEffect, useMemo, useRef, useState, type ReactNode } from "react";
import { API_ENABLED, docsUrl } from "../config";
import * as api from "../lib/api";
import { useAuth } from "../lib/auth";
import { upsert } from "../lib/progressStore";
import { clearActiveJob, getActiveJob, setActiveJob } from "../lib/readiness";
import {
  CATEGORY_LABELS, catLabel, classifyFamilyFromJob, cleanRoleLabel, displayJobTitle, familyLabel, isCategory,
} from "../lib/roles";
import { ExternalLink, Link, useSearchParams } from "../lib/router";
import { KEYS, readJSON, writeJSON } from "../lib/storage";
import { OFFLINE_SCENARIOS } from "../data/offlineScenarios";
import { AuthForm } from "../components/AuthForm";
import { Card, ErrorText } from "../components/ui";
import { JobPicker } from "../components/JobPicker";
import type { Analysis, AnswerFeedback, JobRow, Scenario, ScenarioNode } from "../types";

interface JobContext {
  category: string | null;
  role: string;
  seniority: string;
  technologies: string[];
  gaps: string[];
}

interface StoredAnalysis {
  analysis: Analysis;
  input?: { targetRole?: string };
}

type View =
  | { kind: "list" }
  | { kind: "loading"; msg: string }
  | { kind: "error"; msg: string }
  | { kind: "gate"; gate: "sign-in" | "upgrade"; teaser: Partial<Scenario> }
  | { kind: "run"; scenario: Scenario };

function getStoredAnalysis(): StoredAnalysis | null {
  const rec = readJSON<StoredAnalysis | null>(KEYS.analysis, null);
  return rec?.analysis?.roleSummary ? rec : null;
}

/** Stable cache key so re-opening the same job's generated scenario is free. */
function genCacheKey(rec: StoredAnalysis, category: string | null): string {
  const a = rec.analysis || ({} as Analysis);
  const basis = [rec.input?.targetRole || a.seniority || "", category || "", (a.roleSummary || "").slice(0, 120), (a.technologies || []).join(",")].join("|");
  let h = 0;
  for (let i = 0; i < basis.length; i++) h = ((h << 5) - h + basis.charCodeAt(i)) | 0;
  return KEYS.genScenarioPrefix + (h >>> 0).toString(36);
}

const uniqueCats = (list: Scenario[]) => Array.from(new Set(list.map((s) => s.category).filter(Boolean)));

export default function DefendPage() {
  const auth = useAuth();
  const params = useSearchParams();
  // Explicit workflow job id (?job=) — the highest-precedence binding.
  const workflowJobId = params.get("job") || "";

  // Job-first preselection from ?role= or the stored analyzed-role signal.
  const initial = useMemo(() => {
    const saved = readJSON<{ category?: string; role?: string; seniority?: string; technologies?: string[]; gaps?: string[] } | null>(KEYS.defendRole, null);
    let role = params.get("role");
    let roleTitle: string | null = null;
    if (!role && saved?.category) { role = saved.category; roleTitle = cleanRoleLabel(saved.role) || null; }
    const jobContext: JobContext | null = saved && (saved.technologies || saved.gaps)
      ? {
          category: saved.category || null,
          role: cleanRoleLabel(saved.role),
          seniority: cleanRoleLabel(saved.seniority),
          technologies: (saved.technologies || []).filter(Boolean),
          gaps: (saved.gaps || []).filter(Boolean),
        }
      : null;
    return isCategory(role)
      ? { cat: role as string, matched: roleTitle || CATEGORY_LABELS[role], jobContext }
      : { cat: "all", matched: null as string | null, jobContext };
  }, []); // eslint-disable-line react-hooks/exhaustive-deps

  const [activeCat, setActiveCat] = useState(initial.cat);
  const [matchedRole, setMatchedRole] = useState<string | null>(initial.matched);
  const [activeJob, setActiveJobState] = useState<{ id: string; title: string } | null>(null);
  const [myJobs, setMyJobs] = useState<JobRow[]>([]);
  const [scenarios, setScenarios] = useState<Scenario[]>([]);
  const [offline, setOffline] = useState(!API_ENABLED);
  const [view, setView] = useState<View>(API_ENABLED ? { kind: "loading", msg: "Loading scenarios…" } : { kind: "list" });
  const [notice, setNotice] = useState("");
  const [genBusy, setGenBusy] = useState(false);
  const boundJobId = useRef("");

  // Load the catalog teasers.
  const loadList = async () => {
    if (!API_ENABLED) { setView({ kind: "list" }); return; }
    setView({ kind: "loading", msg: "Loading scenarios…" });
    const res = await api.listScenarios(await auth.getAccessToken());
    if (res.status === 200 && res.body) {
      setScenarios(res.body.scenarios || []);
      setOffline(false);
      setView({ kind: "list" });
    } else {
      setView({ kind: "error", msg: "Couldn't load scenarios right now. Please try again." });
    }
  };
  useEffect(() => {
    if (auth.ready) loadList();
  }, [auth.ready, auth.session]); // eslint-disable-line react-hooks/exhaustive-deps

  // The ACTIVE JOB is authoritative for the family + label (where practice is saved).
  const applyJob = (job: JobRow | undefined, id: string) => {
    if (!job) { setActiveJobState({ id, title: "" }); return; }
    const title = displayJobTitle(job);
    setActiveJobState({ id, title });
    if (title !== "Untitled role") setMatchedRole(title);
    const fam = classifyFamilyFromJob(job);
    // Can't classify this job confidently? Show all roles rather than keep
    // another job's stale family.
    setActiveCat(fam || "all");
    if (fam && title === "Untitled role") setMatchedRole((m) => (cleanRoleLabel(m) ? m : CATEGORY_LABELS[fam]));
  };
  useEffect(() => {
    if (!API_ENABLED || !auth.session) return;
    let alive = true;
    (async () => {
      const tok = await auth.getAccessToken();
      if (!tok) return;
      const res = await api.listJobs(tok);
      if (!alive) return;
      const jobs = res.body?.jobs || [];
      setMyJobs(jobs);
      const id = (workflowJobId && jobs.some((j) => j.id === workflowJobId) ? workflowJobId : "") || getActiveJob();
      if (!id) return;
      if (id !== getActiveJob()) setActiveJob(id);
      applyJob(jobs.find((j) => j.id === id), id);
    })();
    return () => { alive = false; };
  }, [auth.session]); // eslint-disable-line react-hooks/exhaustive-deps
  const switchJob = (id: string) => { setActiveJob(id); applyJob(myJobs.find((j) => j.id === id), id); };

  const list = offline ? OFFLINE_SCENARIOS : scenarios;

  const openScenario = async (s: Scenario) => {
    if (offline || s.content) { setView({ kind: "run", scenario: s }); return; }
    setView({ kind: "loading", msg: "Opening…" });
    const res = await api.getScenario(await auth.getAccessToken(), s.slug);
    if (res.status === 200 && res.body?.scenario) setView({ kind: "run", scenario: res.body.scenario });
    else if (res.status === 401) setView({ kind: "gate", gate: "sign-in", teaser: s });
    else if (res.status === 403) setView({ kind: "gate", gate: "upgrade", teaser: { ...s, teaser: s.teaser || res.body?.teaser, title: s.title || res.body?.title } });
    else if (res.status === 0) setView({ kind: "error", msg: "Couldn't reach the scenario service." });
    else setView({ kind: "error", msg: res.body?.error || "Couldn't open this scenario." });
  };

  const bindJobId = () => workflowJobId || getActiveJob() || "";

  const fallback = (msg: string) => {
    setNotice(msg);
    const match = list.find((s) => s.category === (initial.jobContext?.category || activeCat));
    if (match) setTimeout(() => openScenario(match), 900);
  };

  const generateForJob = async () => {
    const rec = getStoredAnalysis();
    if (!rec) return;
    const category = initial.jobContext?.category || activeCat;
    boundJobId.current = bindJobId();
    const key = genCacheKey(rec, category);
    const cached = readJSON<Scenario | null>(key, null);
    if (cached?.content?.start) {
      setView({ kind: "run", scenario: { ...cached, exactJob: true, jobId: boundJobId.current || cached.jobId } });
      return;
    }
    setGenBusy(true);
    const res = await api.generateScenario(await auth.getAccessToken(), {
      targetRole: rec.input?.targetRole || "",
      category: category === "all" ? null : category,
      analysis: rec.analysis,
      jobId: boundJobId.current || null,
    });
    setGenBusy(false);
    if (res.status === 200 && res.body?.scenario?.content) {
      const scn: Scenario = { ...res.body.scenario, exactJob: true, jobId: boundJobId.current || undefined };
      writeJSON(key, scn);
      setView({ kind: "run", scenario: scn });
    } else if (res.status === 401) setView({ kind: "gate", gate: "sign-in", teaser: { title: "Generate a custom scenario" } });
    else if (res.status === 403) setView({ kind: "gate", gate: "upgrade", teaser: { title: "Generate a custom scenario", teaser: res.body?.scenario?.teaser } });
    else if (res.status === 0) fallback("Couldn't reach the generator — opening the standard one for your role.");
    else fallback("Couldn't generate a custom scenario right now — opening the standard one for your role.");
  };

  const backToList = () => { setNotice(""); if (offline) setView({ kind: "list" }); else loadList(); };

  return (
    <div className="page">
      {notice && <p className="hint">{notice}</p>}
      {view.kind === "loading" && <p className="hint">{view.msg}</p>}
      {view.kind === "error" && (
        <Card>
          <ErrorText>{view.msg}</ErrorText>
          <div className="row">
            <button type="button" className="btn btn-ghost" onClick={backToList}>{"‹"} All scenarios</button>
            <button type="button" className="btn btn-ghost" onClick={() => { setOffline(true); setView({ kind: "list" }); }}>Use the free bundled scenarios</button>
          </div>
        </Card>
      )}
      {view.kind === "list" && (
        <ScenarioList
          list={list} offline={offline} activeCat={activeCat} matchedRole={matchedRole} activeJob={activeJob}
          jobs={myJobs} onSwitchJob={switchJob}
          canGenerate={API_ENABLED && !offline && !!getStoredAnalysis()} genBusy={genBusy}
          onCat={setActiveCat} onClear={() => { setActiveCat("all"); setMatchedRole(null); }}
          onOpen={openScenario} onGenerate={generateForJob}
        />
      )}
      {view.kind === "gate" && <Gate kind={view.gate} teaser={view.teaser} onBack={backToList} />}
      {view.kind === "run" && (
        <Runner
          key={view.scenario.slug + (view.scenario.exactJob ? ":gen" : "")}
          scenario={view.scenario}
          offline={offline}
          jobContext={initial.jobContext}
          whoFallback={activeJob?.title || matchedRole || ""}
          workflowJobId={workflowJobId}
          boundJobId={view.scenario.jobId || boundJobId.current}
          onBack={backToList}
        />
      )}
    </div>
  );
}

// ---- list ------------------------------------------------------------------

function ScenarioList({
  list, offline, activeCat, matchedRole, activeJob, jobs, onSwitchJob, canGenerate, genBusy, onCat, onClear, onOpen, onGenerate,
}: {
  list: Scenario[]; offline: boolean; activeCat: string; matchedRole: string | null;
  activeJob: { id: string; title: string } | null; jobs: JobRow[]; onSwitchJob(id: string): void; canGenerate: boolean; genBusy: boolean;
  onCat(c: string): void; onClear(): void; onOpen(s: Scenario): void; onGenerate(): void;
}) {
  const pointer = getActiveJob();
  // Best score per scenario from your past runs (synced to your account).
  const best = useMemo(() => {
    const out: Record<string, number> = {};
    for (const h of readJSON<{ slug?: string; score?: number }[]>(KEYS.scenarioSessions, [])) {
      if (h && h.slug && typeof h.score === "number") out[h.slug] = Math.max(out[h.slug] ?? 0, h.score);
    }
    return out;
  }, []);
  const inFamily = list.filter((s) => activeCat === "all" || s.category === activeCat);
  // No scenarios for this job's family yet: show every role instead of an empty page.
  const familyEmpty = activeCat !== "all" && !inFamily.length && list.length > 0;
  const shown = familyEmpty ? list : inFamily;
  const cats = ["all", ...uniqueCats(list)];

  return (
    <div className="stack">
      {!offline && jobs.length > 1 && activeJob?.title ? (
        <div className="job-banner job-banner-picker">
          <JobPicker jobs={jobs} current={activeJob.id} onSwitch={onSwitchJob}
            label={<><span className="job-banner-label">Current job</span> <strong>{activeJob.title}</strong> {"·"} <span className="small">practice counts toward its readiness</span></>} />
        </div>
      ) : !offline && (
        <div className="job-banner">
          {pointer && activeJob?.id === pointer && activeJob.title ? (
            <><span className="job-banner-label">Current job</span> <strong>{activeJob.title}</strong> {"·"} <span className="small">completed practice counts toward this job{"’"}s readiness</span></>
          ) : pointer ? (
            <><span className="job-banner-label">Current job</span> <span className="small">practice will be saved to your active job</span></>
          ) : (
            <><span className="job-banner-label">No active job selected</span> <Link className="btn btn-small" to="/jobs">Choose a job</Link> <span className="small">{"—"} practice is saved locally until you pick one</span></>
          )}
        </div>
      )}
      <h2 className="section-heading">Scenarios</h2>
      <p className="hint">
        {offline
          ? "Practice the decisions senior AI, data, and cloud engineers defend under pressure. Pick one, make the call, and hold your reasoning as the interviewer keeps pushing — why, trade-off, constraint, incident. Your ratings feed your readiness."
          : "Practice the decisions senior AI, data, and cloud engineers defend under pressure — across roles. Preview any scenario free; the full library comes with any pass."}
      </p>

      {matchedRole && activeCat !== "all" && (
        <div className="scn-match">
          {!(!offline && pointer && activeJob?.id === pointer && activeJob.title) && (
            <p><span className="job-banner-label">Current job</span> <strong>{matchedRole}</strong></p>
          )}
          <p>
            Showing <strong>{familyLabel(activeCat)}</strong> scenarios, the closest to this job.{" "}
            <button type="button" className="link-btn" onClick={onClear}>Show all roles</button>
          </p>
          {canGenerate && (
            <>
              <button type="button" className="btn btn-primary" disabled={genBusy} onClick={onGenerate}>
                {genBusy ? "Writing your scenario…" : "Write a scenario for this job"}
              </button>
              <p className="hint">Built from <strong>{matchedRole}</strong> and its gaps. Comes with any pass. If it can’t be written right now, the closest scenario below opens instead.</p>
            </>
          )}
        </div>
      )}

      {!list.length ? (
        <p className="hint">No scenarios published yet.</p>
      ) : (
        <>
          <div className="scn-filter" role="group" aria-label="Filter by role">
            {cats.map((c) => (
              <button key={c} type="button" className={"scn-chip" + (c === activeCat || (familyEmpty && c === "all") ? " on" : "")} aria-pressed={c === activeCat || (familyEmpty && c === "all")} onClick={() => onCat(c)}>
                {c === "all" ? "All roles" : catLabel(c)}
              </button>
            ))}
          </div>
          {familyEmpty && <p className="hint">There are no {familyLabel(activeCat)} scenarios in the library yet, so here are all of them. The design calls carry over across roles.{canGenerate ? " Or write one for this job above." : ""}</p>}
          {!shown.length && <p className="hint">No scenarios in this role yet.</p>}
          {shown.map((s) => (
            <div className="scn-card" key={s.slug}>
              <div className="scn-card-top">
                <span className="topic">{catLabel(s.category)}</span>
                {best[s.slug] != null && <span className={"qw-status " + (best[s.slug] >= 80 ? "good" : best[s.slug] >= 55 ? "mid" : "low")}>Done · best {best[s.slug]}%</span>}
              </div>
              <h3>{s.title}</h3>
              {s.teaser?.setup && <p>{s.teaser.setup}</p>}
              {(s.teaser?.you_will_practice || []).length > 0 && <ul>{s.teaser!.you_will_practice!.map((x, i) => <li key={i}>{x}</li>)}</ul>}
              <div className="row">
                <button type="button" className="btn btn-primary" onClick={() => onOpen(s)}>
                  {best[s.slug] != null ? "Practise again" : offline || s.entitled ? "Start scenario" : "Open scenario"}
                </button>
                {!offline && !s.entitled && <span className="scn-lock">Free preview · full with a pass</span>}
              </div>
            </div>
          ))}
          {offline && (
            <p className="hint">These bundled scenarios run free, right here. A pass adds the full multi-role library, with progress saved to your account.</p>
          )}
        </>
      )}
    </div>
  );
}

function Gate({ kind, teaser: s, onBack }: { kind: "sign-in" | "upgrade"; teaser: Partial<Scenario>; onBack(): void }) {
  const t = s.teaser || {};
  return (
    <div className="card paywall">
      <h2>{s.title || "Full scenario"}</h2>
      {t.setup && <p>{t.setup}</p>}
      {t.sample_node && (
        <div className="model">
          <div className="field-label">Sample {"—"} one node from this scenario</div>
          <div className="question">{t.sample_node.prompt}</div>
          {t.sample_node.model && <p><strong>Strong answer:</strong> {t.sample_node.model}</p>}
        </div>
      )}
      {kind === "sign-in" ? (
        <>
          <p className="hint">Sign in to run the full scenario.</p>
          <AuthForm />
        </>
      ) : (
        <>
          <p className="hint">The full scenario comes with any pass: the complete trade-off drill library, with progress tracking. The preview above stays free.</p>
          <Link className="btn btn-primary" to="/pricing">See passes</Link>
        </>
      )}
      <button type="button" className="btn btn-ghost" onClick={onBack}>{"‹"} All scenarios</button>
    </div>
  );
}

// ---- runner ----------------------------------------------------------------

function Runner({
  scenario, offline, jobContext, whoFallback, workflowJobId, boundJobId, onBack,
}: {
  scenario: Scenario; offline: boolean; jobContext: JobContext | null; whoFallback: string;
  workflowJobId: string; boundJobId: string; onBack(): void;
}) {
  const nodes = scenario.content?.nodes || {};
  const total = Object.keys(nodes).length;
  const [current, setCurrent] = useState<string | undefined>(scenario.content?.start);
  const [path, setPath] = useState<string[]>(scenario.content?.start ? [scenario.content.start] : []);
  const [ratings, setRatings] = useState<Record<string, number>>({});
  const [finished, setFinished] = useState(!scenario.content?.start);
  const runId = useRef(Date.now().toString(36) + Math.random().toString(36).slice(2, 8));

  // Personalize only when the analyzed job matches this scenario's family.
  const personalize = useMemo(() => {
    if (!jobContext) return null;
    if (jobContext.category && scenario.category && jobContext.category !== scenario.category) return null;
    if (!jobContext.technologies.length && !jobContext.gaps.length) return null;
    return jobContext;
  }, [jobContext, scenario.category]);

  const pct = (r: Record<string, number>) => {
    const vals = Object.values(r);
    return vals.length ? Math.round((vals.reduce((a, b) => a + b, 0) / vals.length / 5) * 100) : 0;
  };

  /** Local dashboard row — only when there's no server to record it. */
  const persistLocal = (r: Record<string, number>, partial: boolean) => {
    if (!offline && API_ENABLED) return;
    const n = Object.keys(r).length;
    if (!n) return;
    const score = pct(r);
    upsert({
      key: "scenario:" + scenario.slug, mode: "scenario", track: "Scenarios", topic: scenario.title || scenario.slug,
      score, n, total, partial, topics: scenario.title ? { [scenario.title]: score } : {},
    });
  };

  const advance = (next: string | undefined, r = ratings) => {
    persistLocal(r, true);
    if (!next || !nodes[next]) { setFinished(true); return; }
    setCurrent(next);
    setPath((p) => [...p, next]);
    window.scrollTo({ top: 0, behavior: "smooth" });
  };

  if (finished || !current || !nodes[current]) {
    return (
      <Summary scenario={scenario} ratings={ratings} pct={pct(ratings)} offline={offline} runId={runId.current}
        workflowJobId={workflowJobId} boundJobId={boundJobId} whoFallback={whoFallback}
        onPersistLocal={() => persistLocal(ratings, false)} onBack={onBack} />
    );
  }

  const node = nodes[current];
  const step = path.length;
  return (
    <div className="card">
      {personalize && step === 1 && (
        <div className="personalized">
          <div>
            {scenario.exactJob ? "Exact-job scenario generated for: " : "Closest available catalog scenario · for your role: "}
            <strong>{personalize.role || whoFallback || "your target role"}</strong>
          </div>
          {personalize.technologies.length > 0 && <div className="small">Stack: {personalize.technologies.slice(0, 5).join(", ")}</div>}
          {personalize.gaps.length > 0 && <div className="small">Focus: {personalize.gaps.slice(0, 3).join(", ")}</div>}
        </div>
      )}
      <div className="progress-label">{(total ? "Step " + step + " of " + total + " · " : "") + scenario.title + " · " + node.kind}</div>
      <div className="question">{node.prompt}</div>
      <PersonalizeHint node={node} personalize={personalize} step={step} />
      <NodeBody key={node.id} node={node} offline={offline}
        onRate={(v) => { const r = { ...ratings, [node.id]: v }; setRatings(r); advance(node.next, r); }}
        onNext={(next) => advance(next)}
        onFinish={() => setFinished(true)} />
    </div>
  );
}

function PersonalizeHint({ node, personalize, step }: { node: ScenarioNode; personalize: JobContext | null; step: number }) {
  if (!personalize || ["next_drill", "reflection", "choice"].includes(node.kind)) return null;
  const { technologies: t, gaps: g } = personalize;
  if (!t.length && !g.length) return null;
  const i = Math.max(0, step - 1);
  return (
    <p className="hint pers-hint">
      {"🎯"} For your job: frame the answer
      {t.length > 0 && <> using <strong>{t[i % t.length]}</strong></>}
      {g.length > 0 && <> and speak to <strong>{g[i % g.length]}</strong></>}.
    </p>
  );
}

function NodeBody({
  node, offline, onRate, onNext, onFinish,
}: { node: ScenarioNode; offline: boolean; onRate(v: number): void; onNext(next?: string): void; onFinish(): void }) {
  const auth = useAuth();
  const [answer, setAnswer] = useState("");
  const [revealed, setRevealed] = useState(false);
  const [grading, setGrading] = useState(false);
  const [feedback, setFeedback] = useState<AnswerFeedback | null>(null);
  const [gradeNote, setGradeNote] = useState("");
  const [choiceNote, setChoiceNote] = useState("");
  const rateRef = useRef<HTMLDivElement>(null);

  useEffect(() => {
    if (revealed) rateRef.current?.scrollIntoView({ behavior: "smooth", block: "nearest" });
  }, [revealed]);

  if (node.kind === "choice") {
    return (
      <div className="stack-sm">
        {(node.options || []).map((opt) => (
          <button key={opt.label} type="button" className="btn btn-ghost" onClick={() => { if (opt.note) setChoiceNote(opt.note); onNext(opt.next); }}>
            {opt.label}
          </button>
        ))}
        {choiceNote && <p className="hint">{choiceNote}</p>}
      </div>
    );
  }

  if (node.kind === "next_drill") {
    return (
      <>
        <div className="res-list">
          {(node.recommend || []).map((r, i) => (
            <ExternalLink key={i} className="res-link" href={r.path ? docsUrl(r.path) : "#"}>{r.label}</ExternalLink>
          ))}
        </div>
        <button type="button" className="btn btn-primary" onClick={onFinish}>Finish</button>
      </>
    );
  }

  if (node.kind === "reflection") {
    return (
      <>
        {(node.checklist || []).map((item, i) => (
          <label key={i} className="check"><input type="checkbox" /> {item}</label>
        ))}
        <button type="button" className="btn btn-primary" onClick={() => onNext(node.next)}>Continue</button>
      </>
    );
  }

  const grade = async () => {
    const a = answer.trim();
    setFeedback(null);
    setGradeNote("");
    if (a.length < 15) { setGradeNote("Type a few sentences first — then I'll grade it like an interviewer would."); return; }
    setGrading(true);
    const res = await api.gradeAnswer(await auth.getAccessToken(), { prompt: node.prompt, signals: node.signals || [], model: node.model || "", answer: a });
    setGrading(false);
    if (res.status === 200 && res.body?.feedback) setFeedback(res.body.feedback);
    else if (res.status === 401) setGradeNote("Sign in to have your answer graded. You can still reveal the strong answer below.");
    else if (res.status === 403) setGradeNote((res.body?.error || "You’ve reached your AI feedback limit. Get a pass for more.") + " You can still reveal the strong answer below.");
    else if (res.status === 0) setGradeNote("Couldn't reach the feedback service — reveal the strong answer below and self-rate.");
    else setGradeNote("Couldn't grade that right now — reveal the strong answer below and self-rate.");
  };

  const isLast = !node.next;
  const canGrade = API_ENABLED && !offline;

  return (
    <>
      {(node.signals || []).length > 0 && (
        <div className="scn-tests">
          <div className="field-label">What this tests</div>
          <ul>{node.signals!.map((x, i) => <li key={i}>{x}</li>)}</ul>
        </div>
      )}
      <textarea className="input textarea" rows={5} aria-label="Your answer"
        placeholder={"Answer out loud, then type the gist — get it graded, or reveal the strong answer."}
        value={answer} onChange={(e) => setAnswer(e.target.value)} />
      <div className="row">
        {canGrade && (
          <button type="button" className="btn btn-primary" disabled={grading} onClick={grade}>
            {grading ? "Getting feedback…" : "Get feedback"}
          </button>
        )}
        <button type="button" className={"btn " + (canGrade ? "btn-ghost" : "btn-primary")} disabled={revealed} onClick={() => setRevealed(true)}>
          Reveal strong answer
        </button>
      </div>
      {gradeNote && <p className="hint">{gradeNote}</p>}
      {feedback && <FeedbackCard f={feedback} />}
      {revealed && (
        <>
          <div className="model">
            <h4>Strong answer</h4>
            <p>{node.model || ""}</p>
            {(node.signals || []).length > 0 && (
              <>
                <div className="field-label">A strong answer shows</div>
                <ul>{node.signals!.map((x, i) => <li key={i}>{x}</li>)}</ul>
              </>
            )}
          </div>
          <div className="rate-row" ref={rateRef}>
            <div className="progress-label">Rate how well you defended it {"—"} {isLast ? "this finishes the scenario:" : "this moves you to the next step:"}</div>
            <div className="rate">
              {["1 · hand-waved", "2", "3 · partial", "4", "5 · nailed it"].map((lab, i) => (
                <button key={lab} type="button" className="star" onClick={() => onRate(i + 1)}>{lab}</button>
              ))}
            </div>
            <p className="hint">{isLast ? "Pick a rating to see your scenario summary." : "Pick a rating to continue — there are more decisions to defend."}</p>
          </div>
        </>
      )}
    </>
  );
}

function FeedbackCard({ f }: { f: AnswerFeedback }) {
  const score = typeof f.score === "number" ? f.score : 0;
  const tone = score >= 80 ? "strong" : score >= 55 ? "mid" : "weak";
  return (
    <div className={"fb fb-" + tone}>
      <div className="fb-head">
        <span className="fb-score">{score}%</span>
        <span className="fb-verdict">{f.verdict || ""}</span>
      </div>
      {(f.covered || []).length > 0 && (<><div className="field-label">What held up</div><ul className="fb-ok">{f.covered!.map((x, i) => <li key={i}>{x}</li>)}</ul></>)}
      {(f.missing || []).length > 0 && (<><div className="field-label">What was missing</div><ul className="fb-miss">{f.missing!.map((x, i) => <li key={i}>{x}</li>)}</ul></>)}
      {f.followup && (<div className="fb-followup"><div className="field-label">The interviewer would push back</div><p>{f.followup}</p></div>)}
      <p className="hint">Now reveal the strong answer to compare, then rate yourself to continue.</p>
    </div>
  );
}

// ---- summary + authoritative save -------------------------------------------

type SaveResult =
  | { saved: true; partial?: boolean; readiness?: api.ReadinessSummary; reason?: string }
  | { saved: false; local: true; reason: string; error?: string };

function Summary({
  scenario, ratings, pct, offline, runId, workflowJobId, boundJobId, whoFallback, onPersistLocal, onBack,
}: {
  scenario: Scenario; ratings: Record<string, number>; pct: number; offline: boolean; runId: string;
  workflowJobId: string; boundJobId: string; whoFallback: string; onPersistLocal(): void; onBack(): void;
}) {
  const auth = useAuth();
  const n = Object.keys(ratings).length;
  const [result, setResult] = useState<SaveResult | null>(null);
  const [attempt, setAttempt] = useState(0);
  const inFlight = useRef(false);

  useEffect(() => {
    onPersistLocal();
  }, []); // eslint-disable-line react-hooks/exhaustive-deps

  // SINGLE completion event per attempt; runId keeps server retries idempotent.
  useEffect(() => {
    if (inFlight.current) return;
    inFlight.current = true;
    persistSession().then((r) => { inFlight.current = false; setResult(r); });
  }, [attempt]); // eslint-disable-line react-hooks/exhaustive-deps

  const localSave = () => {
    const h = readJSON<unknown[]>(KEYS.scenarioSessions, []);
    h.unshift({ slug: scenario.slug, score: pct, n, mode: "scenario", category: scenario.slug, completed: true, when: new Date().toISOString() });
    writeJSON(KEYS.scenarioSessions, h.slice(0, 50));
  };

  async function persistSession(): Promise<SaveResult> {
    if (offline || !API_ENABLED || !auth.configured) { localSave(); return { saved: false, local: true, reason: "signedout" }; }
    const tok = await auth.getAccessToken();
    if (!tok) { localSave(); return { saved: false, local: true, reason: "signedout" }; }

    // Strict precedence: ?job= → bound job → valid pointer → the only job → ask.
    const jobsRes = await api.listJobs(tok);
    if (jobsRes.status !== 200) { localSave(); return { saved: false, local: true, reason: "error" }; }
    const jobs = jobsRes.body?.jobs || [];
    if (!jobs.length) { localSave(); return { saved: false, local: true, reason: "nojob" }; }
    const owns = (id: string) => !!id && jobs.some((j) => j.id === id);
    const pointer = getActiveJob();
    let jobId = "";
    if (owns(workflowJobId)) jobId = workflowJobId;
    else if (owns(boundJobId)) jobId = boundJobId;
    else if (owns(pointer)) jobId = pointer;
    else {
      if (pointer) clearActiveJob();
      if (jobs.length === 1) jobId = jobs[0].id;
    }
    if (!jobId) { localSave(); return { saved: false, local: true, reason: "choose" }; }
    setActiveJob(jobId);

    const res = await api.completePractice(tok, jobId, {
      sessionId: scenario.slug + ":" + runId, category: scenario.slug, contentSlug: scenario.slug,
      score: pct, completedAt: new Date().toISOString(),
    });
    // Also keep it in the local history: it drives the "Done · best" badges.
    if (res.status === 200 && res.body?.ok) { localSave(); return { saved: true, readiness: res.body.readiness }; }
    if (res.status === 207) { localSave(); return { saved: true, partial: true, readiness: res.body?.readiness, reason: res.body?.reason || "snapshot" }; }
    if (res.status === 404) clearActiveJob();
    localSave();
    if (res.status === 0) return { saved: false, local: true, reason: "network" };
    return { saved: false, local: true, reason: res.body?.reason || (res.status === 404 ? "nojob" : "server"), error: res.body?.error };
  }

  const jt = whoFallback || "your job";
  const retry = () => { setResult(null); setAttempt((a) => a + 1); };
  const allBtn = <button type="button" className="btn btn-ghost" onClick={onBack}>All scenarios</button>;

  let status: ReactNode = <p className="status">Saving practice and updating readiness{"…"}</p>;
  let actions: ReactNode = null;
  if (result?.saved && !result.partial) {
    const ov = typeof result.readiness?.overall === "number" ? result.readiness.overall : null;
    status = (
      <div className="complete" role="status">
        <div className="complete-badge">{"✅"} Scenario complete</div>
        <ul className="complete-list">
          <li>Practice saved to <strong>{jt}</strong></li>
          <li>{ov != null ? <>Interview Readiness updated {"—"} now <strong>{ov}%</strong></> : "Interview Readiness updated"}</li>
        </ul>
      </div>
    );
    actions = (<><Link className="btn btn-primary" to="/dashboard">See readiness {"→"}</Link><button type="button" className="btn btn-ghost" onClick={onBack}>Try another scenario</button></>);
  } else if (result?.saved && result.partial) {
    status = <p className="status status-warn">{result.reason === "schema_missing"
      ? "Scenario completed and your practice was saved, but readiness storage isn’t fully deployed yet (migration 0006). Readiness will update once it’s applied."
      : "Scenario completed, and your practice was saved — Interview Readiness will reconcile on your next activity."}</p>;
    actions = (<><Link className="btn" to="/dashboard">See readiness</Link>{allBtn}</>);
  } else if (result && !result.saved) {
    const r = result.reason;
    if (r === "schema_missing") {
      status = <p className="status status-err">Scenario completed, but readiness storage isn{"’"}t fully deployed yet, so we couldn{"’"}t save this to your job. (Migration 0006 needs to be applied.)</p>;
      actions = (<><button type="button" className="btn btn-primary" onClick={retry}>Try Saving Again</button>{allBtn}</>);
    } else if (r === "choose") {
      status = <p className="status status-warn">Scenario completed. You have more than one saved job {"—"} <Link to="/jobs">open the job</Link> you{"’"}re practicing for, then re-run so it counts toward that job{"’"}s readiness.</p>;
      actions = allBtn;
    } else if (r === "nojob") {
      status = <p className="status status-warn">Scenario completed (saved to this browser only). <Link to="/analyze">Add a job</Link> so practice counts toward its readiness.</p>;
      actions = allBtn;
    } else if (r === "signedout") {
      status = offline || !API_ENABLED
        ? <p className="status status-warn">Scenario completed (saved to this browser only).</p>
        : <p className="status status-warn">Scenario completed (saved to this browser only) {"—"} <Link to="/account">sign in</Link> so your practice is saved to your job and every device.</p>;
      actions = allBtn;
    } else {
      const msg = r === "network"
        ? "Scenario completed, but we couldn’t reach the server to save it. Check your connection and try again — your practice is kept in this browser meanwhile."
        : r === "token"
          ? "Scenario completed, but your sign-in couldn’t be verified, so it wasn’t saved to your job. Sign in again, then retry."
          : r === "error"
            ? "Scenario completed, but we couldn’t load your jobs to attribute this practice. Please try again."
            : "Scenario completed, but the server couldn’t save it right now. Please try again — your practice is kept in this browser meanwhile.";
      status = <p className="status status-err">{msg}</p>;
      actions = (<><button type="button" className="btn btn-primary" onClick={retry}>Try Saving Again</button>{allBtn}</>);
    }
  }

  return (
    <div className="card summary">
      <div className="big-score">{n ? pct + "%" : "✓"}</div>
      <p>{scenario.title} {"—"} {n} decisions defended.</p>
      <p>{pct >= 80 ? "Strong — you held the line under follow-ups." : pct >= 60 ? "Solid. Revisit the ones you rated low and run it again." : "Good start. Re-read the strong answers, then rerun."}</p>
      {status}
      <div className="row">{actions}</div>
    </div>
  );
}
