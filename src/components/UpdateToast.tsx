/* "Update available" toast: shown only when a new version arrives while
 * you're busy (lib/pwa.ts applies it on its own otherwise). Refresh applies
 * it now; Later hides the toast, and the update applies the next time the
 * app goes to the background. */

import { useEffect, useState } from "react";
import { applyUpdate, subscribePwa, updateWaiting } from "../lib/pwa";

export function UpdateToast() {
  const [ready, setReady] = useState(updateWaiting());
  const [hidden, setHidden] = useState(false);
  const [busy, setBusy] = useState(false);
  useEffect(() => subscribePwa(() => setReady(updateWaiting())), []);
  if (!ready || hidden) return null;
  return (
    <div className="lp-toast" role="status" aria-live="polite">
      <span className="lp-toast-text"><strong>Update available.</strong> Refresh now, or it updates by itself next time you leave the app.</span>
      <span className="lp-toast-actions">
        <button type="button" className="btn btn-primary btn-small" disabled={busy} onClick={() => { setBusy(true); applyUpdate(); }}>
          {busy ? "Refreshing…" : "Refresh"}
        </button>
        <button type="button" className="btn btn-ghost btn-small" onClick={() => setHidden(true)}>Later</button>
      </span>
    </div>
  );
}
