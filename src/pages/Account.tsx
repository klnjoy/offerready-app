/* Account: sign in/out, and the checkout bridge (was
 * content/assets/upgrade.js). ?upgrade=1[&option=job|pass30|pass90|pass365|mock10|monthly|annual]
 * starts checkout once signed in (no option: the 90-day pass when sold, else
 * the first configured option; "sprint" is the old name of pass30). Checkout itself is created server-side
 * (/api/billing/checkout); "Manage billing" opens the Stripe portal
 * (/api/billing/portal). */

import { useEffect, useRef, useState } from "react";
import { API_ENABLED, DOCS_BASE, PRICING_URL, SUPPORT_EMAIL } from "../config";
import * as api from "../lib/api";
import type { BillingInfo, BillingOption } from "../lib/api";
import { useAuth } from "../lib/auth";
import { invalidateBilling, shortDate, useBilling } from "../lib/billing";
import { PLAN_MATRIX, featureNoun, usePlan, type Feature } from "../lib/plans";
import { MOCK_PACK, PASSES, POPULAR, passName } from "../lib/passes";
import { Link, useNavigate, useSearchParams } from "../lib/router";
import { downloadText } from "../lib/analysisExport";
import { installState, promptInstall, subscribePwa } from "../lib/pwa";
import { KEYS, allLocalKeys, writeStringQuiet } from "../lib/storage";
import { deleteAllSyncedData, exportAllData } from "../lib/sync";
import { AuthForm } from "../components/AuthForm";
import { SyncStatus } from "../components/SyncStatus";
import { Card } from "../components/ui";
import { track } from "../lib/track";

type Banner = { text: string; tone: "info" | "ok" | "err" } | null;
type Want = BillingOption | "auto" | null;

function parseOption(v: string | null): Want {
  if (v === "sprint") return "pass30";
  return v && api.BILLING_OPTIONS.includes(v as BillingOption) ? (v as BillingOption) : "auto";
}

/** No explicit option: the most popular pass when sold, else the first configured one. */
function resolveOption(want: Want, info: BillingInfo | null): BillingOption {
  if (want && want !== "auto") return want;
  if (info && info.options.length && !info.options.includes(POPULAR)) return info.options[0];
  return POPULAR;
}

