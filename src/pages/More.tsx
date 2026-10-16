/* "More" (the phone tab bar's last tab): who you are at the top (jobs and
 * stories saved), then only what isn't already on another tab. Practice
 * owns stories, the question bank and mocks; Today owns the streak. */

import type { ReactNode } from "react";
import { DOCS_BASE } from "../config";
import { useAuth } from "../lib/auth";
import { getActiveJob } from "../lib/readiness";
import { ExternalLink, Link, useNavigate } from "../lib/router";
import { loadStories } from "../lib/stories";
import { useJobs } from "../lib/useJobs";
import { openFeedback } from "../components/Feedback";
import { openHelp } from "../components/HelpBot";
import { usePlan } from "../lib/plans";

const ic = (d: ReactNode) => (
  <svg viewBox="0 0 24 24" width="22" height="22" fill="none" stroke="currentColor" strokeWidth="1.7" strokeLinecap="round" strokeLinejoin="round" aria-hidden="true">{d}</svg>
);
const ICON = {
  jobs: ic(<><rect x="3.5" y="7" width="17" height="12.5" rx="2.5" /><path d="M9 7V5.5A1.5 1.5 0 0 1 10.5 4h3A1.5 1.5 0 0 1 15 5.5V7M3.5 12.5h17" /></>),
  asked: ic(<><path d="M4 5.5h16v10H9.5L5 19.5v-4H4v-10Z" /><path d="M10 9a2 2 0 1 1 2.5 1.9c-.4.2-.5.5-.5.9M12 13.5v.1" /></>),
  notes: ic(<><path d="M9 6.5h11M9 12h11M9 17.5h11" /><circle cx="4.8" cy="6.5" r="1.1" /><circle cx="4.8" cy="12" r="1.1" /><circle cx="4.8" cy="17.5" r="1.1" /></>),
  debrief: ic(<><rect x="3.5" y="5" width="17" height="15.5" rx="2.5" /><path d="M3.5 10h17M8 3v4M16 3v4M8.5 14.5l2 2 4-4" /></>),
  offers: ic(<><path d="M4 12h16M12 4v16" /><rect x="3.5" y="3.5" width="17" height="17" rx="3" /></>),
  library: ic(<><path d="M5 4h4v16H5zM10 4h4v16h-4z" /><path d="m15.5 5 3.6-1 2.4 15.5-3.6 1z" /></>),
  how: ic(<><circle cx="12" cy="12" r="8.5" /><path d="M10 9.5a2 2 0 1 1 2.6 1.9c-.4.2-.6.5-.6 1v.6M12 16v.1" /></>),
  account: ic(<><circle cx="12" cy="8.5" r="3.5" /><path d="M5 20a7 7 0 0 1 14 0" /></>),
  plan: ic(<><path d="m12 3 2.6 5.4 5.9.8-4.3 4.1 1 5.9L12 16.4 6.8 19.2l1-5.9L3.5 9.2l5.9-.8L12 3Z" /></>),
  app: ic(<><rect x="7" y="3" width="10" height="18" rx="2.5" /><path d="M11 17.5h2" /></>),
  help: ic(<><circle cx="12" cy="12" r="8.5" /><circle cx="12" cy="12" r="3.5" /><path d="m6 6 3.5 3.5M14.5 14.5 18 18M18 6l-3.5 3.5M9.5 14.5 6 18" /></>),
  feedback: ic(<><path d="M4 5.5h16v10H9.5L5 19.5v-4H4v-10Z" /><path d="M8.5 9.5h7M8.5 12.5h4" /></>),
  out: ic(<><path d="M14 4h4.5A1.5 1.5 0 0 1 20 5.5v13a1.5 1.5 0 0 1-1.5 1.5H14M10 16l-4-4 4-4M6 12h10" /></>),
};

type Row = { icon: ReactNode; label: string; sub?: string; to?: string; href?: string; run?: () => void };

