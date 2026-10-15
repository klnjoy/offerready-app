/* The practice path, shown at the top of every practice page:
 *   1 Questions → 2 Trade-off drill → 3 Your stories → 4 Mock interview
 * plus the question bank as an "any time" tool. Under it, one line says which
 * step you're on, what's next and how to skip. Each tool keeps its own
 * progress when you leave, so switching is always safe. */

import { getActiveJob } from "../lib/readiness";
import { Link, useLocation } from "../lib/router";
import { nextStep, stepHref, usePracticePath, type PathStep, type StepKey } from "../lib/practicePath";
import { Icon } from "./Icon";

function currentKey(pathname: string): StepKey | null {
  if (pathname.startsWith("/questions")) return "questions";
  if (pathname.startsWith("/defend")) return "drill";
  if (pathname.startsWith("/stories")) return "stories";
  if (pathname === "/mock") return "mock";
  return null;
}

export function PracticeTabs() {
  const { pathname } = useLocation();
  const job = getActiveJob();
  const path = usePracticePath(job);
  const cur = currentKey(pathname);
  const bankOn = pathname.startsWith("/practice/bank");
  return (
    <div className="pp">
      <nav className="pp-steps" aria-label="Practice path">
        <ol>
          {path.map((s) => {
            const on = s.key === cur;
            return (
              <li key={s.key} className={"pp-step" + (on ? " on" : "") + (s.done ? " done" : "")}>
                <Link to={stepHref(s, job)} aria-current={on ? "step" : undefined}>
                  <span className="pp-num" aria-hidden="true">{s.done ? <Icon name="check" size={13} /> : s.n}</span>
                  <span className="pp-label"><span className="pp-long">{s.label}</span><span className="pp-short" aria-hidden="true">{s.short}</span></span>
                  {s.done ? <span className="hm-sr"> (done)</span> : null}
                </Link>
              </li>
            );
          })}
        </ol>
        <Link to="/practice/bank" className={"pp-any" + (bankOn ? " on" : "")} aria-current={bankOn ? "page" : undefined}>
          <span className="pp-any-k">Any time</span> Question bank
        </Link>
      </nav>
      <PathStatus path={path} cur={cur} job={job} />
    </div>
  );
}

/** One line under the steps: where you are, what's next, how to skip. */
function PathStatus({ path, cur, job }: { path: PathStep[]; cur: StepKey | null; job: string }) {
  if (!cur) {
    // Question bank: point back to the path.
    const todo = nextStep(path, null);
    if (!todo) return <p className="pp-status">All four steps done. Keep practising here, or <Link to="/mock">run another mock</Link>.</p>;
    return (
      <p className="pp-status">
        Quick reps on any topic, any time. Your next step on the path is <strong>{todo.n} · {todo.label}</strong>.{" "}
        <Link to={stepHref(todo, job)}>Go to step {todo.n}</Link>
      </p>
    );
  }
  const here = path.find((s) => s.key === cur)!;
  const next = nextStep(path, cur);
  // Last step done but an earlier one isn't: point there, not "all done".
  const open = next ? null : path.find((s) => !s.done && s.key !== cur) || null;
  if (here.done && open) {
    return (
      <div className="pp-status pp-status-done" role="status">
        <span className="pp-status-ico" aria-hidden="true"><Icon name="check" size={16} /></span>
        <span className="pp-status-text">
          <strong>Step {here.n} done.</strong> Step {open.n}, <strong>{open.label}</strong>, is still open: {open.goal}.
        </span>
        <Link className="btn btn-sm hm-btn-signal" to={stepHref(open, job)}>Go to step {open.n} <Icon name="arrow" size={15} /></Link>
      </div>
    );
  }
  if (here.done) {
    return (
      <div className="pp-status pp-status-done" role="status">
        <span className="pp-status-ico" aria-hidden="true"><Icon name="check" size={16} /></span>
        <span className="pp-status-text">
          <strong>Step {here.n} done.</strong>{" "}
          {next ? <>Next: <strong>{next.label}</strong>, {next.goal}.</> : <>That{"’"}s all four steps. Keep running mocks, and use Interview notes on the day.</>}
        </span>
        {next
          ? <Link className="btn btn-sm hm-btn-signal" to={stepHref(next, job)}>Go to {next.label} <Icon name="arrow" size={15} /></Link>
          : <Link className="btn btn-sm hm-btn-signal" to="/notes">Interview notes <Icon name="arrow" size={15} /></Link>}
      </div>
    );
  }
  return (
    <p className="pp-status">
      <strong>Step {here.n} of 4:</strong> {here.goal}.{" "}
      {next ? <>Then step {next.n}, {next.label}.{" "}<Link className="pp-skip" to={stepHref(next, job)}>Skip to {next.label}</Link></> : <>That{"’"}s the last step.</>}
    </p>
  );
}

/** A highlighted "next step" card for the end of a session (a drill, a mock). */
export function NextStepCard({ after }: { after: StepKey }) {
  const job = getActiveJob();
  const path = usePracticePath(job);
  // The step after this one; after the last step, any step still to do.
  const next = nextStep(path, after) || path.find((s) => !s.done && s.key !== after) || null;
  const later = next ? nextStep(path, next.key) : null;
  if (!next) {
    return (
      <div className="pp-next">
        <div>
          <span className="pp-next-k">You{"’"}ve done all four steps</span>
          <p className="pp-next-t">Run another mock closer to the day, and keep Interview notes open in the real one.</p>
        </div>
        <div className="row wrap">
          <Link className="btn hm-btn-signal" to="/notes">Interview notes <Icon name="arrow" size={15} /></Link>
          <Link className="btn" to="/dashboard">See readiness</Link>
        </div>
      </div>
    );
  }
  return (
    <div className="pp-next">
      <div>
        <span className="pp-next-k">{next.n > (path.find((s) => s.key === after)?.n || 0) ? "Next step" : "Still to do"} · step {next.n} of 4</span>
        <p className="pp-next-t"><strong>{next.label}</strong>: {next.goal}.</p>
      </div>
      <div className="row wrap">
        <Link className="btn hm-btn-signal" to={stepHref(next, job)}>Go to {next.label} <Icon name="arrow" size={15} /></Link>
        {later ? <Link className="btn btn-ghost" to={stepHref(later, job)}>Skip to {later.label}</Link> : null}
      </div>
    </div>
  );
}