export default function AccountPage() {
  const auth = useAuth();
  const params = useSearchParams();
  const navigate = useNavigate();
  const billing = useBilling();
  const [wantsUpgrade, setWantsUpgradeRaw] = useState<Want>(params.get("upgrade") === "1" ? parseOption(params.get("option")) : null);
  const [banner, setBanner] = useState<Banner>(null);
  const started = useRef(false);
  const setWantsUpgrade = (w: Want | boolean) => setWantsUpgradeRaw(w === true ? "auto" : w === false ? null : w);

  useEffect(() => {
    // Drop the flag from the URL so a refresh doesn't re-trigger checkout.
    // Also catches ?upgrade=1 arriving while this page is already open.
    if (params.get("upgrade") === "1") {
      started.current = false;
      setWantsUpgrade(parseOption(params.get("option")));
      navigate("/account", { replace: true });
    }
  }, [params]); // eslint-disable-line react-hooks/exhaustive-deps

  useEffect(() => {
    if (!wantsUpgrade || !auth.ready || started.current) return;
    // "auto" picks from the configured options, so wait for them (briefly).
    if (wantsUpgrade === "auto" && auth.session && billing.loading) return;
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
      const option = resolveOption(wantsUpgrade, billing.info);
      track("checkout_started", { option });
      const res = await api.startCheckoutOption(tok, option);
      if (res.status === 200 && res.body?.url) {
        setBanner({ text: "Redirecting to secure checkout…", tone: "ok" });
        window.location.href = res.body.url;
      } else if (res.status === 401) {
        started.current = false;
        setBanner({ text: "Please sign in below, then try again.", tone: "info" });
      } else if (res.status === 503) {
        setBanner({ text: "Passes aren’t open for checkout yet — opening the waitlist…", tone: "info" });
        window.location.href = PRICING_URL;
      } else if (res.status === 0) {
        setBanner({ text: "Couldn’t reach the billing service. Please try again.", tone: "err" });
      } else if (res.status === 409) {
        setBanner({ text: res.body?.error || "You already have a subscription. Use Manage billing to change it.", tone: "info" });
      } else {
        setBanner({ text: res.body?.error || "Couldn’t start checkout. Please try again.", tone: "err" });
      }
      setWantsUpgrade(false);
    })();
  }, [wantsUpgrade, auth.ready, auth.session, billing.loading]); // eslint-disable-line react-hooks/exhaustive-deps

  const portalBusy = useRef(false);
  const openPortal = async () => {
    if (portalBusy.current) return;
    portalBusy.current = true;
    setBanner({ text: "Opening billing…", tone: "info" });
    try {
      const tok = await auth.getAccessToken();
      if (!tok) { setBanner({ text: "Please sign in again, then try once more.", tone: "info" }); return; }
      const res = await api.openBillingPortal(tok);
      if (res.status === 200 && res.body?.url) {
        setBanner({ text: "Redirecting to Stripe…", tone: "ok" });
        invalidateBilling();
        window.location.href = res.body.url;
        return;
      }
      if (res.status === 404) setBanner({ text: res.body?.error || "No billing account yet.", tone: "info" });
      else if (res.status === 503) setBanner({ text: "Billing isn’t available right now. Please try again later.", tone: "err" });
      else if (res.status === 0) setBanner({ text: "Couldn’t reach the billing service. Please try again.", tone: "err" });
      else setBanner({ text: res.body?.error || "Couldn’t open billing. Please try again.", tone: "err" });
    } finally {
      portalBusy.current = false;
    }
  };

  const UNLOCKS = [
    ["Saved jobs", "Keep every role you analyze, with its gaps and plan, in one place."],
    ["Readiness on every device", "Your resume match, questions and practice follow you wherever you sign in."],
    ["Trade-off drills", "Practise defending your decisions when the interviewer pushes back, counted toward the job you\u2019re preparing for."],
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
        <PlanUsageCard
          billing={billing.info}
          refreshBilling={billing.refresh}
          onUpgrade={(o) => { started.current = false; setWantsUpgrade(o || "auto"); }}
          onPortal={openPortal}
        />
      ) : (
        <Card className="plan-card">
          <div>
            <h2>OfferReady passes</h2>
            <p className="muted">Pay once for the length of your search: the full trade-off drill library, AI answer grading, voice mock interviews and scenarios for your exact job. Nothing renews.</p>
          </div>
          <div className="row wrap">
            <Link className="btn btn-primary" to="/pricing">See passes</Link>
          </div>
        </Card>
      )}
      <YourDataCard />
      <InstallAppCard />
    </div>
  );
}

// ---- your data: sync, export, delete ----------------------------------------

const CONTACT_URL = DOCS_BASE + "Contact/index.html";
const CONFIRM_WORD = "DELETE";

function SupportLink() {
  return SUPPORT_EMAIL
    ? <a href={"mailto:" + SUPPORT_EMAIL + "?subject=" + encodeURIComponent("Delete my OfferReady account")}>{SUPPORT_EMAIL}</a>
    : <a href={CONTACT_URL} target="_blank" rel="noopener noreferrer">the Contact page</a>;
}

/** Saved jobs from the API, in full, for the export file. */
async function exportJobs(token: string | null): Promise<{ included: boolean; items: unknown[]; error?: string }> {
  if (!token || !API_ENABLED) return { included: false, items: [] };
  const list = await api.listJobs(token);
  if (list.status !== 200 || !list.body) return { included: false, items: [], error: "Couldn’t load your saved jobs (status " + list.status + ")." };
  const items: unknown[] = [];
  for (const row of list.body.jobs || []) {
    const d = await api.getJob(token, row.id);
    if (d.status === 200 && d.body) {
      const { ok: _ok, ...detail } = d.body;
      void _ok;
      items.push(detail);
    } else items.push({ ...row, error: "Details couldn’t be loaded." });
  }
  return { included: true, items };
}

