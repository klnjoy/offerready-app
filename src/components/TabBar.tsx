/* Phones: a bottom tab bar (Today · Practice · Coach · Progress) and a round
 * "+" button with quick actions, so the main places are one thumb-tap away.
 * Shown only on narrow screens when signed in (see .tb in styles.css). */

import { useEffect, useRef, useState, type ReactNode } from "react";
import { getActiveJob } from "../lib/readiness";
import { Link, useLocation } from "../lib/router";
import { openHelp } from "./HelpBot";

type Tab = "today" | "practice" | "coach" | "progress" | "more";

const I = (d: ReactNode) => (
  <svg viewBox="0 0 24 24" width="22" height="22" fill="none" stroke="currentColor" strokeWidth="1.8" strokeLinecap="round" strokeLinejoin="round" aria-hidden="true">{d}</svg>
);
const ICONS: Record<Tab, ReactNode> = {
  today: I(<><path d="M4 10.5 12 4l8 6.5V19a1.5 1.5 0 0 1-1.5 1.5H15v-6H9v6H5.5A1.5 1.5 0 0 1 4 19v-8.5Z" /></>),
  practice: I(<><circle cx="12" cy="12" r="8.5" /><circle cx="12" cy="12" r="4.5" /><circle cx="12" cy="12" r="1" /></>),
  // The AI Coach: our own sparkle mark, filled and in brand green, so the
  // assistant is easy to spot in the bar.
  coach: (
    <svg viewBox="0 0 24 24" width="24" height="24" aria-hidden="true" className="tb-ai">
      <defs><linearGradient id="tb-ai-g" x1="0" y1="0" x2="1" y2="1"><stop offset="0" stopColor="#6fe0a9" /><stop offset="1" stopColor="#22c07a" /></linearGradient></defs>
      <path d="M10 3.2c.5 3.6 2.6 5.8 6.2 6.3-3.6.5-5.7 2.7-6.2 6.3-.5-3.6-2.6-5.8-6.2-6.3 3.6-.5 5.7-2.7 6.2-6.3Z" fill="url(#tb-ai-g)" />
      <path d="M17.6 13.4c.3 1.9 1.3 3 3.2 3.2-1.9.3-2.9 1.4-3.2 3.3-.3-1.9-1.4-3-3.3-3.3 1.9-.2 3-1.3 3.3-3.2Z" fill="url(#tb-ai-g)" />
      <circle cx="18.2" cy="5.6" r="1.3" fill="#6fe0a9" />
    </svg>
  ),
  progress: I(<><path d="M5 20V13M10 20V8M15 20v-5M20 20V5" /></>),
  more: I(<><circle cx="5.5" cy="12" r="1.3" /><circle cx="12" cy="12" r="1.3" /><circle cx="18.5" cy="12" r="1.3" /></>),
};

export function TabBar({ section }: { section?: string }) {
  const { pathname } = useLocation();
  const [open, setOpen] = useState(false);
  const sheetRef = useRef<HTMLDivElement | null>(null);
  const fabRef = useRef<HTMLButtonElement | null>(null);
  useEffect(() => setOpen(false), [pathname]);
  useEffect(() => {
    if (!open) return;
    sheetRef.current?.querySelector<HTMLElement>(".tb-act")?.focus();
    const onKey = (e: KeyboardEvent) => { if (e.key === "Escape") { setOpen(false); fabRef.current?.focus(); } };
    document.addEventListener("keydown", onKey);
    return () => document.removeEventListener("keydown", onKey);
  }, [open]);

  const job = getActiveJob();
  const jq = job ? "?job=" + encodeURIComponent(job) : "";
  const cur: Tab | null = section === "jobs" ? "today" : section === "practice" || section === "mock" ? "practice"
    : section === "copilot" ? "coach" : section === "readiness" ? "progress" : section === "more" ? "more" : null;
  const tabs: { key: Tab; label: string; to: string }[] = [
    { key: "today", label: "Today", to: job ? "/jobs/" + encodeURIComponent(job) : "/jobs" },
    { key: "practice", label: "Practice", to: "/practice" },
    { key: "coach", label: "AI Coach", to: "/coach" + jq },
    { key: "progress", label: "Progress", to: "/dashboard" + jq },
    { key: "more", label: "More", to: "/more" },
  ];
  const actions: { label: string; sub: string; to?: string; run?: () => void }[] = [
    { label: "Add a job", sub: "Paste a job link or description", to: "/analyze" },
    { label: "Interview notes", sub: "In an interview now? Jot each question", to: "/notes" + jq },
    { label: "Log a round", sub: "Write down how an interview went", to: "/debrief" + (jq ? jq + "&new=1" : "?new=1") },
    { label: "Quick story", sub: "Capture a STAR story in a minute", to: "/stories?new=1" },
    { label: "Ask for help", sub: "How OfferReady works", run: () => { setOpen(false); openHelp(); } },
  ];

  return (
    <>
      <nav className="tb" aria-label="Main sections">
        <div className="tb-bar">
          {tabs.map((t) => (
            <Link key={t.key} to={t.to} className={"tb-tab" + (cur === t.key ? " on" : "")} aria-current={cur === t.key ? "page" : undefined}>
              {ICONS[t.key]}<span>{t.label}</span>
            </Link>
          ))}
        </div>
        <button ref={fabRef} type="button" className="tb-fab" aria-label="Quick actions" aria-expanded={open} aria-controls="tb-sheet" onClick={() => setOpen((o) => !o)}>
          <svg viewBox="0 0 24 24" width="26" height="26" aria-hidden="true"><path d="M12 5v14M5 12h14" stroke="currentColor" strokeWidth="2.4" strokeLinecap="round" /></svg>
        </button>
      </nav>
      {open ? (
        <div className="tb-scrim" onClick={() => setOpen(false)}>
          <div ref={sheetRef} id="tb-sheet" className="tb-sheet" role="dialog" aria-modal="true" aria-label="Quick actions" onClick={(e) => e.stopPropagation()}>
            <span className="tb-grip" aria-hidden="true" />
            <ul>
              {actions.map((a) => (
                <li key={a.label}>
                  {a.to ? (
                    <Link to={a.to} className="tb-act" onClick={() => setOpen(false)}>
                      <strong>{a.label}</strong><span>{a.sub}</span>
                    </Link>
                  ) : (
                    <button type="button" className="tb-act" onClick={a.run}><strong>{a.label}</strong><span>{a.sub}</span></button>
                  )}
                </li>
              ))}
            </ul>
            <button type="button" className="btn btn-ghost tb-close" onClick={() => { setOpen(false); fabRef.current?.focus(); }}>Close</button>
          </div>
        </div>
      ) : null}
    </>
  );
}
