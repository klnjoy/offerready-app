/* Account sync: OfferReady's local data follows the signed-in account.
 *
 * Talks to public.user_state directly with the user's Supabase session (RLS:
 * own rows only; migration 0012_user_state.sql), so no API function is
 * involved. The merge rules are in lib/syncMerge.ts (pure, unit-tested).
 *
 *  - Every write to a synced key (storage.ts write hook) marks it dirty in
 *    offerready.sync.meta.v1 and pushes after ~1.5 s, in one batched upsert.
 *    Writes are tracked while signed out too, so the next sign-in knows what
 *    changed here.
 *  - Sign-in (startSync): pull every row, reconcile per key, push the rest.
 *    A device's first sign-in merges its data with the account's; it never
 *    simply overwrites either side.
 *  - Offline / network errors: retry with backoff, and again on `online`.
 *    Flushes when the tab is hidden and on pagehide (keepalive request).
 *  - Sign-out (stopSync): stops; local data stays on the device.
 *  - FAIL-SAFE: a missing table or any error never breaks the app. It logs
 *    once and the app keeps working locally ("Sync isn't set up yet").
 *  - The saved resume syncs only with the user's opt-in (setResumeSync).
 *
 * Pages that hold data in state re-read on DATA_CHANGED_EVENT (onDataChanged
 * in storage.ts) after a pull changed it. */

import type { Session, SupabaseClient } from "@supabase/supabase-js";
import { DATA_CHANGED_EVENT, KEYS, allLocalKeys, onStorageWrite, readString, writeStringQuiet } from "./storage";
import {
  addTombs, decode, emptyMeta, encode, isSyncedKey, parseMeta, reconcile, removedIds, specFor, syncedKeys,
  type KeyMeta, type SyncMeta,
} from "./syncMerge";

const TABLE = "user_state";
const DEBOUNCE_MS = 1500;
/** The DB allows 200 000 bytes of jsonb text; jsonb's text form adds spaces. */
const MAX_VALUE_BYTES = 180000;
const BATCH_ROWS = 20;
const BACKUP_KEY = "offerready.sync.backup.v1";

// Module events of the data libs (kept in sync with their EVT constants), so
// already-mounted hooks re-read after a pull.
const LIB_EVENTS: Record<string, string> = {
  [KEYS.interviewDates]: "offerready:interviewdates",
  [KEYS.debriefs]: "offerready:debriefs",
  [KEYS.resume]: "offerready:resume",
};

export type SyncState = "signedOut" | "idle" | "syncing" | "synced" | "offline" | "error" | "unavailable" | "paused";

export interface SyncStatus {
  state: SyncState;
  /** ms of the last successful sync (this device), or null. */
  at: number | null;
  /** Keys waiting to be pushed. */
  pending: number;
  /** Short technical note for "error" / "unavailable". */
  detail?: string;
}

// ------------------------------------------------------------------ state
let client: SupabaseClient | null = null;
let uid: string | null = null;
let running = false;
let pushTimer: ReturnType<typeof setTimeout> | null = null;
let retryTimer: ReturnType<typeof setTimeout> | null = null;
let retryDelay = 2000;
let errorRetries = 0;
let lastPull = 0;
let keepalive = false;
const logged = new Set<string>();

const subs = new Set<(s: SyncStatus) => void>();
let status: SyncStatus = { state: "signedOut", at: null, pending: 0 };

function setStatus(p: Partial<SyncStatus>) {
  const meta = readMeta();
  const pending = Object.values(meta.keys).filter((k) => k.d).length;
  status = { ...status, at: meta.last || status.at || null, pending, ...p };
  // Notify asynchronously: writes (and so status changes) can happen while a
  // component renders, and React must not get a setState from inside that.
  if (notifyQueued) return;
  notifyQueued = true;
  setTimeout(() => {
    notifyQueued = false;
    for (const fn of subs) {
      try { fn(status); } catch { /* ignore */ }
    }
  }, 0);
}
let notifyQueued = false;

export function subscribeSync(fn: (s: SyncStatus) => void): () => void {
  subs.add(fn);
  try { fn(status); } catch { /* ignore */ }
  return () => { subs.delete(fn); };
}

export function getSyncStatus(): SyncStatus {
  return status;
}

function logOnce(tag: string, ...args: unknown[]) {
  if (logged.has(tag)) return;
  logged.add(tag);
  try { console.warn("[OfferReady sync]", ...args); } catch { /* ignore */ }
}

