/* Slim strip at the very top: "Get the OfferReady app". Hidden once the app is
 * installed (or opened as the installed app), on the /app page itself, and
 * for 30 days after the user closes it. On Chrome/Edge/Android it installs in
 * one tap; elsewhere it opens the install steps. */

import { useEffect, useState } from "react";
import { installState, promptInstall, subscribePwa } from "../lib/pwa";
import { Link, useNavigate } from "../lib/router";

const KEY = "offerready.appBanner.closedAt";
const DAYS = 30;

function closedRecently(): boolean {
  try { const t = Number(localStorage.getItem(KEY) || 0); return !!t && Date.now() - t < DAYS * 86400000; } catch { return false; }
}

export function AppBanner({ pathname }: { pathname: string }) {
  const [state, setState] = useState(installState());
  const [closed, setClosed] = useState(closedRecently);
  const navigate = useNavigate();
  useEffect(() => subscribePwa(() => setState(installState())), []);
  if (closed || state === "installed" || pathname === "/app") return null;

  const close = () => { setClosed(true); try { localStorage.setItem(KEY, String(Date.now())); } catch { /* private mode */ } };
  const get = async () => {
    if (state === "prompt") {
      const r = await promptInstall();
      if (r !== "unavailable") { setState(installState()); return; }
    }
    navigate("/app");
  };

  return (
    <div className="appbar" role="region" aria-label="Get the app">
      <span className="appbar-ico" aria-hidden="true">
        <svg viewBox="0 0 24 24" width="16" height="16"><rect x="6" y="2.5" width="12" height="19" rx="3" fill="none" stroke="currentColor" strokeWidth="1.8" /><path d="M10.5 18.5h3" stroke="currentColor" strokeWidth="1.8" strokeLinecap="round" /></svg>
      </span>
      <span className="appbar-text"><strong>Get the OfferReady app</strong><span className="appbar-sub"> for your phone and computer. Free, no app store.</span></span>
      <button type="button" className="appbar-btn" onClick={get}>{state === "prompt" ? "Install" : "Get the app"}</button>
      <Link className="appbar-how" to="/app">How</Link>
      <button type="button" className="appbar-x" aria-label="Close" onClick={close}>×</button>
    </div>
  );
}
