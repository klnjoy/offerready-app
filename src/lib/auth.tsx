/* Supabase auth (was window.OfferReadyAuth in content/assets/auth.js).
 *
 * Establishes IDENTITY only, never access: premium access is always decided
 * server-side. Fails closed — if Supabase isn't configured, auth stays
 * disabled and the UI says sign-in isn't available. */

import { createContext, useCallback, useContext, useEffect, useMemo, useState, type ReactNode } from "react";
import { createClient, type Session, type SupabaseClient } from "@supabase/supabase-js";
import { SUPABASE_ANON_KEY, SUPABASE_URL } from "../config";

let client: SupabaseClient | null = null;
function getClient(): SupabaseClient | null {
  if (client) return client;
  if (!SUPABASE_URL || !SUPABASE_ANON_KEY) return null;
  try {
    client = createClient(SUPABASE_URL, SUPABASE_ANON_KEY, {
      auth: { persistSession: true, autoRefreshToken: true, detectSessionInUrl: true },
    });
  } catch {
    client = null;
  }
  return client;
}

type AuthResult = { error?: string; message?: string };

export interface AuthState {
  configured: boolean;
  ready: boolean;
  session: Session | null;
  email: string | null;
  /** Always reads a fresh token (the cached session may have expired). */
  getAccessToken(): Promise<string | null>;
  signIn(email: string, password: string): Promise<AuthResult>;
  signUp(email: string, password: string): Promise<AuthResult>;
  signInWithProvider(provider: "google" | "github"): Promise<AuthResult>;
  resetPassword(email: string): Promise<AuthResult>;
  signOut(): Promise<void>;
}

const AuthContext = createContext<AuthState | null>(null);

const NOT_AVAILABLE = "Sign-in isn’t available yet.";

export function AuthProvider({ children }: { children: ReactNode }) {
  const c = getClient();
  const [session, setSession] = useState<Session | null>(null);
  const [ready, setReady] = useState(!c);

  useEffect(() => {
    if (!c) return;
    let alive = true;
    c.auth
      .getSession()
      .then((r) => {
        if (alive) setSession(r.data.session ?? null);
      })
      .catch(() => {})
      .finally(() => alive && setReady(true));
    const { data } = c.auth.onAuthStateChange((_evt, s) => setSession(s ?? null));
    return () => {
      alive = false;
      data.subscription.unsubscribe();
    };
  }, [c]);

  const getAccessToken = useCallback(async () => {
    if (!c) return null;
    try {
      const r = await c.auth.getSession();
      return r.data.session?.access_token ?? null;
    } catch {
      return null;
    }
  }, [c]);

  const value = useMemo<AuthState>(
    () => ({
      configured: !!c,
      ready,
      session,
      email: session?.user?.email ?? (session ? "signed in" : null),
      getAccessToken,
      async signIn(email, password) {
        if (!c) return { error: NOT_AVAILABLE };
        const r = await c.auth.signInWithPassword({ email, password });
        return r.error ? { error: r.error.message } : {};
      },
      async signUp(email, password) {
        if (!c) return { error: NOT_AVAILABLE };
        const r = await c.auth.signUp({ email, password });
        return r.error ? { error: r.error.message } : { message: "Check your email to confirm your account." };
      },
      async signInWithProvider(provider) {
        if (!c) return { error: NOT_AVAILABLE };
        const r = await c.auth.signInWithOAuth({
          provider,
          options: { redirectTo: window.location.origin + window.location.pathname },
        });
        return r.error ? { error: r.error.message } : {};
      },
      async resetPassword(email) {
        if (!c) return { error: NOT_AVAILABLE };
        const r = await c.auth.resetPasswordForEmail(email, {
          redirectTo: window.location.origin + window.location.pathname,
        });
        return r.error ? { error: r.error.message } : { message: "If that email exists, a reset link is on its way." };
      },
      async signOut() {
        if (c) await c.auth.signOut();
      },
    }),
    [c, ready, session, getAccessToken],
  );

  return <AuthContext.Provider value={value}>{children}</AuthContext.Provider>;
}

export function useAuth(): AuthState {
  const v = useContext(AuthContext);
  if (!v) throw new Error("useAuth must be used inside <AuthProvider>");
  return v;
}