// ------------------------------------------------------------------- meta
function readMeta(): SyncMeta {
  return parseMeta(readString(KEYS.syncMeta));
}
function writeMeta(m: SyncMeta) {
  writeStringQuiet(KEYS.syncMeta, JSON.stringify(m));
}

// --------------------------------------------------------- resume opt-in
export function getResumeSync(): boolean {
  return readString(KEYS.resumeSync) === "1";
}

/** Opt this device in/out of syncing the saved resume. Opting out also
 * deletes the account's copy (when signed in). */
export async function setResumeSync(on: boolean): Promise<void> {
  const m = readMeta();
  delete m.keys[KEYS.resume];
  writeMeta(m);
  if (on) {
    writeStringQuiet(KEYS.resumeSync, "1");
    setStatus({});
    if (running) await syncNow();
    return;
  }
  writeStringQuiet(KEYS.resumeSync, null);
  setStatus({});
  if (client && uid) {
    try {
      const r = await client.from(TABLE).delete().eq("user_id", uid).eq("key", KEYS.resume);
      if (r && r.error) logOnce("resume-del", "Couldn't delete the synced resume:", r.error.message || r.error);
    } catch (e) {
      logOnce("resume-del", "Couldn't delete the synced resume:", e);
    }
  }
}

// --------------------------------------------------- pause (this device)
export function getSyncEnabled(): boolean {
  return readString(KEYS.syncOff) !== "1";
}

export async function setSyncEnabled(on: boolean): Promise<void> {
  writeStringQuiet(KEYS.syncOff, on ? null : "1");
  if (!on) {
    clearTimers();
    setStatus({ state: running ? "paused" : "signedOut" });
    return;
  }
  if (running) await syncNow();
  else setStatus({ state: "signedOut" });
}

// ------------------------------------------------------------ write hook
onStorageWrite((key, prev, next) => {
  const resumeOn = getResumeSync();
  if (!isSyncedKey(key, resumeOn)) return;
  const spec = specFor(key)!;
  const now = Date.now();
  const m = readMeta();
  const km: KeyMeta = { ...(m.keys[key] || { t: 0 }), t: now, d: 1 };
  delete km.big;
  const gone = removedIds(spec, prev, next);
  if (gone.length) km.del = addTombs(km.del, gone, now);
  m.keys[key] = km;
  writeMeta(m);
  if (running) {
    schedulePush();
    if (status.state === "synced" || status.state === "idle") setStatus({});
  }
});

function schedulePush(delay = DEBOUNCE_MS) {
  if (!running || !getSyncEnabled()) return;
  if (pushTimer) clearTimeout(pushTimer);
  pushTimer = setTimeout(() => { pushTimer = null; void push(); }, delay);
}

function clearTimers() {
  if (pushTimer) clearTimeout(pushTimer);
  if (retryTimer) clearTimeout(retryTimer);
  pushTimer = retryTimer = null;
}

// ---------------------------------------------------------------- errors
type Failure = "offline" | "missing" | "error";
function classify(error: unknown, httpStatus?: number): Failure {
  const e = (error || {}) as { code?: string; message?: string; details?: string; hint?: string };
  const msg = [e.message, e.details, e.hint].filter(Boolean).join(" ");
  if (e.code === "42P01" || e.code === "PGRST205" || e.code === "PGRST204" || httpStatus === 404 || /does not exist|schema cache|Could not find the table/i.test(msg)) return "missing";
  if ((typeof navigator !== "undefined" && navigator.onLine === false) || httpStatus === 0 || /Failed to fetch|NetworkError|Load failed|fetch failed|network/i.test(msg)) return "offline";
  return "error";
}

function fail(kind: Failure, error: unknown) {
  const e = (error || {}) as { message?: string };
  if (kind === "missing") {
    logOnce("missing", "The user_state table isn't there yet (run migration 0012). Working on this device only.");
    clearTimers();
    setStatus({ state: "unavailable", detail: "table missing" });
    return;
  }
  if (kind === "offline") {
    setStatus({ state: "offline" });
  } else {
    logOnce("error:" + (e.message || ""), "Sync failed:", e.message || error);
    errorRetries++;
    setStatus({ state: "error", detail: e.message || "request failed" });
    if (errorRetries > 5) return; // give up until the next change / syncNow
  }
  if (retryTimer) clearTimeout(retryTimer);
  retryTimer = setTimeout(() => { retryTimer = null; void syncNow(); }, retryDelay);
  retryDelay = Math.min(retryDelay * 2, 60000);
}

