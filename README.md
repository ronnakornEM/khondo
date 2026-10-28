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

## Customers, browsing and guest mode

* **Guests can do everything a buyer needs without an account:** browse every live listing from every agent at `/browse` (search, buy/rent, type, bedrooms, price range, sort, paging — filters live in the URL so searches are shareable), open any listing, save favourites with the ❤ (kept in the browser) and send an inquiry to the agent.
* **Customers can also sign up / log in** (“I’m looking for a property”) to keep favourites on every device, get inquiry forms prefilled, and see their inquiry history with one-tap call / LINE / email to the agent (`/account`). Favourites saved as a guest are merged into the account at sign-in. Customer accounts cannot enter the agent app (`403 agent_only`).
* **A listing page links the agency:** the agent card links to the agent’s landing page, and “More from {agent}” shows their other live listings with a “View agency page / View all N properties” link. Browse cards link both to the listing and to the agent.
* Browse honours each agent’s plan limit exactly like the agent’s own page, so over-limit listings of downgraded agents never appear there.

## Sign-up: show-password and email verification

* The password fields (sign-up and sign-in) have a **show / hide** toggle.
* **Email verification:** after sign-up the account exists but has no session. A single-use link (valid 24 h, stored only as a SHA-256 hash) is emailed in the user's language (TH/EN/ZH); opening `/verify-email?token=…` verifies the address and signs the user in. Sign-in is refused (`403 email_not_verified`) until then, with a *Resend email* button (60 s cooldown, also enforced by the API; the resend endpoint always answers `200` so it can't be used to find out which emails have accounts). Re-registering a pending email is rejected, so nobody can take over someone else's half-finished sign-up.
* **Switching it on:** set `RESEND_API_KEY` (and `EMAIL_FROM` on a domain verified in Resend) in Vercel. **Until a provider is configured, verification is off** and accounts are active immediately, so nothing breaks. For local testing set `EMAIL_VERIFICATION=console` and copy the link from the API log. Accounts that existed before the feature are treated as verified by the migration.

## Testing Premium: superuser

A **superuser** has every Premium feature unlocked regardless of plan, plus an **Admin** page (`/app/admin`) where you can see all agents, switch any agent’s plan by hand, and flip your own account between **Premium** and **Free** (“Test as”) to check upgrade prompts and limits.

```bash
npm run db:seed                                  # creates admin@khondo.app / admin1234 (superuser) for local dev
npm run admin:grant -- you@example.com           # make an existing account a superuser (works against any DATABASE_URL)
npm run admin:grant -- you@example.com --revoke
```

On a shared or hosted database set `SEED_ADMIN_PASSWORD` when seeding so the demo superuser doesn't get the documented `admin1234`.

There is deliberately **no sign-up or API path** to become a superuser — it can only be granted with that script (so nobody can claim it by registering an email first). On production grant it only to your own account.

## Stripe sandbox (test mode)

The whole subscription flow runs against Stripe’s **sandbox** with test keys — no real money.

1. Stripe dashboard → switch to **Test mode** → Developers → API keys → copy the **secret key** (`sk_test_…`).
2. `.env`: `STRIPE_SECRET_KEY=sk_test_…`
3. `npm run stripe:setup` – creates the “Khondo Premium” product and a ฿299/month price (lookup key `khondo_premium_monthly`; idempotent). The app finds the price by that key, so `STRIPE_PRICE_ID` is optional. Pass `--webhook https://YOUR_DOMAIN/api/billing/webhook` to also register the webhook on a deployed site (prints `STRIPE_WEBHOOK_SECRET`).
4. `npm run dev`, sign in as an agent → **Plan & billing** → *Upgrade to Premium*. A yellow banner confirms sandbox mode. Pay with **4242 4242 4242 4242**, any future expiry, any CVC/postcode (declined card: `4000 0000 0000 0002`).
5. You are redirected back and the app **syncs the subscription straight from Stripe**, so it works locally even without webhooks. For the real webhook path run `stripe listen --forward-to localhost:3001/api/billing/webhook` and put the printed `whsec_…` into `STRIPE_WEBHOOK_SECRET`.
6. *Manage subscription & invoices* opens the Stripe Customer Portal (enable it in Settings → Billing → Customer portal). Cancelling there downgrades the agent via the webhook (or *Refresh plan from Stripe*).

**Check it any time:** `npm run stripe:check` verifies the key mode, the monthly ฿299 price and the customer portal (read-only, exits non-zero if something is missing).

**Project sandbox status** (Stripe account `acct_1RVFQSFS6bjfP0cZ`, test mode): product `prod_VQvqyWqUzd38ij` “Khondo Premium”, price `price_1UQ3yUFS6bjfP0cZicKIEjCl` (฿299/month, lookup key `khondo_premium_monthly`) and a default customer portal configuration are already created. All that is left is adding `STRIPE_SECRET_KEY=sk_test_…` to `.env` (local) and to the Vercel project's environment variables, then redeploying. Checkout shows the Stripe account's business name — change it in Dashboard → Settings → Business → Public details / Branding.

`npm test` includes an offline test of this flow against a fake Stripe server (`STRIPE_API_BASE` points the code at it), covering checkout, sync, portal, webhook signatures and error handling. Going live later = swap in `sk_live_…`, run `stripe:setup -- --live`, and register the live webhook.

## Languages & currency

* **Thai / English / 中文** – switch from the 🌐 button (landing pages, auth screens and the app). The browser language is auto-detected; the choice is remembered. Dates use Thai Buddhist Era (พ.ศ.) in Thai.
* **Thai baht is always the price of record.** A visitor can choose one extra currency (USD, EUR, CNY, GBP, JPY, KRW, SGD, AUD, HKD, MYR, INR) and it is shown *beside* the baht price as an estimate (`฿1,890,000 ≈ US$58,600`), with a footnote on public pages. Rates come from `GET /api/rates` (ECB data via Frankfurter, cached 1 h at the server and CDN, falling back to approximate built-in rates if the provider is unreachable). Bills and invoices stay in baht.
* Translation is dictionary-based: the English text is the key, `t('Add property')`. Dictionaries live in `src/locales/{th,zh}.ts`; a missing entry falls back to English (and is logged in dev via `window.__i18nMissing`). `npm test` fails if any string used in the app lacks a Thai or Chinese entry. The Thai/Chinese copy is machine-assisted — have a native speaker review it before launch.
* Agent-written content (titles, descriptions, bio) is shown as typed; per-language listing text is a possible next step.

## Freemium rules (single source of truth)

`shared/plans.ts` defines the limits; the API enforces them (HTTP `402` + `code: premium_required | property_limit | photo_limit`) and the UI reads the same file to show locks and upgrade prompts.

## Known gaps / next steps

* Per-language listing content (agent-written titles/descriptions in TH/EN/ZH).
* **SEO / link previews** for landing pages – they are client-rendered; add per-page OG tags via a small Vercel edge function or SSR for `/a/*`.
* **Login rate limiting, email verification, password reset** (needs an email provider such as Resend).
* **Reminders** are stored and exported to `.ics` (calendar apps fire them); push/LINE notifications would need a cron + provider.
* Custom domains for agent pages.
