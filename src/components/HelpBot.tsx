/* OfferReady Help — the floating assistant (was content/assets/chatbot.js on
 * the study site). Asks /api/ask, filters by /api/areas, and links suggested
 * pages to the study library. Answers are rendered as React elements from a
 * small Markdown subset, never as raw HTML. */

import { Fragment, useEffect, useRef, useState, type FormEvent, type KeyboardEvent, type ReactNode } from "react";
import { API_ENABLED, STUDY_URL, docsUrl } from "../config";
import * as api from "../lib/api";

const SUGGESTIONS = [
  "How is Resume Match calculated?",
  "What's the difference between Analysis and Practice?",
  "How do I improve readiness?",
  "What should I do next?",
];

interface Msg {
  id: number;
  from: "user" | "bot";
  text?: string;
  answer?: string;
  citations?: { label: string; url: string }[];
  error?: boolean;
}

// ---- tiny Markdown renderer (headings, lists, tables, bold, italic, code) ----

function Inline({ text }: { text: string }) {
  // Links keep their text only, as on the study site.
  const t = text.replace(/\[([^\]]+)\]\(([^)]+)\)/g, "$1");
  const parts = t.split(/(`[^`]+`|\*\*[^*]+\*\*|\*[^*\s][^*]*\*)/g);
  return (
    <>
      {parts.map((p, i) =>
        p.startsWith("`") && p.endsWith("`") && p.length > 1 ? <code key={i}>{p.slice(1, -1)}</code>
        : p.startsWith("**") && p.endsWith("**") && p.length > 3 ? <strong key={i}>{p.slice(2, -2)}</strong>
        : p.startsWith("*") && p.endsWith("*") && p.length > 2 ? <em key={i}>{p.slice(1, -1)}</em>
        : <Fragment key={i}>{p}</Fragment>,
      )}
    </>
  );
}

function Markdown({ md }: { md: string }) {
  const lines = md.replace(/```[\s\S]*?```/g, "").split("\n");
  const out: ReactNode[] = [];
  let i = 0;
  const cells = (r: string) => r.replace(/^\|/, "").replace(/\|$/, "").split("|").map((c) => c.trim());
  while (i < lines.length) {
    const raw = lines[i].trim();
    if (!raw) { i++; continue; }
    const h = raw.match(/^(#{1,6})\s+(.*)$/);
    if (h || /^\*\*[^*]+\*\*$/.test(raw)) {
      out.push(<h4 key={i} className="hb-h"><Inline text={h ? h[2] : raw} /></h4>);
      i++;
      continue;
    }
    if (raw.includes("|") && i + 1 < lines.length && /^\s*\|?[\s:|-]+\|?\s*$/.test(lines[i + 1]) && lines[i + 1].includes("-")) {
      const head = cells(raw);
      const rows: string[][] = [];
      i += 2;
      while (i < lines.length && lines[i].includes("|") && lines[i].trim()) rows.push(cells(lines[i++].trim()));
      out.push(
        <div key={i} className="table-wrap">
          <table>
            <thead><tr>{head.map((c, k) => <th key={k}><Inline text={c} /></th>)}</tr></thead>
            <tbody>{rows.map((r, k) => <tr key={k}>{r.map((c, j) => <td key={j}><Inline text={c} /></td>)}</tr>)}</tbody>
          </table>
        </div>,
      );
      continue;
    }
    if (/^[-*]\s+/.test(raw) || /^\d+\.\s+/.test(raw)) {
      const ordered = /^\d+\./.test(raw);
      const re = ordered ? /^\s*\d+\.\s+/ : /^\s*[-*]\s+/;
      const items: string[] = [];
      while (i < lines.length && re.test(lines[i])) items.push(lines[i++].replace(re, ""));
      const List = ordered ? "ol" : "ul";
      out.push(<List key={i}>{items.map((it, k) => <li key={k}><Inline text={it} /></li>)}</List>);
      continue;
    }
    const para: string[] = [];
    while (i < lines.length && lines[i].trim() && !/^(#{1,6}\s|[-*]\s|\d+\.\s)/.test(lines[i].trim()) && !lines[i].includes("|")) {
      para.push(lines[i++].trim());
    }
    if (para.length) out.push(<p key={i}><Inline text={para.join(" ")} /></p>);
    else i++;
  }
  return <>{out}</>;
}

// ---- widget -----------------------------------------------------------------

let nextId = 1;

export function HelpBot() {
  const [open, setOpen] = useState(false);
  const [areas, setAreas] = useState<string[]>([]);
  const [area, setArea] = useState("all");
  const [msgs, setMsgs] = useState<Msg[]>([]);
  const [text, setText] = useState("");
  const [busy, setBusy] = useState(false);
  const inputRef = useRef<HTMLInputElement>(null);
  const logRef = useRef<HTMLDivElement>(null);
  const loadedAreas = useRef(false);

  // Load topic areas the first time the panel opens (best effort).
  useEffect(() => {
    if (!open) return;
    setTimeout(() => inputRef.current?.focus(), 30);
    if (loadedAreas.current || !API_ENABLED) return;
    loadedAreas.current = true;
    api.listHelpAreas().then((r) => {
      if (r.status === 200 && Array.isArray(r.body?.areas)) setAreas(r.body!.areas.filter((a) => a !== "all"));
    });
  }, [open]);

  useEffect(() => {
    logRef.current?.scrollTo({ top: logRef.current.scrollHeight });
  }, [msgs, busy]);

  const ask = async (q: string) => {
    const question = q.trim();
    if (!question || busy) return;
    setMsgs((m) => [...m, { id: nextId++, from: "user", text: question }]);
    setText("");
    if (!API_ENABLED) {
      setMsgs((m) => [...m, { id: nextId++, from: "bot", error: true, text: "The assistant isn’t enabled on this site yet." }]);
      return;
    }
    setBusy(true);
    const res = await api.askHelp(question, area);
    setBusy(false);
    if (res.status === 200 && res.body?.answer) {
      const citations = (res.body.citations || [])
        .map((c) => (typeof c === "string" ? { label: c, url: "" } : { label: c.label || c.url || "", url: c.url || "" }))
        .filter((c) => c.label);
      setMsgs((m) => [...m, { id: nextId++, from: "bot", answer: res.body!.answer, citations }]);
    } else {
      const reason =
        res.status === 0 ? "Couldn’t reach the assistant. Check your connection and try again."
        : res.status === 503 ? "The assistant isn’t enabled right now."
        : res.body?.error || "The assistant had a problem. Please try again.";
      setMsgs((m) => [...m, { id: nextId++, from: "bot", error: true, text: reason }]);
    }
    setTimeout(() => inputRef.current?.focus(), 30);
  };

  const onSubmit = (e: FormEvent) => {
    e.preventDefault();
    ask(text);
  };
  const onKey = (e: KeyboardEvent) => {
    if (e.key === "Escape") setOpen(false);
  };

  return (
    <div className="hb no-print" onKeyDown={onKey}>
      {open && (
        <section className="hb-panel" role="dialog" aria-label="OfferReady Help">
          <header className="hb-head">
            <div>
              <h2>OfferReady Help</h2>
              <p>Questions about the product or interview topics</p>
            </div>
            <button type="button" className="hb-close" aria-label="Close help" onClick={() => setOpen(false)}>{"✕"}</button>
          </header>
          {areas.length > 0 && (
            <label className="hb-area">
              <span>Topic</span>
              <select className="input" value={area} onChange={(e) => setArea(e.target.value)}>
                <option value="all">All topics</option>
                {areas.map((a) => <option key={a} value={a}>{a.replace(/-/g, " ")}</option>)}
              </select>
            </label>
          )}
          <div className="hb-log" ref={logRef} aria-live="polite">
            <div className="hb-msg hb-bot">
              <p>Hi! I can help you use OfferReady and explain the concepts behind interview questions. What would you like to know?</p>
            </div>
            {msgs.length === 0 && (
              <div className="hb-chips">
                {SUGGESTIONS.map((s) => (
                  <button key={s} type="button" className="hb-chip" onClick={() => ask(s)}>{s}</button>
                ))}
              </div>
            )}
            {msgs.map((m) => (
              <div key={m.id} className={"hb-msg " + (m.from === "user" ? "hb-user" : "hb-bot") + (m.error ? " hb-err" : "")}>
                {m.answer ? <Markdown md={m.answer} /> : <p>{m.text}</p>}
                {m.error && (
                  <p className="hb-fallback">You can also browse the <a href={STUDY_URL} target="_blank" rel="noopener noreferrer">study notes</a>.</p>
                )}
                {m.citations && m.citations.length > 0 && (
                  <div className="hb-cites">
                    <span>Read more</span>
                    {m.citations.map((c, k) =>
                      c.url ? (
                        <a key={k} href={docsUrl(c.url)} target="_blank" rel="noopener noreferrer">{c.label} {"↗"}</a>
                      ) : (
                        <span key={k}>{c.label}</span>
                      ),
                    )}
                  </div>
                )}
              </div>
            ))}
            {busy && <div className="hb-msg hb-bot hb-thinking"><p>Thinking{"…"}</p></div>}
          </div>
          <form className="hb-form" onSubmit={onSubmit}>
            <input ref={inputRef} className="input" type="text" autoComplete="off" maxLength={800} aria-label="Your question"
              placeholder="e.g. How do I improve my readiness?" value={text} onChange={(e) => setText(e.target.value)} />
            <button type="submit" className="btn btn-primary" disabled={busy || !text.trim()}>Send</button>
          </form>
        </section>
      )}
      <button type="button" className="hb-fab" aria-expanded={open} onClick={() => setOpen((o) => !o)}>
        {open ? "Close" : "💬 Help"}
      </button>
    </div>
  );
}
