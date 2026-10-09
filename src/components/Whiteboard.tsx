/* <Whiteboard> — a small system-design sketchpad for the voice mock interview.
 *
 * SVG + pointer events (mouse, pen and touch), no libraries. Shapes: a box
 * (component), a cylinder (data store) and a sticky note. Drag to move;
 * "Connect" then click source → target to draw an arrow (optional label);
 * select + Delete removes; undo; clear; quick-add chips for common parts.
 *
 * Keyboard: every shape and arrow is focusable (Tab). Arrow keys nudge
 * (Shift = bigger step), Delete/Backspace removes, Enter edits the label,
 * C starts a connection from the focused shape (then Enter on the target),
 * Esc cancels, Ctrl/⌘+Z undoes.
 *
 * The parent owns persistence: `initial` seeds the board and `onChange`
 * fires with every committed diagram. The model, geometry and the text
 * description live in lib/interviewReport (pure, shared with the report). */

import { useEffect, useMemo, useRef, useState, type ChangeEvent, type KeyboardEvent, type PointerEvent } from "react";
import {
  WB_LABEL_MAX, WB_SIZE, WB_VIEW, cleanDiagram, cylinderPaths, edgePoints, emptyDiagram, labelLines, nodeCenter,
  type Diagram, type WbKind, type WbNode,
} from "../lib/interviewReport";

const HISTORY_MAX = 50;
const NUDGE = 10;
const NUDGE_BIG = 40;

export const QUICK_ADD: { label: string; kind: WbKind }[] = [
  { label: "Client", kind: "box" },
  { label: "Load balancer", kind: "box" },
  { label: "API", kind: "box" },
  { label: "Queue", kind: "box" },
  { label: "Cache", kind: "store" },
  { label: "DB", kind: "store" },
  { label: "Vector DB", kind: "store" },
  { label: "LLM", kind: "box" },
  { label: "Worker", kind: "box" },
  { label: "Object store", kind: "store" },
];

const KIND_NAME: Record<WbKind, string> = { box: "Component", store: "Data store", note: "Note" };

type Sel = { type: "node" | "edge"; id: string } | null;
interface Drag { id: string; pointerId: number; dx: number; dy: number; sx: number; sy: number; moved: boolean; before: Diagram }

let instances = 0;
const uid = (p: string) => p + Date.now().toString(36).slice(-4) + Math.random().toString(36).slice(2, 7);

interface Props {
  initial?: Diagram | null;
  onChange(d: Diagram): void;
  /** Accessible name, e.g. "Whiteboard for question 2". */
  label?: string;
}