function succeeded() {
  retryDelay = 2000;
  errorRetries = 0;
}

// ------------------------------------------------------------------ pull
function dispatchChanged(keys: string[]) {
  if (!keys.length) return;
  try {
    window.dispatchEvent(new CustomEvent(DATA_CHANGED_EVENT, { detail: { keys } }));
    for (const k of keys) if (LIB_EVENTS[k]) window.dispatchEvent(new Event(LIB_EVENTS[k]));
  } catch { /* non-DOM */ }
}

async function pull(): Promise<boolean> {
  if (!client || !uid) return false;
  const me = uid;
  const q = async <T,>(run: () => PromiseLike<{ data: unknown; error: unknown; status?: number }>): Promise<T[] | null> => {
    let res: { data: unknown; error: unknown; status?: number };
    try {
      res = await run();
    } catch (e) {
      fail(classify(e), e);
      return null;
    }
    if (res.error) {
      fail(classify(res.error, res.status), res.error);
      return null;
    }
    return (Array.isArray(res.data) ? res.data : []) as T[];
  };
  // 1) Cheap: which rows exist, and when did they change?
  const heads = await q<{ key: string; updated_at: string }>(() => client!.from(TABLE).select("key,updated_at").eq("user_id", me));
  if (!heads || uid !== me) return false; // failed / signed out meanwhile
  let meta = readMeta();
  const foreign = !!meta.owner && meta.owner !== me;
  const resumeOn = getResumeSync();
  const keys = syncedKeys(resumeOn);
  const rows = new Map<string, { value: unknown; ts: number }>();
  const need: string[] = [];
  for (const h of heads) {
    if (!h || typeof h.key !== "string" || !keys.includes(h.key)) continue;
    const ts = Date.parse(h.updated_at) || 0;
    rows.set(h.key, { value: undefined, ts });
    const km = meta.keys[h.key];
    if (foreign || !km || km.s !== ts) need.push(h.key);
  }
  // 2) Values only for the rows that changed since this device last saw them.
  if (need.length) {
    const full = await q<{ key: string; value: unknown; updated_at: string }>(() => client!.from(TABLE).select("key,value,updated_at").eq("user_id", me).in("key", need));
    if (!full || uid !== me) return false;
    for (const r of full) if (r && typeof r.key === "string") rows.set(r.key, { value: r.value, ts: Date.parse(r.updated_at) || 0 });
    meta = readMeta();
  }
  if (foreign) {
    // This device last synced another account: keep a local backup of what
    // is about to be replaced, then take this account's data.
    const backup: Record<string, string> = {};
    for (const k of keys) { const v = readString(k); if (v != null) backup[k] = v; }
    writeStringQuiet(BACKUP_KEY, JSON.stringify({ owner: meta.owner, at: Date.now(), data: backup }));
    meta = emptyMeta();
  }
  const now = Date.now();
  const changed: string[] = [];
  for (const key of keys) {
    const spec = specFor(key)!;
    const row = rows.get(key) || null;
    const local = readString(key);
    const r = reconcile(spec, local, meta.keys[key], row, now, { foreign });
    if (r.changed) {
      writeStringQuiet(key, r.raw);
      changed.push(key);
    }
    if (r.km) meta.keys[key] = r.km;
    else delete meta.keys[key];
  }
  meta.owner = me;
  meta.last = Date.now();
  writeMeta(meta);
  lastPull = Date.now();
  dispatchChanged(changed);
  return true;
}

// ------------------------------------------------------------------ push
function byteLen(s: string): number {
  try { return new TextEncoder().encode(s).length; } catch { return s.length * 2; }
}

