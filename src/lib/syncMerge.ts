/* Account sync: the PURE part (no storage, no network, no DOM) so it can be
 * unit-tested. lib/sync.ts does the I/O.
 *
 * Model
 *  - Each synced localStorage key is one row in public.user_state
 *    (user_id, key, value jsonb, updated_at).
 *  - The row value is an envelope: { v: <parsed JSON> } or { s: "<raw string>" }
 *    (for keys written with writeString), { gone: true } for a removed key,
 *    plus `del` = tombstones { itemId: ms } for list/map keys so a deletion on
 *    one device isn't undone by a merge on another.
 *  - Locally, offerready.sync.meta.v1 keeps per key:
 *      t   = ms of the last local change (or of the adopted server value)
 *      s   = updated_at (ms) of the server row as last seen / pushed
 *      d   = 1 while the local value still has to be pushed
 *      del = tombstones (see above)
 *
 * Reconcile on pull, per key:
 *  - server row unchanged since we last saw it (s === row ts): keep local.
 *  - server changed and local is clean: adopt the server value.
 *  - server changed and local is dirty (or this device has data it never
 *    synced): MERGE. "lww" keys: newer timestamp wins (a never-synced local
 *    value has t = 0, so the account's copy wins for single values).
 *    "list" keys: union by item id, newer item wins (the item's own
 *    updatedAt when it has one, else its side's timestamp), tombstones drop
 *    deleted items. "map" keys: union of entries, newer side wins per entry.
 *  - no server row: push local if there is any. */

export type Kind = "lww" | "list" | "map";

export interface Spec {
  key: string;
  kind: Kind;
  /** For list keys whose array lives inside an object ({ chats: [...] }). */
  path?: string;
  /** Item id for list keys (default: item.id). */
  idOf?: (item: Record<string, unknown>) => string;
  /** Item timestamp in ms for list keys (0 = none: use the side's timestamp). */
  tsOf?: (item: Record<string, unknown>) => number;
}

export interface KeyMeta {
  t: number;
  s?: number;
  d?: 1;
  del?: Record<string, number>;
  /** Too large to sync (over the row size limit). */
  big?: 1;
}

export interface SyncMeta {
  v: 1;
  /** User id this device last synced with. */
  owner?: string;
  /** ms of the last successful sync. */
  last?: number;
  keys: Record<string, KeyMeta>;
}

export interface Envelope {
  v?: unknown;
  s?: string;
  gone?: boolean;
  del?: Record<string, number>;
}

const isoTs = (v: unknown): number => {
  if (typeof v === "number" && isFinite(v)) return v;
  if (typeof v === "string" && v) {
    const t = Date.parse(v);
    return isNaN(t) ? 0 : t;
  }
  return 0;
};
const str = (v: unknown) => (v == null ? "" : String(v));

/** Keys that follow the account. Literal strings (= KEYS in storage.ts) so
 * this file stays dependency-free for the unit tests. */
export const RESUME_KEY = "offerready.resume.v1";
export const SYNC_SPECS: Spec[] = [
  { key: "offerready.interviewDates.v1", kind: "map" },
  { key: "offerready.prepPlan.v1", kind: "map" },
  { key: "offerready.questionProgress.v1", kind: "map" },
  { key: "offerready.jobOutcomes.v1", kind: "map" },
  { key: "offerready.stories.v1", kind: "list", tsOf: (x) => isoTs(x.updatedAt) },
  { key: "offerready.debriefs.v1", kind: "list", tsOf: (x) => isoTs(x.updatedAt) },
  // Offers have ids but no updatedAt: merged by id, the newer side wins per offer.
  { key: "offerready.offers.v1", kind: "list" },
  { key: "offerready.activeJob.v1", kind: "lww" },
  { key: "offerready.readiness.cache.v1", kind: "lww" },
  { key: "offerready.defendRole.v1", kind: "lww" },
  { key: "offerready.help.chats.v1", kind: "list", path: "chats", tsOf: (x) => isoTs(x.updatedAt) },
  // Practice progress (progressStore): entries have no id, so derive one.
  { key: "ip_history_v1", kind: "list", idOf: (x) => str(x.key) || [x.when, x.mode, x.track, x.topic, x.score].map(str).join("|") },
  { key: "ip_activity_v1", kind: "list", idOf: (x) => [x.at, x.type, x.label].map(str).join("|"), tsOf: (x) => isoTs(x.at) },
  { key: "or_scenario_sessions_v1", kind: "lww" },
  // Opt-in only (see syncedKeys).
  { key: RESUME_KEY, kind: "lww" },
];
const BY_KEY: Record<string, Spec> = Object.fromEntries(SYNC_SPECS.map((s) => [s.key, s]));

