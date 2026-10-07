/* Account: sign in/out, and the Upgrade-to-Pro checkout bridge (was
 * content/assets/upgrade.js). ?upgrade=1 starts checkout once signed in.
 * Checkout itself is created server-side (/api/billing/checkout). */

import { useEffect, useRef, useState } from "react";
import { API_ENABLED, PRICING_URL } from "../config";
import * as api from "../lib/api";
import { useAuth } from "../lib/auth";
import { ExternalLink, useNavigate, useSearchParams } from "../lib/router";
import { AuthForm } from "../components/AuthForm";
import { Card } from "../components/ui";

type Banner = { text: string; tone: "info" | "ok" | "err" } | null;

export default function AccountPage() {
  const auth = useAuth();
  const params = useSearchParams();
  const navigate = useNavigate();
  const [wantsUpgrade, setWantsUpgrade] = useState(params.get("upgrade") === "1");
  const [banner, setBanner] = useState<Banner>(null);
  const started = useRef(false);

  useEffect(() => {
    // Drop the flag from the URL so a refresh doesn't re-trigger checkout.
    if (params.get("upgrade") === "1") navigate("/account", { replace: true });
  }, []); // eslint-disable-line react-hooks/exhaustive-deps

  useEffect(() => {
    if (!wantsUpgrade || !auth.ready || started.current) return;
    if (!API_ENABLED || !auth.configured) {
      setBanner({ text: "Checkout isn’t available right now. Opening the waitlist…", tone: "info" });
      window.location.href = PRICING_URL;
      return;
    }
    if (!auth.session) {
      setBanner({ text: "Please sign in below, then you’ll go straight to secure checkout.", tone: "info" });
      return;
    }
    started.current = true;
    (async () => {
      setBanner({ text: "Starting secure checkout…", tone: "info" });
      const tok = await auth.getAccessToken();
      if (!tok) { started.current = false; setBanner({ text: "Please sign in below, then try again.", tone: "info" }); return; }
      const res = await api.startCheckout(tok);
      if (res.status === 200 && res.body?.url) {
        setBanner({ text: "Redirecting to secure checkout…", tone: "ok" });
        window.location.href = res.body.url;
      } else if (res.status === 401) {
        started.current = false;
        setBanner({ text: "Please sign in below, then try again.", tone: "info" });
      } else if (res.status === 503) {
        setBanner({ text: "Pro isn’t open for checkout yet — opening the waitlist…", tone: "info" });
        window.location.href = PRICING_URL;
      } else if (res.status === 0) {
        setBanner({ text: "Couldn’t reach the billing service. Please try again.", tone: "err" });
      } else {
        setBanner({ text: res.body?.error || "Couldn’t start checkout. Please try again.", tone: "err" });
      }
      setWantsUpgrade(false);
    })();
  }, [wantsUpgrade, auth.ready, auth.session]); // eslint-disable-line react-hooks/exhaustive-deps

  const UNLOCKS = [
    ["Saved jobs", "Keep every role you analyze, with its gaps and plan, in one place."],
    ["Readiness on every device", "Your resume match, questions and practice follow you wherever you sign in."],
    ["Defend scenarios", "Practice defending decisions under follow-ups, attributed to the job you\u2019re preparing for."],
  ];

  return (
    <div className="page">
      {banner && <div className={"banner banner-" + banner.tone} role="status">{banner.text}</div>}
      {!auth.session ? (
        <div className="auth-split">
          <section className="auth-pitch">
            <h1>Sign in to OfferReady</h1>
            <p>Your preparation, organized around the job you want.</p>
            <ul>
              {UNLOCKS.map(([t, d]) => (
                <li key={t}><strong>{t}</strong><span>{d}</span></li>
              ))}
            </ul>
          </section>
          <div className="card card-raised auth-card">
            <AuthForm />
          </div>
        </div>
      ) : (
        <>
          <header className="page-head"><h1>Account</h1><p>Your sign-in and plan.</p></header>
          <Card>
            <h2>Profile</h2>
            <AuthForm />
          </Card>
        </>
      )}
      <Card className="plan-card">
        <div>
          <h2>OfferReady Pro</h2>
          <p className="muted">The full defend-your-decision library, AI answer grading, scenarios generated for your exact job, and more saved jobs.</p>
        </div>
        <div className="row wrap">
          <button type="button" className="btn btn-primary" onClick={() => { started.current = false; setWantsUpgrade(true); }}>Upgrade to Pro</button>
          <ExternalLink className="btn btn-ghost" href={PRICING_URL}>Compare Free and Pro</ExternalLink>
        </div>
      </Card>
    </div>
  );
}
