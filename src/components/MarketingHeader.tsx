/* Home-page header for visitors: a light bar with dropdown menus (Product,
 * Features, For your role, Resources), a Pricing link and the sign-in / start
 * buttons. The app pages keep the dark app bar (App.tsx).
 *
 * Desktop: each menu is a disclosure button that opens a panel of links with
 * one-line descriptions; it opens on click or hover, closes on Escape, an
 * outside click or leaving the menu. Phones: a Menu button opens one panel
 * with every group listed. */

import { useEffect, useRef, useState } from "react";
import { DOCS_BASE, STUDY_URL } from "../config";
import { useAuth } from "../lib/auth";
import { ExternalLink, Link } from "../lib/router";
import { GetAppChip } from "./GetAppChip";
import { Icon, type IconName } from "./Icon";

type Item = { label: string; text: string; icon: IconName; to: string; ext?: boolean };
type Group = { id: string; label: string; items: Item[] };

const D = DOCS_BASE;

const GROUPS: Group[] = [
  { id: "product", label: "Product", items: [
    { label: "How it works", text: "A worked example: one job to a ready date", icon: "list", to: "/example" },
    { label: "Readiness forecast", text: "The day you’ll be ready, checked against your interview", icon: "gauge", to: "/dashboard" },
    { label: "Compare OfferReady", text: "Against chatbots and live interview assistants", icon: "layers", to: D + "Compare/index.html", ext: true },
    { label: "What’s new", text: "The latest features and fixes", icon: "spark", to: D + "Changelog/index.html", ext: true },
  ] },
  { id: "features", label: "Features", items: [
    { label: "Job fit and gaps", text: "Paste a job link; see what it needs and where you stand", icon: "briefcase", to: "/analyze" },
    { label: "AI Interview Coach", text: "Answers built from your resume and stories", icon: "chat", to: "/coach" },
    { label: "Practice", text: "Job questions, trade-off drills, stories and a question bank", icon: "target", to: "/practice" },
    { label: "Mock interview", text: "Voice or text, with follow-ups on what you said", icon: "mic", to: "/mock" },
    { label: "Tailor your resume", text: "Rewrite bullets for one job, without inventing anything", icon: "fit", to: "/tailor" },
    { label: "Interview notes", text: "Type questions during a real interview; they become your debrief", icon: "list", to: "/notes" },
    { label: "Interview debrief", text: "Log each round; weak spots come back in your plan", icon: "calendar", to: "/debrief" },
  ] },
  { id: "roles", label: "For your role", items: [
    { label: "AI / GenAI Engineers", text: "RAG, agents, evaluation and LLM system design", icon: "spark", to: D + "For/ai-engineers/index.html", ext: true },
    { label: "Forward Deployed Engineers", text: "Discovery, customer scenarios, practical coding and demos", icon: "briefcase", to: D + "For/forward-deployed-engineers/index.html", ext: true },
    { label: "Data Engineers", text: "SQL, pipelines, Snowflake and Databricks", icon: "list", to: D + "For/data-engineers/index.html", ext: true },
    { label: "Platform / DevOps Engineers", text: "Reliability, Kubernetes and AI platforms", icon: "shield", to: D + "For/platform-engineers/index.html", ext: true },
    { label: "Staff / Principal Engineers", text: "Scope, influence and trade-offs at the next level", icon: "target", to: D + "For/staff-engineers/index.html", ext: true },
    { label: "Architects", text: "Solutions, AI, data and cloud architecture rounds", icon: "layers", to: D + "For/architects/index.html", ext: true },
  ] },
  { id: "resources", label: "Resources", items: [
    { label: "Help Center", text: "How to use OfferReady, step by step", icon: "chat", to: D + "Help/index.html", ext: true },
    { label: "Sample report", text: "What you get after a mock interview, no sign-up", icon: "fit", to: "/sample-report" },
    { label: "Get the app", text: "Install on your computer or phone", icon: "plus", to: "/app" },
    { label: "FAQ", text: "Quick answers about plans, privacy and how it works", icon: "list", to: "/faq" },
    { label: "Study library", text: "Free notes on GenAI, data and cloud topics", icon: "book", to: STUDY_URL, ext: true },
    { label: "Interview guide", text: "How senior technical loops work, round by round", icon: "list", to: D + "Personal-SourceCode/Interview_Guide_Overview.html", ext: true },
    { label: "Cheat sheets", text: "One-page reviews before the interview", icon: "check", to: D + "Personal-SourceCode/Interview_Cheat_Sheets.html", ext: true },
    { label: "Security and your data", text: "What we store, and what you control", icon: "lock", to: D + "Security/index.html", ext: true },
  ] },
];

