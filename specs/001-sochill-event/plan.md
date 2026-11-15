# Implementation plan: SoChill event registration

Status: **ready for implementation planning review**. Branch: `main` (planning only; no implementation branch created). Source: `product-brief.md`; feature specification: `spec.md`.

## Technical context

| Area | Planned choice |
| --- | --- |
| Frontend | React + Vite + TypeScript; one home route; no router required |
| UI | Tailwind CSS; shadcn Base UI Button, Dialog, Drawer, Input; custom Memphis-inspired styling |
| Data | Supabase PostgreSQL registration table; email primary key; database-owned count and capacity transaction |
| Backend | Supabase Edge Functions for public status/registration and private pending-confirmation processing |
| Email | Resend free tier with sender domain and server-side key; deterministic per-registration idempotency keys |
| Scheduling | Supabase Cron daily at 01:00 UTC (09:00 SGT), invoking a private function to drain pending confirmations within the available quota |
| Deploy | Vercel static Vite site; Supabase migrations and functions deployed separately |
| Tests | Focused database concurrency/security checks, function behavior checks, and mobile/browser smoke checks |

## Scope and structure

```text
src/App.tsx                         Home page, countdown, count, CTA, contact drawer
src/components/RegistrationDialog.tsx
src/lib/api.ts                       Public function requests and response types
src/index.css                        Tailwind and Memphis visual tokens
supabase/config.toml                 Function auth settings
supabase/functions/register/index.ts
supabase/functions/status/index.ts
supabase/functions/process-confirmations/index.ts
supabase/functions/_shared/send-confirmation.ts
supabase/migrations/                 Registration, capacity/rate-limit logic, Cron job
supabase/tests/                      Critical database assertions
README.md                            Setup, deploy, secrets, limits
```

No extra page, frontend router, organizer dashboard, or client-side database write is planned. The count is returned by a public status endpoint without exposing emails. Registration is handled server-side; client `localStorage` only improves the UI and never determines eligibility.

## Registration flow

1. Frontend requests count and closing state; renders countdown using an absolute event timestamp.
2. Button opens the requested dialog; `type=email`, `name=email`, and `autocomplete=email` support autofill.
3. Public registration function validates and normalizes the address, applies a shared limit of 30 attempts per IP per minute, then calls a private database transaction that serializes registration attempts, checks duplicate and capacity, and inserts once.
4. Function attempts confirmation through Resend for the newly committed address and returns `sent` or `pending`. If the free daily quota is exhausted, it leaves the confirmation pending; registration is not rolled back after a committed insert.
5. Browser stores only a local success marker (avoid persisting the email); refreshes public count.

## Pending-confirmation flow

Cron invokes a secret-authenticated function each day at 09:00 SGT. It processes unsent confirmations oldest first, claims each before calling Resend, and stops when Resend reports the daily quota is exhausted. Registration and the scheduled processor use one shared confirmation-sending routine. Known quota failures return to pending; uncertain send outcomes stay claimed for manual review so an automatic retry cannot duplicate a message. Resend idempotency keys protect retries within its 24-hour window. No reminder email is sent. If many students register on event day, some confirmations may arrive after the event; the UI must not promise immediate email.

## Security and failure handling

- No direct anonymous table access; enable RLS and revoke public table grants. Keep privileged database functions in a private schema and restrict execution. The public Edge Function alone holds secret credentials.
- Serialize capacity check and insert in one database transaction; a frontend count cannot enforce capacity.
- Validate and cap request size on the Edge Function. Return only outcome codes and aggregate count; do not log or return recipient lists.
- Rate limiting uses the approved small database-backed per-IP minute-window table; store a keyed IP hash and delete expired windows. The 30-per-minute limit is deliberately basic and may occasionally throttle a shared campus network.
- Distinguish accepted registration from email delivery. Resend idempotency only covers a 24-hour retry window, so durable claim/sent state prevents automatic duplicate confirmation attempts after that window.

## Constitution check

No `.specify/memory/constitution.md` exists. Checked against the amended brief instead: requested stack, one page plus drawer, atomic 150 limit, private emails/keys, free-tier intent, and clean modular code. User-approved metadata, the small rate-limit table, and delayed confirmation delivery resolve the identified conflicts; the design clears this check.

## Resolved decisions

1. `registrations` may add minimal delivery metadata; `email` remains its primary key.
2. A small rate-limit table is allowed.
3. Event time and countdown use SGT.
4. No reminders are sent. The free Resend tier is retained; confirmations may be delayed when its daily quota is exhausted.

## Email quota limit

[Resend's current free plan](https://resend.com/pricing) allows 100 emails per day. If more than 100 students register on one day, confirmations beyond the quota wait for a later daily run. This may put a confirmation after the event if registrations cluster on 20 November. The website must distinguish successful registration from pending email delivery.

## Design review

The data model, contract, tests, and tasks reflect all resolved choices. Recheck current CLI commands and email quotas before deployment. No code or infrastructure has been changed in this planning pass.
