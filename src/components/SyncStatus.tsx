/* Account sync status: one plain line + the resume-sync opt-in, for the
 * Account page ("Your data"). <SyncIndicator /> is the tiny header dot. */

import { useEffect, useState } from "react";
import { useAuth } from "../lib/auth";
import { Link } from "../lib/router";
import { getResumeSync, getSyncStatus, setResumeSync, setSyncEnabled, subscribeSync, syncNow, type SyncStatus as Status } from "../lib/sync";
import "./SyncStatus.css";

export function useSyncStatus(): Status {
  const [s, setS] = useState<Status>(getSyncStatus);
  useEffect(() => subscribeSync(setS), []);
  // Re-render now and then so "2 min ago" stays true.
  const [, tick] = useState(0);
  useEffect(() => {
    const t = setInterval(() => tick((n) => n + 1), 30000);
    return () => clearInterval(t);
  }, []);
  return s;
}

export function ago(at: number | null, now = Date.now()): string {
  if (!at) return "";
  const s = Math.max(0, Math.round((now - at) / 1000));
  if (s < 45) return "just now";
  const m = Math.round(s / 60);
  if (m < 60) return m + " min ago";
  const h = Math.round(m / 60);
  if (h < 24) return h + (h === 1 ? " hour ago" : " hours ago");
  return new Date(at).toLocaleDateString(undefined, { day: "numeric", month: "short" });
}

/** The status sentence for a state. */
export function syncLine(s: Status, signedIn: boolean): string {
  if (!signedIn || s.state === "signedOut") return "Saved on this device only (sign in to sync)";
  switch (s.state) {
    case "synced": return "Synced across your devices" + (s.at ? " · " + ago(s.at) : "");
    case "syncing":
    case "idle": return "Syncing…";
    case "offline": return "Offline: changes will sync when you’re back";
    case "error": return "Not synced: couldn’t reach your account. Your changes are saved on this device and will retry.";
    case "unavailable": return "Sync isn’t set up yet. Your data is saved on this device.";
    case "paused": return "Sync is paused on this device. Your data is saved here only.";
  }
  return "";
}

const dotClass = (s: Status) => "sync-dot is-" + s.state;

export function SyncStatus({ showResumeToggle = true }: { showResumeToggle?: boolean }) {
  const auth = useAuth();
  const s = useSyncStatus();
  const signedIn = !!auth.session;
  const [resumeOn, setResumeOn] = useState(getResumeSync);
  const [busy, setBusy] = useState(false);

  const toggleResume = async (on: boolean) => {
    setBusy(true);
    setResumeOn(on);
    try { await setResumeSync(on); } finally { setBusy(false); }
  };

  return (
    <div className="sync-status">
      <p className="sync-line" role="status" aria-live="polite">
        <span className={dotClass(signedIn ? s : { ...s, state: "signedOut" })} aria-hidden="true" />
        <span className="sync-text">{syncLine(s, signedIn)}</span>
        {signedIn && s.state === "error" && <button type="button" className="btn-link" onClick={() => void syncNow()}>Try again</button>}
        {signedIn && s.state === "paused" && <button type="button" className="btn-link" onClick={() => void setSyncEnabled(true)}>Turn sync back on</button>}
      </p>
      {showResumeToggle && (
        <div className="sync-resume">
          <label>
            <input type="checkbox" checked={resumeOn} disabled={busy || !signedIn} onChange={(e) => void toggleResume(e.target.checked)} />
            <span>Also sync my saved resume to my account</span>
          </label>
          <p className="sync-note">
            Off by default: your resume stays on this device only. Turn it on to use it on your other devices; the text is then stored in your
            OfferReady account, where only you can read it. Turning it off deletes the account copy (the copy on this device stays).
            {!signedIn && " Sign in to turn it on."}
          </p>
        </div>
      )}
    </div>
  );
}

/** Tiny header dot (signed in only), linking to the Account page. */
export function SyncIndicator() {
  const auth = useAuth();
  const s = useSyncStatus();
  if (!auth.session || s.state === "signedOut" || s.state === "unavailable") return null;
  const label = syncLine(s, true);
  return (
    <Link className="sync-ind" to="/account" aria-label={"Sync: " + label} title={label}>
      <span className={dotClass(s)} aria-hidden="true" />
    </Link>
  );
}
