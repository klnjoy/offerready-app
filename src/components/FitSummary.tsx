/* Resume-vs-job fit display (was the Check fit result screen), shared by the
 * Add a job result and the job page's Resume tab. */

import { Card, Chips, Muted, ScoreBar, ScoreHead } from "./ui";
import type { GapResult, GapRow } from "../types";

/** A stored gap row (snake_case scores + result) as one GapResult. */
export function gapRowToResult(g: GapRow | null | undefined): GapResult | null {
  if (!g) return null;
  const r = g.result || {};
  return {
    ...r,
    matchScore: g.match_score ?? r.matchScore ?? 0,
    technicalScore: g.technical_score ?? r.technicalScore,
    behavioralScore: g.behavioral_score ?? r.behavioralScore,
    architectureScore: g.architecture_score ?? r.architectureScore,
    domainScore: g.domain_score ?? r.domainScore,
  };
}

/** A fresh gap result as the row shape the job page keeps. */
export function resultToGapRow(r: GapResult): GapRow {
  return {
    match_score: r.matchScore || 0, technical_score: r.technicalScore, behavioral_score: r.behavioralScore,
    architecture_score: r.architectureScore, domain_score: r.domainScore, result: r, created_at: new Date().toISOString(),
  };
}

/** Top gaps, most important first (skills, then keywords, then experience). */
export function topGaps(r: GapResult | null, extra: string[] = [], n = 3): string[] {
  const seen = new Set<string>();
  const out: string[] = [];
  for (const g of [...(r?.missingSkills || []), ...extra, ...(r?.missingKeywords || []), ...(r?.missingExperience || [])]) {
    const t = String(g || "").trim();
    if (t && !seen.has(t.toLowerCase())) { seen.add(t.toLowerCase()); out.push(t); }
    if (out.length >= n) break;
  }
  return out;
}

export function FitDetails({ result: r }: { result: GapResult }) {
  const score = r.matchScore || 0;
  const missing = [
    { label: "Skills not found in your resume", items: r.missingSkills || [] },
    { label: "Keywords not found in your resume", items: r.missingKeywords || [] },
    { label: "Experience not shown in your resume", items: r.missingExperience || [] },
  ].filter((m) => m.items.length);
  const areas = [
    ["Technical", r.technicalScore], ["Behavioral", r.behavioralScore], ["Architecture", r.architectureScore], ["Domain", r.domainScore],
  ].filter(([, v]) => typeof v === "number") as [string, number][];

  return (
    <div className="stack">
      <Card><ScoreHead pct={score} title="Resume match" sub={r.summary} /></Card>
      {areas.length > 0 && (
        <Card>
          <h3>Match by area</h3>
          {areas.map(([l, v]) => <ScoreBar key={l} label={l} pct={v} />)}
        </Card>
      )}
      {(r.strengths || []).length > 0 && (
        <Card tone="ok"><Chips label="Found in your resume" items={r.strengths || []} tone="ok" /></Card>
      )}
      {missing.length > 0 && (
        <Card tone="warn">
          {missing.map((m) => <Chips key={m.label} label={m.label} items={m.items} tone="warn" />)}
          <Muted small>{"“"}Not found{"”"} means your resume doesn{"’"}t show it yet. It isn{"’"}t a judgment of your ability. Treat these as the areas to prepare first.</Muted>
        </Card>
      )}
    </div>
  );
}
