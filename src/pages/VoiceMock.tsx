/* Voice mock interview: answer OUT LOUD, a realistic interviewer follows up on
 * what you actually said, and you're scored on content (AI) and delivery
 * (measured locally from the transcript + timing).
 *
 * Speech: Web Speech API recognition (Chrome/Edge, Safari partly) with a
 * typing fallback; speechSynthesis for the interviewer's voice.
 * AI: POST /api/premium/mock-turn (sign-in; turn 0 = one voice_mock session).
 * Without the API (signed out, not configured, over quota and declined) the
 * session runs from the local question bank and you rate yourself. */

import { useEffect, useMemo, useRef, useState } from "react";
import { SIM_BANK } from "../data/simulatorBank";
import { PlanGate, UpgradeCard } from "../components/PlanGate";
import {
  completePractice, getJob, mockTurn,
  type MockFeedback, type MockScores, type MockStyle, type MockTurnResponse, type MockType,
} from "../lib/api";
import { useAuth } from "../lib/auth";
import {
  computeDelivery, deliveryTips, summarizeDelivery, WPM_TARGET, type DeliveryMetrics,
} from "../lib/delivery";
import { record } from "../lib/progressStore";
import { getActiveJob, setActiveJob } from "../lib/readiness";
import { displayJobTitle } from "../lib/roles";
import { Link } from "../lib/router";
import { readJSON, writeJSON } from "../lib/storage";
import { useJobs } from "../lib/useJobs";
import {
  createRecognizer, detectSupport, onVoicesChanged, speak, startMicMeter, stopSpeaking,
  type MicMeter, type Recognizer,
} from "../lib/voice";

// ---------------------------------------------------------------- constants ---

const SESSIONS_KEY = "offerready.voiceSessions.v1";
const PREFS_KEY = "offerready.voicePrefs.v1";
const MAX_SESSIONS = 10;
const MAIN_TARGET_SEC = 120;
const FOLLOWUP_TARGET_SEC = 60;
const HISTORY_TURNS = 6;

const TYPES: { id: MockType; label: string; desc: string }[] = [
  { id: "behavioral", label: "Behavioral", desc: "Ownership, conflict, impact. STAR stories." },
  { id: "technical", label: "Technical deep dive", desc: "How it works, why, and the trade-offs." },
  { id: "system_design", label: "System design", desc: "Requirements, components, scale, failure." },
  { id: "mixed", label: "Mixed", desc: "A real loop: all three, interleaved." },
];
const STYLES: { id: MockStyle; label: string; desc: string; name: string }[] = [
  { id: "friendly", label: "Friendly", desc: "Warm, encouraging, still honest.", name: "Sam Rivera" },
  { id: "neutral", label: "Neutral", desc: "Even and professional.", name: "Jordan Lee" },
  { id: "tough", label: "Tough", desc: "A bar-raiser who presses on vague claims.", name: "Morgan Hale" },
];
const DIMS: { k: keyof MockScores; label: string }[] = [
  { k: "structure", label: "Structure" },
  { k: "depth", label: "Depth" },
  { k: "relevance", label: "Relevance" },
  { k: "communication", label: "Communication" },
];
const typeLabel = (t: MockType) => TYPES.find((x) => x.id === t)?.label || "Mixed";
const styleOf = (s: MockStyle) => STYLES.find((x) => x.id === s) || STYLES[1];
const initials = (name: string) => name.split(/\s+/).map((p) => p[0] || "").join("").slice(0, 2).toUpperCase();

// ------------------------------------------------------------ question bank ---

interface BankQ {
  text: string;
  topic: string;
  kind: "behavioral" | "technical" | "system_design";
  outline: string[];
  followup?: string;
}

const BEHAVIORAL: BankQ[] = [
  { kind: "behavioral", topic: "Ownership", text: "Tell me about a project you're proud of from the last couple of years. What was your part in it, specifically?",
    outline: ["Context in one or two sentences: team, goal, stakes", "Your own role and decisions (say “I”)", "The hardest part and how you handled it", "A measurable result", "What you'd do differently"],
    followup: "What's one decision on that project that was yours alone, and what was the alternative you rejected?" },
  { kind: "behavioral", topic: "Conflict", text: "Tell me about a time you disagreed with a teammate or manager about a technical decision. How did it play out?",
    outline: ["The disagreement and why it mattered", "How you understood their view first", "Evidence or data you used", "How it was resolved, including if you lost", "The relationship afterwards"],
    followup: "Looking back, was there anything in their position you should have taken more seriously?" },
  { kind: "behavioral", topic: "Failure", text: "Tell me about a time something you owned failed or went wrong in production. What happened?",
    outline: ["What broke and the impact", "How you detected and mitigated it", "Root cause, honestly", "What you changed so it can't recur", "What you learned"],
    followup: "What did you change in the process afterwards, and how do you know it worked?" },
  { kind: "behavioral", topic: "Influence", text: "Describe a time you had to convince people outside your team to change how they worked.",
    outline: ["Who needed convincing and why they resisted", "How you built the case (data, prototype, allies)", "The specific steps you took", "Outcome and adoption", "What you'd repeat"],
    followup: "What was the strongest objection you heard, and how did you answer it?" },
  { kind: "behavioral", topic: "Ambiguity", text: "Tell me about a time you had to deliver with unclear requirements. How did you decide what to build?",
    outline: ["The ambiguity and the deadline", "How you clarified: users, stakeholders, data", "The scope you chose and why", "How you de-risked it", "Result and follow-up"],
    followup: "What did you deliberately leave out, and how did you get agreement on that?" },
  { kind: "behavioral", topic: "Prioritization", text: "Tell me about a time you had too much on your plate. What did you drop, and how did you decide?",
    outline: ["The competing demands", "Your prioritization criteria", "How you communicated trade-offs", "The outcome", "What you'd change"],
    followup: "Who was unhappy with that call, and how did you handle it?" },
  { kind: "behavioral", topic: "Mentoring", text: "Tell me about someone you helped grow. What did you actually do?",
    outline: ["Where they started", "Specific actions you took", "How you gave hard feedback", "Their growth, with evidence", "What you learned as a mentor"],
    followup: "What's a piece of feedback you gave them that was hard to deliver?" },
];

const SYSTEM_DESIGN: BankQ[] = [
  { kind: "system_design", topic: "Rate limiting", text: "Design a rate limiter for a public API used by thousands of customers. Where does it run and how does it behave under load?",
    outline: ["Clarify: per key / per IP, limits, burst, global vs regional", "Algorithm: token bucket or sliding window, and why", "State: Redis or in-memory with sync; atomic ops", "Failure mode: fail open vs closed", "Headers, 429s, observability, cost"],
    followup: "Your Redis cluster goes down. What happens to traffic, and is that the right behavior?" },
  { kind: "system_design", topic: "Notifications", text: "Design a notification system that sends email, SMS and push to millions of users.",
    outline: ["Requirements: volume, latency, priority, preferences", "Queue-based fan-out with per-channel workers", "Idempotency and retries with backoff", "Provider failover and rate limits", "Preferences, unsubscribe, and metrics"],
    followup: "How do you guarantee a user never gets the same notification twice?" },
  { kind: "system_design", topic: "Feed", text: "Design the home feed for a social app. How are posts collected, ranked and served fast?",
    outline: ["Scale assumptions and read/write ratio", "Fan-out on write vs read, hybrid for celebrities", "Ranking pipeline and caching", "Storage choices and pagination", "Freshness vs cost trade-off"],
    followup: "A user with fifty million followers posts. Walk me through exactly what happens." },
  { kind: "system_design", topic: "File storage", text: "Design a service like a shared drive where users upload, share and sync files.",
    outline: ["Requirements: file sizes, sharing model, sync", "Chunked uploads, object storage, metadata DB", "Sync and conflict handling", "Permissions and links", "Durability, cost tiers, CDN"],
    followup: "Two people edit the same file offline and reconnect. What does your system do?" },
];

