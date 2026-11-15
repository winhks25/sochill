# SoChill

A simple, mobile-friendly registration website for **SoChill**, a study break offering
free bubble tea and snacks at NUS. Students see event details, a live countdown, and the
current sign-up count, then enter their email to "count me in" and receive a confirmation
email.

- **Event:** 20 November 2026, 7:00–9:00 PM, NUS COM1 Foyer
- **Capacity:** 150 participants
- **Hosted on:** Vercel (frontend) + Supabase (database, Edge Functions, Cron)

See [`product-brief.md`](product-brief.md) for the full requirements and
[`specs/001-sochill-event/`](specs/001-sochill-event/) for the plan, spec, data model, and
contract.

## Tech stack

| Component | Technology |
| --- | --- |
| Frontend | React + Vite + TypeScript |
| Styling | Tailwind CSS (v4) |
| UI | shadcn Base UI (Button, Dialog, Drawer, Input) |
| Database | Supabase PostgreSQL |
| Backend | Supabase Edge Functions |
| Email | Resend (free tier) |
| Scheduling | Supabase Cron (delayed confirmations) |
| Deployment | Vercel |

## Project structure

```text
src/
  App.tsx                         Home page: countdown, count, "Count Me In", contact drawer
  components/RegistrationDialog.tsx    Base UI email dialog (US2)
  components/ui/                  Base UI Button, Dialog, Drawer, Input
  lib/api.ts                      Public function requests and response types
  lib/utils.ts                    cn() helper
  index.css                       Tailwind + Memphis visual tokens
main.tsx                          Vite entry point
supabase/
  config.toml                     Local stack + Edge Function authentication
  functions/                      register, status, process-confirmations, _shared
  migrations/                     Tables, capacity/rate-limit logic, Cron job
  tests/                          Database assertions
```

## Prerequisites

- Node.js 22+ and a package manager (npm/pnpm).
- [Supabase CLI v3](https://supabase.com/docs/guides/local-development) for the local stack.
- A Resend account with a verified sender domain and an API key.
- A Vercel account (deploy only).

## Setup

```bash
# 1. Install frontend dependencies from the lockfile.
npm install        # or: pnpm install

# 2. Start the local Supabase stack (reads supabase/config.toml).
supabase start

# 3. Apply the database migrations and register the Edge Functions.
supabase functions install

# 4. Start the frontend dev server.
npm run dev
```

Open the printed local URL (default http://localhost:5173). The home page shows the event
details, a countdown to **2026-11-20 19:00 SGT**, the live sign-up count, and a centered
**Count Me In** button. Open the navbar **Contact Us** drawer for the organizer handles.

## Environment variables

Secrets are split by exposure risk. **Never put the Resend key or the Supabase service key
in Vite environment variables** — Vite only bundles `VITE_`-prefixed variables, so those
would be shipped to every browser.

### Client (safe to expose) — `.env.frontend.example`

| Variable | Purpose |
| --- | --- |
| `VITE_SUPABASE_URL` | Public URL of the deployed Supabase project. |
| `VITE_SUPABASE_ANON_KEY` | Public anon/publishable key (safe in the browser build). |

### Local development / functions (never expose) — `.env.example`

| Variable | Purpose |
| --- | --- |
| `SUPABASE_URL` | Local Supabase endpoint (from `supabase start`). |
| `SUPABASE_SERVICE_KEY` | Local service key, only if a function needs RLS-elevated access. |
| `RESEND_API_KEY` | Resend key for local confirmation-email testing. |

### Deployment secrets (Vault / deploy flags)

- `RESEND_API_KEY` — passed at deploy time, never committed:
  `supabase functions deploy register --secret "RESEND_API_KEY=<key>"`.
- `SUPABASE_ACCESS_TOKEN` — for linked deploy commands (`supabase link`, `supabase db push`).
- Cron and function secrets live in Supabase Vault, not in the repo or Vite build.

Copy the templates to real files as needed:

```bash
cp .env.example .env          # local Supabase + functions
cp .env.frontend.example .env.production   # Vite client (fill in deployed values)
```

## Available scripts

| Command | Description |
| --- | --- |
| `npm run dev` | Start the Vite dev server. |
| `npm run build` | Type-check with `tsc -b` and produce the production bundle in `dist/`. |
| `npm run preview` | Preview the production build locally. |
| `npm run lint` | Lint with oxlint. |

## Deployment

### Supabase

```bash
# Link to your remote project (prompts for a personal access token or password).
supabase link --project-ref <PROJECT_REF>

# Apply migrations to the database.
supabase db push

# Deploy the Edge Functions (supply secrets at deploy time or via Vault).
supabase functions deploy status --no-verify-jwt
supabase functions deploy register --no-verify-jwt --secret "RESEND_API_KEY=<key>"
supabase functions deploy process-confirmations --secret "RESEND_API_KEY=<key>"

# Register the daily cron that drains pending confirmations (also defined in migrations/).
supabase functions deploy --all
```

The cron is scheduled for **01:00 UTC (09:00 SGT)** to process pending confirmations within
the available daily quota.

### Vercel (frontend)

Deploy the static `dist/` output. Set the client env vars `VITE_SUPABASE_URL` and
`VITE_SUPABASE_ANON_KEY` in the Vercel project settings. Do **not** add the Resend or
service keys.

## Security model

- Registration and capacity (`= 150`) are enforced server-side in one database transaction
  with a row lock; the count is aggregate-only in `GET /status` and never reveals emails.
- The `registrations` and `registration_rate_limits` tables are behind Row-Level Security;
  anonymous clients have no direct read/write access.
- Email sending and privileged database access stay server-side in the Edge Functions.
- A shared limit of 30 attempts per IP per minute throttles spam; a shared campus IP may
  occasionally hit it and receive `429`.

## Known limitations

- **Delayed confirmations.** Resend's free tier allows 100 emails per day. When that quota
  is exhausted, new registrations still succeed but the confirmation is queued and sent on a
  later daily run — possibly after the event. The UI distinguishes a successful registration
  from pending email delivery and never promises immediate email.
- **Rate limiting** is intentionally basic (per-IP, per-minute) and may throttle shared
  networks.
- **No reminders** are sent, by design.

## Validation

See [`specs/001-sochill-event/quickstart.md`](specs/001-sochill-event/quickstart.md) for the
end-to-end run and verification checks (registration, concurrency at 150, rate limiting,
pending-confirmation delivery, and deploy smoke tests).
