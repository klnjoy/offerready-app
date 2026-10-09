/* A drafted email (or script) streamed from the help API (api/ask.js via
 * streamHelp), shown as plain text with Copy / Again / Stop. Anonymous use is
 * fine: /api/ask is rate-limited on its own. */

import { useEffect, useRef, useState } from "react";
import * as api from "../lib/api";
import { cleanDraft } from "../lib/debrief";

export function copyText(text: string): Promise<boolean> {
  try {
    if (navigator.clipboard && window.isSecureContext) return navigator.clipboard.writeText(text).then(() => true, () => legacyCopy(text));
  } catch { /* fall through */ }
  return Promise.resolve(legacyCopy(text));
}

function legacyCopy(text: string): boolean {
  try {
    const ta = document.createElement("textarea");
    ta.value = text;
    ta.setAttribute("readonly", "");
    ta.style.position = "fixed";
    ta.style.opacity = "0";
    document.body.appendChild(ta);
    ta.select();
    const ok = document.execCommand("copy");
    ta.remove();
    return ok;
  } catch {
    return false;
  }
}

/** "Copy" button with a short "Copied" confirmation. */
export function CopyButton({ text, label = "Copy", className = "btn btn-small" }: { text: string; label?: string; className?: string }) {
  const [done, setDone] = useState<"" | "ok" | "fail">("");
  useEffect(() => {
    if (!done) return;
    const t = setTimeout(() => setDone(""), 1800);
    return () => clearTimeout(t);
  }, [done]);
  return (
    <button type="button" className={className + (done === "ok" ? " is-copied" : "")} disabled={!text}
      onClick={async () => setDone((await copyText(text)) ? "ok" : "fail")}>
      {done === "ok" ? "Copied" : done === "fail" ? "Select and copy" : label}
      <span className="dto-sr" aria-live="polite">{done === "ok" ? " to clipboard" : ""}</span>
    </button>
  );
}

export function StreamDraft({ prompt, title, page, onClose, autoStart = true }: {
  /** Built fresh on every run (≤ 800 chars, the help API's question cap). */
  prompt(): string;
  title: string;
  page: { title: string; path: string };
  onClose?(): void;
  autoStart?: boolean;
}) {
  const [text, setText] = useState("");
  const [busy, setBusy] = useState(false);
  const [err, setErr] = useState("");
  const ctrl = useRef<AbortController | null>(null);

  const run = async () => {
    ctrl.current?.abort();
    const c = new AbortController();
    ctrl.current = c;
    setText("");
    setErr("");
    setBusy(true);
    const out = await api.streamHelp({ question: prompt(), area: "all", context: { surface: "app", page } }, (t) => setText((x) => x + t), c.signal);
    if (c.signal.aborted) return;
    setBusy(false);
    if (out.kind === "error" && !out.gotDelta) setErr(out.status === 429 ? "Too many drafts in a short time. Wait a minute and try again." : "Drafting isn't available right now. Please try again.");
  };

  useEffect(() => {
    if (autoStart) void run();
    return () => ctrl.current?.abort();
  }, []); // eslint-disable-line react-hooks/exhaustive-deps

  const clean = cleanDraft(text);

  return (
    <div className="dto-draft" aria-live="polite">
      <div className="dto-draft-head">
        <strong>{title}</strong>
        <span className="row">
          {busy ? (
            <button type="button" className="btn btn-ghost btn-small" onClick={() => { ctrl.current?.abort(); setBusy(false); }}>Stop</button>
          ) : (
            <button type="button" className="btn btn-ghost btn-small" onClick={run}>{text || err ? "Draft again" : "Draft"}</button>
          )}
          <CopyButton text={busy ? "" : clean} />
          {onClose && <button type="button" className="btn btn-ghost btn-small" onClick={() => { ctrl.current?.abort(); onClose(); }}>Close</button>}
        </span>
      </div>
      {err ? <p className="error">{err}</p> : (
        <div className={"dto-draft-text" + (busy ? " is-busy" : "")}>{clean || <span className="muted">Drafting{"…"}</span>}</div>
      )}
      {!busy && clean && <p className="small muted">A draft to edit, not to send as is. Check every detail before you use it.</p>}
    </div>
  );
}