function ItemLink({ it, onPick }: { it: Item; onPick: () => void }) {
  const body = (
    <>
      <span className="mh-ico" aria-hidden="true"><Icon name={it.icon} size={18} /></span>
      <span className="mh-item-body">
        <span className="mh-item-label">{it.label}{it.ext ? <Icon name="ext" size={13} /> : null}</span>
        <span className="mh-item-text">{it.text}</span>
      </span>
    </>
  );
  return it.ext
    ? <ExternalLink className="mh-item" href={it.to} onClick={onPick}>{body}<span className="hm-sr"> (opens in a new tab)</span></ExternalLink>
    : <Link className="mh-item" to={it.to} onClick={onPick}>{body}</Link>;
}

function MarkLogo() {
  return (
    <svg viewBox="0 0 40 40" width="26" height="26" aria-hidden="true">
      <path d="M33 11 A15 15 0 1 0 35 21" fill="none" stroke="currentColor" strokeWidth="3" strokeLinecap="round" />
      <path d="M13 33 L19 20 L25 11" fill="none" stroke="currentColor" strokeWidth="5" strokeLinecap="round" strokeLinejoin="round" />
      <path d="M25 11 L31 5 M31 5 L24 6 M31 5 L30 12" fill="none" stroke="#1a9e64" strokeWidth="3" strokeLinecap="round" strokeLinejoin="round" />
    </svg>
  );
}

