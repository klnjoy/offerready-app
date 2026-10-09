/* Runtime configuration. Replaces content/assets/api-config.js.
 * Only browser-safe values live here (publishable Supabase key, never the
 * service-role key). Everything is overridable via VITE_* env vars. */

const env = import.meta.env;

/** "" means same-origin /api (dev proxy, or same Vercel project in prod). */
export const API_BASE = (env.VITE_API_BASE || "").replace(/\/$/, "");

/** When false the app runs in demo mode: sample analysis, bundled scenarios. */
export const API_ENABLED = env.VITE_API_ENABLED !== "false";

const SUPABASE_URL_RAW = env.VITE_SUPABASE_URL || "https://qelqtqgypwzduauiudbg.supabase.co";
const SUPABASE_KEY_RAW = env.VITE_SUPABASE_ANON_KEY || "sb_publishable_J-_TcxztkDSld8jSqTcmMQ_cBniHoaT";

export const SUPABASE_URL = /^https:\/\/.+\.supabase\.co/.test(SUPABASE_URL_RAW)
  ? SUPABASE_URL_RAW.replace(/\/$/, "")
  : "";
export const SUPABASE_ANON_KEY =
  SUPABASE_KEY_RAW && SUPABASE_KEY_RAW.indexOf("your-") !== 0 ? SUPABASE_KEY_RAW : "";

/** The MkDocs study site — learning content stays there. */
export const DOCS_BASE = (env.VITE_DOCS_BASE || "https://klnjoy.github.io/offerready/").replace(/\/?$/, "/");

export const QUESTION_BANK_URL = env.VITE_QUESTION_BANK_URL || DOCS_BASE + "assets/interview_questions.json";

export const PRICING_URL = DOCS_BASE + "assets/pricing.html";

/** Pro price as shown on /pricing and upgrade cards. A display label only:
 * the amount actually charged is the Stripe price (STRIPE_PRO_MONTHLY_PRICE_ID
 * on the API), so keep the two in sync. */
export const PRO_PRICE_LABEL = (env.VITE_PRO_PRICE_LABEL || "").trim() || "$12 / month";

/** Annual Pro label (STRIPE_PRO_ANNUAL_PRICE_ID on the API). Display only. */
export const PRO_ANNUAL_PRICE_LABEL = (env.VITE_PRO_ANNUAL_PRICE_LABEL || "").trim() || "$96 / year";

/** 30-day Interview Sprint pass label (STRIPE_SPRINT_PRICE_ID, one-time). Display only. */
export const SPRINT_PRICE_LABEL = (env.VITE_SPRINT_PRICE_LABEL || "").trim() || "$19 one-time · 30 days";

/** Optional support address for billing questions (cancel by email). */
export const SUPPORT_EMAIL = (env.VITE_SUPPORT_EMAIL || "").trim();

/** Study notes landing (GenAI topics) — not the docs home, which still hosts
 * the old copies of the tools. */
export const STUDY_URL = DOCS_BASE + "GenAI-Topics/index.html";

/** Absolute URL for a page on the MkDocs site (e.g. "GenAI-Topics/rag/index.html"). */
export function docsUrl(path: string): string {
  if (/^https?:\/\//.test(path)) return path;
  return DOCS_BASE + String(path || "").replace(/^\/+/, "");
}
