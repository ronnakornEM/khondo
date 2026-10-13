# Khondo

**Khondo** = **Khon** Kaen + con**do**. A portfolio, landing page and back-office for real estate agents.

* **Free** – up to 5 properties, your own landing page (`/a/your-name`), visitor inquiry inbox, basic calendar.
* **Premium** (฿299/month, change in `shared/plans.ts`) – up to 200 properties, **contact management** (CRM + pipeline), **bills & invoices**, **advanced calendar** (week/day views, recurring events, reminders, bill due dates, `.ics` sync), premium page themes and no branding.

Stack: **React 19 + Vite + Tailwind** (web / PWA) · **Hono** API on **Vercel** serverless functions · **PostgreSQL on Neon** · Stripe for subscriptions · Vercel Blob for photos · **Capacitor** for iOS/Android.

## How it is put together

```
src/        React app (pages, components, lib/api.ts = the only place that talks to the API)
api/        Vercel entry – one function that hands every /api/* request to Hono
server/     The API: routes/, auth, db, migrations runner, seed, tests
shared/     Plain TypeScript used by BOTH sides: API types, plan limits, recurring-event expansion
db/migrations/   SQL, applied in order by `npm run db:migrate` (and on every Vercel build)
```

Design choices that keep the mobile app easy:

* **The API is the product.** The web app is just one client of a JSON API with `Authorization: Bearer` tokens (no cookies), CORS for `capacitor://localhost`, and types in `shared/`. A React Native / Capacitor app reuses `shared/` and `src/lib/api.ts` as-is.
* **Mobile-first UI**: bottom tab bar on phones, sidebar on desktop, safe-area insets, 16px inputs (no iOS zoom), installable PWA manifest.
* Storage (`src/lib/storage.ts`) and the API base URL (`VITE_API_URL`) are the only two things that change in a native shell.

## Run it locally

Requires Node 22+ and any PostgreSQL (Docker: `docker run -p 5432:5432 -e POSTGRES_PASSWORD=khondo -e POSTGRES_USER=khondo -e POSTGRES_DB=khondo postgres:16`).

```bash
npm install
cp .env.example .env        # set DATABASE_URL and JWT_SECRET; ALLOW_DEV_UPGRADE=true lets you try Premium without Stripe
npm run db:migrate
npm run db:seed             # optional demo workspace: demo@khondo.app / demo1234, page at /a/nok-property
npm run dev                 # web on :5173, API on :3001 (proxied)
```

Tests (integration tests against a real Postgres – they **wipe** the `public` schema of `TEST_DATABASE_URL`, default `khondo_test`):

```bash
createdb khondo_test && npm test
```

## Deploy: Neon + Vercel

1. **Neon** – create a project. Copy the **pooled** connection string (host contains `-pooler`).
2. **Vercel** – import this repo (framework preset *Vite* is picked up from `vercel.json`). Add environment variables:

   | Variable | Required | Notes |
   |---|---|---|
   | `DATABASE_URL` | ✅ | Neon pooled connection string. (The Vercel ↔ Neon integration sets this and gives every preview deployment its own DB branch.) |
   | `JWT_SECRET` | ✅ | `openssl rand -base64 48` |
   | `APP_URL` | recommended | e.g. `https://khondo.app` – used for Stripe redirects and the calendar feed URL |
   | `BLOB_READ_WRITE_TOKEN` | for photo upload | Vercel → Storage → create a **Blob** store and connect it. Without it agents can paste image links. |
   | `STRIPE_SECRET_KEY`, `STRIPE_PRICE_ID`, `STRIPE_WEBHOOK_SECRET` | for Premium billing | see below |
   | `CORS_ORIGINS` | for the mobile app | `capacitor://localhost,http://localhost,https://localhost` is the default-friendly set |

3. Deploy. The build runs `vercel-build` = **database migrations, then the app build**, so schema changes ship with the code. Never set `ALLOW_DEV_UPGRADE` in production (it is also ignored when `VERCEL_ENV=production`).

### Stripe (Premium)

1. Stripe Dashboard → create a **Product** “Khondo Premium” with a recurring monthly price (฿299) → copy the **Price ID** into `STRIPE_PRICE_ID`.
2. Enable the **Customer Portal** (Settings → Billing → Customer portal) so users can cancel / update cards.
3. Add a **webhook** to `https://YOUR_DOMAIN/api/billing/webhook` for `checkout.session.completed`, `customer.subscription.created`, `customer.subscription.updated`, `customer.subscription.deleted` → copy the signing secret into `STRIPE_WEBHOOK_SECRET`.

The webhook is the source of truth for the plan: a failed/cancelled subscription drops the agent back to Free automatically (listings over the Free limit stay saved but are hidden from the public page until they upgrade again).

## Mobile app (iOS / Android) with Capacitor

The web app is already responsive and installable (Add to Home Screen). To ship to the stores:

```bash
npm i @capacitor/ios @capacitor/android
npx cap add ios && npx cap add android
VITE_API_URL=https://your-app.vercel.app npm run cap:sync     # builds dist/ and copies it into the native projects
npm run cap:ios      # opens Xcode      |   npm run cap:android   # opens Android Studio
```

Before release: swap `src/lib/storage.ts` to `@capacitor/preferences` (or secure storage) for the token, add app icons/splash (`@capacitor/assets`), and consider Apple’s in-app-purchase rules for subscriptions bought inside the app.

## Freemium rules (single source of truth)

`shared/plans.ts` defines the limits; the API enforces them (HTTP `402` + `code: premium_required | property_limit | photo_limit`) and the UI reads the same file to show locks and upgrade prompts.

## Known gaps / next steps

* **Thai language** – UI is English; add i18n (react-i18next) with `th` first-class. Currency (฿) and units (ตร.ว.) are already Thai-market aware.
* **SEO / link previews** for landing pages – they are client-rendered; add per-page OG tags via a small Vercel edge function or SSR for `/a/*`.
* **Login rate limiting, email verification, password reset** (needs an email provider such as Resend).
* **Reminders** are stored and exported to `.ics` (calendar apps fire them); push/LINE notifications would need a cron + provider.
* Custom domains for agent pages.
