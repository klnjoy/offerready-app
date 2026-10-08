/* Account: sign in/out, and the Upgrade-to-Pro checkout bridge (was
 * content/assets/upgrade.js). ?upgrade=1 starts checkout once signed in.
 * Checkout itself is created server-side (/api/billing/checkout). */

import { useEffect, useRef, useState } from "react";
import { API_ENABLED, PRICING_URL, PRO_PRICE_LABEL } from "../config";
import * as api from "../lib/api";
import { useAuth } from "../lib/auth";
import { PLAN_MATRIX, featureNoun, usePlan, type Feature } from "../lib/plans";
import { Link, useNavigate, useSearchParams } from "../lib/router";
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
    // Also catches ?upgrade=1 arriving while this page is already open.
    if (params.get("upgrade") === "1") {
      started.current = false;
      setWantsUpgrade(true);
      navigate("/account", { replace: true });
    }
  }, [params]); // eslint-disable-line react-hooks/exhaustive-deps

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
      {auth.session ? (
        <PlanUsageCard onUpgrade={() => { started.current = false; setWantsUpgrade(true); }} />
      ) : (
        <Card className="plan-card">
          <div>
            <h2>OfferReady Pro</h2>
            <p className="muted">The full defend-your-decision library, AI answer grading, scenarios generated for your exact job, and more saved jobs.</p>
          </div>
          <div className="row wrap">
            <button type="button" className="btn btn-primary" onClick={() => { started.current = false; setWantsUpgrade(true); }}>Upgrade to Pro</button>
            <Link className="btn btn-ghost" to="/pricing">Compare Free and Pro</Link>
          </div>
        </Card>
      )}
    </div>
  );
}

// ---- plan + usage ------------------------------------------------------------

/** Limited features shown as meters, in PLAN_MATRIX order. */
const METER_FEATURES: Feature[] = PLAN_MATRIX
  .map((r) => r.feature)
  .filter((f): f is Feature => f !== "library" && f !== "prep_plan" && f !== "premium_scenarios");

function UsageMeter({ feature, used, limit, unknown }: { feature: Feature; used: number; limit: number | null; unknown?: boolean }) {
  const label = PLAN_MATRIX.find((r) => r.feature === feature)?.label || featureNoun(feature, 2);
  if (limit === 0) {
    return (
      <li className="meter meter-locked">
        <div className="meter-top"><span>{label}</span><span className="pill pill-info">Pro</span></div>
      </li>
    );
  }
  const pct = limit === null || unknown ? 0 : Math.min(100, Math.round((used / Math.max(1, limit)) * 100));
  const tone = limit !== null && !unknown && used >= limit ? " meter-full" : pct >= 80 ? " meter-near" : "";
  const value = unknown ? "Not available" : limit === null ? (feature === "saved_jobs" ? `${used} · Unlimited` : "Unlimited") : `${used} of ${limit}`;
  return (
    <li className={"meter" + tone}>
      <div className="meter-top"><span>{label}</span><span className="meter-val">{value}</span></div>
      {limit !== null && !unknown && (
        <div className="meter-track" role="progressbar" aria-label={label} aria-valuemin={0} aria-valuemax={limit} aria-valuenow={Math.min(used, limit)}>
          <div className="meter-fill" style={{ width: Math.max(pct ? 3 : 0, pct) + "%" }} />
        </div>
      )}
    </li>
  );
}

function PlanUsageCard({ onUpgrade }: { onUpgrade(): void }) {
  const p = usePlan();
  const refreshed = useRef(false);
  useEffect(() => {
    // Account is where people check after paying: always show fresh numbers.
    if (!refreshed.current) { refreshed.current = true; p.refresh(); }
  }, []); // eslint-disable-line react-hooks/exhaustive-deps

  const isPro = p.plan === "pro";
  const anyUnknown = METER_FEATURES.some((f) => p.usage[f]?.unknown);
  const resets = p.resetsAt
    ? new Date(p.resetsAt).toLocaleDateString(undefined, { month: "long", day: "numeric", timeZone: "UTC" })
    : null;

  return (
    <Card className="plan-usage">
      <div className="plan-usage-head">
        <div>
          <span className="plan-usage-kicker">Current plan</span>
          <h2>{p.loading ? "Loading…" : isPro ? "OfferReady Pro" : "Free"}</h2>
        </div>
        {!p.loading && <span className={"pill " + (isPro ? "pill-ok" : "pill-info")}>{isPro ? "Pro" : "Free"}</span>}
      </div>
      {!p.loading && (
        <>
          <p className="muted small">
            {isPro ? "Fair-use limits this month" : "Your usage this month"}
            {resets ? ` · resets ${resets}` : ""}
          </p>
          <ul className="meters">
            {METER_FEATURES.map((f) => {
              const u = p.usage[f];
              return <UsageMeter key={f} feature={f} used={u ? u.used : 0} limit={u ? u.limit : null} unknown={!u || u.unknown} />;
            })}
          </ul>
          {anyUnknown && <p className="hint">Usage counts aren’t available right now. Nothing is blocked while they’re unavailable.</p>}
        </>
      )}
      {isPro ? (
        <p className="plan-usage-note">
          <strong>Manage billing.</strong> Update your card or cancel from the Stripe customer portal (the “Manage subscription” link in any Stripe receipt email), or email us and we’ll take care of it.
        </p>
      ) : (
        <div className="plan-usage-cta">
          <p className="muted">Pro unlocks the full scenario library, scenarios generated for your job and higher limits for {PRO_PRICE_LABEL}.</p>
          <div className="row wrap">
            <button type="button" className="btn btn-primary" onClick={onUpgrade}>Upgrade to Pro</button>
            <Link className="btn btn-ghost" to="/pricing">Compare plans</Link>
          </div>
        </div>
      )}
    </Card>
  );
}
