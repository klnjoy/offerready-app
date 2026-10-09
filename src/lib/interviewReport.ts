/* Interview report + whiteboard diagram helpers for the voice mock interview.
 *
 * Pure string builders: no DOM, no storage, no React, so they're unit-testable
 * and the same code renders the in-app snapshot, the printable HTML report,
 * the Markdown download and the plain-text share summary.
 *
 * Everything user- or model-supplied goes through esc() before it lands in
 * HTML or SVG. Nothing here talks to the server; reports are built locally. */

import { WPM_TARGET, type DeliveryMetrics, type DeliverySummary } from "./delivery";

// ------------------------------------------------------------ diagram model ---

export type WbKind = "box" | "store" | "note";

export interface WbNode {
  id: string;
  kind: WbKind;
  label: string;
  /** Top-left corner, in board units (the board is WB_VIEW wide). */
  x: number;
  y: number;
}

export interface WbEdge {
  id: string;
  from: string;
  to: string;
  label: string;
}

export interface Diagram {
  nodes: WbNode[];
  edges: WbEdge[];
}

export const WB_VIEW = { w: 760, h: 500 } as const;
export const WB_SIZE: Record<WbKind, { w: number; h: number }> = {
  box: { w: 150, h: 54 },
  store: { w: 136, h: 76 },
  note: { w: 176, h: 76 },
};
export const WB_LABEL_MAX: Record<WbKind, number> = { box: 32, store: 32, note: 90 };
export const DIAGRAM_TEXT_MAX = 2000;

export const emptyDiagram = (): Diagram => ({ nodes: [], edges: [] });
export const isEmptyDiagram = (d: Diagram | null | undefined) => !d || (!d.nodes.length && !d.edges.length);

/** Defensive copy that drops malformed entries (sessions come back from localStorage). */
export function cleanDiagram(d: unknown): Diagram {
  const src = d && typeof d === "object" ? (d as Partial<Diagram>) : {};
  const nodes = (Array.isArray(src.nodes) ? src.nodes : [])
    .filter((n): n is WbNode => !!n && typeof n.id === "string" && (n.kind === "box" || n.kind === "store" || n.kind === "note"))
    .map((n) => ({ id: n.id, kind: n.kind, label: String(n.label || "").slice(0, WB_LABEL_MAX[n.kind]), x: Number(n.x) || 0, y: Number(n.y) || 0 }));
  const ids = new Set(nodes.map((n) => n.id));
  const edges = (Array.isArray(src.edges) ? src.edges : [])
    .filter((e): e is WbEdge => !!e && typeof e.id === "string" && ids.has(e.from) && ids.has(e.to) && e.from !== e.to)
    .map((e) => ({ id: e.id, from: e.from, to: e.to, label: String(e.label || "").slice(0, 40) }));
  return { nodes, edges };
}

// ---------------------------------------------------------------- geometry ---

export const nodeSize = (n: WbNode) => WB_SIZE[n.kind];
export function nodeCenter(n: WbNode) {
  const s = nodeSize(n);
  return { x: n.x + s.w / 2, y: n.y + s.h / 2 };
}

/** Where the line from a's centre toward b's centre leaves a's bounding box. */
function exitPoint(a: WbNode, toward: { x: number; y: number }, gap: number) {
  const c = nodeCenter(a);
  const s = nodeSize(a);
  const dx = toward.x - c.x;
  const dy = toward.y - c.y;
  if (!dx && !dy) return c;
  const hw = s.w / 2 + gap;
  const hh = s.h / 2 + gap;
  const t = Math.min(dx ? hw / Math.abs(dx) : Infinity, dy ? hh / Math.abs(dy) : Infinity);
  return { x: c.x + dx * t, y: c.y + dy * t };
}

/** Arrow endpoints between two shapes, clipped to their outlines. */
export function edgePoints(a: WbNode, b: WbNode) {
  const p1 = exitPoint(a, nodeCenter(b), 2);
  const p2 = exitPoint(b, nodeCenter(a), 6);
  return { x1: p1.x, y1: p1.y, x2: p2.x, y2: p2.y, mx: (p1.x + p2.x) / 2, my: (p1.y + p2.y) / 2 };
}