export default function Whiteboard({ initial, onChange, label = "System design whiteboard" }: Props) {
  const [d, setD] = useState<Diagram>(() => (initial ? cleanDiagram(initial) : emptyDiagram()));
  const [past, setPast] = useState<Diagram[]>([]);
  const [sel, setSel] = useState<Sel>(null);
  const [connecting, setConnecting] = useState(false);
  const [from, setFrom] = useState<string | null>(null);
  const [cursor, setCursor] = useState<{ x: number; y: number } | null>(null);
  const [announce, setAnnounce] = useState("");
  const [narrow, setNarrow] = useState(false);

  const dRef = useRef(d);
  dRef.current = d;
  const drag = useRef<Drag | null>(null);
  const svgRef = useRef<SVGSVGElement | null>(null);
  const wrapRef = useRef<HTMLDivElement | null>(null);
  const labelRef = useRef<HTMLInputElement | null>(null);
  const editing = useRef(false);
  const focusAfter = useRef<string | null>(null);
  const markerId = useMemo(() => "wb-arrow-" + ++instances, []);

  // Board size: wide and short on desktop, narrower and taller on phones so
  // labels stay readable. Content outside the base size grows the view.
  useEffect(() => {
    const el = wrapRef.current;
    if (!el) return;
    const check = () => setNarrow(el.clientWidth > 0 && el.clientWidth < 560);
    check();
    const RO = (window as unknown as { ResizeObserver?: new (cb: () => void) => { observe(e: Element): void; disconnect(): void } }).ResizeObserver;
    if (RO) { const ro = new RO(check); ro.observe(el); return () => ro.disconnect(); }
    window.addEventListener("resize", check);
    return () => window.removeEventListener("resize", check);
  }, []);
  const base = narrow ? { w: 480, h: 540 } : WB_VIEW;
  const view = useMemo(() => {
    let w: number = base.w, h: number = base.h;
    for (const n of d.nodes) { const s = WB_SIZE[n.kind]; w = Math.max(w, n.x + s.w + 12); h = Math.max(h, n.y + s.h + 12); }
    return { w, h };
  }, [d, base.w, base.h]);

  // Move focus to a shape after it's (re)rendered (keyboard add / delete).
  useEffect(() => {
    const id = focusAfter.current;
    if (!id) return;
    focusAfter.current = null;
    const el = svgRef.current?.querySelector<SVGGElement>(`[data-id="${id}"]`);
    if (el) el.focus();
    else if (id === "__svg") svgRef.current?.focus();
  });

  const say = (s: string) => setAnnounce(s);
  const nameOf = (n: WbNode | undefined) => (n ? (n.label.trim() || KIND_NAME[n.kind]) : "shape");

  function commit(next: Diagram, msg?: string) {
    // Capture now: updaters can run later, after dRef has moved on.
    const prev = dRef.current;
    setPast((p) => [...p.slice(-(HISTORY_MAX - 1)), prev]);
    dRef.current = next;
    setD(next);
    onChange(next);
    if (msg) say(msg);
  }

  function undo() {
    if (!past.length) { say("Nothing to undo."); return; }
    const prev = past[past.length - 1];
    setPast(past.slice(0, -1));
    dRef.current = prev;
    setD(prev);
    onChange(prev);
    if (sel && !(sel.type === "node" ? prev.nodes : prev.edges).some((x) => x.id === sel.id)) setSel(null);
    say("Undone.");
  }

  function freeSpot(kind: WbKind) {
    const s = WB_SIZE[kind];
    // Spread columns across the board so arrows between neighbours stay readable.
    const cols = Math.max(1, Math.floor((base.w - 24) / 220));
    const colW = cols > 1 ? (base.w - 40 - WB_SIZE.note.w) / (cols - 1) : 172;
    const rowH = narrow ? 130 : 112;
    const hit = (x: number, y: number) => dRef.current.nodes.some((n) => {
      const t = WB_SIZE[n.kind];
      return x < n.x + t.w + 8 && x + s.w + 8 > n.x && y < n.y + t.h + 8 && y + s.h + 8 > n.y;
    });
    for (let r = 0; r < 12; r++) for (let c = 0; c < cols; c++) {
      const x = Math.round(20 + c * colW), y = 20 + r * rowH;
      if (!hit(x, y)) return { x, y };
    }
    const k = dRef.current.nodes.length;
    return { x: 20 + (k * 17) % 200, y: 20 + (k * 23) % 200 };
  }

  function addNode(kind: WbKind, text?: string, focusLabel = false) {
    const p = freeSpot(kind);
    const n: WbNode = { id: uid("n"), kind, label: (text ?? KIND_NAME[kind]).slice(0, WB_LABEL_MAX[kind]), x: p.x, y: p.y };
    commit({ ...dRef.current, nodes: [...dRef.current.nodes, n] }, `Added ${nameOf(n)}.`);
    setSel({ type: "node", id: n.id });
    if (focusLabel) setTimeout(() => { labelRef.current?.focus(); labelRef.current?.select(); }, 0);
  }

  function remove(target: Sel) {
    if (!target) return;
    const cur = dRef.current;
    if (target.type === "node") {
      const n = cur.nodes.find((x) => x.id === target.id);
      const idx = cur.nodes.findIndex((x) => x.id === target.id);
      const rest = cur.nodes.filter((x) => x.id !== target.id);
      commit({ nodes: rest, edges: cur.edges.filter((e) => e.from !== target.id && e.to !== target.id) }, `Deleted ${nameOf(n)}.`);
      const nextFocus = rest[Math.min(idx, rest.length - 1)];
      focusAfter.current = nextFocus ? nextFocus.id : "__svg";
      setSel(nextFocus ? { type: "node", id: nextFocus.id } : null);
    } else {
      commit({ ...cur, edges: cur.edges.filter((e) => e.id !== target.id) }, "Deleted the arrow.");
      focusAfter.current = "__svg";
      setSel(null);
    }
    if (from === target.id) setFrom(null);
  }

  function clearAll() {
    if (!dRef.current.nodes.length) return;
    commit(emptyDiagram(), "Cleared the board. Undo brings it back.");
    setSel(null); setFrom(null); setConnecting(false);
  }

  function connectTo(id: string) {
    const cur = dRef.current;
    if (!from) { setFrom(id); say(`Connecting from ${nameOf(cur.nodes.find((n) => n.id === id))}. Now pick the target.`); return; }
    if (from === id) { setFrom(null); say("Connection cancelled."); return; }
    const existing = cur.edges.find((e) => e.from === from && e.to === id);
    const a = cur.nodes.find((n) => n.id === from), b = cur.nodes.find((n) => n.id === id);
    if (existing) { setSel({ type: "edge", id: existing.id }); say("Those are already connected."); }
    else {
      const e = { id: uid("e"), from, to: id, label: "" };
      commit({ ...cur, edges: [...cur.edges, e] }, `Connected ${nameOf(a)} to ${nameOf(b)}. Add an optional label.`);
      setSel({ type: "edge", id: e.id });
    }
    setFrom(null);
    setConnecting(false);
    setCursor(null);
  }

  function moveNode(id: string, x: number, y: number, history: boolean) {
    const cur = dRef.current;
    const n = cur.nodes.find((k) => k.id === id);
    if (!n) return;
    const s = WB_SIZE[n.kind];
    const nx = Math.round(Math.max(0, Math.min(view.w - s.w, x)));
    const ny = Math.round(Math.max(0, Math.min(view.h - s.h, y)));
    if (nx === n.x && ny === n.y) return;
    const next = { ...cur, nodes: cur.nodes.map((k) => (k.id === id ? { ...k, x: nx, y: ny } : k)) };
    if (history) commit(next);
    else { dRef.current = next; setD(next); }
  }

  // ------------------------------------------------------------ pointer ---

  function toBoard(e: { clientX: number; clientY: number }) {
    const svg = svgRef.current;
    const m = svg?.getScreenCTM();
    if (!svg || !m) return { x: 0, y: 0 };
    const pt = svg.createSVGPoint();
    pt.x = e.clientX; pt.y = e.clientY;
    const r = pt.matrixTransform(m.inverse());
    return { x: r.x, y: r.y };
  }

  function onPointerDown(e: PointerEvent<SVGSVGElement>) {
    if (e.button !== undefined && e.button > 0) return;
    const t = e.target as Element;
    const nodeEl = t.closest("[data-node]");
    const edgeEl = t.closest("[data-edge]");
    if (nodeEl) {
      const id = nodeEl.getAttribute("data-id") || "";
      if (connecting) { e.preventDefault(); connectTo(id); return; }
      const n = dRef.current.nodes.find((k) => k.id === id);
      if (!n) return;
      const p = toBoard(e);
      drag.current = { id, pointerId: e.pointerId, dx: p.x - n.x, dy: p.y - n.y, sx: p.x, sy: p.y, moved: false, before: dRef.current };
      try { svgRef.current?.setPointerCapture(e.pointerId); } catch { /* old browsers */ }
      setSel({ type: "node", id });
      (nodeEl as SVGGElement).focus({ preventScroll: true } as FocusOptions);
      e.preventDefault();
      return;
    }
    if (edgeEl) {
      const id = edgeEl.getAttribute("data-id") || "";
      setSel({ type: "edge", id });
      (edgeEl as SVGGElement).focus({ preventScroll: true } as FocusOptions);
      return;
    }
    setSel(null);
    if (from) { setFrom(null); say("Connection cancelled."); }
  }

  function onPointerMove(e: PointerEvent<SVGSVGElement>) {
    const g = drag.current;
    const p = toBoard(e);
    if (from) setCursor(p);
    if (!g || g.pointerId !== e.pointerId) return;
    if (!g.moved && Math.hypot(p.x - g.sx, p.y - g.sy) < 3) return;
    g.moved = true;
    moveNode(g.id, p.x - g.dx, p.y - g.dy, false);
  }

  function onPointerUp(e: PointerEvent<SVGSVGElement>) {
    const g = drag.current;
    if (!g || g.pointerId !== e.pointerId) return;
    drag.current = null;
    try { svgRef.current?.releasePointerCapture(e.pointerId); } catch { /* fine */ }
    if (g.moved) {
      const before = g.before;
      setPast((p) => [...p.slice(-(HISTORY_MAX - 1)), before]);
      onChange(dRef.current);
      say(`Moved ${nameOf(dRef.current.nodes.find((n) => n.id === g.id))}.`);
    }
  }

  // ----------------------------------------------------------- keyboard ---

  function onShapeKey(e: KeyboardEvent<SVGGElement>, type: "node" | "edge", id: string) {
    const k = e.key;
    if (k === "Delete" || k === "Backspace") { e.preventDefault(); remove({ type, id }); return; }
    if (k === "Escape") { if (from || connecting) { setFrom(null); setConnecting(false); say("Connection cancelled."); } else setSel(null); return; }
    if (type === "node") {
      if (k === "Enter" || k === " ") {
        e.preventDefault();
        if (connecting || from) connectTo(id);
        else { setSel({ type, id }); setTimeout(() => { labelRef.current?.focus(); labelRef.current?.select(); }, 0); }
        return;
      }
      if (k === "c" || k === "C") {
        e.preventDefault();
        if (from && from !== id) { connectTo(id); return; }
        setConnecting(true); setFrom(id);
        say(`Connecting from ${nameOf(dRef.current.nodes.find((n) => n.id === id))}. Tab to the target and press Enter.`);
        return;
      }
      const step = e.shiftKey ? NUDGE_BIG : NUDGE;
      const delta: Record<string, [number, number]> = { ArrowLeft: [-step, 0], ArrowRight: [step, 0], ArrowUp: [0, -step], ArrowDown: [0, step] };
      if (delta[k]) {
        e.preventDefault();
        const n = dRef.current.nodes.find((x) => x.id === id);
        if (n) moveNode(id, n.x + delta[k][0], n.y + delta[k][1], true);
      }
    } else if (k === "Enter" || k === " ") {
      e.preventDefault();
      setSel({ type, id });
      setTimeout(() => labelRef.current?.focus(), 0);
    }
  }

  function onBoardKey(e: KeyboardEvent<HTMLDivElement>) {
    const tag = (e.target as HTMLElement).tagName;
    if ((e.ctrlKey || e.metaKey) && (e.key === "z" || e.key === "Z") && tag !== "INPUT") { e.preventDefault(); undo(); }
  }

  // ------------------------------------------------------------- label ---

  const selNode = sel?.type === "node" ? d.nodes.find((n) => n.id === sel.id) : undefined;
  const selEdge = sel?.type === "edge" ? d.edges.find((x) => x.id === sel.id) : undefined;
  const selLabel = selNode ? selNode.label : selEdge ? selEdge.label : "";
  const labelMax = selNode ? WB_LABEL_MAX[selNode.kind] : 40;

  function setLabel(v: string) {
    const cur = dRef.current;
    const text = v.slice(0, labelMax);
    const next = selNode
      ? { ...cur, nodes: cur.nodes.map((n) => (n.id === selNode.id ? { ...n, label: text } : n)) }
      : selEdge ? { ...cur, edges: cur.edges.map((x) => (x.id === selEdge.id ? { ...x, label: text } : x)) } : cur;
    // One undo step per editing session, not per keystroke.
    if (!editing.current) { editing.current = true; commit(next); }
    else { dRef.current = next; setD(next); onChange(next); }
  }

  // ------------------------------------------------------------ render ---

  const byId = new Map(d.nodes.map((n) => [n.id, n]));
  const srcNode = from ? byId.get(from) : undefined;
  const empty = !d.nodes.length;
  const hint = connecting
    ? (from ? `Now click the target for the arrow from ${nameOf(srcNode)}. Esc cancels.` : "Click the shape the arrow starts from.")
    : null;

  return (
    <div className={"wb" + (connecting ? " is-connecting" : "")} ref={wrapRef} onKeyDown={onBoardKey}>
      <div className="wb-tools" role="toolbar" aria-label="Whiteboard tools">
        <button type="button" className="wb-btn" onClick={() => addNode("box", undefined, true)} title="Add a component box"><ShapeIcon kind="box" /> Box</button>
        <button type="button" className="wb-btn" onClick={() => addNode("store", undefined, true)} title="Add a data store"><ShapeIcon kind="store" /> Data store</button>
        <button type="button" className="wb-btn" onClick={() => addNode("note", "", true)} title="Add a text note"><ShapeIcon kind="note" /> Note</button>
        <span className="wb-sep" aria-hidden="true" />
        <button type="button" className={"wb-btn" + (connecting ? " on" : "")} aria-pressed={connecting} disabled={d.nodes.length < 2 && !connecting}
          onClick={() => { const on = !connecting; setConnecting(on); setFrom(null); setCursor(null); say(on ? "Connect: pick the shape the arrow starts from, then the target." : "Connection cancelled."); }}
          title="Connect two shapes with an arrow"><ArrowIcon /> Connect</button>
        <span className="wb-sep" aria-hidden="true" />
        <button type="button" className="wb-btn wb-icon" onClick={undo} disabled={!past.length} aria-label="Undo" title="Undo (Ctrl/⌘+Z)"><UndoIcon /></button>
        <button type="button" className="wb-btn wb-icon" onClick={() => remove(sel)} disabled={!sel} aria-label="Delete selected" title="Delete selected (Delete)"><TrashIcon /></button>
        <button type="button" className="wb-btn wb-clear" onClick={clearAll} disabled={empty}>Clear</button>
      </div>
      <div className="wb-chips" role="group" aria-label="Quick add a component">
        {QUICK_ADD.map((q) => (
          <button key={q.label} type="button" className={"wb-chip wb-chip-" + q.kind} onClick={() => addNode(q.kind, q.label)}>+ {q.label}</button>
        ))}
      </div>

      <div className="wb-canvas">
        {hint && <div className="wb-hint" role="status">{hint}</div>}
        <svg
          ref={svgRef}
          className="wb-svg"
          viewBox={`0 0 ${view.w} ${view.h}`}
          role="group"
          aria-label={label + (empty ? ", empty" : `, ${d.nodes.length} shape${d.nodes.length === 1 ? "" : "s"} and ${d.edges.length} arrow${d.edges.length === 1 ? "" : "s"}`)}
          tabIndex={-1}
          onPointerDown={onPointerDown}
          onPointerMove={onPointerMove}
          onPointerUp={onPointerUp}
          onPointerCancel={onPointerUp}
          onPointerLeave={() => setCursor(null)}
        >
          <defs>
            <pattern id={markerId + "-grid"} width="20" height="20" patternUnits="userSpaceOnUse">
              <circle cx="1" cy="1" r="1" className="wb-dot" />
            </pattern>
            <marker id={markerId} viewBox="0 0 10 10" refX="9" refY="5" markerWidth="8" markerHeight="8" orient="auto-start-reverse">
              <path d="M0,0 L10,5 L0,10 z" className="wb-arrowhead" />
            </marker>
            <marker id={markerId + "-sel"} viewBox="0 0 10 10" refX="9" refY="5" markerWidth="8" markerHeight="8" orient="auto-start-reverse">
              <path d="M0,0 L10,5 L0,10 z" className="wb-arrowhead-sel" />
            </marker>
          </defs>
          <rect x="0" y="0" width={view.w} height={view.h} fill={`url(#${markerId}-grid)`} className="wb-bg" />
          {empty && (
            <text x={view.w / 2} y={view.h / 2} textAnchor="middle" className="wb-empty">
              <tspan x={view.w / 2} dy="-6">Sketch your design while you talk.</tspan>
              <tspan x={view.w / 2} dy="22" className="wb-empty-sub">Add components, then connect them with arrows.</tspan>
            </text>
          )}

          {d.edges.map((e) => {
            const a = byId.get(e.from), b = byId.get(e.to);
            if (!a || !b) return null;
            const p = edgePoints(a, b);
            const on = sel?.type === "edge" && sel.id === e.id;
            const w = Math.min(190, e.label.length * 7.4 + 16);
            return (
              <g key={e.id} data-edge="" data-id={e.id} className={"wb-edge" + (on ? " is-sel" : "")} tabIndex={0} role="button"
                aria-label={`Arrow from ${nameOf(a)} to ${nameOf(b)}${e.label ? ", " + e.label : ""}. Delete removes it, Enter edits the label.`}
                aria-pressed={on} onKeyDown={(ev: KeyboardEvent<SVGGElement>) => onShapeKey(ev, "edge", e.id)} onFocus={() => setSel({ type: "edge", id: e.id })}>
                <line x1={p.x1} y1={p.y1} x2={p.x2} y2={p.y2} className="wb-edge-hit" />
                <line x1={p.x1} y1={p.y1} x2={p.x2} y2={p.y2} className="wb-edge-line" markerEnd={`url(#${markerId}${on ? "-sel" : ""})`} />
                {e.label && (
                  <>
                    <rect x={p.mx - w / 2} y={p.my - 12} width={w} height={24} rx={12} className="wb-edge-pill" />
                    <text x={p.mx} y={p.my + 4.5} textAnchor="middle" className="wb-edge-text">{e.label.slice(0, 26)}</text>
                  </>
                )}
              </g>
            );
          })}

          {srcNode && cursor && (() => {
            const c = nodeCenter(srcNode);
            return <line x1={c.x} y1={c.y} x2={cursor.x} y2={cursor.y} className="wb-rubber" />;
          })()}

          {d.nodes.map((n) => {
            const s = WB_SIZE[n.kind];
            const on = sel?.type === "node" && sel.id === n.id;
            const lines = labelLines(n);
            const lh = n.kind === "note" ? 17 : 18;
            const cy = s.h / 2 + (n.kind === "store" ? 4 : 0);
            const y0 = cy - ((lines.length - 1) * lh) / 2 + 4;
            const cyl = n.kind === "store" ? cylinderPaths(0, 0, s.w, s.h) : null;
            return (
              <g key={n.id} data-node="" data-id={n.id} transform={`translate(${n.x},${n.y})`} tabIndex={0} role="button"
                className={"wb-node wb-" + n.kind + (on ? " is-sel" : "") + (from === n.id ? " is-src" : "")}
                aria-label={`${KIND_NAME[n.kind]}: ${n.label || "unlabelled"}. Arrow keys move, Delete removes, Enter edits the label, C connects.`}
                aria-pressed={on}
                onKeyDown={(ev: KeyboardEvent<SVGGElement>) => onShapeKey(ev, "node", n.id)}
                onFocus={() => { if (!drag.current) setSel({ type: "node", id: n.id }); }}
                onDoubleClick={() => { setSel({ type: "node", id: n.id }); setTimeout(() => { labelRef.current?.focus(); labelRef.current?.select(); }, 0); }}>
                {(on || from === n.id) && <rect x={-5} y={-5} width={s.w + 10} height={s.h + 10} rx={12} className="wb-sel-ring" />}
                {n.kind === "box" && <rect width={s.w} height={s.h} rx={9} className="wb-shape" />}
                {cyl && <><path d={cyl.body} className="wb-shape" /><path d={cyl.top} className="wb-shape wb-cyl-top" /></>}
                {n.kind === "note" && <rect width={s.w} height={s.h} rx={4} className="wb-shape" />}
                <text className="wb-text" textAnchor="middle">
                  {lines.length ? lines.map((l, i) => <tspan key={i} x={s.w / 2} y={y0 + i * lh}>{l}</tspan>)
                    : <tspan x={s.w / 2} y={y0} className="wb-placeholder">{n.kind === "note" ? "Type a note" : "Label"}</tspan>}
                </text>
              </g>
            );
          })}
        </svg>
      </div>

      <div className="wb-selbar">
        {selNode || selEdge ? (
          <>
            <label className="wb-label-field">
              <span>{selNode ? (selNode.kind === "note" ? "Note" : "Label") : "Arrow label"}</span>
              <input ref={labelRef} className="input wb-label-input" value={selLabel} maxLength={labelMax}
                placeholder={selEdge ? "Optional, e.g. HTTPS, async, writes" : selNode?.kind === "note" ? "e.g. 10k QPS reads, 99.9% SLO" : "e.g. API gateway"}
                onFocus={() => { editing.current = false; }}
                onBlur={() => { editing.current = false; }}
                onChange={(e: ChangeEvent<HTMLInputElement>) => setLabel(e.target.value)}
                onKeyDown={(e: KeyboardEvent<HTMLInputElement>) => {
                  if (e.key === "Enter" || e.key === "Escape") {
                    e.preventDefault();
                    const id = sel?.id;
                    if (id) focusAfter.current = id;
                    editing.current = false;
                    setD({ ...dRef.current });
                  }
                }} />
            </label>
            {selNode && <button type="button" className="wb-btn" onClick={() => { setConnecting(true); setFrom(selNode.id); say(`Connecting from ${nameOf(selNode)}. Now pick the target.`); }} disabled={d.nodes.length < 2}><ArrowIcon /> Connect from here</button>}
            <button type="button" className="wb-btn" onClick={() => remove(sel)}><TrashIcon /> Delete</button>
          </>
        ) : (
          <p className="wb-tip">Drag to move. Select a shape, then use arrow keys to nudge, <kbd>Delete</kbd> to remove, <kbd>C</kbd> to connect.</p>
        )}
      </div>
      <p className="vm-sr" aria-live="polite">{announce}</p>
    </div>
  );
}