async function pushOnce(): Promise<boolean> {
  if (!client || !uid) return false;
  const me = uid;
  const resumeOn = getResumeSync();
  const meta = readMeta();
  const dirty = Object.keys(meta.keys).filter((k) => meta.keys[k].d && isSyncedKey(k, resumeOn));
  if (!dirty.length) return true;
  const rows: { user_id: string; key: string; value: unknown; updated_at: string }[] = [];
  const sentT: Record<string, number> = {};
  let tooBig = false;
  for (const k of dirty) {
    const km = meta.keys[k];
    const env = encode(readString(k), km.del);
    if (byteLen(JSON.stringify(env)) > MAX_VALUE_BYTES) {
      km.big = 1;
      tooBig = true;
      logOnce("big:" + k, "Not syncing " + k + ": too large.");
      continue;
    }
    rows.push({ user_id: me, key: k, value: env, updated_at: new Date(km.t).toISOString() });
    sentT[k] = km.t;
  }
  if (tooBig) {
    // Leave oversized keys out of the queue until they change again.
    for (const k of dirty) if (meta.keys[k].big) delete meta.keys[k].d;
    writeMeta(meta);
  }
  for (let i = 0; i < rows.length; i += BATCH_ROWS) {
    const batch = rows.slice(i, i + BATCH_ROWS);
    let res: { data: unknown; error: unknown; status?: number };
    try {
      res = await client.from(TABLE).upsert(batch, { onConflict: "user_id,key" }).select("key,updated_at");
    } catch (e) {
      fail(classify(e), e);
      return false;
    }
    if (res.error) {
      fail(classify(res.error, res.status), res.error);
      return false;
    }
    if (uid !== me) return false;
    const back = new Map<string, number>();
    for (const r of (Array.isArray(res.data) ? res.data : []) as { key: string; updated_at: string }[]) {
      if (r && r.key) back.set(r.key, Date.parse(r.updated_at) || 0);
    }
    const m2 = readMeta();
    for (const row of batch) {
      const km = m2.keys[row.key];
      if (!km) continue;
      const t = sentT[row.key];
      km.s = back.get(row.key) || t;
      // Changed again while the request was out: stays dirty.
      if (km.t === t) delete km.d;
    }
    m2.owner = me;
    m2.last = Date.now();
    writeMeta(m2);
  }
  return true;
}

/** One sync cycle: pull (cheap when nothing changed, and it merges a newer
 * copy from another device instead of overwriting it), then push what's
 * dirty. Cycles never overlap; a request during one queues one more. */
let inflight: Promise<void> | null = null;
let again = false;
function cycle(): Promise<void> {
  if (inflight) { again = true; return inflight; }
  inflight = (async () => {
    setStatus({ state: "syncing" });
    const ok = (await pull()) && (await pushOnce());
    if (ok) { succeeded(); setStatus({ state: "synced", detail: undefined }); }
  })().finally(() => {
    inflight = null;
    if (again) { again = false; if (running && getSyncEnabled() && status.state !== "unavailable") void cycle(); }
  });
  return inflight;
}

function push(): Promise<void> {
  if (!running || !client || !getSyncEnabled() || status.state === "unavailable") return Promise.resolve();
  return cycle();
}

// ------------------------------------------------------------- lifecycle
/** Pull, merge and push now. Safe to call any time (no-op when signed out).
 * Also re-checks after "Sync isn't set up yet". */
export function syncNow(): Promise<void> {
  if (!running || !client || !uid) return Promise.resolve();
  if (!getSyncEnabled()) { setStatus({ state: "paused" }); return Promise.resolve(); }
  if (retryTimer) { clearTimeout(retryTimer); retryTimer = null; }
  return cycle();
}

/** Push pending changes now (e.g. before sign-out). Resolves within `ms`. */
export function flushSync(ms = 2500): Promise<void> {
  if (!running) return Promise.resolve();
  if (pushTimer) { clearTimeout(pushTimer); pushTimer = null; }
  return Promise.race([push(), new Promise<void>((r) => setTimeout(r, ms))]);
}

/** True while a page-hide flush is going out (the client's fetch adds keepalive). */
export function wantKeepalive(): boolean {
  return keepalive;
}

function flushForExit() {
  if (!running || !readMetaHasDirty()) return;
  if (pushTimer) { clearTimeout(pushTimer); pushTimer = null; }
  if (inflight || !getSyncEnabled() || status.state === "unavailable") return;
  // Straight to the upsert (no pull first): the page may be going away.
  keepalive = true;
  inflight = pushOnce()
    .then((ok) => { if (ok) { succeeded(); setStatus({ state: "synced", detail: undefined }); } })
    .finally(() => { keepalive = false; inflight = null; if (again) { again = false; void push(); } });
}
function readMetaHasDirty() {
  return Object.values(readMeta().keys).some((k) => k.d);
}