/** Greedy word wrap by character count (SVG text has no wrapping). */
export function wrapLabel(text: string, perLine: number, maxLines: number): string[] {
  const words = String(text || "").trim().split(/\s+/).filter(Boolean);
  const lines: string[] = [];
  let cur = "";
  for (const w0 of words) {
    let w = w0;
    while (w.length > perLine) { // very long word: hard-split
      if (cur) { lines.push(cur); cur = ""; }
      lines.push(w.slice(0, perLine));
      w = w.slice(perLine);
    }
    if (!cur) cur = w;
    else if ((cur + " " + w).length <= perLine) cur += " " + w;
    else { lines.push(cur); cur = w; }
  }
  if (cur) lines.push(cur);
  if (lines.length > maxLines) {
    const kept = lines.slice(0, maxLines);
    kept[maxLines - 1] = kept[maxLines - 1].slice(0, Math.max(1, perLine - 1)).replace(/\s+\S*$/, "") + "…";
    return kept;
  }
  return lines;
}

export const labelLines = (n: WbNode) => n.kind === "note" ? wrapLabel(n.label, 22, 3) : wrapLabel(n.label, n.kind === "store" ? 14 : 16, 2);

/** Cylinder outline for a data store at (x, y, w, h): body + the top ellipse. */
export function cylinderPaths(x: number, y: number, w: number, h: number) {
  const ry = Math.min(10, h / 6);
  const rx = w / 2;
  const body = `M${x},${y + ry} L${x},${y + h - ry} A${rx},${ry} 0 0 0 ${x + w},${y + h - ry} L${x + w},${y + ry} A${rx},${ry} 0 0 0 ${x},${y + ry} Z`;
  const top = `M${x},${y + ry} A${rx},${ry} 0 0 0 ${x + w},${y + ry} A${rx},${ry} 0 0 0 ${x},${y + ry} Z`;
  return { body, top, ry };
}

// ------------------------------------------------------------- description ---

/** Display names, disambiguating duplicates ("API", "API (2)"). */
function names(d: Diagram): Map<string, string> {
  const out = new Map<string, string>();
  const seen: Record<string, number> = {};
  for (const n of d.nodes) {
    const base = n.label.trim() || (n.kind === "store" ? "Data store" : n.kind === "note" ? "Note" : "Component");
    const k = base.toLowerCase();
    seen[k] = (seen[k] || 0) + 1;
    out.set(n.id, seen[k] > 1 ? `${base} (${seen[k]})` : base);
  }
  return out;
}

/**
 * Compact text the interviewer model reads, e.g.
 *   Components: Client; API gateway; Postgres (data store)
 *   Flows: Client → API gateway (HTTPS); API gateway → Postgres
 * Capped at DIAGRAM_TEXT_MAX. '' for an empty board.
 */
export function describeDiagram(d: Diagram | null | undefined): string {
  if (!d || isEmptyDiagram(d)) return "";
  const nm = names(d);
  const comps = d.nodes.filter((n) => n.kind !== "note").map((n) => nm.get(n.id) + (n.kind === "store" ? " (data store)" : ""));
  const notes = d.nodes.filter((n) => n.kind === "note" && n.label.trim()).map((n) => `"${n.label.trim()}"`);
  const flows = d.edges.map((e) => `${nm.get(e.from)} → ${nm.get(e.to)}${e.label.trim() ? ` (${e.label.trim()})` : ""}`);
  const linked = new Set(d.edges.flatMap((e) => [e.from, e.to]));
  const loose = d.nodes.filter((n) => n.kind !== "note" && !linked.has(n.id)).map((n) => nm.get(n.id) as string);
  const parts: string[] = [];
  parts.push("Components: " + (comps.length ? comps.join("; ") : "none"));
  parts.push("Flows: " + (flows.length ? flows.join("; ") : "none drawn"));
  if (loose.length && flows.length) parts.push("Not connected: " + loose.join("; "));
  if (notes.length) parts.push("Notes: " + notes.join("; "));
  const text = parts.join("\n");
  return text.length > DIAGRAM_TEXT_MAX ? text.slice(0, DIAGRAM_TEXT_MAX - 1) + "…" : text;
}

// ---------------------------------------------------------------- escaping ---

