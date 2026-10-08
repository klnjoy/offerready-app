/* OfferReady Help — the in-product assistant.
 *
 * Streams answers from /api/ask (Server-Sent Events) with a caret and a Stop
 * button, remembers the conversation for the browser session, knows which
 * screen and job the user is on, and ends each answer with follow-up chips,
 * "take me there" buttons, Read more links, copy and feedback.
 *
 * Answers are rendered as React elements from a small Markdown subset, never
 * as raw HTML. */

import {
  Fragment, useCallback, useEffect, useMemo, useRef, useState,
  type ChangeEvent, type FormEvent, type KeyboardEvent, type ReactNode,
} from "react";
import { API_ENABLED, STUDY_URL, docsUrl } from "../config";
import * as api from "../lib/api";
import { buildAppContext, contextLabel, readJobContext, startersFor } from "../lib/helpContext";
import { useLocation, useNavigate } from "../lib/router";
import { readJSON, writeJSON } from "../lib/storage";

const SESSION_KEY = "offerready.help.v2";
const FEEDBACK_KEY = "offerready.help.feedback.v1";
const MAX_CHARS = 800;
const HISTORY_TURNS = 8;
const MAX_STORED_MSGS = 40;

interface Citation { label: string; url: string }

interface Msg {
  id: string;
  role: "user" | "assistant";
  content: string;
  citations?: Citation[];
  actions?: api.HelpAction[];
  followups?: string[];
  error?: boolean;
  streaming?: boolean;
  stopped?: boolean;
  /** For assistant messages: the question it answers (for feedback). */
  q?: string;
  vote?: "up" | "down";
}

interface Saved { v: 2; msgs: Msg[]; open?: boolean; wide?: boolean }

// ---- session persistence --------------------------------------------------

function loadSession(): Saved {
  try {
    const raw = sessionStorage.getItem(SESSION_KEY);
    if (raw) {
      const s = JSON.parse(raw) as Saved;
      if (s && s.v === 2 && Array.isArray(s.msgs)) {
        // A reload mid-answer leaves a partial message: mark it stopped.
        s.msgs = s.msgs
          .filter((m) => m && (m.role === "user" || m.role === "assistant") && typeof m.content === "string")
          .map((m) => (m.streaming ? { ...m, streaming: false, stopped: true } : m));
        return s;
      }
    }
  } catch {
    /* blocked or corrupt — start fresh */
  }
  return { v: 2, msgs: [] };
}

function saveSession(s: Saved) {
  try {
    sessionStorage.setItem(SESSION_KEY, JSON.stringify({ ...s, msgs: s.msgs.slice(-MAX_STORED_MSGS) }));
  } catch {
    /* non-fatal */
  }
}

const uid = () => Math.random().toString(36).slice(2, 10) + Date.now().toString(36);

function normalizeCitations(list: api.HelpExtras["citations"]): Citation[] {
  return (list || [])
    .map((c) => (typeof c === "string" ? { label: c, url: "" } : { label: c?.label || c?.url || "", url: c?.url || "" }))
    .filter((c) => c.label)
    .slice(0, 2);
}

function normalizeActions(list: api.HelpExtras["actions"]): api.HelpAction[] {
  return (list || [])
    .filter((a) => a && typeof a.label === "string" && typeof a.route === "string" && a.route.startsWith("/"))
    .slice(0, 2);
}

function normalizeFollowups(list: api.HelpExtras["followups"]): string[] {
  return (list || []).filter((f) => typeof f === "string" && f.trim()).map((f) => f.trim().slice(0, 80)).slice(0, 3);
}

