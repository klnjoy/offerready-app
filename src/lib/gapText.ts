/* Short, plain labels for resume-match chips. Older analyses (and some model
 * replies) say "Proven track record of…", "Experience with…", "Ability to…";
 * we show just the thing. Mirrors tidy() in the API (api/_lib/readinessAi.js). */

const FILLER = /^(?:(?:proven|demonstrated|strong|solid|deep|extensive|excellent|hands-on|specific|prior|relevant|direct|good|working|practical)\s+)*(?:track record (?:of|in)\s+|ability to\s+|experience (?:with|in|of|on)\s+|experience\s+(?=[a-z]+ing\b)|familiarity with\s+|knowledge of\s+|understanding of\s+|expertise in\s+|proficiency (?:in|with)\s+)?/i;

export function tidyGap(s: string): string {
  let t = String(s || "").trim().replace(/\s+/g, " ").replace(/[.;]+$/, "");
  const cut = t.replace(FILLER, "");
  if (cut.length >= 3) t = cut;
  return t.charAt(0).toUpperCase() + t.slice(1);
}

/** Tidy and drop repeats (case-insensitive), keeping the first. */
export function tidyList(items: string[] | undefined, seen = new Set<string>()): string[] {
  return (items || []).map(tidyGap).filter((x) => { const k = x.toLowerCase(); if (!x || seen.has(k)) return false; seen.add(k); return true; });
}