export function MarketingHeader() {
  const auth = useAuth();
  const [open, setOpen] = useState<string | null>(null);
  const [mobile, setMobile] = useState(false);
  const ref = useRef<HTMLElement | null>(null);
  const hoverTimer = useRef<number | undefined>(undefined);
  /** When hover opened a menu: a click that follows straight after keeps it open instead of toggling it shut. */
  const hoverAt = useRef<{ id: string; t: number } | null>(null);

  useEffect(() => {
    if (!open && !mobile) return;
    const onDoc = (e: MouseEvent) => { if (ref.current && !ref.current.contains(e.target as Node)) { setOpen(null); setMobile(false); } };
    const onKey = (e: KeyboardEvent) => {
      if (e.key !== "Escape") return;
      const id = open;
      setOpen(null); setMobile(false);
      if (id) document.getElementById("mh-btn-" + id)?.focus();
    };
    document.addEventListener("mousedown", onDoc);
    document.addEventListener("keydown", onKey);
    return () => { document.removeEventListener("mousedown", onDoc); document.removeEventListener("keydown", onKey); };
  }, [open, mobile]);

  const close = () => { setOpen(null); setMobile(false); };
  const enter = (id: string) => {
    window.clearTimeout(hoverTimer.current);
    if (open !== id) hoverAt.current = { id, t: Date.now() };
    setOpen(id);
  };
  const toggle = (id: string) => {
    const h = hoverAt.current;
    hoverAt.current = null;
    if (h && h.id === id && Date.now() - h.t < 800) { setOpen(id); return; }
    setOpen((o) => (o === id ? null : id));
  };
  const leave = () => { window.clearTimeout(hoverTimer.current); hoverTimer.current = window.setTimeout(() => setOpen(null), 160); };

  const signedIn = !!auth.session;

  return (
    <header className="mh" ref={ref}>
      <div className="mh-inner">
        <Link className="mh-brand" to="/" aria-label="OfferReady home"><MarkLogo /><span>Offer<b>Ready</b></span></Link>

        <nav className="mh-nav" aria-label="Main">
          <ul className="mh-menus">
            {GROUPS.map((g) => (
              <li key={g.id} className="mh-menu" onMouseEnter={() => enter(g.id)} onMouseLeave={leave}>
                <button type="button" id={"mh-btn-" + g.id} className={"mh-trigger" + (open === g.id ? " on" : "")}
                  aria-expanded={open === g.id} aria-controls={"mh-panel-" + g.id}
                  onClick={() => toggle(g.id)}>
                  {g.label}
                  <svg className="mh-chev" viewBox="0 0 12 12" width="12" height="12" aria-hidden="true"><path d="M3 4.5 6 7.5 9 4.5" fill="none" stroke="currentColor" strokeWidth="1.6" strokeLinecap="round" strokeLinejoin="round" /></svg>
                </button>
                <div id={"mh-panel-" + g.id} className={"mh-panel" + (g.items.length > 4 ? " mh-panel-wide" : "")} hidden={open !== g.id}>
                  {g.items.map((it) => <ItemLink key={it.label} it={it} onPick={close} />)}
                </div>
              </li>
            ))}
            <li className="mh-menu"><Link className="mh-trigger" to="/pricing">Pricing</Link></li>
          </ul>
        </nav>

        <div className="mh-actions">
          <GetAppChip pathname="/" className="getapp-light" />
          <ExternalLink className="mh-study" href={STUDY_URL} onClick={close}>
            <svg viewBox="0 0 24 24" width="17" height="17" aria-hidden="true"><path d="M4 5.5A2.5 2.5 0 0 1 6.5 3H20v15H6.5A2.5 2.5 0 0 0 4 20.5v-15Z" fill="none" stroke="currentColor" strokeWidth="1.8" /><path d="M4 20.5A2.5 2.5 0 0 1 6.5 18H20v3H6.5" fill="none" stroke="currentColor" strokeWidth="1.8" /></svg>
            <span className="mh-study-t">Study notes</span><span className="mh-free">Free</span><span className="hm-sr"> (free study notes, opens in a new tab)</span>
          </ExternalLink>
          <ExternalLink className="mh-help" href={D + "Help/index.html"} onClick={close}>
            <svg viewBox="0 0 20 20" width="18" height="18" aria-hidden="true"><circle cx="10" cy="10" r="8" fill="none" stroke="currentColor" strokeWidth="1.6" /><path d="M7.8 7.6a2.3 2.3 0 0 1 4.4.9c0 1.5-2.2 1.9-2.2 3.1" fill="none" stroke="currentColor" strokeWidth="1.6" strokeLinecap="round" /><circle cx="10" cy="14.4" r="1" fill="currentColor" /></svg>
            Help<span className="hm-sr"> center (opens in a new tab)</span>
          </ExternalLink>
          {signedIn ? (
            <>
              <Link className="mh-signin" to="/account">Account</Link>
              <Link className="btn mh-start" to="/jobs">Open my jobs</Link>
            </>
          ) : (
            <>
              <Link className="mh-signin" to="/account">Sign in</Link>
              <Link className="btn mh-start" to="/analyze">Start free</Link>
            </>
          )}
          <button type="button" className="mh-menu-btn" aria-expanded={mobile} aria-controls="mh-mobile" aria-label={mobile ? "Close menu" : "Open menu"} onClick={() => setMobile((m) => !m)}>
            <svg viewBox="0 0 20 20" width="18" height="18" aria-hidden="true">{mobile ? <path d="M5 5l10 10M15 5 5 15" stroke="currentColor" strokeWidth="1.8" strokeLinecap="round" /> : <path d="M3 6h14M3 10h14M3 14h14" stroke="currentColor" strokeWidth="1.8" strokeLinecap="round" />}</svg>
            <span className="mh-menu-t">{mobile ? "Close" : "Menu"}</span>
          </button>
        </div>
      </div>

      <div id="mh-mobile" className="mh-mobile" hidden={!mobile}>
        <div className="mh-mquick">
          <Link className="mh-mq mh-mq-app" to="/app" onClick={close}>Get the app</Link>
          <ExternalLink className="mh-mq" href={STUDY_URL} onClick={close}>Study notes</ExternalLink>
          <ExternalLink className="mh-mq" href={D + "Help/index.html"} onClick={close}>Help</ExternalLink>
        </div>
        {GROUPS.map((g) => (
          <section key={g.id} className="mh-mgroup" aria-label={g.label}>
            <h2 className="mh-mlabel">{g.label}</h2>
            {g.items.map((it) => <ItemLink key={it.label} it={it} onPick={close} />)}
          </section>
        ))}
        <Link className="btn mh-start mh-mstart" to="/pricing" onClick={close}>See pricing</Link>
      </div>
    </header>
  );
}