function errorText(status: number, error?: string): string {
  if (status === 0) return "Couldn’t reach the assistant. Check your connection and try again.";
  if (status === 503) return "The assistant isn’t enabled right now.";
  return error || "The assistant had a problem. Please try again.";
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

/** `tail` (the streaming caret) is placed at the end of the last text block. */
function Markdown({ md, tail }: { md: string; tail?: ReactNode }) {
  const lines = md.replace(/```[\s\S]*?(```|$)/g, "").split("\n");
  type Block =
    | { k: "h"; text: string }
    | { k: "p"; text: string }
    | { k: "list"; ordered: boolean; items: string[] }
    | { k: "table"; head: string[]; rows: string[][] };
  const blocks: Block[] = [];
  let i = 0;
  const cells = (r: string) => r.replace(/^\|/, "").replace(/\|$/, "").split("|").map((c) => c.trim());
  while (i < lines.length) {
    const raw = lines[i].trim();
    if (!raw) { i++; continue; }
    const h = raw.match(/^(#{1,6})\s+(.*)$/);
    if (h || /^\*\*[^*]+\*\*$/.test(raw)) {
      blocks.push({ k: "h", text: h ? h[2] : raw });
      i++;
      continue;
    }
    if (raw.includes("|") && i + 1 < lines.length && /^\s*\|?[\s:|-]+\|?\s*$/.test(lines[i + 1]) && lines[i + 1].includes("-")) {
      const head = cells(raw);
      const rows: string[][] = [];
      i += 2;
      while (i < lines.length && lines[i].includes("|") && lines[i].trim()) rows.push(cells(lines[i++].trim()));
      blocks.push({ k: "table", head, rows });
      continue;
    }
    if (/^[-*]\s+/.test(raw) || /^\d+\.\s+/.test(raw)) {
      const ordered = /^\d+\./.test(raw);
      const re = ordered ? /^\s*\d+\.\s+/ : /^\s*[-*]\s+/;
      const items: string[] = [];
      while (i < lines.length && re.test(lines[i])) items.push(lines[i++].replace(re, ""));
      blocks.push({ k: "list", ordered, items });
      continue;
    }
    const para: string[] = [];
    while (i < lines.length && lines[i].trim() && !/^(#{1,6}\s|[-*]\s|\d+\.\s)/.test(lines[i].trim()) && !lines[i].includes("|")) {
      para.push(lines[i++].trim());
    }
    if (para.length) blocks.push({ k: "p", text: para.join(" ") });
    else { blocks.push({ k: "p", text: raw }); i++; }
  }
  const last = blocks.length - 1;
  const out = blocks.map((b, n) => {
    const t = n === last ? tail : null;
    if (b.k === "h") return <h4 key={n} className="hb-h"><Inline text={b.text} />{t}</h4>;
    if (b.k === "p") return <p key={n}><Inline text={b.text} />{t}</p>;
    if (b.k === "list") {
      const List = b.ordered ? "ol" : "ul";
      return (
        <List key={n}>
          {b.items.map((it, k) => <li key={k}><Inline text={it} />{k === b.items.length - 1 ? t : null}</li>)}
        </List>
      );
    }
    return (
      <Fragment key={n}>
        <div className="table-wrap">
          <table>
            <thead><tr>{b.head.map((c, k) => <th key={k}><Inline text={c} /></th>)}</tr></thead>
            <tbody>{b.rows.map((r, k) => <tr key={k}>{r.map((c, j) => <td key={j}><Inline text={c} /></td>)}</tr>)}</tbody>
          </table>
        </div>
        {t}
      </Fragment>
    );
  });
  return <>{out.length ? out : tail ? <p>{tail}</p> : null}</>;
}

// ---- icons ------------------------------------------------------------------

const Icon = {
  chat: (
    <svg viewBox="0 0 24 24" width="18" height="18" aria-hidden="true" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
      <path d="M4 5.5A2.5 2.5 0 0 1 6.5 3h11A2.5 2.5 0 0 1 20 5.5v8a2.5 2.5 0 0 1-2.5 2.5H10l-4.5 4v-4h0A2.5 2.5 0 0 1 4 13.5z" />
      <path d="M8.5 9.5h7M8.5 12.5h4" />
    </svg>
  ),
  close: (
    <svg viewBox="0 0 24 24" width="16" height="16" aria-hidden="true" fill="none" stroke="currentColor" strokeWidth="2.2" strokeLinecap="round"><path d="M6 6l12 12M18 6L6 18" /></svg>
  ),
  expand: (
    <svg viewBox="0 0 24 24" width="16" height="16" aria-hidden="true" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round"><path d="M14 4h6v6M10 20H4v-6M20 4l-7 7M4 20l7-7" /></svg>
  ),
  collapse: (
    <svg viewBox="0 0 24 24" width="16" height="16" aria-hidden="true" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round"><path d="M20 10h-6V4M4 14h6v6M14 10l7-7M10 14l-7 7" /></svg>
  ),
  plus: (
    <svg viewBox="0 0 24 24" width="15" height="15" aria-hidden="true" fill="none" stroke="currentColor" strokeWidth="2.2" strokeLinecap="round"><path d="M12 5v14M5 12h14" /></svg>
  ),
  send: (
    <svg viewBox="0 0 24 24" width="17" height="17" aria-hidden="true" fill="none" stroke="currentColor" strokeWidth="2.2" strokeLinecap="round" strokeLinejoin="round"><path d="M5 12h13M13 6l6 6-6 6" /></svg>
  ),
  stop: (
    <svg viewBox="0 0 24 24" width="14" height="14" aria-hidden="true" fill="currentColor"><rect x="6" y="6" width="12" height="12" rx="2" /></svg>
  ),
  arrow: (
    <svg viewBox="0 0 24 24" width="14" height="14" aria-hidden="true" fill="none" stroke="currentColor" strokeWidth="2.2" strokeLinecap="round" strokeLinejoin="round"><path d="M5 12h13M13 6l6 6-6 6" /></svg>
  ),
  copy: (
    <svg viewBox="0 0 24 24" width="14" height="14" aria-hidden="true" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round"><rect x="9" y="9" width="11" height="11" rx="2" /><path d="M5 15V6a2 2 0 0 1 2-2h9" /></svg>
  ),
  up: (
    <svg viewBox="0 0 24 24" width="14" height="14" aria-hidden="true" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round"><path d="M7 10v10H4V10zM7 10l4-7a2 2 0 0 1 3 2l-1 5h6a2 2 0 0 1 2 2.3l-1.3 6A2 2 0 0 1 17.7 20H7" /></svg>
  ),
  down: (
    <svg viewBox="0 0 24 24" width="14" height="14" aria-hidden="true" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round"><path d="M7 14V4H4v10zM7 14l4 7a2 2 0 0 0 3-2l-1-5h6a2 2 0 0 0 2-2.3l-1.3-6A2 2 0 0 0 17.7 4H7" /></svg>
  ),
};

// ---- widget -----------------------------------------------------------------

export function HelpBot() {
  const { pathname } = useLocation();
  const navigate = useNavigate();
  const initial = useMemo(loadSession, []);
  const [open, setOpen] = useState(!!initial.open);
  const [wide, setWide] = useState(!!initial.wide);
  const [msgs, setMsgs] = useState<Msg[]>(initial.msgs);
  const [areas, setAreas] = useState<string[]>([]);
  const [area, setArea] = useState("all");
  const [text, setText] = useState("");
  const [announce, setAnnounce] = useState("");
  const [copied, setCopied] = useState("");
  const inputRef = useRef<HTMLTextAreaElement>(null);
  const logRef = useRef<HTMLDivElement>(null);
  const fabRef = useRef<HTMLButtonElement>(null);
  const abortRef = useRef<AbortController | null>(null);
  const pending = useRef("");
  const raf = useRef(0);
  const loadedAreas = useRef(false);
  const stickToBottom = useRef(true);
  const wasOpen = useRef(open);

  const busy = msgs.some((m) => m.streaming);

  // Re-read cached job data whenever the screen changes (cheap: localStorage).
  const job = useMemo(() => readJobContext(), [pathname, open]); // eslint-disable-line react-hooks/exhaustive-deps
  const pill = contextLabel(pathname, job);
  const starters = startersFor(pathname, job);

  useEffect(() => {
    saveSession({ v: 2, msgs: msgs.filter((m) => !m.streaming || m.content), open, wide });
  }, [msgs, open, wide]);

  // Open: focus the input, load topic areas once. Close: focus back to launcher.
  useEffect(() => {
    if (open) {
      setTimeout(() => inputRef.current?.focus(), 30);
      if (!loadedAreas.current && API_ENABLED) {
        loadedAreas.current = true;
        api.listHelpAreas().then((r) => {
          if (r.status === 200 && Array.isArray(r.body?.areas)) setAreas(r.body!.areas.filter((a) => a !== "all"));
        });
      }
    } else if (wasOpen.current) {
      fabRef.current?.focus();
    }
    wasOpen.current = open;
  }, [open]);

  // Escape closes from anywhere while open.
  useEffect(() => {
    if (!open) return;
    const onKey = (e: { key: string }) => { if (e.key === "Escape") setOpen(false); };
    document.addEventListener("keydown", onKey);
    return () => document.removeEventListener("keydown", onKey);
  }, [open]);

  // Keep the log pinned to the bottom unless the user scrolled up to read.
  useEffect(() => {
    const el = logRef.current;
    if (el && stickToBottom.current) el.scrollTop = el.scrollHeight;
  }, [msgs, open]);
  const onScroll = () => {
    const el = logRef.current;
    if (el) stickToBottom.current = el.scrollHeight - el.scrollTop - el.clientHeight < 40;
  };

  // Grow the textarea with its content (up to the CSS max-height).
  useEffect(() => {
    const el = inputRef.current;
    if (!el) return;
    el.style.height = "auto";
    el.style.height = Math.min(el.scrollHeight, 140) + "px";
  }, [text, open]);

  // Abort any in-flight stream on unmount.
  useEffect(() => () => abortRef.current?.abort(), []);

  const patch = useCallback((id: string, p: Partial<Msg> | ((m: Msg) => Partial<Msg>)) => {
    setMsgs((list) => list.map((m) => (m.id === id ? { ...m, ...(typeof p === "function" ? p(m) : p) } : m)));
  }, []);

  const flush = useCallback((id: string) => {
    raf.current = 0;
    const chunk = pending.current;
    pending.current = "";
    if (chunk) patch(id, (m) => ({ content: m.content + chunk }));
  }, [patch]);

  const ask = async (q: string) => {
    const question = q.trim().slice(0, MAX_CHARS);
    if (!question || busy) return;
    const history: api.HelpTurn[] = msgs
      .filter((m) => !m.error && m.content.trim())
      .slice(-HISTORY_TURNS)
      .map((m) => ({ role: m.role, content: m.content.slice(0, 2000) }));
    const botId = uid();
    stickToBottom.current = true;
    setText("");
    setMsgs((m) => [...m, { id: uid(), role: "user", content: question }]);
    if (!API_ENABLED) {
      setMsgs((m) => [...m, { id: botId, role: "assistant", error: true, content: "The assistant isn’t enabled on this site yet." }]);
      return;
    }
    setMsgs((m) => [...m, { id: botId, role: "assistant", content: "", streaming: true, q: question }]);

    const req: api.HelpRequest = { question, area, history, context: buildAppContext(pathname, job) };
    const ctrl = new AbortController();
    abortRef.current = ctrl;
    pending.current = "";
    let full = "";
    const out = await api.streamHelp(req, (t) => {
      full += t;
      pending.current += t;
      if (!raf.current) raf.current = requestAnimationFrame(() => flush(botId));
    }, ctrl.signal);
    if (raf.current) cancelAnimationFrame(raf.current);
    flush(botId);
    abortRef.current = null;

    if (out.kind === "done") {
      const m: Partial<Msg> = {
        streaming: false,
        citations: normalizeCitations(out.extras.citations),
        actions: normalizeActions(out.extras.actions),
        followups: normalizeFollowups(out.extras.followups),
      };
      patch(botId, (cur) => ({ ...m, content: cur.content.trimEnd() }));
      setAnnounce(full.trim().slice(0, 600));
    } else if (out.kind === "aborted") {
      patch(botId, (cur) => ({ streaming: false, stopped: true, content: cur.content.trimEnd() }));
    } else if (out.gotDelta) {
      patch(botId, (cur) => ({ streaming: false, stopped: true, content: cur.content.trimEnd() + "\n\n*The answer was interrupted. Please try again.*" }));
    } else if (out.status === 0 || out.status === 200 || out.status === 502 || out.status === 504) {
      // Stream never got going: one plain request instead.
      const res = await api.askHelp(question, area, { history: req.history, context: req.context });
      if (res.status === 200 && res.body?.answer) {
        patch(botId, {
          streaming: false,
          content: res.body.answer.trim(),
          citations: normalizeCitations(res.body.citations),
          actions: normalizeActions(res.body.actions),
          followups: normalizeFollowups(res.body.followups),
        });
        setAnnounce(res.body.answer.slice(0, 600));
      } else {
        patch(botId, { streaming: false, error: true, content: errorText(res.status, res.body?.error) });
      }
    } else {
      patch(botId, { streaming: false, error: true, content: errorText(out.status, out.error) });
    }
    setTimeout(() => inputRef.current?.focus(), 30);
  };

  const stop = () => abortRef.current?.abort();

  const newChat = () => {
    abortRef.current?.abort();
    setMsgs([]);
    setText("");
    setAnnounce("");
    setTimeout(() => inputRef.current?.focus(), 30);
  };

  const onSubmit = (e: FormEvent) => {
    e.preventDefault();
    ask(text);
  };
  const onInputKey = (e: KeyboardEvent<HTMLTextAreaElement>) => {
    if (e.key === "Enter" && !e.shiftKey && !e.nativeEvent.isComposing) {
      e.preventDefault();
      ask(text);
    }
  };

  const go = (route: string) => {
    navigate(route);
    if (window.matchMedia && window.matchMedia("(max-width: 639px)").matches) setOpen(false);
  };

  const copy = async (m: Msg) => {
    try {
      await navigator.clipboard.writeText(m.content);
    } catch {
      const ta = document.createElement("textarea");
      ta.value = m.content;
      document.body.appendChild(ta);
      ta.select();
      try { document.execCommand("copy"); } catch { /* ignore */ }
      ta.remove();
    }
    setCopied(m.id);
    setTimeout(() => setCopied((c) => (c === m.id ? "" : c)), 1600);
  };

  const vote = (m: Msg, v: "up" | "down") => {
    patch(m.id, { vote: v });
    const log = readJSON<{ q: string; vote: string; route: string; at: number }[]>(FEEDBACK_KEY, []);
    log.unshift({ q: (m.q || "").slice(0, 200), vote: v, route: pathname, at: Date.now() });
    writeJSON(FEEDBACK_KEY, log.slice(0, 50));
  };

  const caret = <span className="hb-caret" aria-hidden="true" />;
  const lastBot = [...msgs].reverse().find((m) => m.role === "assistant");

  return (
    <div className={"hb no-print" + (open ? " hb-is-open" : "")}>
      {open && (
        <section className={"hb-panel" + (wide ? " hb-panel--wide" : "")} role="dialog" aria-modal="false" aria-labelledby="hb-title">
          <header className="hb-head">
            <div className="hb-head-top">
              <div className="hb-title-row">
                <span className="hb-mark" aria-hidden="true">{Icon.chat}</span>
                <h2 id="hb-title">OfferReady Help</h2>
              </div>
              <div className="hb-tools">
                <button type="button" className="hb-tool hb-new" onClick={newChat} disabled={!msgs.length} title="Start a new chat">
                  {Icon.plus}<span>New chat</span>
                </button>
                <button type="button" className="hb-tool hb-expand" onClick={() => setWide((w) => !w)}
                  aria-pressed={wide} aria-label={wide ? "Use a smaller panel" : "Use a larger panel"} title={wide ? "Smaller" : "Larger"}>
                  {wide ? Icon.collapse : Icon.expand}
                </button>
                <button type="button" className="hb-tool hb-close" aria-label="Close help" onClick={() => setOpen(false)}>{Icon.close}</button>
              </div>
            </div>
            <p className="hb-pill" title={pill}><span className="hb-pill-dot" aria-hidden="true" /><span className="hb-pill-text">On: {pill}</span></p>
          </header>

          <div className="hb-log" ref={logRef} role="log" aria-label="Conversation" onScroll={onScroll}>
            {msgs.length === 0 && (
              <div className="hb-welcome">
                <p className="hb-welcome-title">How can I help?</p>
                <p>Ask about this screen, your job, or any interview topic. Answers stream in as they{"’"}re written.</p>
                {areas.length > 0 && (
                  <label className="hb-area">
                    <span>Topic</span>
                    <select className="input" value={area} onChange={(e: ChangeEvent<HTMLSelectElement>) => setArea(e.target.value)}>
                      <option value="all">All topics</option>
                      {areas.map((a) => <option key={a} value={a}>{a.replace(/-/g, " ")}</option>)}
                    </select>
                  </label>
                )}
                <div className="hb-starters" role="group" aria-label="Suggested questions">
                  {starters.map((s) => (
                    <button key={s} type="button" className="hb-starter" onClick={() => ask(s)}>
                      <span>{s}</span>{Icon.arrow}
                    </button>
                  ))}
                </div>
              </div>
            )}

            {msgs.map((m) =>
              m.role === "user" ? (
                <div key={m.id} className="hb-msg hb-user"><p>{m.content}</p></div>
              ) : (
                <div key={m.id} className={"hb-msg hb-bot" + (m.error ? " hb-err" : "") + (m.streaming ? " hb-streaming" : "")} aria-busy={m.streaming || undefined}>
                  {m.error ? (
                    <>
                      <p>{m.content}</p>
                      <p className="hb-fallback">You can also browse the <a href={STUDY_URL} target="_blank" rel="noopener noreferrer">study notes</a>.</p>
                    </>
                  ) : m.streaming && !m.content ? (
                    <p className="hb-typing" aria-label="Writing an answer"><span /><span /><span /></p>
                  ) : (
                    <Markdown md={m.content} tail={m.streaming ? caret : undefined} />
                  )}
                  {m.stopped && !m.error && <p className="hb-note">Stopped.</p>}

                  {!m.streaming && !m.error && m.content && (
                    <>
                      {m.actions && m.actions.length > 0 && (
                        <div className="hb-actions">
                          {m.actions.map((a) => (
                            <button key={a.route} type="button" className="hb-action" onClick={() => go(a.route)}>
                              {a.label}{Icon.arrow}
                            </button>
                          ))}
                        </div>
                      )}
                      {m.citations && m.citations.length > 0 && (
                        <div className="hb-cites">
                          <span>Read more</span>
                          {m.citations.map((c, k) =>
                            c.url ? (
                              <a key={k} href={docsUrl(c.url)} target="_blank" rel="noopener noreferrer">{c.label} <span aria-hidden="true">{"↗"}</span></a>
                            ) : (
                              <span key={k}>{c.label}</span>
                            ),
                          )}
                        </div>
                      )}
                      <div className="hb-meta">
                        <button type="button" className="hb-mini" onClick={() => copy(m)} aria-label="Copy answer">
                          {Icon.copy}<span>{copied === m.id ? "Copied" : "Copy"}</span>
                        </button>
                        {m.vote ? (
                          <span className="hb-thanks" role="status">Thanks for the feedback</span>
                        ) : (
                          <>
                            <button type="button" className="hb-mini hb-vote" onClick={() => vote(m, "up")} aria-label="Helpful">{Icon.up}</button>
                            <button type="button" className="hb-mini hb-vote" onClick={() => vote(m, "down")} aria-label="Not helpful">{Icon.down}</button>
                          </>
                        )}
                      </div>
                      {m === lastBot && m.followups && m.followups.length > 0 && (
                        <div className="hb-followups" role="group" aria-label="Follow-up questions">
                          {m.followups.map((f) => (
                            <button key={f} type="button" className="hb-follow" onClick={() => ask(f)} disabled={busy}>{f}</button>
                          ))}
                        </div>
                      )}
                    </>
                  )}
                </div>
              ),
            )}
          </div>
          <div className="hb-sr" aria-live="polite" aria-atomic="true">{announce}</div>

          <form className="hb-form" onSubmit={onSubmit}>
            <div className="hb-field">
              <textarea ref={inputRef} className="hb-input" rows={1} maxLength={MAX_CHARS} aria-label="Your question"
                placeholder={job?.title ? `Ask about ${job.title} or this screen…` : "Ask about this screen or any interview topic…"}
                value={text} onChange={(e: ChangeEvent<HTMLTextAreaElement>) => setText(e.target.value)} onKeyDown={onInputKey} />
              {text.length > MAX_CHARS - 200 && <span className="hb-count" aria-live="polite">{text.length}/{MAX_CHARS}</span>}
            </div>
            {busy ? (
              <button type="button" className="hb-send hb-stop" onClick={stop} aria-label="Stop generating">{Icon.stop}<span>Stop</span></button>
            ) : (
              <button type="submit" className="hb-send" disabled={!text.trim()} aria-label="Send">{Icon.send}</button>
            )}
          </form>
          <p className="hb-foot">Enter to send · Shift+Enter for a new line</p>
        </section>
      )}
      <button ref={fabRef} type="button" className="hb-fab" aria-expanded={open} aria-haspopup="dialog" onClick={() => setOpen((o) => !o)}>
        {open ? Icon.close : Icon.chat}<span>{open ? "Close" : "Ask OfferReady"}</span>
      </button>
    </div>
  );
}
