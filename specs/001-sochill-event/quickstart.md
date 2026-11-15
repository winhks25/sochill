# Validation quickstart

Status: future run guide; there is no application to run yet.

## Prerequisites

- Node.js, package manager and Supabase CLI versions pinned during implementation.
- Supabase project/CLI access; Resend sender domain and API key; Vercel project.
- Function secrets configured server-side; never place Resend or Supabase secret keys in Vite environment variables.

## Run and verify

1. Install dependencies from the lockfile, start the local Supabase stack and Vite dev server using the README commands written during implementation.
2. Inspect home at narrow and wide viewports. Verify event details, centered CTA, accessible dialog, right drawer, and countdown to 20 November 2026 19:00 SGT.
3. Register a valid address. Expect one database row, count +1, success UI, local success marker, and one confirmation message or a clear pending-email state if the daily quota is exhausted.
4. Repeat the same address with different casing/spacing. Expect `already_registered`, unchanged count, no extra confirmation.
5. Send concurrent unique registrations at 149 rows. Expect exactly one success and exactly 150 rows. At 150, expect disabled CTA and `full` from the backend.
6. Call public Data API directly as an anonymous client. Expect no registration email read/write access. Inspect browser bundle and network responses for absent secret keys and recipient lists.
7. Exceed the request limit. Expect 429 without a new row.
8. Simulate the provider's daily quota limit with a test sender. Expect registration to succeed with `confirmation: "pending"`; run the private confirmation processor and verify it sends the pending message once when quota is available. Run it again and expect no duplicate. Inspect failed or uncertain delivery in database state and logs.
9. Deploy to Vercel and Supabase; repeat the home, registration, and aggregate count smoke checks. Verify the daily Cron schedule is 01:00 UTC (09:00 SGT). Confirm no reminder job or reminder email exists.

Expected API responses and UI states are defined in `contracts/public-interface.md`.
