/* "Update available" toast: shown when a new service worker is waiting
 * (a new deploy). Refresh activates it and reloads; Later hides the toast
 * until the next page load. */

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
      <span className="lp-toast-text"><strong>Update available.</strong> Refresh to get the latest version of OfferReady.</span>
      <span className="lp-toast-actions">
        <button type="button" className="btn btn-primary btn-small" disabled={busy} onClick={() => { setBusy(true); applyUpdate(); }}>
          {busy ? "Refreshing…" : "Refresh"}
        </button>
        <button type="button" className="btn btn-ghost btn-small" onClick={() => setHidden(true)}>Later</button>
      </span>
    </div>
  );
}