export function specFor(key: string): Spec | null {
  return BY_KEY[key] || null;
}

/** The keys this device syncs. The resume only with the user's opt-in. */
export function syncedKeys(resumeOn: boolean): string[] {
  return SYNC_SPECS.map((s) => s.key).filter((k) => resumeOn || k !== RESUME_KEY);
}

export function isSyncedKey(key: string, resumeOn: boolean): boolean {
  return !!BY_KEY[key] && (resumeOn || key !== RESUME_KEY);
}

// ---------------------------------------------------------------- envelope
function parse(raw: string | null): { ok: boolean; v?: unknown } {
  if (raw == null) return { ok: false };
  try {
    return { ok: true, v: JSON.parse(raw) };
  } catch {
    return { ok: false };
  }
}

export function encode(raw: string | null, del?: Record<string, number>): Envelope {
  const env: Envelope = {};
  if (raw == null) env.gone = true;
  else {
    const p = parse(raw);
    if (p.ok) env.v = p.v;
    else env.s = raw;
  }
  if (del && Object.keys(del).length) env.del = del;
  return env;
}

export function decode(env: unknown): string | null {
  if (!env || typeof env !== "object") return null;
  const e = env as Envelope;
  if (e.gone) return null;
  if (typeof e.s === "string") return e.s;
  if ("v" in e) return JSON.stringify(e.v);
  return null;
}

export function envDel(env: unknown): Record<string, number> {
  const d = env && typeof env === "object" ? (env as Envelope).del : null;
  const out: Record<string, number> = {};
  if (d && typeof d === "object") for (const k of Object.keys(d)) if (typeof d[k] === "number") out[k] = d[k];
  return out;
}

/** Same value? (JSON-normalised, so formatting differences don't count.) */
export function sameValue(a: string | null, b: string | null): boolean {
  if (a === b) return true;
  if (a == null || b == null) return false;
  const pa = parse(a), pb = parse(b);
  return pa.ok && pb.ok && JSON.stringify(pa.v) === JSON.stringify(pb.v);
}

// -------------------------------------------------------------- tombstones
const TOMB_MAX_AGE = 90 * 86400000;
const TOMB_MAX = 300;

function itemsOf(spec: Spec, raw: string | null): Record<string, unknown>[] | null {
  const p = parse(raw);
  if (!p.ok) return null;
  const arr = spec.path ? (p.v && typeof p.v === "object" ? (p.v as Record<string, unknown>)[spec.path] : null) : p.v;
  return Array.isArray(arr) ? (arr.filter((x) => x && typeof x === "object") as Record<string, unknown>[]) : null;
}
const idFor = (spec: Spec, x: Record<string, unknown>) => (spec.idOf ? spec.idOf(x) : str(x.id));

function idsOf(spec: Spec, raw: string | null): string[] | null {
  if (spec.kind === "list") {
    const items = itemsOf(spec, raw);
    return items ? items.map((x) => idFor(spec, x)).filter(Boolean) : null;
  }
  if (spec.kind === "map") {
    const p = parse(raw);
    return p.ok && p.v && typeof p.v === "object" && !Array.isArray(p.v) ? Object.keys(p.v as object) : null;
  }
  return null;
}

/** Item ids present in prev but not in next (list/map keys only). */
export function removedIds(spec: Spec, prev: string | null, next: string | null): string[] {
  if (spec.kind === "lww" || next == null) return [];
  const a = idsOf(spec, prev), b = idsOf(spec, next);
  if (!a || !b) return [];
  const keep = new Set(b);
  return a.filter((id) => !keep.has(id));
}

