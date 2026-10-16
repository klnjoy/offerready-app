// Fetch open forward deployed engineer roles from the PUBLIC job-board APIs
// that companies publish for exactly this purpose (Greenhouse, Ashby, Lever),
// and write public/roles.json for the app's "Open roles" page.
//
// Runs in the deploy workflow (daily schedule + every deploy). No API keys,
// no AI calls, no scraping of job sites. A board that fails or returns
// nothing is skipped; if every board fails, the last published file is kept
// (see FALLBACK_URL) so the page never goes empty because of a network blip.
//
// Usage: node scripts/fetch-roles.mjs [outFile]

import { writeFile, mkdir } from "node:fs/promises";
import { dirname } from "node:path";

const OUT = process.argv[2] || "public/roles.json";
const FALLBACK_URL = "https://klnjoy.github.io/offerready-app/roles.json";
const TITLE = /forward[\s-]*deploy|deployed engineer|deployment engineer|deployment strategist/i;
const MAX_DESC = 8000;
const TIMEOUT_MS = 15000;

// [company name, board type, board slug]. A wrong or retired slug just logs
// and is skipped, so this list is safe to edit.
const BOARDS = [
  ["Anthropic", "greenhouse", "anthropic"],
  ["Databricks", "greenhouse", "databricks"],
  ["Scale AI", "greenhouse", "scaleai"],
  ["Glean", "greenhouse", "gleanwork"],
  ["Anyscale", "greenhouse", "anyscale"],
  ["Snorkel AI", "greenhouse", "snorkelai"],
  ["MongoDB", "greenhouse", "mongodb"],
  ["OpenAI", "ashby", "openai"],
  ["Cohere", "ashby", "cohere"],
  ["Sierra", "ashby", "sierra"],
  ["Decagon", "ashby", "decagon"],
  ["Harvey", "ashby", "harvey"],
  ["ElevenLabs", "ashby", "elevenlabs"],
  ["Perplexity", "ashby", "perplexity"],
  ["Baseten", "ashby", "baseten"],
  ["LangChain", "ashby", "langchain"],
  ["Writer", "ashby", "writer"],
  ["Hebbia", "ashby", "hebbia"],
  ["Ramp", "ashby", "ramp"],
  ["Palantir", "lever", "palantir"],
  ["Mistral AI", "lever", "mistral"],
];

const ENT = { amp: "&", lt: "<", gt: ">", quot: '"', apos: "'", nbsp: " ", "#39": "'" };
const decode = (s) => String(s || "").replace(/&(#\d+|#x[0-9a-f]+|[a-z]+);/gi, (m, e) => {
  if (e[0] === "#") { const n = e[1] === "x" || e[1] === "X" ? parseInt(e.slice(2), 16) : parseInt(e.slice(1), 10); return Number.isFinite(n) ? String.fromCodePoint(n) : m; }
  return ENT[e.toLowerCase()] ?? m;
});
const plain = (html) => decode(decode(String(html || "")) // Greenhouse escapes its HTML once
  .replace(/<(br|\/p|\/li|\/h\d|\/div)[^>]*>/gi, "\n")
  .replace(/<li[^>]*>/gi, "• ")
  .replace(/<[^>]+>/g, ""))
  .replace(/[ \t]+/g, " ").replace(/\n\s*\n\s*\n+/g, "\n\n").trim();
const clip = (s) => (s.length > MAX_DESC ? s.slice(0, MAX_DESC).replace(/\s+\S*$/, "") + " …" : s);
// Where a role is: "us" (a US city or state, or remote in the US), "remote"
// (remote with no country) or "intl". The app shows US roles first.
const US_STATES = "AL|AK|AZ|AR|CA|CO|CT|DE|FL|GA|HI|ID|IL|IN|IA|KS|KY|LA|ME|MD|MA|MI|MN|MS|MO|MT|NE|NV|NH|NJ|NM|NY|NC|ND|OH|OK|OR|PA|RI|SC|SD|TN|TX|UT|VT|VA|WA|WV|WI|WY|DC";
const US_RE = new RegExp(`\\b(United States|USA|U\\.S\\.|US|(${US_STATES}))\\b|San Francisco|New York|NYC|Seattle|Bellevue|Austin|Boston|Chicago|Denver|Los Angeles|Palo Alto|Mountain View|Sunnyvale|San Jose|Menlo Park|Washington|Atlanta|Dallas|Houston|Miami|Pittsburgh|Philadelphia|San Diego|Portland|Salt Lake|Raleigh|Arlington|McLean|Reston|Tysons`);
const INTL_RE = /\b(London|UK|United Kingdom|Canada|Toronto|Vancouver|Montreal|India|Bengaluru|Bangalore|Hyderabad|Pune|Paris|France|Berlin|Munich|Germany|Amsterdam|Netherlands|Dublin|Ireland|Zurich|Switzerland|Madrid|Spain|Stockholm|Copenhagen|Tokyo|Japan|Seoul|Korea|Singapore|Sydney|Melbourne|Australia|Tel Aviv|Israel|Sao Paulo|Brazil|Mexico|Warsaw|Poland|Milan|Italy|Lisbon|Dubai|EMEA|APAC|Europe)\b/i;
const region = (loc) => (US_RE.test(loc) ? "us" : INTL_RE.test(loc) ? "intl" : /remote|anywhere/i.test(loc) ? "remote" : loc ? "intl" : "remote");