let listening = false;
function listen() {
  if (listening || typeof window === "undefined") return;
  listening = true;
  window.addEventListener("online", () => { if (running) { retryDelay = 2000; void syncNow(); } });
  window.addEventListener("offline", () => { if (running) setStatus({ state: "offline" }); });
  document.addEventListener("visibilitychange", () => {
    if (!running) return;
    if (document.visibilityState === "hidden") flushForExit();
    else if (Date.now() - lastPull > 30000 && status.state !== "unavailable") void syncNow();
  });
  window.addEventListener("pagehide", flushForExit);
  // Another tab changed a key: its own sync pushes it; re-read pages here.
  window.addEventListener("storage", (e) => {
    if (!e.key) return;
    if (e.key === KEYS.syncMeta) { if (running) setStatus({}); return; }
    if (isSyncedKey(e.key, getResumeSync())) dispatchChanged([e.key]);
  });
}

/** Called by AuthProvider whenever the session changes. */
export function startSync(c: SupabaseClient, session: Session | null): void {
  const id = (session?.user as { id?: string } | undefined)?.id || "";
  if (!session || !id) { stopSync(); return; }
  listen();
  if (running && client === c && uid === id) return;
  client = c;
  uid = id;
  running = true;
  retryDelay = 2000;
  errorRetries = 0;
  void syncNow();
}

/** Signed out: stop syncing. Local data stays on this device. */
export function stopSync(): void {
  running = false;
  client = null;
  uid = null;
  clearTimers();
  setStatus({ state: "signedOut", detail: undefined });
}

// ------------------------------------------------------------ "Your data"
/** Everything OfferReady keeps for this user: every localStorage key of the
 * app plus the account's synced rows (when signed in). */
export async function exportAllData(): Promise<{
  app: "OfferReady";
  exportedAt: string;
  local: Record<string, unknown>;
  account: { signedIn: boolean; rows: { key: string; value: unknown; updated_at: string }[]; error?: string };
}> {
  const local: Record<string, unknown> = {};
  for (const k of allLocalKeys()) {
    const raw = readString(k);
    if (raw == null) continue;
    try { local[k] = JSON.parse(raw); } catch { local[k] = raw; }
  }
  const account: { signedIn: boolean; rows: { key: string; value: unknown; updated_at: string }[]; error?: string } = { signedIn: !!(client && uid), rows: [] };
  if (client && uid) {
    try {
      const r = await client.from(TABLE).select("key,value,updated_at").eq("user_id", uid);
      if (r.error) account.error = classify(r.error, r.status) === "missing" ? "Sync isn't set up yet." : String((r.error as { message?: string }).message || "Couldn't load synced data.");
      else {
        account.rows = ((Array.isArray(r.data) ? r.data : []) as { key: string; value: unknown; updated_at: string }[]).map((row) => {
          const raw = decode(row.value);
          let value: unknown = raw;
          try { value = raw == null ? null : JSON.parse(raw); } catch { /* raw string */ }
          return { key: row.key, value, updated_at: row.updated_at };
        });
      }
    } catch (e) {
      account.error = String((e as Error)?.message || e);
    }
  }
  return { app: "OfferReady", exportedAt: new Date().toISOString(), local, account };
}

/** Delete this user's synced copies (public.user_state rows). Local data on
 * this device stays. Sync is paused on this device afterwards so the copies
 * aren't uploaded again; setSyncEnabled(true) turns it back on. Note: other
 * signed-in devices keep their own local data and would upload it again. */
export async function deleteAllSyncedData(opts: { keepSyncing?: boolean } = {}): Promise<{ ok: boolean; error?: string }> {
  if (!client || !uid) return { ok: false, error: "Sign in to delete your synced data." };
  try {
    const r = await client.from(TABLE).delete().eq("user_id", uid);
    if (r.error) {
      if (classify(r.error, r.status) === "missing") return { ok: true };
      return { ok: false, error: String((r.error as { message?: string }).message || "Couldn't delete.") };
    }
  } catch (e) {
    return { ok: false, error: String((e as Error)?.message || e) };
  }
  const m = readMeta();
  for (const k of Object.keys(m.keys)) { delete m.keys[k].s; m.keys[k].d = 1; }
  delete m.last;
  writeMeta(m);
  if (opts.keepSyncing) await syncNow();
  else await setSyncEnabled(false);
  return { ok: true };
}