// --------------------------------------------------------------- icons ---

function ShapeIcon({ kind }: { kind: WbKind }) {
  return (
    <svg width="16" height="16" viewBox="0 0 16 16" aria-hidden="true" focusable="false">
      {kind === "box" && <rect x="1.5" y="3.5" width="13" height="9" rx="2" fill="none" stroke="currentColor" strokeWidth="1.5" />}
      {kind === "store" && <><ellipse cx="8" cy="4" rx="5.5" ry="2" fill="none" stroke="currentColor" strokeWidth="1.5" /><path d="M2.5 4v8c0 1.1 2.5 2 5.5 2s5.5-.9 5.5-2V4" fill="none" stroke="currentColor" strokeWidth="1.5" /></>}
      {kind === "note" && <><path d="M2.5 2.5h11v8l-3 3h-8z" fill="none" stroke="currentColor" strokeWidth="1.5" strokeLinejoin="round" /><path d="M5 6h6M5 9h4" stroke="currentColor" strokeWidth="1.3" strokeLinecap="round" /></>}
    </svg>
  );
}
function ArrowIcon() {
  return (
    <svg width="16" height="16" viewBox="0 0 16 16" aria-hidden="true" focusable="false">
      <path d="M2 12 L12 4 M7.5 3.5 H12.5 V8.5" fill="none" stroke="currentColor" strokeWidth="1.6" strokeLinecap="round" strokeLinejoin="round" />
    </svg>
  );
}
function UndoIcon() {
  return (
    <svg width="16" height="16" viewBox="0 0 16 16" aria-hidden="true" focusable="false">
      <path d="M5.5 3 L2.5 6 L5.5 9 M2.5 6 H10 a3.5 3.5 0 0 1 0 7 H7" fill="none" stroke="currentColor" strokeWidth="1.6" strokeLinecap="round" strokeLinejoin="round" />
    </svg>
  );
}
function TrashIcon() {
  return (
    <svg width="16" height="16" viewBox="0 0 16 16" aria-hidden="true" focusable="false">
      <path d="M2.5 4.5h11M6 4.5V3h4v1.5M4 4.5l.7 9h6.6l.7-9" fill="none" stroke="currentColor" strokeWidth="1.5" strokeLinecap="round" strokeLinejoin="round" />
    </svg>
  );
}
