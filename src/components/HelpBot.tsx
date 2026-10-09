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
import { KEYS, onDataChanged, readJSON, readString, writeJSON, writeString } from "../lib/storage";
import { TOPIC_GROUPS, effectiveTopic, topicLabel } from "../lib/helpTopics";

const SESSION_KEY = "offerready.help.v2"; // legacy single chat, imported once
const STORE_KEY = KEYS.helpChats; // all chats (follows the account when signed in, lib/sync.ts)
const UI_KEY = "offerready.help.ui.v1"; // panel open/size (this tab)
const FEEDBACK_KEY = "offerready.help.feedback.v1";
const MAX_CHARS = 800;
const HISTORY_TURNS = 8;
const MAX_STORED_MSGS = 40;
const MAX_CHATS = 20;

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

interface Chat { id: string; title: string; area: string; updatedAt: number; msgs: Msg[] }
interface Store { activeId: string; chats: Chat[] }

// ---- persistence: chats in localStorage, panel state per tab ---------------

function cleanMsgs(list: unknown): Msg[] {
  return (Array.isArray(list) ? (list as Msg[]) : [])
    .filter((m) => m && (m.role === "user" || m.role === "assistant") && typeof m.content === "string")
    .map((m) => (m.streaming ? { ...m, streaming: false, stopped: true } : m));
}

function titleFor(msgs: Msg[]): string {
  const first = msgs.find((m) => m.role === "user");
  const t = first ? first.content.replace(/\s+/g, " ").trim() : "";
  return t.length > 60 ? t.slice(0, 57) + "…" : t;
}

function newChat(area = "auto"): Chat {
  return { id: uid(), title: "", area, updatedAt: Date.now(), msgs: [] };
}

function loadStore(): Store {
  let s: Store | null = null;
  try {
    const raw = JSON.parse(readString(STORE_KEY) || "null") as { v?: number; activeId?: string; chats?: Chat[] } | null;
    if (raw && raw.v === 1 && Array.isArray(raw.chats)) {
      s = {
        activeId: raw.activeId || "",
        chats: raw.chats.filter((c) => c && c.id).map((c) => ({ ...c, title: c.title || "", area: c.area || "auto", msgs: cleanMsgs(c.msgs) })),
      };
    }
  } catch {
    s = null;
  }
  if (!s) {
    s = { activeId: "", chats: [] };
    try {
      const old = JSON.parse(sessionStorage.getItem(SESSION_KEY) || "null") as { msgs?: Msg[] } | null;
      if (old && Array.isArray(old.msgs) && old.msgs.length) {
        const c = newChat();
        c.msgs = cleanMsgs(old.msgs);
        c.title = titleFor(c.msgs);
        s.chats.push(c);
      }
    } catch {
      /* ignore */
    }
  }
  if (!s.chats.some((c) => c.id === s!.activeId)) {
    const empty = s.chats.find((c) => !c.msgs.length);
    if (empty) s.activeId = empty.id;
    else {
      const c = newChat();
      s.chats.unshift(c);
      s.activeId = c.id;
    }
  }
  return s;
}

function saveStore(s: Store) {
  try {
    const chats = [...s.chats]
      .sort((a, b) => b.updatedAt - a.updatedAt)
      .filter((c) => c.msgs.length || c.id === s.activeId)
      .slice(0, MAX_CHATS)
      .map((c) => ({ ...c, msgs: c.msgs.filter((m) => !m.streaming || m.content).slice(-MAX_STORED_MSGS) }));
    writeString(STORE_KEY, JSON.stringify({ v: 1, activeId: s.activeId, chats }));
  } catch {
    /* non-fatal */
  }
}

function loadUi(): { open: boolean; wide: boolean } {
  try {
    const ui = JSON.parse(sessionStorage.getItem(UI_KEY) || "null") as { open?: boolean; wide?: boolean } | null;
    if (ui) return { open: !!ui.open, wide: !!ui.wide };
    const old = JSON.parse(sessionStorage.getItem(SESSION_KEY) || "null") as { open?: boolean; wide?: boolean } | null;
    if (old) return { open: !!old.open, wide: !!old.wide };
  } catch {
    /* ignore */
  }
  return { open: false, wide: false };
}

