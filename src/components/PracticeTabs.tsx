/* Switch between the four practice tools at any point. Each tool keeps its
 * own progress when you leave (questions save per answer, drills resume,
 * story drafts and question-bank sessions are saved on the way out). */

import { getActiveJob } from "../lib/readiness";
import { Link, useLocation } from "../lib/router";

const TABS = [
  { to: "/questions", label: "Questions for this job", short: "Questions", job: true },
  { to: "/defend", label: "Trade-off drills", short: "Drills", job: true },
  { to: "/stories", label: "Your stories", short: "Stories", job: false },
  { to: "/practice/bank", label: "Question bank", short: "Bank", job: false },
];

export function PracticeTabs() {
  const { pathname } = useLocation();
  const job = getActiveJob();
  return (
    <nav className="pt-tabs" aria-label="Practice tools">
      {TABS.map((t) => {
        const on = pathname === t.to || pathname.startsWith(t.to + "/");
        const to = t.job && job ? t.to + "?job=" + encodeURIComponent(job) : t.to;
        return (
          <Link key={t.to} to={to} className={"pt-tab" + (on ? " on" : "")} aria-current={on ? "page" : undefined}>
            <span className="pt-long">{t.label}</span><span className="pt-short" aria-hidden="true">{t.short}</span>
          </Link>
        );
      })}
      <span className="pt-note">Switch any time. Your progress is kept.</span>
    </nav>
  );
}