export function esc(s: unknown): string {
  return String(s ?? "")
    .replace(/&/g, "&amp;")
    .replace(/</g, "&lt;")
    .replace(/>/g, "&gt;")
    .replace(/"/g, "&quot;")
    .replace(/'/g, "&#39;");
}

const num = (n: number) => (Math.round(n * 10) / 10).toString();

// ------------------------------------------------------------- SVG snapshot ---

/**
 * Static SVG of a diagram, cropped to its content. Uses presentation
 * attributes (works standalone in the report) plus wb-* classes so the app
 * can restyle it for dark mode. `idPrefix` keeps marker ids unique when
 * several snapshots share a page.
 */
export function diagramToSvg(d: Diagram, opts: { idPrefix?: string; title?: string; maxWidth?: number } = {}): string {
  if (isEmptyDiagram(d)) return "";
  const id = (opts.idPrefix || "wbs").replace(/[^A-Za-z0-9_-]/g, "") + "-arrow";
  let minX = Infinity, minY = Infinity, maxX = -Infinity, maxY = -Infinity;
  for (const n of d.nodes) {
    const s = nodeSize(n);
    minX = Math.min(minX, n.x); minY = Math.min(minY, n.y);
    maxX = Math.max(maxX, n.x + s.w); maxY = Math.max(maxY, n.y + s.h);
  }
  const pad = 18;
  const vx = minX - pad, vy = minY - pad, vw = maxX - minX + pad * 2, vh = maxY - minY + pad * 2;
  const byId = new Map(d.nodes.map((n) => [n.id, n]));
  const out: string[] = [];
  out.push(`<svg xmlns="http://www.w3.org/2000/svg" class="wb-snap" viewBox="${num(vx)} ${num(vy)} ${num(vw)} ${num(vh)}" width="100%" style="max-width:${opts.maxWidth || Math.round(vw)}px;height:auto" role="img" aria-label="${esc(opts.title || "Whiteboard diagram")}" font-family="Inter, system-ui, -apple-system, Segoe UI, Roboto, sans-serif">`);
  out.push(`<title>${esc(opts.title || "Whiteboard diagram")}</title>`);
  out.push(`<defs><marker id="${id}" viewBox="0 0 10 10" refX="9" refY="5" markerWidth="8" markerHeight="8" orient="auto-start-reverse"><path d="M0,0 L10,5 L0,10 z" class="wb-arrowhead" fill="#5b6b85"/></marker></defs>`);
  for (const e of d.edges) {
    const a = byId.get(e.from), b = byId.get(e.to);
    if (!a || !b) continue;
    const p = edgePoints(a, b);
    out.push(`<g class="wb-edge"><line x1="${num(p.x1)}" y1="${num(p.y1)}" x2="${num(p.x2)}" y2="${num(p.y2)}" stroke="#5b6b85" stroke-width="1.8" marker-end="url(#${id})"/>`);
    if (e.label.trim()) {
      const w = Math.min(190, e.label.length * 7.4 + 16);
      out.push(`<rect class="wb-edge-pill" x="${num(p.mx - w / 2)}" y="${num(p.my - 12)}" width="${num(w)}" height="24" rx="12" fill="#ffffff" stroke="#cfd7e3"/><text class="wb-edge-text" x="${num(p.mx)}" y="${num(p.my + 4.5)}" text-anchor="middle" font-size="12.5" fill="#5b6b85">${esc(e.label.slice(0, 26))}</text>`);
    }
    out.push(`</g>`);
  }
  for (const n of d.nodes) {
    const s = nodeSize(n);
    const lines = labelLines(n);
    const cy = n.y + s.h / 2 + (n.kind === "store" ? 4 : 0);
    const lh = n.kind === "note" ? 17 : 18;
    const y0 = cy - ((lines.length - 1) * lh) / 2 + 4;
    out.push(`<g class="wb-node wb-${n.kind}">`);
    if (n.kind === "box") out.push(`<rect x="${n.x}" y="${n.y}" width="${s.w}" height="${s.h}" rx="9" fill="#edf3fb" stroke="#16305c" stroke-width="1.6"/>`);
    else if (n.kind === "store") {
      const c = cylinderPaths(n.x, n.y, s.w, s.h);
      out.push(`<path d="${c.body}" fill="#e7f5ee" stroke="#158452" stroke-width="1.6"/><path class="wb-cyl-top" d="${c.top}" fill="#d3eedf" stroke="#158452" stroke-width="1.6"/>`);
    } else out.push(`<rect x="${n.x}" y="${n.y}" width="${s.w}" height="${s.h}" rx="4" fill="#fff5e3" stroke="#e2c27f" stroke-width="1.2"/>`);
    out.push(`<text x="${num(n.x + s.w / 2)}" text-anchor="middle" font-size="${n.kind === "note" ? 13.5 : 15}" font-weight="${n.kind === "note" ? 400 : 600}" fill="#15233b">${lines.map((l, i) => `<tspan x="${num(n.x + s.w / 2)}" y="${num(y0 + i * lh)}">${esc(l)}</tspan>`).join("")}</text>`);
    out.push(`</g>`);
  }
  out.push(`</svg>`);
  return out.join("");
}

// ----------------------------------------------------------- report input ---

export interface ReportScore { label: string; value: number }

export interface ReportTurn {
  mainIndex: number;
  /** 0 = main question, n = n-th follow-up. */
  depth: number;
  question: string;
  transcript: string;
  typed: boolean;
  scores: ReportScore[] | null;
  selfRated: boolean;
  strengths: string[];
  improve: string[];
  outline: string[];
  delivery: DeliveryMetrics;
  diagram?: Diagram | null;
  diagramText?: string;
}

export interface ReportInput {
  at: number;
  jobTitle: string;
  typeLabel: string;
  styleLabel: string;
  /** "Normal" or "Deep (up to 3 follow-ups)". */
  depthLabel: string;
  mode: "ai" | "offline";
  overall: number | null;
  dims: ReportScore[] | null;
  delivery: DeliverySummary;
  fixes: string[];
  best?: string;
  weakest?: string;
  turns: ReportTurn[];
}

const dateLong = (at: number) => {
  try { return new Date(at).toLocaleString(undefined, { dateStyle: "long", timeStyle: "short" }); } catch { return new Date(at).toISOString(); }
};
const dateShort = (at: number) => {
  try { return new Date(at).toLocaleDateString(undefined, { dateStyle: "medium" }); } catch { return new Date(at).toISOString().slice(0, 10); }
};
const isoDay = (at: number) => {
  const d = new Date(at);
  return d.getFullYear() + "-" + String(d.getMonth() + 1).padStart(2, "0") + "-" + String(d.getDate()).padStart(2, "0");
};
const turnTag = (t: ReportTurn) => (t.depth ? `Follow-up ${t.depth}` : `Question ${t.mainIndex + 1}`);
const avgScore = (s: ReportScore[]) => s.reduce((a, x) => a + x.value, 0) / (s.length || 1);
const fmtSec = (secs: number) => Math.floor(secs / 60) + ":" + String(Math.floor(secs % 60)).padStart(2, "0");

export function reportFileName(r: ReportInput, ext: "md" | "html") {
  const slug = (r.typeLabel + " " + (r.jobTitle || "")).toLowerCase().replace(/[^a-z0-9]+/g, "-").replace(/^-|-$/g, "").slice(0, 48);
  return `offerready-interview-${isoDay(r.at)}${slug ? "-" + slug : ""}.${ext}`;
}

function deliveryRows(d: DeliverySummary, beh: boolean): [string, string, boolean][] {
  const rows: [string, string, boolean][] = [
    ["Average pace", d.avgWpm === null ? "n/a (typed)" : d.avgWpm + " wpm", d.avgWpm !== null && (d.avgWpm < WPM_TARGET.min - 10 || d.avgWpm > WPM_TARGET.max + 15)],
    ["Filler words", `${d.fillerTotal} (${d.fillersPer100} per 100 words)`, d.fillersPer100 >= 4],
    ["Long pauses", d.longPauses === null ? "n/a" : String(d.longPauses), false],
    ["On-target length", `${d.onTarget} of ${d.answers}`, d.onTarget < d.answers / 2],
  ];
  if (beh && d.iShare !== null) rows.push(["I vs we", Math.round(d.iShare * 100) + "% I", d.iShare < 0.4]);
  return rows;
}

function turnDeliveryLine(m: DeliveryMetrics, typed: boolean): string {
  const bits: string[] = [];
  if (typed) bits.push(`${m.words} words (typed)`);
  else bits.push(m.durationSec ? fmtSec(m.durationSec) : m.words + " words");
  if (m.wpm !== null) bits.push(m.wpm + " wpm");
  bits.push(`${m.fillers.total} filler${m.fillers.total === 1 ? "" : "s"}`);
  if (m.longPauses !== null) bits.push(`${m.longPauses} long pause${m.longPauses === 1 ? "" : "s"}`);
  if (m.length !== "good") bits.push(m.length === "short" ? "short" : "long");
  return bits.join(" · ");
}

/** Show a turn's diagram only when it changed since the previous turn on the same question. */
function diagramsToShow(turns: ReportTurn[]): boolean[] {
  const last: Record<number, string> = {};
  return turns.map((t) => {
    const txt = t.diagramText || "";
    if (!txt || last[t.mainIndex] === txt) return false;
    last[t.mainIndex] = txt;
    return true;
  });
}

// --------------------------------------------------------------- HTML ---

const REPORT_CSS = `
:root { color-scheme: light; }
* { box-sizing: border-box; }
body { margin: 0; background: #f4f6f9; color: #15233b; font: 400 15px/1.6 Inter, system-ui, -apple-system, "Segoe UI", Roboto, sans-serif; -webkit-font-smoothing: antialiased; }
.sheet { max-width: 820px; margin: 24px auto; background: #fff; border: 1px solid #e3e8ef; border-radius: 14px; padding: 40px 44px; }
.toolbar { max-width: 820px; margin: 16px auto 0; display: flex; gap: 8px; justify-content: flex-end; padding: 0 16px; }
.toolbar button, .toolbar a { text-decoration: none; font: inherit; font-weight: 600; font-size: 14px; padding: 8px 16px; border-radius: 8px; border: 1px solid #cfd7e3; background: #fff; color: #15233b; cursor: pointer; }
.toolbar .primary { background: #16305c; border-color: #16305c; color: #fff; }
header { display: flex; justify-content: space-between; align-items: flex-start; gap: 24px; border-bottom: 2px solid #0c1c38; padding-bottom: 18px; margin-bottom: 22px; }
.brand { font-weight: 700; letter-spacing: -0.02em; font-size: 13px; color: #5b6b85; text-transform: uppercase; }
.brand b { color: #1a9e64; }
h1 { font-size: 24px; line-height: 1.25; margin: 4px 0 6px; letter-spacing: -0.015em; }
h2 { font-size: 13px; text-transform: uppercase; letter-spacing: 0.07em; color: #5b6b85; margin: 26px 0 10px; }
h3 { font-size: 16px; margin: 0 0 6px; line-height: 1.4; }
.meta { color: #5b6b85; font-size: 13.5px; margin: 0; }
.score { text-align: right; flex: none; }
.score .n { font-size: 40px; font-weight: 800; line-height: 1; color: #16305c; font-variant-numeric: tabular-nums; }
.score .l { font-size: 12px; color: #5b6b85; }
.dims { display: grid; grid-template-columns: 1fr 1fr; gap: 8px 28px; }
.dim { display: grid; grid-template-columns: 110px 1fr 34px; align-items: center; gap: 10px; font-size: 14px; }
.bar { height: 8px; background: #e3e8ef; border-radius: 4px; overflow: hidden; }
.bar i { display: block; height: 100%; border-radius: 4px; background: #1a9e64; }
.bar i.mid { background: #c47f0c; } .bar i.weak { background: #c0442b; }
.dim b { text-align: right; font-variant-numeric: tabular-nums; }
.metrics { display: grid; grid-template-columns: repeat(auto-fill, minmax(150px, 1fr)); gap: 8px; margin: 0; padding: 0; list-style: none; }
.metrics li { border: 1px solid #e3e8ef; border-radius: 8px; padding: 8px 12px; background: #f8fafc; }
.metrics li.warn { background: #fff5e3; border-color: #f1d7a6; }
.metrics span { display: block; font-size: 12px; color: #5b6b85; }
.metrics strong { font-variant-numeric: tabular-nums; }
ol.fixes { margin: 0; padding-left: 20px; } ol.fixes li { margin: 4px 0; }
.bw { display: grid; grid-template-columns: 1fr 1fr; gap: 10px; margin-top: 14px; }
.bw div { border: 1px solid #e3e8ef; border-left: 3px solid #1a9e64; border-radius: 8px; padding: 8px 12px; font-size: 14px; }
.bw div.weak { border-left-color: #c0442b; }
.bw span { display: block; font-size: 11px; font-weight: 700; text-transform: uppercase; letter-spacing: 0.06em; color: #5b6b85; }
.turn { border-top: 1px solid #e3e8ef; padding: 18px 0 6px; break-inside: avoid-page; }
.turn.fu { margin-left: 22px; border-top-style: dashed; }
.tag { display: inline-block; font-size: 11px; font-weight: 700; color: #16305c; background: #edf3fb; border-radius: 999px; padding: 1px 9px; margin-bottom: 6px; }
.turn.fu .tag { color: #a86400; background: #fff5e3; }
.tag .s { color: #5b6b85; font-weight: 600; margin-left: 6px; }
blockquote { margin: 8px 0 10px; padding: 10px 14px; border-left: 3px solid #cfd7e3; background: #f8fafc; border-radius: 0 8px 8px 0; white-space: pre-wrap; overflow-wrap: anywhere; }
.dl { font-size: 12.5px; color: #5b6b85; margin: 0 0 8px; }
.cols { display: grid; grid-template-columns: 1fr 1fr; gap: 6px 24px; }
.lbl { font-size: 12px; font-weight: 700; color: #5b6b85; margin: 8px 0 2px; }
ul { margin: 0; padding-left: 18px; } li { margin: 2px 0; }
ul.ok li::marker { color: #1a9e64; } ul.fix li::marker { color: #c47f0c; }
.scores { font-size: 13px; color: #15233b; margin: 4px 0; }
.scores span { margin-right: 12px; white-space: nowrap; }
.outline { background: #f8fafc; border: 1px solid #e3e8ef; border-radius: 8px; padding: 8px 14px; margin-top: 10px; font-size: 14px; }
.diagram { margin-top: 12px; border: 1px solid #e3e8ef; border-radius: 10px; padding: 12px; }
.diagram pre { margin: 10px 0 0; font: 12.5px/1.5 ui-monospace, "JetBrains Mono", monospace; white-space: pre-wrap; color: #15233b; }
.diagram svg { display: block; margin: 0 auto; }
footer { margin-top: 28px; padding-top: 14px; border-top: 1px solid #e3e8ef; font-size: 12px; color: #8592a8; }
@media (max-width: 640px) {
  .sheet { margin: 0; border: 0; border-radius: 0; padding: 22px 16px; }
  header { flex-direction: column; } .score { text-align: left; }
  .dims, .cols, .bw { grid-template-columns: 1fr; }
  .turn.fu { margin-left: 10px; }
}
@media print {
  @page { margin: 16mm 14mm; }
  body { background: #fff; font-size: 11pt; }
  .toolbar { display: none; }
  .sheet { margin: 0; border: 0; padding: 0; max-width: none; }
  .turn, .diagram, .dims, .metrics li { break-inside: avoid; }
  h2 { break-after: avoid; }
  * { -webkit-print-color-adjust: exact; print-color-adjust: exact; }
}`;

function barClass(v: number) { return v >= 3.5 ? "" : v >= 2.5 ? "mid" : "weak"; }

/** Full standalone, printable HTML document. */
export function buildReportHtml(r: ReportInput): string {
  const beh = r.turns.some((t) => t.delivery.behavioral);
  const show = diagramsToShow(r.turns);
  const h: string[] = [];
  const title = `${r.typeLabel} interview${r.jobTitle ? " · " + r.jobTitle : ""}`;
  h.push(`<!doctype html><html lang="en"><head><meta charset="utf-8"><meta name="viewport" content="width=device-width, initial-scale=1">`);
  h.push(`<title>${esc("Interview report · " + title + " · " + dateShort(r.at))}</title><style>${REPORT_CSS}</style></head><body>`);
  h.push(`<div class="toolbar"><a class="btn" href="#" download="${esc(reportFileName(r, "html"))}" onclick="this.href=location.href">Download HTML</a><button type="button" class="primary" onclick="window.print()">Print or save as PDF</button></div>`);
  h.push(`<main class="sheet">`);
  h.push(`<header><div><div class="brand">Offer<b>Ready</b> · Voice mock interview report</div><h1>${esc(title)}</h1>`);
  h.push(`<p class="meta">${esc(dateLong(r.at))} · ${esc(r.styleLabel)} interviewer · Follow-up depth: ${esc(r.depthLabel)} · ${r.turns.length} answer${r.turns.length === 1 ? "" : "s"}</p></div>`);
  h.push(`<div class="score"><div class="n">${r.overall === null ? "—" : r.overall + "%"}</div><div class="l">${r.mode === "offline" ? "self-rated" : "overall content score"}</div></div></header>`);

  if (r.dims) {
    h.push(`<h2>Scores by dimension</h2><div class="dims">`);
    for (const d of r.dims) h.push(`<div class="dim"><span>${esc(d.label)}</span><span class="bar"><i class="${barClass(d.value)}" style="width:${Math.round((d.value / 5) * 100)}%"></i></span><b>${num(d.value)}</b></div>`);
    h.push(`</div>`);
  }
  h.push(`<h2>Delivery</h2><ul class="metrics">`);
  for (const [k, v, warn] of deliveryRows(r.delivery, beh)) h.push(`<li${warn ? ' class="warn"' : ""}><span>${esc(k)}</span><strong>${esc(v)}</strong></li>`);
  h.push(`</ul><p class="meta" style="margin-top:6px">Target pace ${WPM_TARGET.min}–${WPM_TARGET.max} wpm; fewer than 4 fillers per 100 words.</p>`);

  h.push(`<h2>Top things to fix</h2>`);
  h.push(r.fixes.length ? `<ol class="fixes">${r.fixes.map((f) => `<li>${esc(f)}</li>`).join("")}</ol>` : `<p class="meta">Nothing stood out. Try a tougher interviewer next time.</p>`);
  if (r.best || r.weakest) {
    h.push(`<div class="bw">`);
    if (r.best) h.push(`<div><span>Best answer</span>${esc(r.best)}</div>`);
    if (r.weakest) h.push(`<div class="weak"><span>Weakest answer</span>${esc(r.weakest)}</div>`);
    h.push(`</div>`);
  }

  h.push(`<h2>Questions, answers and feedback</h2>`);
  r.turns.forEach((t, i) => {
    h.push(`<section class="turn${t.depth ? " fu" : ""}">`);
    const sc = t.scores ? `<span class="s">${num(avgScore(t.scores))}/5${t.selfRated ? " self-rated" : ""}</span>` : "";
    h.push(`<div class="tag">${esc(turnTag(t))}${sc}</div><h3>${esc(t.question)}</h3>`);
    h.push(t.transcript.trim() ? `<blockquote>${esc(t.transcript)}</blockquote>` : `<blockquote><em>No answer recorded.</em></blockquote>`);
    h.push(`<p class="dl">${esc(turnDeliveryLine(t.delivery, t.typed))}</p>`);
    if (t.scores && !t.selfRated) h.push(`<p class="scores">${t.scores.map((s) => `<span>${esc(s.label)} <b>${s.value}</b>/5</span>`).join("")}</p>`);
    if (t.strengths.length || t.improve.length) {
      h.push(`<div class="cols">`);
      h.push(`<div>${t.strengths.length ? `<div class="lbl">What worked</div><ul class="ok">${t.strengths.map((s) => `<li>${esc(s)}</li>`).join("")}</ul>` : ""}</div>`);
      h.push(`<div>${t.improve.length ? `<div class="lbl">To improve</div><ul class="fix">${t.improve.map((s) => `<li>${esc(s)}</li>`).join("")}</ul>` : ""}</div>`);
      h.push(`</div>`);
    }
    if (t.outline.length) h.push(`<div class="outline"><div class="lbl" style="margin-top:0">Strong answer outline</div><ul>${t.outline.map((s) => `<li>${esc(s)}</li>`).join("")}</ul></div>`);
    if (show[i] && t.diagramText) {
      const svg = t.diagram ? diagramToSvg(t.diagram, { idPrefix: "r" + i, title: "Whiteboard for " + turnTag(t), maxWidth: 680 }) : "";
      h.push(`<div class="diagram"><div class="lbl" style="margin-top:0">Whiteboard</div>${svg}<pre>${esc(t.diagramText)}</pre></div>`);
    }
    h.push(`</section>`);
  });
  h.push(`<footer>Generated by OfferReady on ${esc(dateLong(Date.now()))}. Built in your browser; nothing was uploaded. Delivery metrics come from speech-to-text timing and are approximate.</footer>`);
  h.push(`</main></body></html>`);
  return h.join("\n");
}

// ----------------------------------------------------------- Markdown ---

/** Keep user text from turning into Markdown structure or raw HTML. */
function mdText(s: string): string {
  return String(s || "").replace(/\r/g, "").replace(/</g, "&lt;").replace(/>/g, "&gt;").replace(/([\\`*_[\]#|])/g, "\\$1");
}
const mdQuote = (s: string) => mdText(s).split("\n").map((l) => "> " + l).join("\n");

export function buildReportMarkdown(r: ReportInput): string {
  const beh = r.turns.some((t) => t.delivery.behavioral);
  const show = diagramsToShow(r.turns);
  const L: string[] = [];
  L.push(`# Interview report: ${mdText(r.typeLabel)} interview${r.jobTitle ? " · " + mdText(r.jobTitle) : ""}`, "");
  L.push(`- **Date:** ${dateLong(r.at)}`);
  L.push(`- **Job:** ${r.jobTitle ? mdText(r.jobTitle) : "General practice"}`);
  L.push(`- **Type:** ${mdText(r.typeLabel)} · ${mdText(r.styleLabel)} interviewer · follow-up depth ${mdText(r.depthLabel)}`);
  L.push(`- **Overall:** ${r.overall === null ? "n/a" : r.overall + "%"}${r.mode === "offline" ? " (self-rated)" : ""}`, "");
  if (r.dims) {
    L.push(`## Scores`, "", "| Dimension | Score (1–5) |", "|---|---|");
    for (const d of r.dims) L.push(`| ${mdText(d.label)} | ${num(d.value)} |`);
    L.push("");
  }
  L.push(`## Delivery`, "");
  for (const [k, v] of deliveryRows(r.delivery, beh)) L.push(`- ${k}: ${v}`);
  L.push("", `## Top things to fix`, "");
  if (r.fixes.length) r.fixes.forEach((f, i) => L.push(`${i + 1}. ${mdText(f)}`));
  else L.push("Nothing stood out.");
  L.push("", `## Questions`, "");
  r.turns.forEach((t, i) => {
    L.push(`### ${turnTag(t)}${t.scores ? ` (${num(avgScore(t.scores))}/5${t.selfRated ? ", self-rated" : ""})` : ""}`, "");
    L.push(`**${mdText(t.question)}**`, "");
    L.push(t.transcript.trim() ? mdQuote(t.transcript) : "> _No answer recorded._", "");
    L.push(`_${turnDeliveryLine(t.delivery, t.typed)}_`, "");
    if (t.scores && !t.selfRated) L.push(t.scores.map((s) => `${s.label} ${s.value}/5`).join(" · "), "");
    if (t.strengths.length) { L.push("**What worked**", ""); t.strengths.forEach((s) => L.push("- " + mdText(s))); L.push(""); }
    if (t.improve.length) { L.push("**To improve**", ""); t.improve.forEach((s) => L.push("- " + mdText(s))); L.push(""); }
    if (t.outline.length) { L.push("**Strong answer outline**", ""); t.outline.forEach((s) => L.push("- " + mdText(s))); L.push(""); }
    if (show[i] && t.diagramText) L.push("**Whiteboard**", "", "```text", t.diagramText.replace(/```/g, "'''"), "```", "");
  });
  L.push("---", "", "_Generated by OfferReady in your browser. Nothing was uploaded._", "");
  return L.join("\n");
}

// ------------------------------------------------------- share summary ---

/** Short plain text to paste to a mentor (no transcripts). */
export function buildShareSummary(r: ReportInput): string {
  const L: string[] = [];
  L.push(`OfferReady voice mock: ${r.typeLabel}${r.jobTitle ? " for " + r.jobTitle : ""} (${dateShort(r.at)})`);
  const dims = r.dims ? " · " + r.dims.map((d) => `${d.label} ${num(d.value)}/5`).join(", ") : "";
  L.push(`Overall ${r.overall === null ? "n/a" : r.overall + "%"}${r.mode === "offline" ? " (self-rated)" : ""}${dims}`);
  const d = r.delivery;
  L.push(`Delivery: ${d.avgWpm === null ? "pace n/a" : d.avgWpm + " wpm"}, ${d.fillersPer100} fillers per 100 words, ${d.onTarget} of ${d.answers} answers on target length`);
  const mains = new Set(r.turns.map((t) => t.mainIndex)).size;
  const fus = r.turns.filter((t) => t.depth > 0);
  const maxDepth = fus.reduce((a, t) => Math.max(a, t.depth), 0);
  L.push(`${mains} question${mains === 1 ? "" : "s"}, ${fus.length} follow-up${fus.length === 1 ? "" : "s"}${maxDepth > 1 ? ` (drilled ${maxDepth} levels deep)` : ""}, ${r.styleLabel.toLowerCase()} interviewer`);
  if (r.turns.some((t) => t.diagramText)) L.push("Included a whiteboard design.");
  if (r.best) L.push(`Best: ${r.best}`);
  if (r.weakest) L.push(`Weakest: ${r.weakest}`);
  if (r.fixes.length) {
    L.push("Working on:");
    r.fixes.forEach((f, i) => L.push(`${i + 1}. ${f}`));
  }
  return L.join("\n");
}
