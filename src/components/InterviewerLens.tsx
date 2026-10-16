/* "Who's interviewing you?" on Questions for this job: pick the kind of
 * interviewer (recruiter, hiring manager, technical peer, senior leader,
 * business partner) to see what they care about, and get the questions
 * they're likely to ask for this job. Works from the interviewer's KIND only;
 * it never looks anyone up. Results are kept on this device per job. */

import { useState } from "react";
import * as api from "../lib/api";
import { useAuth } from "../lib/auth";
import { Link } from "../lib/router";
import { KEYS, readJSON, writeJSON } from "../lib/storage";

type Kind = api.InterviewerKind;

export const KINDS: { key: Kind; label: string; example: string; cares: string[]; how: string }[] = [
  { key: "recruiter", label: "Recruiter / HR", example: "Recruiter, talent partner, HR",
    cares: ["Why this role and company", "Your career story and why you're moving", "Salary, notice period, location"],
    how: "Keep it short and positive. Have a 60-second story of your career and a salary range ready." },
  { key: "hiring_manager", label: "Hiring manager", example: "Your future boss",
    cares: ["Can you do this exact job from day one", "Ownership and how you prioritise", "Your first 90 days"],
    how: "Use real examples from your last roles that match the job's main duties. Show you own outcomes." },
  { key: "peer", label: "Technical peer", example: "An engineer or specialist on the team",
    cares: ["Hands-on depth in the core skills", "Design choices and trade-offs", "How you debug and test"],
    how: "Go deep: name the tools, the numbers and what you'd do differently. Say \"I\", not \"we\"." },
  { key: "leader", label: "Director / VP", example: "Director, head of, VP, executive",
    cares: ["Business impact you delivered", "Judgement, strategy and scale", "Influencing people you don't manage"],
    how: "Lead with the result and the business number, then how you got there. Little implementation detail." },
  { key: "business", label: "Business partner", example: "Product, analytics, operations, a stakeholder",
    cares: ["Turning business needs into solutions", "Explaining technical things simply", "Handling conflicting requests"],
    how: "Talk in their terms: the problem, the decision it helped, the outcome. Avoid jargon." },
];

interface Saved { at: string; role: string; result: api.InterviewerResult }
type Store = Record<string, Partial<Record<Kind, Saved>>>;

export function InterviewerLens({ jobId, job }: { jobId: string; job: { title?: string; company?: string; skills?: string[] } }) {
  const auth = useAuth();
  const [kind, setKind] = useState<Kind | null>(null);
  const [store, setStore] = useState<Store>(() => readJSON<Store>(KEYS.interviewerQs, {}));
  const [role, setRole] = useState("");
  const [busy, setBusy] = useState(false);
  const [err, setErr] = useState("");
  const [open, setOpen] = useState<number | null>(null);

  const meta = KINDS.find((k) => k.key === kind) || null;
  const saved = kind ? store[jobId]?.[kind] : undefined;

  const pick = (k: Kind) => {
    setKind(k === kind ? null : k);
    setErr(""); setOpen(null);
    setRole(store[jobId]?.[k]?.role || "");
  };

  const generate = async () => {
    if (!kind) return;
    const tok = auth.session ? await auth.getAccessToken() : null;
    if (!tok) { setErr("signin"); return; }
    setBusy(true); setErr("");
    const res = await api.interviewerQuestions(tok, kind, role.trim(), job);
    setBusy(false);
    if (res.status === 200 && res.body?.result) {
      const next: Store = { ...store, [jobId]: { ...(store[jobId] || {}), [kind]: { at: new Date().toISOString(), role: role.trim(), result: res.body.result } } };
      setStore(next); writeJSON(KEYS.interviewerQs, next); setOpen(null);
      return;
    }
    setErr(res.status === 0 ? "Couldn’t reach the server. Check your connection and try again." : res.body?.error || "Couldn’t write the questions. Please try again.");
  };

  const coachTo = (q: string) => "/coach?job=" + encodeURIComponent(jobId) + "&q=" + encodeURIComponent(q);

  return (
    <section className="card il" aria-labelledby="il-h">
      <div>
        <h2 id="il-h">Who{"’"}s interviewing you?</h2>
        <p className="muted small">Each kind of interviewer asks different things. Pick one to see what they care about and the questions they{"’"}re likely to ask for this job.</p>
      </div>
      <div className="il-kinds" role="group" aria-label="Kind of interviewer">
        {KINDS.map((k) => (
          <button key={k.key} type="button" className={"il-kind" + (kind === k.key ? " on" : "")} aria-pressed={kind === k.key} onClick={() => pick(k.key)}>
            <strong>{k.label}</strong>
            <span>{k.example}</span>
            {store[jobId]?.[k.key] ? <em className="il-has">{store[jobId]![k.key]!.result.questions.length} questions</em> : null}
          </button>
        ))}
      </div>

      {meta ? (
        <div className="il-body">
          <div className="il-guide">
            <div>
              <span className="td-eyebrow">What they care about</span>
              <ul>{meta.cares.map((c) => <li key={c}>{c}</li>)}</ul>
            </div>
            <div>
              <span className="td-eyebrow">How to answer</span>
              <p>{meta.how}</p>
            </div>
          </div>

          <div className="il-gen">
            <label className="il-role">
              <span className="field-label">Their title <span className="muted">(optional)</span></span>
              <input className="input" value={role} maxLength={80} placeholder={kind === "leader" ? "e.g. Director of Data Platform" : kind === "peer" ? "e.g. Senior Data Engineer" : "e.g. as shown in the invite"}
                onChange={(e) => setRole(e.target.value)} />
            </label>
            <button type="button" className="btn btn-primary" disabled={busy} onClick={generate}>
              {busy ? "Writing… (about 10 seconds)" : saved ? "Write new questions" : "Get their likely questions"}
            </button>
          </div>
          <p className="small muted">Uses only the interviewer{"’"}s role and this job. We don{"’"}t look anyone up.</p>
          {err === "signin" ? <p className="small" role="alert">Please <Link to="/account">sign in</Link> to get questions for your interviewer.</p>
            : err ? <p className="error small" role="alert">{err}</p> : null}

          {saved ? (
            <div className="il-result">
              {saved.result.focus ? <p className="il-focus"><strong>{meta.label}{saved.role ? " (" + saved.role + ")" : ""}:</strong> {saved.result.focus}</p> : null}
              <ol className="il-list">
                {saved.result.questions.map((q, i) => (
                  <li key={i} className={"il-q" + (open === i ? " open" : "")}>
                    <button type="button" className="il-q-btn" aria-expanded={open === i} onClick={() => setOpen(open === i ? null : i)}>
                      <span className="il-n">{i + 1}</span><span>{q.text}</span>
                    </button>
                    {open === i ? (
                      <div className="il-q-body">
                        {q.why ? <p className="small"><strong>Why they ask:</strong> {q.why}</p> : null}
                        {q.tip ? <p className="small"><strong>How to answer:</strong> {q.tip}</p> : null}
                        <Link className="btn btn-small" to={coachTo(q.text)}>Practise with AI Coach {"→"}</Link>
                      </div>
                    ) : null}
                  </li>
                ))}
              </ol>
            </div>
          ) : null}
        </div>
      ) : null}
    </section>
  );
}