function ago(t: number): string {
  const s = Math.max(0, Math.round((Date.now() - t) / 1000));
  if (s < 60) return "just now";
  if (s < 3600) return Math.round(s / 60) + " min ago";
  if (s < 86400) return Math.round(s / 3600) + " h ago";
  const d = Math.round(s / 86400);
  return d === 1 ? "yesterday" : d + " days ago";
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
  history: (
    <svg viewBox="0 0 24 24" width="16" height="16" aria-hidden="true" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round"><path d="M3 12a9 9 0 1 0 3-6.7L3 8" /><path d="M3 3v5h5M12 7v5l3 2" /></svg>
  ),
  trash: (
    <svg viewBox="0 0 24 24" width="14" height="14" aria-hidden="true" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round"><path d="M4 7h16M10 11v6M14 11v6M6 7l1 12a2 2 0 0 0 2 2h6a2 2 0 0 0 2-2l1-12M9 7V4h6v3" /></svg>
  ),
  back: (
    <svg viewBox="0 0 24 24" width="15" height="15" aria-hidden="true" fill="none" stroke="currentColor" strokeWidth="2.2" strokeLinecap="round" strokeLinejoin="round"><path d="M19 12H6M11 6l-6 6 6 6" /></svg>
  ),
  down: (
    <svg viewBox="0 0 24 24" width="14" height="14" aria-hidden="true" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round"><path d="M7 14V4H4v10zM7 14l4 7a2 2 0 0 0 3-2l-1-5h6a2 2 0 0 0 2-2.3l-1.3-6A2 2 0 0 0 17.7 4H7" /></svg>
  ),
};


// ---- widget -----------------------------------------------------------------

