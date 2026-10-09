/* Switch job by searching title or company. A <select> with hundreds of jobs
 * is unusable, so this shows the first 8 matches as you type (Enter picks the
 * first). Optional back link on the left (e.g. "← All jobs"). */

import { useMemo, useState, type ReactNode } from "react";
import { displayJobTitle } from "../lib/roles";
import { Link } from "../lib/router";
import type { JobRow } from "../types";

export function JobPicker({ jobs, current, onSwitch, back, label }: {
  jobs: JobRow[];
  current: string;
  onSwitch(id: string): void;
  back?: { to: string; label: string };
  /** Shown before the box when there's no back link, e.g. the current job's name. */
  label?: ReactNode;
}) {
  const [q, setQ] = useState("");
  const [open, setOpen] = useState(false);
  const needle = q.trim().toLowerCase();
  const matches = useMemo(
    () => jobs.filter((j) => j.id !== current && (!needle || (displayJobTitle(j) + " " + (j.company || "")).toLowerCase().includes(needle))).slice(0, 8),
    [jobs, current, needle],
  );
  const choose = (id: string) => { setQ(""); setOpen(false); onSwitch(id); };
  return (
    <div className="rd-switch">
      {back ? <Link className="rd-back" to={back.to}>{"←"} {back.label}</Link> : label ? <div className="rd-switch-label">{label}</div> : <span />}
      <div className="rd-switch-box" onBlur={(e) => { if (!e.currentTarget.contains(e.relatedTarget as Node)) setOpen(false); }}>
        <input className="input" type="search" role="combobox" aria-expanded={open} aria-controls="job-picker-list" aria-label="Switch to another job"
          placeholder={"Switch job: search title or company…"} value={q}
          onFocus={() => setOpen(true)} onChange={(e) => { setQ(e.target.value); setOpen(true); }}
          onKeyDown={(e) => { if (e.key === "Enter" && matches[0]) { e.preventDefault(); choose(matches[0].id); } if (e.key === "Escape") setOpen(false); }} />
        {open && (
          <ul id="job-picker-list" className="rd-switch-list" role="listbox">
            {matches.length ? matches.map((j) => (
              <li key={j.id} role="option" aria-selected={false}>
                <button type="button" onClick={() => choose(j.id)}>
                  <strong>{displayJobTitle(j)}</strong>{j.company ? <span className="muted small"> {"·"} {j.company}</span> : null}
                </button>
              </li>
            )) : <li className="muted small rd-switch-none">No other job matches</li>}
          </ul>
        )}
      </div>
    </div>
  );
}