/** Removes every OfferReady key from this browser. Keeps the sync pause flag
 * (deleteAllSyncedData sets it) so nothing is uploaded again by accident, and
 * the Supabase sign-in session, so the user stays signed in. */
function clearLocalData(): number {
  let n = 0;
  for (const k of allLocalKeys()) {
    if (k === KEYS.syncOff) continue;
    writeStringQuiet(k, null);
    n++;
  }
  try {
    for (let i = sessionStorage.length - 1; i >= 0; i--) {
      const k = sessionStorage.key(i);
      if (k && /^(offerready\.|ip_|or_)/.test(k)) sessionStorage.removeItem(k);
    }
  } catch {
    /* blocked */
  }
  return n;
}

type DelResult = { ok: boolean; lines: string[] };

function YourDataCard() {
  const auth = useAuth();
  const signedIn = !!auth.session;
  const [exportMsg, setExportMsg] = useState<Banner>(null);
  const [exporting, setExporting] = useState(false);
  const [open, setOpen] = useState(false);
  const [typed, setTyped] = useState("");
  const [deleting, setDeleting] = useState(false);
  const [result, setResult] = useState<DelResult | null>(null);
  const confirmed = typed.trim() === CONFIRM_WORD;

  const onExport = async () => {
    if (exporting) return;
    setExporting(true);
    setExportMsg({ text: "Preparing your file…", tone: "info" });
    try {
      const data = await exportAllData();
      const jobs = await exportJobs(signedIn ? await auth.getAccessToken() : null);
      const file = { ...data, jobs };
      const day = new Date().toISOString().slice(0, 10);
      downloadText("offerready-data-" + day + ".json", JSON.stringify(file, null, 2), "application/json;charset=utf-8");
      const notes = [data.account.error, jobs.error].filter(Boolean);
      setExportMsg(notes.length
        ? { text: "Downloaded, but some parts were missing: " + notes.join(" "), tone: "err" }
        : { text: "Downloaded offerready-data-" + day + ".json.", tone: "ok" });
    } catch {
      setExportMsg({ text: "Couldn’t create the file. Please try again.", tone: "err" });
    } finally {
      setExporting(false);
    }
  };

  const onDelete = async () => {
    if (!confirmed || deleting) return;
    setDeleting(true);
    setResult(null);
    const lines: string[] = [];
    let ok = true;
    if (signedIn) {
      // 1. Synced copies (this also pauses sync on this device).
      const r = await deleteAllSyncedData();
      if (r.ok) lines.push("Synced preparation data and synced resume: deleted.");
      else { ok = false; lines.push("Synced data: not deleted (" + (r.error || "error") + ")."); }
      // 2. Saved jobs, with their analyses, questions and readiness history.
      const tok = await auth.getAccessToken();
      if (tok && API_ENABLED) {
        const list = await api.listJobs(tok);
        if (list.status === 200 && list.body) {
          const jobs = list.body.jobs || [];
          let gone = 0;
          for (const j of jobs) {
            const d = await api.deleteJob(tok, j.id);
            if (d.status === 200 || d.status === 404) gone++;
          }
          if (gone === jobs.length) lines.push("Saved jobs: " + (jobs.length ? "deleted " + jobs.length + "." : "none to delete."));
          else { ok = false; lines.push("Saved jobs: deleted " + gone + " of " + jobs.length + ". Try again for the rest."); }
        } else { ok = false; lines.push("Saved jobs: couldn’t be loaded, so none were deleted. Try again."); }
      } else if (API_ENABLED) { ok = false; lines.push("Saved jobs: please sign in again, then retry."); }
    }
    // 3. This browser.
    const n = clearLocalData();
    lines.push("This browser: cleared " + n + " item" + (n === 1 ? "" : "s") + ".");
    setResult({ ok, lines });
    setDeleting(false);
    setTyped("");
    if (ok) setOpen(false);
  };

  return (
    <Card className="lp-data">
      <div className="lp-data-head">
        <h2>Your data</h2>
        <p className="muted">
          {signedIn
            ? "Your preparation syncs to your account so it follows you to every device. Download a copy or delete it any time."
            : "Signed out, OfferReady keeps your preparation in this browser only. Download a copy or clear it any time."}
        </p>
      </div>
      {signedIn && <SyncStatus />}

      <div className="lp-data-row">
        <div>
          <h3>Download my data</h3>
          <p className="hint">A JSON file with {signedIn ? "your saved jobs and their analyses, your synced preparation data, and " : ""}everything OfferReady keeps in this browser.</p>
        </div>
        <button type="button" className="btn btn-ghost" onClick={onExport} disabled={exporting}>{exporting ? "Preparing…" : "Download my data"}</button>
      </div>
      {exportMsg && <p className={"lp-note lp-note-" + exportMsg.tone} role="status">{exportMsg.text}</p>}

      <div className="lp-data-row">
        <div>
          <h3>Delete my data</h3>
          <p className="hint">Permanently delete your preparation data. This can’t be undone.</p>
        </div>
        {!open && <button type="button" className="btn btn-ghost lp-danger-ghost" onClick={() => { setOpen(true); setResult(null); }}>Delete my data…</button>}
      </div>
      {open && (
        <div className="lp-delete" role="group" aria-labelledby="lp-del-title">
          <h3 id="lp-del-title">This permanently deletes:</h3>
          <ul>
            {signedIn && <li><strong>Your saved jobs</strong>, with their analyses, resume matches, generated questions, practice results and readiness history.</li>}
            {signedIn && <li><strong>Your synced data</strong>: plan progress, interview dates, stories, debriefs, offers, practice history, help chats and your synced resume.</li>}
            <li><strong>Everything OfferReady keeps in this browser</strong>, including your saved resume and recent voice sessions.</li>
          </ul>
          <p className="hint">
            {signedIn
              ? <>It does <strong>not</strong> delete your sign-in account, cancel your plan, or reset this month’s usage. To cancel Pro, use Manage billing. Sync stays paused on this device afterwards; if you’re signed in on other devices, delete there too or their copies will sync back. </>
              : <>Sign in first if you also want to delete your saved jobs and synced data. </>}
            {SUPPORT_EMAIL
              ? <>To delete your account entirely, email <SupportLink /> from the address you signed up with.</>
              : <>To delete your account entirely, contact us through <SupportLink />.</>}
          </p>
          <label className="field-label" htmlFor="lp-del-confirm">Type <code>{CONFIRM_WORD}</code> to confirm</label>
          <input id="lp-del-confirm" className="input lp-del-input" value={typed} autoComplete="off" spellCheck={false}
            onChange={(e) => setTyped(e.target.value)} onKeyDown={(e) => { if (e.key === "Enter") void onDelete(); }} aria-describedby="lp-del-title" />
          <div className="row wrap">
            <button type="button" className="btn btn-danger" disabled={!confirmed || deleting} onClick={onDelete}>{deleting ? "Deleting…" : "Delete my data"}</button>
            <button type="button" className="btn btn-ghost" disabled={deleting} onClick={() => { setOpen(false); setTyped(""); }}>Cancel</button>
          </div>
        </div>
      )}
      {result && (
        <div className={"lp-note lp-note-" + (result.ok ? "ok" : "err")} role="status">
          <strong>{result.ok ? "Your data was deleted." : "Some data wasn’t deleted."}</strong>
          <ul>{result.lines.map((l) => <li key={l}>{l}</li>)}</ul>
          <button type="button" className="btn btn-ghost btn-small" onClick={() => window.location.reload()}>Reload the app</button>
        </div>
      )}
    </Card>
  );
}

