/* "Get the app" chip for the headers, styled like the Study notes chip.
 * Hidden once the app is installed (or opened as the app) and on /app.
 * On Chrome/Edge/Android it installs in one tap; elsewhere it opens /app. */

import { useEffect, useState } from "react";
import { installState, promptInstall, subscribePwa } from "../lib/pwa";
import { useNavigate } from "../lib/router";

export function GetAppChip({ pathname, className = "" }: { pathname: string; className?: string }) {
  const [state, setState] = useState(installState());
  const navigate = useNavigate();
  useEffect(() => subscribePwa(() => setState(installState())), []);
  if (state === "installed" || pathname === "/app") return null;
  const get = async () => {
    if (state === "prompt") {
      const r = await promptInstall();
      if (r !== "unavailable") { setState(installState()); return; }
    }
    navigate("/app");
  };
  return (
    <button type="button" className={"getapp " + className} onClick={get} aria-label="Get the OfferReady app">
      <svg viewBox="0 0 24 24" width="16" height="16" aria-hidden="true"><rect x="6" y="2.5" width="12" height="19" rx="3" fill="none" stroke="currentColor" strokeWidth="1.8" /><path d="M10.5 18.5h3" stroke="currentColor" strokeWidth="1.8" strokeLinecap="round" /></svg>
      <span className="getapp-t">Get the app</span>
    </button>
  );
}
