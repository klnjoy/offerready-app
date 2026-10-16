/* Admin: what the AI costs, per feature. Reads GET /api/me/plan?op=costs,
 * which only answers for emails in ADMIN_EMAILS (server). Numbers only: the
 * log never stores prompts, answers or resumes. */

import { useEffect, useState } from "react";
import { useAuth } from "../lib/auth";
import * as api from "../lib/api";
import type { AiCostSummary } from "../lib/api";
import { Link } from "../lib/router";

const LABEL: Record<string, string> = {
  coach: "AI Coach", analyze_job: "Analyze a job", resume_match: "Resume match", job_questions: "Questions for a job",
  grade_answer: "Answer feedback", mock_turn: "Mock interview turns", drill_generate: "Trade-off drills",
  tailor: "Tailor resume", story_coach: "Story coaching", story_draft: "Story drafts", story_batch: "Stories from resume",
  interviewer_qs: "Interviewer questions", debrief_fill: "Debrief fill", help_chat: "Help assistant", other: "Other",
};
const num = (v: number | string) => Number(v) || 0;
const usd = (v: number) => (v >= 1 ? "$" + v.toFixed(2) : v >= 0.01 ? "$" + v.toFixed(3) : "$" + v.toFixed(4));
const k = (n: number) => (n >= 1e6 ? (n / 1e6).toFixed(1) + "M" : n >= 1e3 ? (n / 1e3).toFixed(1) + "k" : String(n));

export default function AdminCostsPage() {
  const auth = useAuth();
  const [days, setDays] = useState(30);
  const [state, setState] = useState<{ kind: "loading" } | { kind: "error"; msg: string } | { kind: "ok"; data: AiCostSummary }>({ kind: "loading" });

  useEffect(() => {
    let alive = true;
    setState({ kind: "loading" });
    void (async () => {
      const tok = await auth.getAccessToken();
      if (!tok) { if (alive) setState({ kind: "error", msg: "Sign in first." }); return; }
      const res = await api.getAiCosts(tok, days);
      if (!alive) return;
      if (res.status === 200 && res.body) setState({ kind: "ok", data: res.body });
      else if (res.status === 403) setState({ kind: "error", msg: "This page is for admins. Add your email to ADMIN_EMAILS in Vercel." });
      else if (res.status === 503) setState({ kind: "error", msg: "The cost log isn’t set up yet. Run migration 0017_ai_costs.sql in the Supabase SQL editor." });
      else setState({ kind: "error", msg: "Couldn’t load costs. Please try again." });
    })();
    return () => { alive = false; };
  }, [days, auth.session]); // eslint-disable-line react-hooks/exhaustive-deps

  const rows = state.kind === "ok" ? state.data.rows : [];
  const total = rows.reduce((s, r) => s + num(r.cost_usd), 0);
  const calls = rows.reduce((s, r) => s + num(r.calls), 0);
  const input = rows.reduce((s, r) => s + num(r.input_tokens), 0);
  const cached = rows.reduce((s, r) => s + num(r.cached_tokens), 0);
  const output = rows.reduce((s, r) => s + num(r.output_tokens), 0);
  const cacheRate = input ? Math.round((cached / input) * 100) : 0;

  return (
    <div className="page adc">
      <div className="adc-days" role="radiogroup" aria-label="Period">
        {[7, 30, 90].map((d) => (
          <button key={d} type="button" role="radio" aria-checked={days === d} className={"cp-chip" + (days === d ? " on" : "")} onClick={() => setDays(d)}>Last {d} days</button>
        ))}
      </div>

      {state.kind === "loading" && <p className="muted">Loading{"…"}</p>}
      {state.kind === "error" && <div className="card"><p>{state.msg}</p><Link to="/more">Back to More</Link></div>}

      {state.kind === "ok" && (
        <>
          <div className="tdy-stats adc-stats">
            <div className="tdy-stat"><span>AI spend</span><strong>{usd(total)}</strong><em>≈ {usd((total / state.data.days) * 30)}/mo</em></div>
            <div className="tdy-stat"><span>Calls</span><strong>{k(calls)}</strong><em>{calls ? usd(total / calls) + " each" : "none yet"}</em></div>
            <div className="tdy-stat"><span>Cached input</span><strong>{cacheRate}%</strong><em>{k(input)} in · {k(output)} out</em></div>
          </div>

          {rows.length === 0 ? (
            <p className="muted">No AI calls logged in this period yet. Costs appear here after the next AI request.</p>
          ) : (
            <section className="tdy" aria-labelledby="adc-h">
              <div className="tdy-head"><h2 id="adc-h">By feature</h2><span className="small muted">Most expensive first</span></div>
              <ul className="tdy-group adc-list">
                {rows.map((r) => {
                  const c = num(r.cost_usd);
                  const share = total ? Math.round((c / total) * 100) : 0;
                  const cr = num(r.input_tokens) ? Math.round((num(r.cached_tokens) / num(r.input_tokens)) * 100) : 0;
                  return (
                    <li key={r.feature} className="adc-row">
                      <div className="adc-top">
                        <strong>{LABEL[r.feature] || r.feature}</strong>
                        <span className="adc-cost">{usd(c)} <em>{share}%</em></span>
                      </div>
                      <div className="adc-bar" aria-hidden="true"><span style={{ width: share + "%" }} /></div>
                      <div className="small muted adc-meta">
                        {num(r.calls)} calls · {usd(num(r.avg_cost_usd))} each · {num(r.users)} users · {k(num(r.input_tokens))} in ({cr}% cached) · {k(num(r.output_tokens))} out · {(num(r.avg_ms) / 1000).toFixed(1)}s avg{num(r.failed) ? " · " + num(r.failed) + " failed" : ""}
                      </div>
                    </li>
                  );
                })}
              </ul>
            </section>
          )}

          <section className="card adc-tips" aria-labelledby="adc-tips-h">
            <h2 id="adc-tips-h">How to read this</h2>
            <ul>
              <li><strong>Start with the top row.</strong> It’s where savings matter most.</li>
              <li><strong>Low cached %</strong> on a big feature: put the fixed instructions first in the prompt and the resume, job or answer last, so OpenAI can reuse the start of the prompt at half price.</li>
              <li><strong>High output tokens</strong>: lower the answer length cap, or ask for a shorter format.</li>
              <li><strong>Many calls per user</strong>: save results and reuse them instead of asking again.</li>
            </ul>
            <p className="small muted">Estimates from token counts and OpenAI’s list prices. Your OpenAI bill is the final word.</p>
          </section>
        </>
      )}
    </div>
  );
}
