# OfferReady app

The OfferReady product: analyze a job, check your fit, prepare questions,
defend your decisions, and track interview readiness, all organized around
the job you're applying for.

| | Where | Repo |
|---|---|---|
| **Product** (this app) | https://klnjoy.github.io/offerready-app/ | `klnjoy/offerready-app` |
| **Study library** (MkDocs) | https://klnjoy.github.io/offerready/ | `klnjoy/offerready` |
| **API** (Vercel Functions) | https://offerready-beta.vercel.app/api | `klnjoy/offerready` (`api/`) |

React 18 + Vite + TypeScript. Auth is Supabase; data comes from the API.

## Run it locally

```bash
npm install
npm run dev        # http://localhost:5173
```

`npm run dev` proxies `/api/*` to the deployed API, so local runs use real
data once you sign in. To use a local API instead, run `vercel dev` in the
`offerready` repo and set `VITE_API_PROXY_TARGET=http://localhost:3000` in
`.env.local`. All settings are listed in `.env.example`.

```bash
npm run build      # type-check + production build → dist/
npm run preview
```

## Deploy

Every push to `main` builds the app and publishes it to GitHub Pages
(`.github/workflows/deploy.yml`). Pull requests run a build check
(`.github/workflows/ci.yml`).

One-time setup:

1. **GitHub Pages:** in this repo, go to Settings → Pages → Source and choose
   **GitHub Actions**.
2. **Supabase:** go to Authentication → URL Configuration.
   - Set **Site URL** to `https://klnjoy.github.io/offerready-app/`.
   - Under **Redirect URLs**, add `https://klnjoy.github.io/offerready-app/**`
     and `http://localhost:5173/**`.

   Without this, Google/GitHub sign-in and email links send people to the
   study library instead of the app.
3. **API:** nothing to change. It already accepts requests from
   `https://klnjoy.github.io`. Stripe checkout returns to the app once the
   `offerready` change that adds `app: true` handling is merged.

## Screens

| Route | Screen |
|---|---|
| `/` | Home |
| `/analyze` | Analyze a job |
| `/jobs`, `/jobs/:id` | My jobs, job detail |
| `/fit` | Check my fit (resume vs job) |
| `/questions` | Practice questions for the job |
| `/defend` | Defend your decisions (scenarios) |
| `/dashboard` | Interview readiness |
| `/practice` | Interview practice (question bank) |
| `/simulator` | Mock interview |
| `/example` | Sample walkthrough |
| `/account` | Sign in, account, upgrade |

The study notes, resource links and the practice question bank load from the
study library (`VITE_DOCS_BASE`).

## Code layout

- `src/lib/api.ts`: typed API client (no DOM; reusable from React Native).
- `src/lib/roles.ts`, `readiness.ts`, `progressStore.ts`: pure logic.
- `src/lib/storage.ts`: the only place that touches localStorage.
- `src/lib/auth.tsx`: Supabase auth context.
- `src/lib/router.tsx`: a small History-API router with base-path support.
- `src/pages/*`: screens. `src/components/*`: shared UI. `src/data/*`: bundled
  content (sample analysis, offline scenarios, simulator bank).

## Toward mobile

The non-UI layer (`api.ts`, `roles.ts`, `readiness.ts`, `progressStore.ts`,
`src/data/*`) can be reused as-is in Expo / React Native. Swap `storage.ts` for
AsyncStorage, `router.tsx` for expo-router, and re-render the screens with
native components. If Pro is sold inside the iOS/Android app, Apple and Google
generally require in-app purchase for digital goods rather than Stripe.

## Installable app (PWA)

`public/manifest.webmanifest`, the icons in `public/icons/` and a hand-written
service worker (`public/sw.js`) make the app installable and let it open
offline after the first visit. The worker is registered only in production
builds, scoped to the base path (`/offerready-app/`). It caches the app shell
and the hashed files in `/assets/`, and never caches API, Supabase or Stripe
requests. Each build stamps its id into `sw.js` (see `vite.config.ts`), so a
new deploy shows "Update available" in open tabs. Account → "Install the app"
shows the browser's install prompt where supported, or iOS steps.

## Error reports

Uncaught errors, unhandled promise rejections and screens that crash (the
error boundary) are reported to the Supabase table `client_errors` by
`src/lib/errorReport.ts` (no third-party SDK). Reports are scrubbed in the
browser first (no query strings, emails or tokens) and capped at 10 per
browser session. Run migration `supabase/migrations/0013_client_errors.sql`
in the `offerready` repo to create the table; until then inserts fail
silently.

Clients can only insert, so view the reports in the Supabase dashboard:

- **Table Editor → `client_errors`**, sorted by `created_at`, or
- **SQL Editor**, for example the most common errors this week:

  ```sql
  select message, route, release, count(*) as n, max(created_at) as last_seen
  from public.client_errors
  where created_at > now() - interval '7 days'
  group by 1, 2, 3
  order by n desc
  limit 50;
  ```

To trim old rows: `delete from public.client_errors where created_at < now() - interval '90 days';`