// ---- install the app ---------------------------------------------------------------

function InstallAppCard() {
  const [state, setState] = useState(installState());
  const [msg, setMsg] = useState("");
  useEffect(() => subscribePwa(() => setState(installState())), []);
  if (state === "installed") return null;
  const install = async () => {
    const r = await promptInstall();
    setMsg(r === "accepted" ? "Installing OfferReady…" : r === "dismissed" ? "No problem. You can install it later from here." : "");
    setState(installState());
  };
  return (
    <Card className="lp-install">
      <div className="lp-install-copy">
        <h2>Install the app</h2>
        <p className="muted">Open OfferReady from your home screen or dock, in its own window. It opens even when you’re offline.</p>
        {state === "ios" && (
          <ol className="lp-install-steps">
            <li>In Safari, tap the <strong>Share</strong> button.</li>
            <li>Choose <strong>Add to Home Screen</strong>, then tap <strong>Add</strong>.</li>
          </ol>
        )}
        {state === "manual" && (
          <p className="hint">In Chrome or Edge, use the install icon in the address bar or the browser menu’s “Install app”. On Android, choose “Add to Home screen”.</p>
        )}
        {msg && <p className="hint" role="status">{msg}</p>}
      </div>
      {state === "prompt" && <button type="button" className="btn btn-primary" onClick={install}>Install app</button>}
    </Card>
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
        <div className="meter-top"><span>{label}</span><span className="pill pill-info">With a pass</span></div>
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

/** "90-day pass · ends Jan 7", "Pro · renews monthly", "Pro · ends Nov 8". */
function sourceLine(b: BillingInfo | null, passEnd?: string): string | null {
  if (!b || !b.pro_source) return null;
  const end = shortDate(b.pro_expires_at || passEnd);
  if (b.pro_source === "pass") {
    const queued = Math.max(0, (b.pass_kinds?.length || 1) - 1);
    return passName(b.pass_kind) + (end ? " · ends " + end : "") + (queued ? ` · ${queued} more queued` : "") + " · doesn’t renew";
  }
  if (b.pro_source === "sprint") return "30-day pass" + (end ? " · ends " + end : "") + " · doesn’t renew";
  if (b.cancel_at_period_end) return "Pro" + (end ? " · ends " + end : " · cancels at period end");
  return "Pro · renews " + (b.pro_interval === "year" ? "yearly" : "monthly") + (end ? " · next on " + end : "");
}

function PlanUsageCard({ billing, refreshBilling, onUpgrade, onPortal }: {
  billing: BillingInfo | null;
  refreshBilling(): void;
  onUpgrade(option?: BillingOption): void;
  onPortal(): void;
}) {
  const p = usePlan();
  const refreshed = useRef(false);
  useEffect(() => {
    // Account is where people check after paying: always show fresh numbers.
    if (!refreshed.current) { refreshed.current = true; p.refresh(); refreshBilling(); }
  }, []); // eslint-disable-line react-hooks/exhaustive-deps

  const isPro = p.plan === "pro";
  const source = billing?.pro_source || null;
  const onPass = isPro && (!!p.pass || source === "pass" || source === "sprint");
  const onSub = isPro && source === "subscription";
  const opts = billing ? billing.options : [];
  const sells = (o: BillingOption) => !billing || opts.includes(o);
  const anyUnknown = METER_FEATURES.some((f) => p.usage[f]?.unknown);
  const resets = p.resetsAt && !onPass
    ? new Date(p.resetsAt).toLocaleDateString(undefined, { month: "long", day: "numeric", timeZone: "UTC" })
    : null;
  const line = isPro ? sourceLine(billing, p.pass?.expiresAt) : null;
  const passKind = p.pass?.kind || billing?.pass_kind || null;
  const title = p.loading ? "Loading…" : onPass ? passName(passKind || "pass30") : isPro ? "OfferReady Pro" : "Free";
  const days = p.pass ? Math.ceil((Date.parse(p.pass.expiresAt) - Date.now()) / 86400000) : null;

  return (
    <Card className="plan-usage">
      <div className="plan-usage-head">
        <div>
          <span className="plan-usage-kicker">Current plan</span>
          <h2>{title}</h2>
          {line && <p className="bl-source">{line}</p>}
        </div>
        {!p.loading && <span className={"pill " + (isPro ? "pill-ok" : "pill-info")}>{onPass ? (days != null && days > 0 ? days + (days === 1 ? " day left" : " days left") : "Pass") : isPro ? "Pro" : "Free"}</span>}
      </div>
      {!p.loading && (
        <>
          <p className="muted small">
            {onPass ? "Used in this pass" : isPro ? "Fair-use limits this month" : "Your usage this month"}
            {resets ? ` · resets ${resets}` : ""}
          </p>
          <ul className="meters">
            {METER_FEATURES.map((f) => {
              const u = p.usage[f];
              return <UsageMeter key={f} feature={f} used={u ? u.used : 0} limit={u ? u.limit : null} unknown={!u || u.unknown} />;
            })}
          </ul>
          {p.mockCredits > 0 && (
            <p className="bl-credits"><strong>{p.mockCredits}</strong> extra mock {p.mockCredits === 1 ? "interview" : "interviews"} from mock packs. They never expire and are used after your plan’s own.</p>
          )}
          {anyUnknown && <p className="hint">Usage counts aren’t available right now. Nothing is blocked while they’re unavailable.</p>}
        </>
      )}
      {onPass ? (
        <div className="plan-usage-cta">
          <p className="muted">
            Your pass doesn’t renew, so there’s nothing to cancel. Another pass starts when this one ends, and its allowance is added right away.
          </p>
          <div className="row wrap">
            <Link className="btn btn-primary" to="/pricing">Add another pass</Link>
            {sells(MOCK_PACK.kind) && <button type="button" className="btn btn-ghost" onClick={() => onUpgrade(MOCK_PACK.kind)}>Add {MOCK_PACK.amount} mock interviews ({MOCK_PACK.price})</button>}
            {billing?.portal && <button type="button" className="btn btn-ghost" onClick={onPortal}>Receipts</button>}
          </div>
        </div>
      ) : onSub ? (
        billing?.portal ? (
          <div className="plan-usage-cta">
            <p className="muted">Update your card, see invoices or cancel in the Stripe customer portal.</p>
            <div className="row wrap">
              <button type="button" className="btn btn-primary" onClick={onPortal}>Manage billing</button>
            </div>
          </div>
        ) : (
          <p className="plan-usage-note">
            <strong>Manage billing.</strong> Update your card or cancel from the Stripe customer portal (the “Manage subscription” link in any Stripe receipt email), or email us and we’ll take care of it.
          </p>
        )
      ) : (
        <div className="plan-usage-cta">
          <p className="muted">
            Get a pass for the length of your search. The {PASSES[POPULAR].name} is {PASSES[POPULAR].price}, one-time, and nothing renews.
          </p>
          <div className="row wrap">
            <Link className="btn btn-primary" to="/pricing">See passes</Link>
            {sells(MOCK_PACK.kind) && <button type="button" className="btn btn-ghost" onClick={() => onUpgrade(MOCK_PACK.kind)}>Just {MOCK_PACK.amount} mock interviews ({MOCK_PACK.price})</button>}
            {billing?.portal && <button type="button" className="btn btn-ghost" onClick={onPortal}>Receipts</button>}
          </div>
        </div>
      )}
    </Card>
  );
}