/** Union of tombstones (newest per id), pruned by age and count. */
export function mergeTombs(a: Record<string, number> | undefined, b: Record<string, number> | undefined, now: number = Date.now()): Record<string, number> | undefined {
  const out: Record<string, number> = { ...(a || {}) };
  for (const [k, v] of Object.entries(b || {})) if (!(k in out) || v > out[k]) out[k] = v;
  const live = Object.entries(out).filter(([, v]) => now - v < TOMB_MAX_AGE).sort((x, y) => y[1] - x[1]).slice(0, TOMB_MAX);
  return live.length ? Object.fromEntries(live) : undefined;
}

/** Ids that came back (re-added) are no longer deleted. */
function dropRevived(del: Record<string, number> | undefined, spec: Spec, raw: string | null) {
  if (!del) return del;
  const ids = idsOf(spec, raw);
  if (!ids) return del;
  const out = { ...del };
  for (const id of ids) delete out[id];
  return Object.keys(out).length ? out : undefined;
}

export function addTombs(del: Record<string, number> | undefined, ids: string[], at: number): Record<string, number> | undefined {
  return mergeTombs(del, Object.fromEntries(ids.map((id) => [id, at])), at);
}

// ------------------------------------------------------------------- merge
export interface Side {
  raw: string | null;
  /** ms of the side's last change (0 = unknown). */
  ts: number;
  del?: Record<string, number>;
}

/** Merge two versions of one key. Returns the merged raw string (null = removed). */
export function mergeKey(spec: Spec, local: Side, server: Side): string | null {
  const lww = () => (local.ts > server.ts ? local.raw : server.raw);
  if (spec.kind === "lww" || local.raw == null || server.raw == null) return lww();
  const del: Record<string, number> = { ...(local.del || {}) };
  for (const [k, v] of Object.entries(server.del || {})) if (!(k in del) || v > del[k]) del[k] = v;

  if (spec.kind === "map") {
    const a = parse(local.raw), b = parse(server.raw);
    const isObj = (v: unknown) => v && typeof v === "object" && !Array.isArray(v);
    if (!a.ok || !b.ok || !isObj(a.v) || !isObj(b.v)) return lww();
    const lv = a.v as Record<string, unknown>, sv = b.v as Record<string, unknown>;
    const localNewer = local.ts > server.ts;
    const out: Record<string, unknown> = {};
    const keys = [...Object.keys(localNewer ? lv : sv), ...Object.keys(localNewer ? sv : lv)];
    for (const k of keys) {
      if (k in out) continue;
      const inL = k in lv, inS = k in sv;
      let v: unknown, ts: number;
      if (inL && inS) { v = localNewer ? lv[k] : sv[k]; ts = Math.max(local.ts, server.ts); }
      else if (inL) { v = lv[k]; ts = local.ts; }
      else { v = sv[k]; ts = server.ts; }
      if (del[k] != null && del[k] >= ts) continue;
      out[k] = v;
    }
    return JSON.stringify(out);
  }

  // list
  const li = itemsOf(spec, local.raw), si = itemsOf(spec, server.raw);
  if (!li || !si) return lww();
  const localNewer = local.ts > server.ts;
  const [first, second] = localNewer ? [li, si] : [si, li];
  const [firstTs, secondTs] = localNewer ? [local.ts, server.ts] : [server.ts, local.ts];
  const own = (x: Record<string, unknown>) => (spec.tsOf ? spec.tsOf(x) : 0);
  const secondById = new Map(second.map((x) => [idFor(spec, x), x]));
  const firstIds = new Set(first.map((x) => idFor(spec, x)));
  const alive = (id: string, x: Record<string, unknown>, sideTs: number) => {
    const t = own(x) || sideTs;
    return !id || del[id] == null || del[id] < t;
  };

  const out: { id: string; x: Record<string, unknown> }[] = [];
  for (const x of first) {
    const id = idFor(spec, x);
    const other = id ? secondById.get(id) : undefined;
    let pick = x, pickTs = firstTs;
    // Both have it: the newer item wins (its own timestamp first).
    if (other && own(other) > own(x)) { pick = other; pickTs = secondTs; }
    if (alive(id, pick, pickTs)) out.push({ id, x: pick });
  }
  // Items only the other side has, placed after their predecessor there.
  let prevId: string | null = null;
  for (const x of second) {
    const id = idFor(spec, x);
    if (id && firstIds.has(id)) { prevId = id; continue; }
    if (alive(id, x, secondTs)) {
      const at = prevId == null ? -1 : out.findIndex((o) => o.id === prevId);
      out.splice(at + 1, 0, { id, x });
      prevId = id;
    }
  }
  const arr = out.map((o) => o.x);
  if (!spec.path) return JSON.stringify(arr);
  const base = parse(localNewer ? local.raw : server.raw).v as Record<string, unknown>;
  const localObj = parse(local.raw).v as Record<string, unknown>;
  // Container fields (e.g. the help bot's activeId) stay this device's.
  return JSON.stringify({ ...base, ...localObj, [spec.path]: arr });
}