export function HelpBot() {
  const { pathname } = useLocation();
  const navigate = useNavigate();
  const ui0 = useMemo(loadUi, []);
  const [open, setOpen] = useState(ui0.open);
  const [wide, setWide] = useState(ui0.wide);
  const [store, setStore] = useState<Store>(loadStore);
  const [view, setView] = useState<"chat" | "history">("chat");
  const [running, setRunning] = useState<string[]>([]); // chat ids with an answer streaming
  const [text, setText] = useState("");
  const [announce, setAnnounce] = useState("");
  const [copied, setCopied] = useState("");
  const inputRef = useRef<HTMLTextAreaElement>(null);
  const logRef = useRef<HTMLDivElement>(null);
  const fabRef = useRef<HTMLButtonElement>(null);
  const controllers = useRef<Record<string, AbortController>>({});
  const pending = useRef<Record<string, string>>({});
  const frames = useRef<Record<string, number>>({});
  const stickToBottom = useRef(true);
  const wasOpen = useRef(open);
  const activeRef = useRef(store.activeId);
  activeRef.current = store.activeId;

  const chat = store.chats.find((c) => c.id === store.activeId) || store.chats[0];
  const msgs = chat ? chat.msgs : [];
  const busy = !!chat && running.includes(chat.id);
  const savedChats = [...store.chats].filter((c) => c.msgs.length).sort((a, b) => b.updatedAt - a.updatedAt);

  // Re-read cached job data whenever the screen changes (cheap: localStorage).
  const job = useMemo(() => readJobContext(), [pathname, open]); // eslint-disable-line react-hooks/exhaustive-deps
  const pill = contextLabel(pathname, job);
  const starters = startersFor(pathname, job);

  useEffect(() => { saveStore(store); }, [store]);
  useEffect(() => {
    try { sessionStorage.setItem(UI_KEY, JSON.stringify({ open, wide })); } catch { /* ignore */ }
  }, [open, wide]);

  // Another tab saved chats: pick them up unless this tab is mid-answer.
  useEffect(() => {
    const onStorage = (e: StorageEvent) => {
      if (e.key !== STORE_KEY || Object.keys(controllers.current).length) return;
      const next = loadStore();
      if (next.chats.some((c) => c.id === activeRef.current)) next.activeId = activeRef.current;
      setStore(next);
    };
    window.addEventListener("storage", onStorage);
    // Account sync brought chats from another device.
    const off = onDataChanged([STORE_KEY], () => onStorage({ key: STORE_KEY } as StorageEvent));
    return () => { window.removeEventListener("storage", onStorage); off(); };
  }, []);

  // Open: focus the input. Close: focus back to the launcher.
  useEffect(() => {
    if (open) inputRef.current?.focus(); // the panel mounted in this commit
    else if (wasOpen.current) fabRef.current?.focus();
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
  }, [msgs, open, view]);
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
  }, [text, open, view]);

  // Abort any in-flight answers on unmount.
  useEffect(() => () => Object.values(controllers.current).forEach((c) => c.abort()), []);

  const updateChat = useCallback((chatId: string, fn: (c: Chat) => Chat) => {
    setStore((s) => ({ ...s, chats: s.chats.map((c) => (c.id === chatId ? fn(c) : c)) }));
  }, []);

  const patch = useCallback((chatId: string, id: string, p: Partial<Msg> | ((m: Msg) => Partial<Msg>)) => {
    updateChat(chatId, (c) => ({
      ...c,
      msgs: c.msgs.map((m) => (m.id === id ? { ...m, ...(typeof p === "function" ? p(m) : p) } : m)),
    }));
  }, [updateChat]);

  const flush = useCallback((chatId: string, id: string) => {
    delete frames.current[chatId];
    const chunk = pending.current[chatId] || "";
    pending.current[chatId] = "";
    if (chunk) patch(chatId, id, (m) => ({ content: m.content + chunk }));
  }, [patch]);

  const setRun = (chatId: string, on: boolean) =>
    setRunning((r) => (on ? (r.includes(chatId) ? r : [...r, chatId]) : r.filter((x) => x !== chatId)));

  const ask = async (q: string) => {
    const question = q.trim().slice(0, MAX_CHARS);
    if (!chat || !question || busy) return;
    const chatId = chat.id;
    const area = effectiveTopic(chat.area);
    const history: api.HelpTurn[] = chat.msgs
      .filter((m) => !m.error && m.content.trim())
      .slice(-HISTORY_TURNS)
      .map((m) => ({ role: m.role, content: m.content.slice(0, 2000) }));
    const botId = uid();
    const visible = () => activeRef.current === chatId;
    stickToBottom.current = true;
    setText("");
    setView("chat");
    const userMsg: Msg = { id: uid(), role: "user", content: question };
    if (!API_ENABLED) {
      updateChat(chatId, (c) => ({
        ...c, updatedAt: Date.now(), title: c.title || titleFor([userMsg]),
        msgs: [...c.msgs, userMsg, { id: botId, role: "assistant", error: true, content: "The assistant isn’t enabled on this site yet." }],
      }));
      return;
    }
    updateChat(chatId, (c) => ({
      ...c, updatedAt: Date.now(), title: c.title || titleFor([userMsg]),
      msgs: [...c.msgs, userMsg, { id: botId, role: "assistant", content: "", streaming: true, q: question }],
    }));

    const req: api.HelpRequest = { question, area, history, context: buildAppContext(pathname, job) };
    const ctrl = new AbortController();
    controllers.current[chatId] = ctrl;
    setRun(chatId, true);
    pending.current[chatId] = "";
    let full = "";
    const out = await api.streamHelp(req, (t) => {
      full += t;
      pending.current[chatId] = (pending.current[chatId] || "") + t;
      if (!frames.current[chatId]) frames.current[chatId] = requestAnimationFrame(() => flush(chatId, botId));
    }, ctrl.signal);
    if (frames.current[chatId]) cancelAnimationFrame(frames.current[chatId]);
    flush(chatId, botId);

    if (out.kind === "done") {
      patch(chatId, botId, (cur) => ({
        streaming: false,
        content: cur.content.trimEnd(),
        citations: normalizeCitations(out.extras.citations),
        actions: normalizeActions(out.extras.actions),
        followups: normalizeFollowups(out.extras.followups),
      }));
      if (visible()) setAnnounce(full.trim().slice(0, 600));
    } else if (out.kind === "aborted") {
      patch(chatId, botId, (cur) => ({ streaming: false, stopped: true, content: cur.content.trimEnd() }));
    } else if (out.gotDelta) {
      patch(chatId, botId, (cur) => ({ streaming: false, stopped: true, content: cur.content.trimEnd() + "\n\n*The answer was interrupted. Please try again.*" }));
    } else if (out.status === 0 || out.status === 200 || out.status === 502 || out.status === 504) {
      // Stream never got going: one plain request instead.
      const res = await api.askHelp(question, area, { history: req.history, context: req.context });
      if (res.status === 200 && res.body?.answer) {
        patch(chatId, botId, {
          streaming: false,
          content: res.body.answer.trim(),
          citations: normalizeCitations(res.body.citations),
          actions: normalizeActions(res.body.actions),
          followups: normalizeFollowups(res.body.followups),
        });
        if (visible()) setAnnounce(res.body.answer.slice(0, 600));
      } else {
        patch(chatId, botId, { streaming: false, error: true, content: errorText(res.status, res.body?.error) });
      }
    } else {
      patch(chatId, botId, { streaming: false, error: true, content: errorText(out.status, out.error) });
    }
    delete controllers.current[chatId];
    setRun(chatId, false);
    updateChat(chatId, (c) => ({ ...c, updatedAt: Date.now() }));
    if (visible()) setTimeout(() => inputRef.current?.focus(), 30);
  };

  const stop = () => { if (chat) controllers.current[chat.id]?.abort(); };

  // "New" keeps the current chat (and any answer still streaming in it) under Chats.
  const startNewChat = () => {
    setView("chat");
    setText("");
    setAnnounce("");
    if (chat && chat.msgs.length) {
      const c = newChat(chat.area);
      setStore((s) => ({ activeId: c.id, chats: [c, ...s.chats] }));
    }
    stickToBottom.current = true;
    setTimeout(() => inputRef.current?.focus(), 30);
  };

  const openChat = (id: string) => {
    setStore((s) => ({ ...s, activeId: id }));
    setView("chat");
    stickToBottom.current = true;
    setTimeout(() => inputRef.current?.focus(), 30);
  };

  const deleteChat = (id: string) => {
    controllers.current[id]?.abort();
    setStore((s) => {
      const chats = s.chats.filter((c) => c.id !== id);
      if (s.activeId !== id) return { ...s, chats };
      const c = newChat();
      return { activeId: c.id, chats: [c, ...chats] };
    });
  };

  const deleteAll = () => {
    if (!window.confirm("Delete all saved chats on this device?")) return;
    Object.values(controllers.current).forEach((c) => c.abort());
    const c = newChat();
    setStore({ activeId: c.id, chats: [c] });
    setView("chat");
  };

  const setArea = (area: string) => { if (chat) updateChat(chat.id, (c) => ({ ...c, area })); };

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
    if (!chat) return;
    patch(chat.id, m.id, { vote: v });
    const log = readJSON<{ q: string; vote: string; route: string; at: number }[]>(FEEDBACK_KEY, []);
    log.unshift({ q: (m.q || "").slice(0, 200), vote: v, route: pathname, at: Date.now() });
    writeJSON(FEEDBACK_KEY, log.slice(0, 50));
  };

  const caret = <span className="hb-caret" aria-hidden="true" />;
  const lastBot = [...msgs].reverse().find((m) => m.role === "assistant");
  const area = chat?.area || "auto";
  const focusTitle = "Answers focus on: " + (topicLabel(effectiveTopic(area)) || "this screen and your job");

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
                <button type="button" className={"hb-tool hb-hist" + (view === "history" ? " hb-tool--on" : "")} aria-pressed={view === "history"}
                  onClick={() => setView((v) => (v === "history" ? "chat" : "history"))} title="Your chats">
                  {Icon.history}<span className="hb-tool-label">Chats</span>
                  {savedChats.length > 0 && <span className="hb-hist-n">{savedChats.length}</span>}
                </button>
                <button type="button" className="hb-tool hb-new" onClick={startNewChat} disabled={!msgs.length && view === "chat"} title="Start a new chat">
                  {Icon.plus}<span className="hb-tool-label">New</span>
                </button>
                <button type="button" className="hb-tool hb-expand" onClick={() => setWide((w) => !w)}
                  aria-pressed={wide} aria-label={wide ? "Use a smaller panel" : "Use a larger panel"} title={wide ? "Smaller" : "Larger"}>
                  {wide ? Icon.collapse : Icon.expand}
                </button>
                <button type="button" className="hb-tool hb-close" aria-label="Close help" onClick={() => setOpen(false)}>{Icon.close}</button>
              </div>
            </div>
            <div className="hb-subhead">
              <p className="hb-pill" title={pill}><span className="hb-pill-dot" aria-hidden="true" /><span className="hb-pill-text">On: {pill}</span></p>
              <label className="hb-topic" title={focusTitle}>
                <span className="hb-topic-label">Focus</span>
                <select className="hb-topic-select" aria-label="Topic focus" value={area}
                  onChange={(e: ChangeEvent<HTMLSelectElement>) => setArea(e.target.value)}>
                  <option value="auto">Auto · this screen</option>
                  {TOPIC_GROUPS.map((g) => (
                    <optgroup key={g.label} label={g.label}>
                      {g.topics.map((t) => <option key={t.id} value={t.id}>{t.label}</option>)}
                    </optgroup>
                  ))}
                </select>
              </label>
            </div>
          </header>

          <div className="hb-log" ref={logRef} role="log" aria-label={view === "history" ? "Your chats" : "Conversation"} onScroll={onScroll}>
            {view === "history" ? (
              <div className="hb-history">
                <div><button type="button" className="hb-mini hb-back" onClick={() => setView("chat")}>{Icon.back}<span>Back to chat</span></button></div>
                <p className="hb-history-title">Your chats</p>
                {savedChats.length === 0 ? (
                  <p className="hb-note">No chats yet. Your conversations are saved here on this device.</p>
                ) : (
                  <ul className="hb-chats">
                    {savedChats.map((c) => {
                      const n = c.msgs.filter((m) => m.role === "user").length;
                      const live = running.includes(c.id);
                      return (
                        <li key={c.id} className={"hb-chat" + (c.id === store.activeId ? " hb-chat--active" : "")}>
                          <button type="button" className="hb-chat-open" onClick={() => openChat(c.id)}>
                            <span className="hb-chat-title">{c.title || titleFor(c.msgs) || "Untitled chat"}</span>
                            <span className={"hb-chat-meta" + (live ? " hb-chat-live" : "")}>
                              {live ? "Answering… · " : ""}{n} {n === 1 ? "question" : "questions"} · {ago(c.updatedAt)}
                              {c.area && c.area !== "auto" ? " · " + topicLabel(c.area) : ""}
                            </span>
                          </button>
                          <button type="button" className="hb-mini hb-chat-del" aria-label={"Delete chat: " + (c.title || "untitled")} onClick={() => deleteChat(c.id)}>{Icon.trash}</button>
                        </li>
                      );
                    })}
                  </ul>
                )}
                {savedChats.length > 0 && <button type="button" className="hb-mini hb-clear" onClick={deleteAll}>Delete all chats</button>}
              </div>
            ) : (
              <>
                {msgs.length === 0 && (
                  <div className="hb-welcome">
                    <p className="hb-welcome-title">How can I help?</p>
                    <p>Ask about this screen, your job, or any interview topic. Answers stream in as they{"’"}re written.</p>
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
              </>
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