const day = (v) => { const t = typeof v === "number" ? v : Date.parse(v || ""); return Number.isFinite(t) ? new Date(t).toISOString().slice(0, 10) : null; };

async function getJSON(url) {
  const c = new AbortController(); const t = setTimeout(() => c.abort(), TIMEOUT_MS);
  try {
    const r = await fetch(url, { signal: c.signal, headers: { Accept: "application/json", "User-Agent": "OfferReady roles (github.com/klnjoy/offerready-app)" } });
    if (!r.ok) throw new Error("HTTP " + r.status);
    return await r.json();
  } finally { clearTimeout(t); }
}

const FETCH = {
  async greenhouse(slug) {
    const d = await getJSON(`https://boards-api.greenhouse.io/v1/boards/${slug}/jobs?content=true`);
    return (d.jobs || []).map((j) => ({ title: j.title, location: j.location?.name || "", url: j.absolute_url, posted: day(j.first_published || j.updated_at), desc: plain(j.content) }));
  },
  async ashby(slug) {
    const d = await getJSON(`https://api.ashbyhq.com/posting-api/job-board/${slug}`);
    return (d.jobs || []).filter((j) => j.isListed !== false).map((j) => ({
      title: j.title,
      location: [j.location, j.isRemote ? "Remote" : ""].filter(Boolean).join(" · "),
      url: j.jobUrl || j.applyUrl, posted: day(j.publishedAt), desc: (j.descriptionPlain || plain(j.descriptionHtml)).trim(),
    }));
  },
  async lever(slug) {
    const d = await getJSON(`https://api.lever.co/v0/postings/${slug}?mode=json`);
    return (Array.isArray(d) ? d : []).map((j) => ({
      title: j.text, location: j.categories?.location || (j.categories?.allLocations || []).join(", ") || "", url: j.hostedUrl, posted: day(j.createdAt),
      desc: [j.descriptionPlain, ...(j.lists || []).map((l) => l.text + "\n" + plain(l.content)), j.additionalPlain].filter(Boolean).join("\n\n").trim(),
    }));
  },
};

const roles = []; const sources = []; let ok = 0;
for (const [company, type, slug] of BOARDS) {
  try {
    const all = await FETCH[type](slug);
    ok++;
    const hits = all.filter((j) => j.title && j.url && TITLE.test(j.title));
    for (const j of hits) roles.push({ company, title: j.title.trim(), location: j.location.trim(), url: j.url, posted: j.posted, desc: clip(j.desc || ""), source: type, region: region(j.location || "") });
    sources.push({ company, type, total: all.length, matched: hits.length });
    console.log(`${company} (${type}/${slug}): ${hits.length} of ${all.length}`);
  } catch (e) {
    sources.push({ company, type, error: String(e.message || e).slice(0, 80) });
    console.log(`${company} (${type}/${slug}): skipped, ${e.message || e}`);
  }
}

let out = { updated: new Date().toISOString(), count: roles.length, roles: roles.sort((a, b) => (b.posted || "").localeCompare(a.posted || "") || a.company.localeCompare(b.company)), sources };
if (ok === 0) {
  try { const prev = await getJSON(FALLBACK_URL); if (prev && Array.isArray(prev.roles)) { out = prev; console.log("Every board failed; keeping the last published file."); } }
  catch { console.log("Every board failed and there is no published file yet."); }
}
await mkdir(dirname(OUT), { recursive: true });
await writeFile(OUT, JSON.stringify(out));
console.log(`Wrote ${out.roles.length} roles to ${OUT}`);
// A one-line summary as a GitHub Actions notice, so each run shows which
// boards worked without opening the full log.
if (process.env.GITHUB_ACTIONS) {
  const us = out.roles.filter((r) => r.region === "us").length;
  const line = "US " + us + ", remote " + out.roles.filter((r) => r.region === "remote").length + " · " + sources.map((x) => x.company + ":" + (x.error ? "ERR " + x.error : x.matched + "/" + x.total)).join(", ");
  console.log(`::notice title=Open roles (${out.roles.length})::${line.replace(/[\r\n%]/g, " ")}`);
}