export default function MorePage() {
  const auth = useAuth();
  const jobs = useJobs();
  const navigate = useNavigate();
  const job = getActiveJob();
  const jq = job ? "?job=" + encodeURIComponent(job) : "";
  const plan = usePlan();

  const nJobs = jobs.status === "ready" ? jobs.jobs.length : null;
  const nStories = loadStories().length;
  const initial = (auth.email || "").trim().charAt(0).toUpperCase() || "•";

  const groups: { title: string; rows: Row[] }[] = [
    { title: "Find your next role", rows: [
      { icon: ICON.jobs, label: "Open roles", sub: "FDE jobs in the USA, updated daily", to: "/roles" },
      { icon: ICON.library, label: "12-week AI roadmap", sub: "Learn, build, practise: week by week", to: "/learn/roadmap" },
    ] },
    { title: "Your jobs", rows: [
      { icon: ICON.jobs, label: "My jobs", sub: "Every job you’re preparing for", to: "/jobs" },
      { icon: ICON.notes, label: "Interview notes", sub: "Jot each question as it’s asked", to: "/notes" + jq },
      { icon: ICON.debrief, label: "Debriefs", sub: "Log a round and see past ones", to: "/debrief" + jq },
      { icon: ICON.asked, label: "Questions you were asked", sub: "From all your real interviews", to: "/asked" + jq },
      { icon: ICON.offers, label: "Compare offers", sub: "Side by side, then negotiate", to: "/offers" + jq },
    ] },
    { title: "Learn", rows: [
      { icon: ICON.library, label: "Study library", sub: "Where to start, by role", href: DOCS_BASE + "Where-To-Start/index.html" },
      { icon: ICON.how, label: "Keep up with AI", sub: "News and free courses from the source", to: "/learn" },
      { icon: ICON.how, label: "How OfferReady works", sub: "A worked example in a few minutes", to: "/example" },
    ] },
    { title: "Account", rows: [
      { icon: ICON.account, label: "Account and data", sub: auth.email || "Sign in, sync and your data", to: "/account" },
      { icon: ICON.plan, label: "Plans and pricing", to: "/pricing" },
      { icon: ICON.app, label: "Get the app", sub: "Install on your phone or computer", to: "/app" },
      { icon: ICON.help, label: "Help", sub: "Ask how anything works", run: openHelp },
      { icon: ICON.feedback, label: "Send feedback", run: openFeedback },
      ...(plan.isAdmin ? [{ icon: ICON.plan, label: "AI costs", sub: "Admin: spend per feature", to: "/admin/costs" }] : []),
      ...(auth.session ? [{ icon: ICON.out, label: "Sign out", run: async () => { await auth.signOut(); navigate("/"); } }] : []),
    ] },
  ];

  return (
    <div className="page more">
      <section className="more-head" aria-label="Your summary">
        <div className="more-stat"><span>Jobs</span><strong>{nJobs ?? "–"}</strong><em>saved</em></div>
        <div className="more-me">
          <span className="avatar avatar-lg more-avatar" aria-hidden="true">{initial}</span>
          <span className="more-email">{auth.email || "Not signed in"}</span>
        </div>
        <div className="more-stat"><span>Stories</span><strong>{nStories}</strong><em>written</em></div>
      </section>

      {groups.map((g) => (
        <section key={g.title} className="more-group" aria-labelledby={"more-" + g.title.replace(/\W+/g, "-")}>
          <h2 id={"more-" + g.title.replace(/\W+/g, "-")} className="more-h">{g.title}</h2>
          <ul className="more-list">
            {g.rows.map((r) => {
              const inner = (
                <>
                  <span className="more-ico">{r.icon}</span>
                  <span className="more-text"><strong>{r.label}</strong>{r.sub ? <span>{r.sub}</span> : null}</span>
                  <span className="more-chev" aria-hidden="true">{r.href ? "↗" : "›"}</span>
                </>
              );
              return (
                <li key={r.label}>
                  {r.to ? <Link className="more-row" to={r.to}>{inner}</Link>
                    : r.href ? <ExternalLink className="more-row" href={r.href}>{inner}</ExternalLink>
                    : <button type="button" className="more-row" onClick={r.run}>{inner}</button>}
                </li>
              );
            })}
          </ul>
        </section>
      ))}

      <p className="more-legal small muted">
        <ExternalLink href={DOCS_BASE + "Help/index.html"}>Help Center</ExternalLink>{" · "}
        <ExternalLink href={DOCS_BASE + "Privacy/index.html"}>Privacy</ExternalLink>{" · "}
        <ExternalLink href={DOCS_BASE + "Terms/index.html"}>Terms</ExternalLink>{" · "}
        <ExternalLink href={DOCS_BASE + "Disclaimer/index.html"}>Disclaimer</ExternalLink>
        <br />Practice only, never during a live interview.
      </p>
    </div>
  );
}