const stripMd = (s: string) => s.replace(/\*\*|`/g, "");
const TECH_BANK: BankQ[] = SIM_BANK.filter((b) => !/system design/i.test(b.area)).map((b) => ({
  kind: "technical" as const, topic: b.topic, text: stripMd(b.q), outline: b.strong.map(stripMd),
  followup: stripMd(b.followup.split("→")[0]).trim() || undefined,
}));
SYSTEM_DESIGN.push(...SIM_BANK.filter((b) => /system design/i.test(b.area)).map((b) => ({
  kind: "system_design" as const, topic: b.topic, text: stripMd(b.q), outline: b.strong.map(stripMd),
  followup: stripMd(b.followup.split("→")[0]).trim() || undefined,
})));

const shuffle = <T,>(a: T[]): T[] => {
  const b = a.slice();
  for (let i = b.length - 1; i > 0; i--) {
    const j = Math.floor(Math.random() * (i + 1));
    [b[i], b[j]] = [b[j], b[i]];
  }
  return b;
};

/** Technical questions, preferring ones that mention the job's skills. */
function techFor(skills: string[]): BankQ[] {
  const s = skills.map((x) => x.toLowerCase()).filter((x) => x.length > 1);
  const hit = (q: BankQ) => s.some((k) => (q.text + " " + q.topic).toLowerCase().includes(k));
  const matched = shuffle(TECH_BANK.filter(hit));
  const rest = shuffle(TECH_BANK.filter((q) => !hit(q)));
  if (!matched.length && s.length) {
    const generic: BankQ = {
      kind: "technical", topic: "Deep dive",
      text: `Walk me through a technical system you built or know well, ideally one using ${skills.slice(0, 2).join(" or ")}. How does it work, and what's one design decision you'd defend?`,
      outline: ["One-sentence purpose and scale", "The main components and data flow", "One decision, the alternatives, and why", "A failure mode and how it's handled", "What you'd change now"],
      followup: "What's the first thing that breaks if traffic grows ten times?",
    };
    return [generic, ...rest];
  }
  return [...matched, ...rest];
}

function bankFor(type: MockType, n: number, skills: string[]): BankQ[] {
  const b = shuffle(BEHAVIORAL);
  const t = techFor(skills);
  const d = shuffle(SYSTEM_DESIGN);
  if (type === "behavioral") return b.slice(0, n);
  if (type === "technical") return t.slice(0, n);
  if (type === "system_design") return d.slice(0, n);
  const order = [b, t, d];
  const out: BankQ[] = [];
  for (let i = 0; out.length < n; i++) {
    const q = order[i % 3].shift();
    if (q) out.push(q);
    if (i > 30) break;
  }
  return out;
}

// --------------------------------------------------------------- data model ---

interface Prefs {
  type: MockType;
  length: 3 | 5;
  style: MockStyle;
  voiceURI: string;
  muted: boolean;
  silenceSec: number;
  coach: boolean;
  typeAnswers: boolean;
}
const DEFAULT_PREFS: Prefs = { type: "behavioral", length: 3, style: "neutral", voiceURI: "", muted: false, silenceSec: 3, coach: true, typeAnswers: false };

interface JobCtx {
  id: string;
  title: string;
  company?: string;
  seniority?: string;
  skills: string[];
}

interface Answer {
  mainIndex: number;
  isFollowup: boolean;
  question: string;
  topic: string;
  transcript: string;
  typed: boolean;
  delivery: DeliveryMetrics;
  feedback: MockFeedback | null;
  outline: string[];
  /** 1–5 self rating when AI feedback wasn't available. */
  selfRating?: number;
}

interface SessionRec {
  id: string;
  at: number;
  jobId: string;
  jobTitle: string;
  type: MockType;
  style: MockStyle;
  length: number;
  mode: "ai" | "offline";
  answers: Answer[];
  mains: string[];
  saved?: boolean;
}

interface Cur {
  mainIndex: number;
  isFollowup: boolean;
  text: string;
  topic: string;
  outline: string[];
  bankFollowup?: string;
}

function readPrefs(): Prefs {
  const p = readJSON<Partial<Prefs>>(PREFS_KEY, {});
  return { ...DEFAULT_PREFS, ...(p && typeof p === "object" ? p : {}) };
}
function readSessions(): SessionRec[] {
  const s = readJSON<SessionRec[]>(SESSIONS_KEY, []);
  return Array.isArray(s) ? s.filter((x) => x && Array.isArray(x.answers)) : [];
}
function saveSession(rec: SessionRec) {
  const list = readSessions().filter((s) => s.id !== rec.id);
  list.unshift(rec);
  writeJSON(SESSIONS_KEY, list.slice(0, MAX_SESSIONS));
}

const answerScores = (a: Answer): MockScores | null =>
  a.feedback ? a.feedback.scores
  : a.selfRating ? { structure: a.selfRating, depth: a.selfRating, relevance: a.selfRating, communication: a.selfRating }
  : null;
const avg = (s: MockScores) => (s.structure + s.depth + s.relevance + s.communication) / 4;

function sessionStats(rec: SessionRec) {
  const scored = rec.answers.filter((a) => answerScores(a));
  const dims: MockScores | null = scored.length
    ? (Object.fromEntries(DIMS.map(({ k }) => [k, Math.round((scored.reduce((s, a) => s + (answerScores(a) as MockScores)[k], 0) / scored.length) * 10) / 10])) as unknown as MockScores)
    : null;
  const overall = dims ? Math.round((avg(dims) / 5) * 100) : null;
  const ranked = scored.slice().sort((a, b) => avg(answerScores(b) as MockScores) - avg(answerScores(a) as MockScores));
  return { dims, overall, best: ranked[0] || null, weakest: ranked.length > 1 ? ranked[ranked.length - 1] : null, scored: scored.length };
}

const newSid = () => "vm_" + Date.now().toString(36) + Math.random().toString(36).slice(2, 10);
const fmt = (secs: number) => String(Math.floor(secs / 60)).padStart(2, "0") + ":" + String(Math.floor(secs % 60)).padStart(2, "0");

// --------------------------------------------------------------------- page ---

type View =
  | { kind: "setup" }
  | { kind: "session"; key: string; prefs: Prefs; job: JobCtx | null; mains?: BankQ[]; length: number; carry?: Carry }
  | { kind: "summary"; rec: SessionRec; fromHistory?: boolean; carry?: Carry };

interface Carry {
  sid: string;
  token: string;
  turnIndex: number;
}

export default function VoiceMockPage() {
  const [view, setView] = useState<View>({ kind: "setup" });
  const [sessions, setSessions] = useState<SessionRec[]>(() => readSessions());

  return (
    <div className="page vm">
      {view.kind === "setup" && (
        <Setup
          sessions={sessions}
          onStart={(prefs, job) => setView({ kind: "session", key: newSid(), prefs, job, length: prefs.length })}
          onOpen={(rec) => setView({ kind: "summary", rec, fromHistory: true })}
        />
      )}
      {view.kind === "session" && (
        <Session
          key={view.key}
          prefs={view.prefs}
          job={view.job}
          length={view.length}
          initialMains={view.mains}
          carry={view.carry}
          onExit={() => setView({ kind: "setup" })}
          onFinish={(rec, carry) => {
            if (rec.answers.length) { saveSession(rec); setSessions(readSessions()); }
            setView(rec.answers.length ? { kind: "summary", rec, carry } : { kind: "setup" });
          }}
        />
      )}
      {view.kind === "summary" && (
        <Summary
          rec={view.rec}
          onBack={() => { setSessions(readSessions()); setView({ kind: "setup" }); }}
          onSaved={(rec) => { saveSession(rec); setSessions(readSessions()); setView({ ...view, rec }); }}
          onPracticeAgain={(q) => {
            const prefs = { ...readPrefs(), type: view.rec.type, style: view.rec.style };
            const job = view.rec.jobId ? { id: view.rec.jobId, title: view.rec.jobTitle, skills: [] } : null;
            setView({ kind: "session", key: newSid(), prefs, job, length: 1, mains: [q], carry: view.fromHistory ? undefined : view.carry });
          }}
        />
      )}
    </div>
  );
}

// -------------------------------------------------------------------- setup ---

function Setup({ sessions, onStart, onOpen }: { sessions: SessionRec[]; onStart(p: Prefs, job: JobCtx | null): void; onOpen(r: SessionRec): void }) {
  const auth = useAuth();
  const jobs = useJobs();
  const support = useMemo(() => detectSupport(), []);
  const [prefs, setPrefsState] = useState<Prefs>(() => readPrefs());
  const [jobId, setJobId] = useState<string>("__init");
  const [voices, setVoices] = useState<SpeechSynthesisVoice[]>([]);
  const [starting, setStarting] = useState(false);
  const setPrefs = (p: Partial<Prefs>) => setPrefsState((cur) => { const n = { ...cur, ...p }; writeJSON(PREFS_KEY, n); return n; });

  useEffect(() => onVoicesChanged(setVoices), []);
  useEffect(() => {
    if (jobId !== "__init" || jobs.status === "loading") return;
    setJobId(jobs.activeId || (jobs.status === "ready" ? getActiveJob() : "") || "");
  }, [jobs.status, jobs.activeId]); // eslint-disable-line react-hooks/exhaustive-deps

  const signedIn = !!auth.session;
  const canVoice = support.recognition && !prefs.typeAnswers;
  const pickedJob = jobs.jobs.find((j) => j.id === jobId);

  const start = async () => {
    setStarting(true);
    let job: JobCtx | null = null;
    if (pickedJob) {
      job = { id: pickedJob.id, title: displayJobTitle(pickedJob), company: pickedJob.company, seniority: pickedJob.seniority, skills: [] };
      const a = pickedJob.analysis;
      const fromAnalysis = (an: typeof a) => [
        ...((an?.coreSkills || []).map((s) => (typeof s === "string" ? s : s.name))),
        ...(an?.technologies || []),
      ].filter(Boolean).slice(0, 15);
      job.skills = fromAnalysis(a);
      if (!job.skills.length && jobs.token) {
        // Pull skills from the saved analysis; don't hold the start for long.
        const res = await Promise.race([
          getJob(jobs.token, pickedJob.id),
          new Promise<null>((r) => setTimeout(() => r(null), 4000)),
        ]);
        if (res && res.status === 200 && res.body?.job) {
          job.skills = Array.from(new Set(fromAnalysis(res.body.job.analysis))).slice(0, 15);
          job.seniority = job.seniority || res.body.job.analysis?.seniority;
        }
      }
      setActiveJob(pickedJob.id);
    }
    setStarting(false);
    onStart(prefs, job);
  };

  return (
    <div className="stack">
      <SupportNotice support={support} typing={prefs.typeAnswers} />

      <section className="card vm-setup">
        <div className="vm-field">
          <label className="field-label" htmlFor="vm-job">Job</label>
          <select id="vm-job" className="input" value={jobId === "__init" ? "" : jobId} onChange={(e) => setJobId(e.target.value)}>
            <option value="">General practice (no job)</option>
            {jobs.jobs.map((j) => <option key={j.id} value={j.id}>{displayJobTitle(j)}{j.company ? " · " + j.company : ""}</option>)}
          </select>
          {jobs.status === "signedout" && <p className="hint">Sign in to tailor questions to a saved job.</p>}
        </div>

        <fieldset className="vm-field">
          <legend className="field-label">Interview type</legend>
          <div className="vm-choices vm-choices-4">
            {TYPES.map((t) => (
              <label key={t.id} className={"vm-choice" + (prefs.type === t.id ? " on" : "")}>
                <input type="radio" name="vm-type" value={t.id} checked={prefs.type === t.id} onChange={() => setPrefs({ type: t.id })} />
                <span className="vm-choice-title">{t.label}</span>
                <span className="vm-choice-desc">{t.desc}</span>
              </label>
            ))}
          </div>
        </fieldset>

        <div className="vm-grid-2">
          <fieldset className="vm-field">
            <legend className="field-label">Length</legend>
            <div className="vm-seg" role="radiogroup" aria-label="Length">
              {([3, 5] as const).map((n) => (
                <label key={n} className={"vm-seg-opt" + (prefs.length === n ? " on" : "")}>
                  <input type="radio" name="vm-len" checked={prefs.length === n} onChange={() => setPrefs({ length: n })} />
                  {n} questions <span className="small muted">~{n * 4} min</span>
                </label>
              ))}
            </div>
          </fieldset>
          <fieldset className="vm-field">
            <legend className="field-label">Interviewer style</legend>
            <div className="vm-seg" role="radiogroup" aria-label="Interviewer style">
              {STYLES.map((s) => (
                <label key={s.id} className={"vm-seg-opt" + (prefs.style === s.id ? " on" : "")} title={s.desc}>
                  <input type="radio" name="vm-style" checked={prefs.style === s.id} onChange={() => setPrefs({ style: s.id })} />
                  {s.label}
                </label>
              ))}
            </div>
            <p className="hint">{styleOf(prefs.style).desc}</p>
          </fieldset>
        </div>

        <details className="vm-more">
          <summary>Voice and feedback settings</summary>
          <div className="vm-grid-2">
            <div className="vm-field">
              <label className="field-label" htmlFor="vm-voice">Interviewer voice</label>
              <div className="row">
                <select id="vm-voice" className="input vm-grow" value={prefs.voiceURI} disabled={!support.synthesis || !voices.length} onChange={(e) => setPrefs({ voiceURI: e.target.value })}>
                  <option value="">Default voice</option>
                  {voices.map((v) => <option key={v.voiceURI} value={v.voiceURI}>{v.name} ({v.lang})</option>)}
                </select>
                <button type="button" className="btn" disabled={!support.synthesis} onClick={() => speak("Hi, thanks for joining. Let's get started.", { voiceURI: prefs.voiceURI })}>Test</button>
              </div>
              <label className="check"><input type="checkbox" checked={prefs.muted} onChange={(e) => setPrefs({ muted: e.target.checked })} /> Mute the interviewer (read questions only)</label>
            </div>
            <div className="vm-field">
              <label className="field-label" htmlFor="vm-silence">Auto-stop after silence</label>
              <select id="vm-silence" className="input" value={String(prefs.silenceSec)} onChange={(e) => setPrefs({ silenceSec: Number(e.target.value) })}>
                <option value="0">Off (press Done)</option>
                <option value="3">3 seconds</option>
                <option value="5">5 seconds</option>
                <option value="8">8 seconds</option>
              </select>
              <label className="check"><input type="checkbox" checked={prefs.coach} onChange={(e) => setPrefs({ coach: e.target.checked })} /> Show feedback after each answer (off = feedback at the end, like a real interview)</label>
              {support.recognition && <label className="check"><input type="checkbox" checked={prefs.typeAnswers} onChange={(e) => setPrefs({ typeAnswers: e.target.checked })} /> Type my answers instead of speaking</label>}
            </div>
          </div>
        </details>
      </section>

      {canVoice && <MicCheck />}

      <section className="card vm-start">
        <PlanGate feature="voice_mock">
          <div className="vm-start-row">
            <div>
              <strong>{typeLabel(prefs.type)} · {prefs.length} questions · {styleOf(prefs.style).label} interviewer</strong>
              <p className="hint">
                {signedIn
                  ? "Each session counts once toward your monthly voice mock sessions, however many follow-ups you get."
                  : <>Signed out, you{"’"}ll practice from the question bank and rate yourself. <Link to="/account">Sign in</Link> for AI follow-ups and scoring.</>}
              </p>
            </div>
            <button type="button" className="btn btn-primary btn-lg" onClick={start} disabled={starting}>{starting ? "Preparing…" : "Start session"}</button>
          </div>
        </PlanGate>
      </section>

      <RecentSessions sessions={sessions} onOpen={onOpen} />
    </div>
  );
}

function SupportNotice({ support, typing }: { support: ReturnType<typeof detectSupport>; typing: boolean }) {
  if (!support.recognition) {
    return (
      <div className="vm-notice vm-notice-warn" role="note">
        <strong>Speech recognition isn{"’"}t available in this browser{support.browser === "firefox" ? " (Firefox)" : ""}.</strong>{" "}
        You can still run the full interview by typing your answers: follow-ups and content scoring work the same. Pace and pause metrics need voice; use Chrome or Edge for those.
      </div>
    );
  }
  return (
    <div className="vm-notice" role="note">
      {typing ? "You’ll type answers this session. " : "Answers are transcribed by your browser’s speech recognition (the Web Speech API). "}
      It works best in Chrome and Edge; Safari support is partial and Firefox has none (you can type instead).
      {support.browser !== "safari" && " In Chrome, audio is processed by the browser’s speech service."}
    </div>
  );
}

function MicCheck() {
  const [level, setLevel] = useState(0);
  const [peak, setPeak] = useState(0);
  const [state, setState] = useState<"idle" | "on" | "error">("idle");
  const [err, setErr] = useState("");
  const meter = useRef<MicMeter | null>(null);
  useEffect(() => () => meter.current?.stop(), []);
  const toggle = async () => {
    if (meter.current) { meter.current.stop(); meter.current = null; setState("idle"); setLevel(0); return; }
    const m = await startMicMeter((l) => { setLevel(l); setPeak((p) => Math.max(p * 0.995, l)); });
    if ("error" in m) {
      setState("error");
      setErr(m.error === "denied" ? "Microphone access was blocked. Allow it from the icon in the address bar, then try again." : m.error === "nodevice" ? "No microphone found. Plug one in, or type your answers." : "Couldn’t open the microphone in this browser.");
      return;
    }
    meter.current = m;
    setState("on");
  };
  const heard = peak > 0.25;
  return (
    <section className="card vm-mic">
      <div className="vm-mic-head">
        <div>
          <strong>Mic check</strong>
          <p className="hint">{state === "on" ? (heard ? "We can hear you. You’re good to go." : "Say a few words at your normal interview volume.") : "Optional: check the level before you start."}</p>
        </div>
        <button type="button" className="btn" onClick={toggle} aria-pressed={state === "on"}>{state === "on" ? "Stop test" : "Test microphone"}</button>
      </div>
      <div className="vm-meter" role="meter" aria-label="Microphone level" aria-valuemin={0} aria-valuemax={100} aria-valuenow={Math.round(level * 100)}>
        <div className={"vm-meter-fill" + (heard ? " ok" : "")} style={{ width: Math.round(level * 100) + "%" }} />
      </div>
      {state === "error" && <p className="error" role="alert">{err}</p>}
    </section>
  );
}

function RecentSessions({ sessions, onOpen }: { sessions: SessionRec[]; onOpen(r: SessionRec): void }) {
  if (!sessions.length) return null;
  return (
    <section className="card">
      <h2 className="section-title">Recent sessions</h2>
      <ul className="vm-recent">
        {sessions.map((s) => {
          const st = sessionStats(s);
          return (
            <li key={s.id}>
              <button type="button" className="vm-recent-btn" onClick={() => onOpen(s)}>
                <span className="vm-recent-main">
                  <strong>{typeLabel(s.type)}</strong> · {s.jobTitle || "General practice"}
                  <span className="vm-recent-meta">{new Date(s.at).toLocaleString()} · {s.answers.length} answer{s.answers.length === 1 ? "" : "s"}{s.mode === "offline" ? " · self-rated" : ""}{s.saved ? " · saved" : ""}</span>
                </span>
                <span className={"vm-recent-score" + (st.overall === null ? " none" : "")}>{st.overall === null ? "—" : st.overall + "%"}</span>
              </button>
            </li>
          );
        })}
      </ul>
    </section>
  );
}

// ------------------------------------------------------------------ session ---

type Step = "asking" | "ready" | "recording" | "thinking" | "review" | "upgrade";

interface SessionProps {
  prefs: Prefs;
  job: JobCtx | null;
  length: number;
  initialMains?: BankQ[];
  carry?: Carry;
  onExit(): void;
  onFinish(rec: SessionRec, carry?: Carry): void;
}

function Session({ prefs, job, length, initialMains, carry, onExit, onFinish }: SessionProps) {
  const auth = useAuth();
  const support = useMemo(() => detectSupport(), []);
  const persona = styleOf(prefs.style);
  const [muted, setMuted] = useState(prefs.muted);
  const typing = !support.recognition || prefs.typeAnswers;
  const [typeThis, setTypeThis] = useState(false);
  const typed = typing || typeThis;

  // Mutable session data (read inside async callbacks), plus a render tick.
  const S = useRef({
    sid: carry?.sid || newSid(),
    token: carry?.token || "",
    turnIndex: carry?.turnIndex || 0,
    mode: "ai" as "ai" | "offline",
    offlineNote: "",
    mains: (initialMains || bankFor(prefs.type, length, job?.skills || [])) as BankQ[],
    bank: bankFor(prefs.type, 8, job?.skills || []),
    planned: !!initialMains || !!carry,
    answers: [] as Answer[],
    followupUsed: false,
    next: null as Cur | null,
    at: Date.now(),
  });
  const [, setTick] = useState(0);
  const rerender = () => setTick((n) => n + 1);

  const first = S.current.mains[0];
  const [cur, setCur] = useState<Cur>({ mainIndex: 0, isFollowup: false, text: first.text, topic: first.topic, outline: first.outline, bankFollowup: first.followup });
  const [step, setStep] = useState<Step>("asking");
  const [finalText, setFinalText] = useState("");
  const [interim, setInterim] = useState("");
  const [draft, setDraft] = useState("");
  const [secs, setSecs] = useState(0);
  const [levels, setLevels] = useState<number[]>(() => new Array(28).fill(0));
  const [error, setError] = useState("");
  const [last, setLast] = useState<Answer | null>(null);
    const [status, setStatus] = useState("");

  const recRef = useRef<Recognizer | null>(null);
  const meterRef = useRef<MicMeter | null>(null);
  const t0 = useRef(0);
  const autoStopped = useRef(false);
  const startBtn = useRef<HTMLButtonElement | null>(null);
  const doneBtn = useRef<HTMLButtonElement | null>(null);
  const contBtn = useRef<HTMLButtonElement | null>(null);
  const draftRef = useRef<HTMLTextAreaElement | null>(null);
  const stepRef = useRef(step);
  stepRef.current = step;

  const total = length;
  const target = cur.isFollowup ? FOLLOWUP_TARGET_SEC : MAIN_TARGET_SEC;

  // Ask each question: show it, speak it (unless muted), then wait for the answer.
  useEffect(() => {
    let alive = true;
    stepRef.current = "asking";
    setStep("asking");
    const room = document.querySelector(".vm-room");
    if (room && room.getBoundingClientRect().top < 0) room.scrollIntoView({ block: "start" });
    setFinalText(""); setInterim(""); setDraft(""); setError(""); setSecs(0);
    setStatus((cur.isFollowup ? "Follow-up: " : `Question ${cur.mainIndex + 1}: `) + cur.text);
    (async () => {
      if (!muted && support.synthesis) await speak(cur.text, { voiceURI: prefs.voiceURI });
      // The user may have started answering mid-question; don't clobber that.
      if (!alive || stepRef.current !== "asking") return;
      stepRef.current = "ready";
      setStep("ready");
      t0.current = Date.now();
    })();
    return () => { alive = false; stopSpeaking(); };
  }, [cur]); // eslint-disable-line react-hooks/exhaustive-deps

  useEffect(() => {
    if (step === "ready") (typed ? draftRef.current : startBtn.current)?.focus();
    if (step === "recording") doneBtn.current?.focus();
    if (step === "review") contBtn.current?.focus();
  }, [step, typed]);

  // Timer: while recording, or while typing an answer.
  useEffect(() => {
    if (!(step === "recording" || (step === "ready" && typed))) return;
    const t = setInterval(() => setSecs(Math.floor((Date.now() - t0.current) / 1000)), 250);
    return () => clearInterval(t);
  }, [step, typed]);

  // Cleanup on unmount.
  useEffect(() => () => { recRef.current?.abort(); meterRef.current?.stop(); stopSpeaking(); }, []);

  // Keyboard: Space starts/stops the answer (when focus isn't in a control), Esc cancels.
  useEffect(() => {
    const onKey = (e: KeyboardEvent) => {
      const el = e.target as HTMLElement | null;
      const tag = el?.tagName || "";
      if (/^(INPUT|TEXTAREA|SELECT|BUTTON|A|SUMMARY)$/.test(tag) || el?.isContentEditable) return;
      if (e.code === "Space" || e.key === " ") {
        if (typed) return;
        if (stepRef.current === "ready" || stepRef.current === "asking") { e.preventDefault(); startAnswer(); }
        else if (stepRef.current === "recording") { e.preventDefault(); finishAnswer(); }
      } else if (e.key === "Escape" && stepRef.current === "recording") {
        cancelAnswer();
      }
    };
    window.addEventListener("keydown", onKey);
    return () => window.removeEventListener("keydown", onKey);
  });

  function startAnswer() {
    if (stepRef.current !== "ready" && stepRef.current !== "asking") return;
    stopSpeaking();
    setError("");
    autoStopped.current = false;
    const r = createRecognizer({
      onText: (f, i) => { setFinalText(f); setInterim(i); },
      onAutoStop: (reason, err) => {
        if (reason === "silence") { autoStopped.current = true; finishAnswer(); return; }
        meterRef.current?.stop(); meterRef.current = null;
        setStep("ready");
        setTypeThis(true);
        setError(err === "not-allowed" || err === "service-not-allowed"
          ? "The microphone or speech service was blocked. Allow the mic from the address bar, or type this answer below."
          : "No microphone was found. Type this answer below.");
      },
    }, { silenceMs: prefs.silenceSec * 1000 });
    if (!r) { setTypeThis(true); setStep("ready"); return; }
    recRef.current = r;
    t0.current = Date.now();
    setSecs(0); setFinalText(""); setInterim("");
    try { r.start(); } catch { setTypeThis(true); return; }
    stepRef.current = "recording";
    setStep("recording");
    setStatus("Recording. Press Space or Done when you finish.");
    startMicMeter((l) => setLevels((xs) => [...xs.slice(1), l])).then((m) => {
      if ("error" in m) return;
      if (stepRef.current !== "recording") { m.stop(); return; }
      meterRef.current = m;
    });
  }

  function cancelAnswer() {
    recRef.current?.abort(); recRef.current = null;
    meterRef.current?.stop(); meterRef.current = null;
    setFinalText(""); setInterim(""); setLevels(new Array(28).fill(0));
    setStep("ready");
    setStatus("Answer discarded. Press Start answer to try again.");
  }

  async function finishAnswer() {
    if (stepRef.current !== "recording") return;
    stepRef.current = "thinking";
    setStep("thinking");
    meterRef.current?.stop(); meterRef.current = null;
    let durationMs = Date.now() - t0.current;
    if (autoStopped.current) durationMs = Math.max(0, durationMs - prefs.silenceSec * 1000);
    const out = recRef.current ? await recRef.current.stop() : { transcript: "", gapsMs: [] };
    recRef.current = null;
    setLevels(new Array(28).fill(0));
    await submit(out.transcript, durationMs, out.gapsMs, false);
  }

  async function submitTyped() {
    const text = draft.trim();
    if (!text) { setError("Type your answer first (or press Skip)."); return; }
    setStep("thinking");
    await submit(text, Date.now() - t0.current, undefined, true);
  }

  async function submit(transcript: string, durationMs: number, gapsMs: number[] | undefined, wasTyped: boolean) {
    const s = S.current;
    const behavioral = prefs.type === "behavioral" || (prefs.type === "mixed" && s.mains[cur.mainIndex]?.kind === "behavioral");
    const delivery = computeDelivery({ transcript, durationMs: wasTyped ? 0 : durationMs, gapsMs: wasTyped ? undefined : gapsMs, targetSec: target, behavioral });
    if (wasTyped) {
      // Typed: no pace/pauses. Judge length by words at a typical speaking pace.
      const estSec = (delivery.words / 140) * 60;
      delivery.durationSec = Math.round(estSec);
      delivery.length = estSec < target * 0.35 ? "short" : estSec > target * 1.3 ? "long" : "good";
    }
    const answer: Answer = {
      mainIndex: cur.mainIndex, isFollowup: cur.isFollowup, question: cur.text, topic: cur.topic,
      transcript, typed: wasTyped, delivery, feedback: null, outline: cur.outline,
    };
    setStatus("The interviewer is considering your answer.");

    let resp: MockTurnResponse | null = null;
    if (s.mode === "ai") {
      const token = await auth.getAccessToken();
      if (!token) {
        goOffline("Sign in to get AI follow-ups and scoring. For now you’re practicing from the question bank.");
      } else {
        const history = s.answers.slice(-HISTORY_TURNS).map((a) => ({ question: a.question, answer: a.transcript.slice(0, 1500) }));
        const needNext = !cur.isFollowup && cur.mainIndex + 1 < total && !s.planned && s.turnIndex > 0;
        const res = await mockTurn(token, {
          session_id: s.sid, session_token: s.token || undefined, turn_index: s.turnIndex,
          type: prefs.type, style: prefs.style, length: (total === 5 ? 5 : 3),
          question: cur.text, transcript: transcript.slice(0, 6000),
          is_followup: cur.isFollowup, allow_followup: !cur.isFollowup && !s.followupUsed, need_next: needNext,
          history, job: job ? { title: job.title, company: job.company, seniority: job.seniority, skills: job.skills } : null,
        });
        if (res.status === 200 && res.body?.feedback) {
          resp = res.body;
          if (resp.session_token) s.token = resp.session_token;
          if (s.turnIndex === 0 && Array.isArray(resp.questions) && !s.planned) {
            // The interviewer's plan for the rest of the session; bank fills gaps.
            const ai: BankQ[] = resp.questions.map((q) => ({ text: q, topic: typeLabel(prefs.type), kind: prefs.type === "mixed" ? "technical" : (prefs.type as BankQ["kind"]), outline: [] }));
            s.mains = [s.mains[0], ...ai, ...s.mains.slice(1)].slice(0, total);
          }
          s.planned = true;
          s.turnIndex += 1;
          if (resp.next_question && cur.mainIndex + 1 < total && s.mains.length <= cur.mainIndex + 1) {
            s.mains.push({ text: resp.next_question, topic: typeLabel(prefs.type), kind: "technical", outline: [] });
          }
          answer.feedback = resp.feedback;
          if (resp.feedback.strong_answer_outline?.length) answer.outline = resp.feedback.strong_answer_outline;
        } else if (res.status === 403 && res.body?.upgrade) {
          s.answers.push(answer);
          setLast(answer);
          s.next = computeNext(null);
          if (s.next?.isFollowup) s.followupUsed = true;
          setStep("upgrade");
          rerender();
          return;
        } else if (res.status === 401) {
          goOffline("Your sign-in expired. You’re practicing from the question bank; sign in again for AI scoring.");
        } else if (res.status === 503) {
          goOffline("The AI interviewer isn’t enabled on this deployment, so you’re practicing from the question bank.");
        } else if (res.status === 409) {
          goOffline("This session expired on the server. Finishing from the question bank.");
        } else {
          setError(res.status === 0 ? "Couldn’t reach the interviewer. This answer is self-rated; the next one will try again." : (res.body?.error || "The interviewer had an error.") + " This answer is self-rated.");
        }
      }
    }

    s.answers.push(answer);
    setLast(answer);
    s.next = computeNext(resp);
    if (s.next?.isFollowup) s.followupUsed = true;
    // Coach mode, or no AI scores (needs a self-rating): show feedback before moving on.
    if (prefs.coach || !answer.feedback) { setStep("review"); rerender(); }
    else advance();
  }

  function goOffline(note: string) {
    S.current.mode = "offline";
    S.current.offlineNote = note;
  }

  function computeNext(resp: MockTurnResponse | null): Cur | null {
    const s = S.current;
    const canFollow = !cur.isFollowup && !s.followupUsed;
    if (canFollow && resp?.followup) return { mainIndex: cur.mainIndex, isFollowup: true, text: resp.followup, topic: cur.topic, outline: [] };
    if (canFollow && !resp && cur.bankFollowup) return { mainIndex: cur.mainIndex, isFollowup: true, text: cur.bankFollowup, topic: cur.topic, outline: [] };
    const ni = cur.mainIndex + 1;
    if (ni >= total) return null;
    let q = s.mains[ni];
    if (!q) {
      const used = new Set(s.mains.map((m) => m.text));
      q = s.bank.find((b) => !used.has(b.text)) || s.bank[ni % s.bank.length];
      s.mains[ni] = q;
    }
    return { mainIndex: ni, isFollowup: false, text: q.text, topic: q.topic, outline: q.outline, bankFollowup: q.followup };
  }

  function advance() {
    const s = S.current;
    const n = s.next;
    s.next = null;
    setTypeThis(false);
    if (!n) { finish(); return; }
    if (!n.isFollowup) s.followupUsed = false;
    setCur(n);
  }

  function finish() {
    recRef.current?.abort(); meterRef.current?.stop(); stopSpeaking();
    const s = S.current;
    const rec: SessionRec = {
      id: s.sid + (initialMains ? "_r" + Date.now().toString(36) : ""), at: s.at, jobId: job?.id || "", jobTitle: job?.title || "",
      type: prefs.type, style: prefs.style, length: total, mode: s.answers.some((a) => a.feedback) ? "ai" : "offline",
      answers: s.answers, mains: s.mains.slice(0, total).map((m) => m.text),
    };
    onFinish(rec, s.token ? { sid: s.sid, token: s.token, turnIndex: s.turnIndex } : undefined);
  }

  function rate(n: number) {
    if (!last) return;
    last.selfRating = n;
    rerender();
  }

  const s = S.current;
  const progressPct = Math.round(((cur.mainIndex + (step === "review" ? 1 : 0)) / total) * 100);
  const live = [finalText, interim].filter(Boolean).join(" ");
  const nextLabel = !s.next ? "See summary" : s.next.isFollowup ? "Continue to the follow-up" : "Next question";

  return (
    <div className="stack">
      <div className="vm-topbar">
        <div className="vm-topbar-info">
          <span className="progress-label">Question {cur.mainIndex + 1} of {total}{cur.isFollowup ? " · follow-up" : ""} · {typeLabel(prefs.type)}</span>
          <div className="bar" aria-hidden="true"><div style={{ width: progressPct + "%" }} /></div>
        </div>
        <div className="row">
          {support.synthesis && (
            <button type="button" className="btn btn-small" aria-pressed={muted} onClick={() => { setMuted(!muted); if (!muted) stopSpeaking(); }}>
              {muted ? "Unmute interviewer" : "Mute interviewer"}
            </button>
          )}
          <button type="button" className="btn btn-small btn-ghost" onClick={() => (s.answers.length ? finish() : onExit())}>End interview</button>
        </div>
      </div>

      {s.mode === "offline" && s.offlineNote && <div className="vm-notice vm-notice-warn" role="status">{s.offlineNote} Rate yourself after each answer.</div>}

      <section className="card vm-room" aria-labelledby="vm-q">
        <div className="vm-interviewer">
          <div className={"vm-avatar" + (step === "asking" && !muted ? " speaking" : "")} aria-hidden="true">{initials(persona.name)}</div>
          <div className="vm-who">
            <strong>{persona.name}</strong>
            <span className="small muted">Interviewer · {persona.label}{job?.title ? " · " + job.title : ""}</span>
          </div>
          {step === "asking" && !muted && support.synthesis && (
            <button type="button" className="btn btn-small btn-ghost vm-skip" onClick={() => { stopSpeaking(); }}>Skip</button>
          )}
        </div>
        {cur.isFollowup && <span className="vm-followup-tag">Follow-up</span>}
        <p id="vm-q" className="vm-question">{cur.text}</p>
        {(step === "ready" || step === "recording") && support.synthesis && (
          <button type="button" className="link-btn small vm-replay" onClick={() => speak(cur.text, { voiceURI: prefs.voiceURI })}>Replay question</button>
        )}
      </section>

      <section className={"card vm-answer" + (step === "recording" ? " is-recording" : "")} aria-label="Your answer">
        {(step === "asking" || step === "ready") && !typed && (
          <div className="vm-ready">
            <button ref={startBtn} type="button" className="btn btn-primary btn-lg vm-mic-btn" onClick={startAnswer}>
              <MicIcon /> Start answer
            </button>
            <p className="hint">or press <kbd>Space</kbd>. Aim for about {target === 120 ? "2 minutes" : "1 minute"}.{prefs.silenceSec ? ` Stops after ${prefs.silenceSec}s of silence.` : ""}</p>
            <button type="button" className="link-btn small" onClick={() => setTypeThis(true)}>Type this answer instead</button>
          </div>
        )}

        {(step === "asking" || step === "ready") && typed && (
          <div className="vm-typed">
            <div className="vm-rec-head">
              <span className="field-label">{typing ? "Type your answer as you’d say it" : "Type your answer"}</span>
              <Timer secs={secs} target={target} />
            </div>
            <textarea ref={draftRef} className="input textarea" aria-label="Your answer" value={draft} onChange={(e) => setDraft(e.target.value)}
              placeholder="Write it the way you'd say it out loud." rows={6}
              onKeyDown={(e) => { if (e.key === "Enter" && (e.metaKey || e.ctrlKey)) submitTyped(); }} />
            <div className="row">
              <button type="button" className="btn btn-primary" onClick={submitTyped}>Submit answer</button>
              {!typing && <button type="button" className="btn btn-ghost" onClick={() => setTypeThis(false)}>Speak instead</button>}
              <span className="hint">Ctrl/⌘ + Enter to submit</span>
            </div>
          </div>
        )}

        {step === "recording" && (
          <div className="vm-recording">
            <div className="vm-rec-head">
              <span className="vm-rec-dot" aria-hidden="true" /> <strong>Recording</strong>
              <Timer secs={secs} target={target} />
            </div>
            <Waveform levels={levels} />
            <div className="vm-transcript" aria-live="off">
              {live ? <>{finalText} <span className="vm-interim">{interim}</span></> : <span className="muted">Listening… start speaking.</span>}
            </div>
            <div className="row">
              <button ref={doneBtn} type="button" className="btn btn-primary btn-lg" onClick={finishAnswer}>Done</button>
              <button type="button" className="btn btn-ghost" onClick={cancelAnswer}>Discard and retry</button>
              <span className="hint"><kbd>Space</kbd> to finish · <kbd>Esc</kbd> to discard</span>
            </div>
          </div>
        )}

        {step === "thinking" && (
          <div className="vm-thinking" role="status">
            <span className="vm-dots" aria-hidden="true"><i /><i /><i /></span> {persona.name.split(" ")[0]} is considering your answer…
          </div>
        )}

        {step === "review" && last && (
          <div className="stack">
            <AnswerFeedback a={last} onRate={rate} />
            <div className="row">
              <button ref={contBtn} type="button" className="btn btn-primary" disabled={!last.feedback && !last.selfRating} onClick={advance}>{nextLabel} →</button>
              {!last.feedback && !last.selfRating && <span className="hint">Rate your answer to continue.</span>}
            </div>
          </div>
        )}

        {step === "upgrade" && (
          <div className="stack">
            <UpgradeCard feature="voice_mock" />
            <div className="row">
              <button type="button" className="btn" onClick={() => { goOffline("No AI sessions left this month. You’re practicing from the question bank."); setStep("review"); rerender(); }}>Continue without AI (self-rated)</button>
              <button type="button" className="btn btn-ghost" onClick={onExit}>Back to setup</button>
            </div>
          </div>
        )}

        {error && <p className="error" role="alert">{error}</p>}
      </section>
      <p className="vm-sr" aria-live="polite">{status}</p>
    </div>
  );
}

function MicIcon() {
  return (
    <svg width="18" height="18" viewBox="0 0 24 24" aria-hidden="true" focusable="false">
      <rect x="9" y="3" width="6" height="11" rx="3" fill="currentColor" />
      <path d="M5.5 11a6.5 6.5 0 0 0 13 0M12 17.5V21" fill="none" stroke="currentColor" strokeWidth="1.8" strokeLinecap="round" />
    </svg>
  );
}

function Timer({ secs, target }: { secs: number; target: number }) {
  const pct = Math.min(100, Math.round((secs / target) * 100));
  const over = secs > target;
  return (
    <span className={"vm-timer" + (over ? " over" : "")} aria-label={`Elapsed ${fmt(secs)} of a ${fmt(target)} target`}>
      <span className="vm-timer-num">{fmt(secs)}</span>
      <span className="vm-timer-track" aria-hidden="true"><span style={{ width: pct + "%" }} /></span>
      <span className="vm-timer-target">{over ? "wrap up" : "/ " + fmt(target)}</span>
    </span>
  );
}

function Waveform({ levels }: { levels: number[] }) {
  return (
    <div className="vm-wave" aria-hidden="true">
      {levels.map((l, i) => <span key={i} style={{ height: Math.max(6, Math.round(l * 100)) + "%" }} />)}
    </div>
  );
}

// ------------------------------------------------------------ answer feedback ---

function ScorePips({ label, value }: { label: string; value: number }) {
  return (
    <div className="vm-dim">
      <span className="vm-dim-label">{label}</span>
      <span className="vm-pips" aria-label={`${label}: ${value} out of 5`}>
        {[1, 2, 3, 4, 5].map((n) => <i key={n} className={n <= Math.round(value) ? "on b" + Math.round(value) : ""} />)}
      </span>
      <span className="vm-dim-num">{Number.isInteger(value) ? value : value.toFixed(1)}</span>
    </div>
  );
}

function DeliveryRow({ m }: { m: DeliveryMetrics }) {
  const items: { k: string; v: string; ok: boolean | null }[] = [];
  if (m.wpm !== null) items.push({ k: "Pace", v: m.wpm + " wpm", ok: m.wpm >= WPM_TARGET.min - 10 && m.wpm <= WPM_TARGET.max + 15 });
  items.push({ k: "Fillers", v: m.fillers.total + (m.words ? ` (${m.fillers.per100}/100)` : ""), ok: m.fillers.per100 < 4 });
  if (m.longPauses !== null) items.push({ k: "Long pauses", v: String(m.longPauses), ok: m.longPauses <= 1 });
  items.push({ k: "Length", v: (m.durationSec ? fmt(m.durationSec) : m.words + " words") + (m.length === "good" ? "" : " · " + m.length), ok: m.length === "good" });
  if (m.behavioral && m.iShare !== null) items.push({ k: "I vs we", v: Math.round(m.iShare * 100) + "% I", ok: m.iShare >= 0.4 });
  return (
    <ul className="vm-metrics">
      {items.map((it) => (
        <li key={it.k} className={it.ok === false ? "warn" : ""}><span>{it.k}</span><strong>{it.v}</strong></li>
      ))}
    </ul>
  );
}

function AnswerFeedback({ a, onRate }: { a: Answer; onRate?(n: number): void }) {
  const fb = a.feedback;
  const tips = deliveryTips(a.delivery);
  return (
    <div className="vm-fb">
      <div className="vm-fb-grid">
        <div className="vm-fb-col">
          <h3 className="vm-fb-h">Content</h3>
          {fb ? (
            <>
              <div className="vm-dims">{DIMS.map((d) => <ScorePips key={d.k} label={d.label} value={fb.scores[d.k]} />)}</div>
              {fb.strengths.length > 0 && <div><div className="field-label">What worked</div><ul className="vm-list ok">{fb.strengths.map((s, i) => <li key={i}>{s}</li>)}</ul></div>}
              {fb.improve.length > 0 && <div><div className="field-label">To improve</div><ul className="vm-list fix">{fb.improve.map((s, i) => <li key={i}>{s}</li>)}</ul></div>}
            </>
          ) : (
            <div className="stack-sm">
              <p className="hint">No AI scoring for this answer. Compare with the outline below, then rate yourself honestly.</p>
              <div className="rate" role="group" aria-label="Rate your answer">
                {[[1, "Missed it"], [2, "Shaky"], [3, "Solid"], [4, "Strong"], [5, "Nailed it"]].map(([v, l]) => (
                  <button key={v} type="button" className={"star" + (a.selfRating === v ? " vm-star-on" : "")} aria-pressed={a.selfRating === v} disabled={!onRate} onClick={() => onRate?.(v as number)}>{v} · {l}</button>
                ))}
              </div>
            </div>
          )}
        </div>
        <div className="vm-fb-col">
          <h3 className="vm-fb-h">Delivery</h3>
          {a.typed && <p className="hint">Typed answer: pace and pauses aren{"’"}t measured.</p>}
          <DeliveryRow m={a.delivery} />
          {tips.length > 0 && <ul className="vm-tips">{tips.map((t, i) => <li key={i} className={t.tone}>{t.text}</li>)}</ul>}
        </div>
      </div>
      {a.outline.length > 0 && (
        <details className="vm-outline" open={!fb}>
          <summary>What a strong answer covers</summary>
          <ul>{a.outline.map((s, i) => <li key={i}>{s}</li>)}</ul>
        </details>
      )}
    </div>
  );
}

// ------------------------------------------------------------------ summary ---

function Summary({ rec, onBack, onSaved, onPracticeAgain }: { rec: SessionRec; onBack(): void; onSaved(r: SessionRec): void; onPracticeAgain(q: BankQ): void }) {
  const auth = useAuth();
  const st = useMemo(() => sessionStats(rec), [rec]);
  const del = useMemo(() => summarizeDelivery(rec.answers.map((a) => a.delivery)), [rec]);
  const [saveMsg, setSaveMsg] = useState("");
  const [saving, setSaving] = useState(false);
  const beh = rec.answers.some((a) => a.delivery.behavioral);

  const fixes = useMemo(() => {
    const out: string[] = [];
    const sorted = rec.answers.slice().sort((a, b) => (answerScores(a) ? avg(answerScores(a) as MockScores) : 9) - (answerScores(b) ? avg(answerScores(b) as MockScores) : 9));
    for (const a of sorted) for (const s of a.feedback?.improve || []) if (out.length < 3 && !out.includes(s)) out.push(s);
    for (const a of rec.answers) for (const t of deliveryTips(a.delivery)) if (out.length < 3 && t.tone === "tip" && !out.some((x) => x.slice(0, 12) === t.text.slice(0, 12))) out.push(t.text);
    if (st.dims && out.length < 3) {
      const low = DIMS.slice().sort((x, y) => (st.dims as MockScores)[x.k] - (st.dims as MockScores)[y.k])[0];
      out.push(`Your lowest dimension was ${low.label.toLowerCase()}. Pick one answer and redo it focusing only on that.`);
    }
    return out.slice(0, 3);
  }, [rec, st]);

  const weakMain = st.weakest || st.best;
  const practiceQ = (): BankQ | null => {
    if (!weakMain) return null;
    const text = rec.mains[weakMain.mainIndex] || weakMain.question;
    const mainAns = rec.answers.find((a) => a.mainIndex === weakMain.mainIndex && !a.isFollowup);
    return { text, topic: weakMain.topic, kind: rec.type === "mixed" ? "technical" : (rec.type as BankQ["kind"]), outline: mainAns?.outline || [] };
  };

  const save = async () => {
    if (st.overall === null) return;
    setSaving(true);
    const topics: Record<string, number> = {};
    for (const a of rec.answers) {
      const sc = answerScores(a);
      if (!sc) continue;
      const k = a.topic || typeLabel(rec.type);
      topics[k] = topics[k] ? Math.round((topics[k] + (avg(sc) / 5) * 100) / 2) : Math.round((avg(sc) / 5) * 100);
    }
    record({ mode: "mock", track: "Voice mock", topic: typeLabel(rec.type), score: st.overall, n: rec.answers.length, topics });
    let msg = "Saved to your practice history.";
    const token = rec.jobId ? await auth.getAccessToken() : null;
    if (token && rec.jobId) {
      const res = await completePractice(token, rec.jobId, {
        sessionId: "voice:" + rec.id, category: "voice_mock", contentSlug: "voice-mock-" + rec.type,
        score: st.overall, completedAt: new Date(rec.at).toISOString(),
      });
      if ((res.status === 200 || res.status === 207) && res.body?.ok !== false) {
        const ov = res.body?.readiness?.overall;
        msg = `Saved. ${rec.jobTitle || "This job"}’s readiness${typeof ov === "number" ? ` is now ${ov}%` : " was updated"}.`;
      } else msg = "Saved to your practice history. Couldn’t update the job’s readiness right now.";
    } else if (!rec.jobId) msg = "Saved to your practice history. Pick a job before the session to count it toward that job’s readiness.";
    setSaving(false);
    setSaveMsg(msg);
    onSaved({ ...rec, saved: true });
  };

  return (
    <div className="stack">
      <section className="card summary vm-summary">
        <div className="vm-sum-head">
          <div className="vm-sum-score">
            <div className="big-score">{st.overall === null ? "—" : st.overall + "%"}</div>
            <div className="small muted">{rec.mode === "offline" ? "self-rated" : "content score"}</div>
          </div>
          <div className="vm-sum-title">
            <h2>{typeLabel(rec.type)} interview{rec.jobTitle ? " · " + rec.jobTitle : ""}</h2>
            <p className="muted">{new Date(rec.at).toLocaleString()} · {rec.answers.length} answer{rec.answers.length === 1 ? "" : "s"} · {styleOf(rec.style).label} interviewer</p>
          </div>
        </div>
        {st.dims && <div className="vm-dims vm-dims-wide">{DIMS.map((d) => <ScorePips key={d.k} label={d.label} value={(st.dims as MockScores)[d.k]} />)}</div>}

        <div className="vm-sum-grid">
          <div>
            <h3 className="vm-fb-h">Top 3 things to fix</h3>
            {fixes.length ? <ol className="vm-fixes">{fixes.map((f, i) => <li key={i}>{f}</li>)}</ol> : <p className="hint">Nothing stood out. Try a tougher interviewer next.</p>}
          </div>
          <div>
            <h3 className="vm-fb-h">Delivery</h3>
            <ul className="vm-metrics">
              <li className={del.avgWpm !== null && (del.avgWpm < WPM_TARGET.min - 10 || del.avgWpm > WPM_TARGET.max + 15) ? "warn" : ""}><span>Average pace</span><strong>{del.avgWpm === null ? "n/a" : del.avgWpm + " wpm"}</strong></li>
              <li className={del.fillersPer100 >= 4 ? "warn" : ""}><span>Filler words</span><strong>{del.fillerTotal} ({del.fillersPer100}/100)</strong></li>
              <li><span>Long pauses</span><strong>{del.longPauses === null ? "n/a" : del.longPauses}</strong></li>
              <li className={del.onTarget < del.answers / 2 ? "warn" : ""}><span>On-target length</span><strong>{del.onTarget} of {del.answers}</strong></li>
              {beh && del.iShare !== null && <li className={del.iShare < 0.4 ? "warn" : ""}><span>I vs we</span><strong>{Math.round(del.iShare * 100)}% I</strong></li>}
            </ul>
            <p className="hint">Target pace {WPM_TARGET.min}–{WPM_TARGET.max} wpm; fewer than 4 fillers per 100 words.</p>
          </div>
        </div>

        {(st.best || st.weakest) && (
          <div className="vm-bw">
            {st.best && <div className="vm-bw-card"><span className="vm-bw-label">Best answer</span><p>{st.best.question}</p></div>}
            {st.weakest && <div className="vm-bw-card vm-bw-weak"><span className="vm-bw-label">Weakest answer</span><p>{st.weakest.question}</p></div>}
          </div>
        )}

        <div className="row wrap">
          <button type="button" className="btn btn-primary" onClick={save} disabled={saving || !!rec.saved || st.overall === null}>
            {rec.saved ? "Saved to readiness ✓" : saving ? "Saving…" : "Save to readiness"}
          </button>
          {weakMain && <button type="button" className="btn" onClick={() => { const q = practiceQ(); if (q) onPracticeAgain(q); }}>Practice weakest again</button>}
          <button type="button" className="btn btn-ghost" onClick={onBack}>New session</button>
          {rec.saved && <Link className="btn btn-ghost" to="/dashboard">Readiness →</Link>}
        </div>
        {saveMsg && <p className="hint" role="status">{saveMsg}</p>}
      </section>

      <section className="card">
        <h2 className="section-title">Transcript and feedback</h2>
        <div className="vm-transcripts">
          {rec.answers.map((a, i) => {
            const sc = answerScores(a);
            return (
              <details key={i} className="vm-turn" open={i === 0}>
                <summary>
                  <span className="vm-turn-q"><span className="vm-turn-tag">{a.isFollowup ? "Follow-up" : "Q" + (a.mainIndex + 1)}</span>{a.question}</span>
                  {sc && <span className="vm-turn-score">{avg(sc).toFixed(1)}/5</span>}
                </summary>
                <blockquote className="vm-said">{a.transcript || <em>No answer recorded.</em>}</blockquote>
                <AnswerFeedback a={a} />
              </details>
            );
          })}
        </div>
      </section>
    </div>
  );
}