// --------------------------------------------------------------- reconcile
export interface ServerRow {
  value: unknown;
  /** updated_at in ms */
  ts: number;
}

export interface Reconciled {
  /** The new local value (null = remove). */
  raw: string | null;
  /** The new meta entry (undefined = drop it). */
  km: KeyMeta | undefined;
  /** Local value changed (pages should re-read). */
  changed: boolean;
}

/** Decide one key on pull. `foreign` = the device last synced a different
 * account: the account's copy replaces local (the caller backs local up). */
export function reconcile(spec: Spec, localRaw: string | null, km: KeyMeta | undefined, row: ServerRow | null, now: number, opts: { foreign?: boolean } = {}): Reconciled {
  const unchanged = (k: KeyMeta | undefined): Reconciled => ({ raw: localRaw, km: k, changed: false });
  const adopt = (r: ServerRow, prevDel?: Record<string, number>): Reconciled => {
    const raw = decode(r.value);
    const del = dropRevived(mergeTombs(prevDel, envDel(r.value), now), spec, raw);
    const k: KeyMeta = { t: r.ts, s: r.ts };
    if (del) k.del = del;
    return { raw, km: k, changed: !sameValue(raw, localRaw) };
  };

  if (opts.foreign) {
    if (row) return adopt(row);
    return { raw: null, km: undefined, changed: localRaw != null };
  }

  if (!row) {
    if (localRaw == null) return unchanged(km && km.d ? undefined : km ? { ...km, d: undefined, s: undefined } : undefined);
    return unchanged({ ...(km || {}), t: km ? km.t : now, d: 1, s: undefined });
  }

  if (km && km.s === row.ts) return unchanged(km);

  const dirty = km ? !!km.d : localRaw != null;
  if (!dirty) return adopt(row, km?.del);

  const serverRaw = decode(row.value);
  const sDel = envDel(row.value);
  const lt = km ? km.t : 0;
  const merged = mergeKey(spec, { raw: localRaw, ts: lt, del: km?.del }, { raw: serverRaw, ts: row.ts, del: sDel });
  const del = dropRevived(mergeTombs(km?.del, sDel, now), spec, merged);
  const sameAsServer = sameValue(merged, serverRaw) && JSON.stringify(del || {}) === JSON.stringify(dropRevived(mergeTombs(undefined, sDel, now), spec, serverRaw) || {});
  const k: KeyMeta = sameAsServer ? { t: row.ts, s: row.ts } : { t: Math.max(now, row.ts + 1), s: row.ts, d: 1 };
  if (del) k.del = del;
  return { raw: merged, km: k, changed: !sameValue(merged, localRaw) };
}

export function emptyMeta(): SyncMeta {
  return { v: 1, keys: {} };
}

export function parseMeta(raw: string | null): SyncMeta {
  const p = parse(raw);
  const v = p.ok ? (p.v as SyncMeta) : null;
  if (!v || typeof v !== "object" || v.v !== 1 || !v.keys || typeof v.keys !== "object") return emptyMeta();
  return v;
}
