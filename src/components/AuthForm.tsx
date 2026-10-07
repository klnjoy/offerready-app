/* Sign-in form (email/password + Google/GitHub). Was the #or-auth-slot UI
 * rendered by content/assets/auth.js. */

import { useState, type FormEvent, type ReactNode } from "react";
import { useAuth } from "../lib/auth";
import { Link } from "../lib/router";

type Mode = "signin" | "signup";

export function AuthForm() {
  const auth = useAuth();
  const [mode, setMode] = useState<Mode>("signin");
  const [email, setEmail] = useState("");
  const [password, setPassword] = useState("");
  const [msg, setMsg] = useState<{ text: string; err?: boolean } | null>(null);
  const [busy, setBusy] = useState(false);

  if (!auth.configured) {
    return <p className="muted">Sign-in isn{"’"}t enabled on this site yet.</p>;
  }

  if (auth.session) {
    return (
      <div className="auth-signed-in">
        <span className="avatar avatar-lg" aria-hidden="true">{(auth.email || "?").charAt(0).toUpperCase()}</span>
        <div className="auth-who">
          <span className="muted small">Signed in as</span>
          <strong>{auth.email}</strong>
        </div>
        <button type="button" className="btn btn-ghost" onClick={() => auth.signOut()}>Sign out</button>
      </div>
    );
  }

  const run = async (label: string, fn: () => Promise<{ error?: string; message?: string }>) => {
    setBusy(true);
    setMsg({ text: label });
    try {
      const r = await fn();
      setMsg(r.error ? { text: r.error, err: true } : r.message ? { text: r.message } : null);
    } catch (e) {
      setMsg({ text: (e as Error).message || "Something went wrong.", err: true });
    } finally {
      setBusy(false);
    }
  };

  const onSubmit = (e: FormEvent) => {
    e.preventDefault();
    if (mode === "signin") run("Signing in…", () => auth.signIn(email.trim(), password));
    else run("Creating account…", () => auth.signUp(email.trim(), password));
  };

  return (
    <form className="auth-form" onSubmit={onSubmit}>
      <div className="auth-tabs" role="tablist" aria-label="Sign in or create account">
        <button type="button" role="tab" aria-selected={mode === "signin"} className={mode === "signin" ? "on" : ""} onClick={() => { setMode("signin"); setMsg(null); }}>Sign in</button>
        <button type="button" role="tab" aria-selected={mode === "signup"} className={mode === "signup" ? "on" : ""} onClick={() => { setMode("signup"); setMsg(null); }}>Create account</button>
      </div>
      <div className="oauth-row">
        <button type="button" className="btn btn-oauth" disabled={busy}
          onClick={() => run("Redirecting to Google…", () => auth.signInWithProvider("google"))}>
          Continue with Google
        </button>
        <button type="button" className="btn btn-oauth" disabled={busy}
          onClick={() => run("Redirecting to GitHub…", () => auth.signInWithProvider("github"))}>
          Continue with GitHub
        </button>
      </div>
      <div className="auth-divider"><span>or with email</span></div>
      <label className="field-label" htmlFor="auth-email">Email</label>
      <input id="auth-email" className="input" type="email" placeholder="you@email.com" autoComplete="email" required
        value={email} onChange={(e) => setEmail(e.target.value)} />
      <div className="auth-pw-row">
        <label className="field-label" htmlFor="auth-pw">Password</label>
        {mode === "signin" && (
          <button type="button" className="link-btn small" disabled={busy}
            onClick={() => {
              if (!email.trim()) { setMsg({ text: "Enter your email first, then choose Forgot password.", err: true }); return; }
              run("Sending reset link…", () => auth.resetPassword(email.trim()));
            }}>
            Forgot password?
          </button>
        )}
      </div>
      <input id="auth-pw" className="input" type="password" placeholder={mode === "signup" ? "At least 6 characters" : "Password"}
        autoComplete={mode === "signup" ? "new-password" : "current-password"} required
        value={password} onChange={(e) => setPassword(e.target.value)} />
      <button type="submit" className="btn btn-primary btn-block" disabled={busy}>
        {mode === "signin" ? "Sign in" : "Create account"}
      </button>
      {msg ? <div className={"auth-msg" + (msg.err ? " error" : "")} role="status">{msg.text}</div> : null}
    </form>
  );
}

/** Sign-in panel used by screens that need a signed-in user. */
export function SignInCard({ title, children }: { title: string; children?: ReactNode }) {
  return (
    <div className="auth-gate">
      <div className="auth-gate-copy">
        <h2>{title}</h2>
        {children}
        <p className="muted small">New here? <Link to="/example">See a sample walkthrough</Link> first.</p>
      </div>
      <div className="card card-raised">
        <AuthForm />
      </div>
    </div>
  );
}
