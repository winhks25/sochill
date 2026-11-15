# Tasks: SoChill event registration

All planning decisions are resolved, including delayed confirmations on Resend's free tier. The project currently contains no application files. Each task names its intended file.

## Phase 1: Setup

- [X] T001 Initialize the Vite React TypeScript project and lock dependencies in `package.json` and the package lockfile.
- [X] T002 Configure Tailwind and the shadcn Base UI registry in `src/index.css` and `components.json`; add only Button, Dialog, Drawer, and Input.
- [ ] T003 Initialize Supabase local configuration and function auth settings in `supabase/config.toml`.
- [ ] T004 Document required environment variables and local/deploy commands in `README.md` and `.env.example`.

## Phase 2: Foundational

- [ ] T005 Create `registrations` and `registration_rate_limits` in `supabase/migrations/`: `email` is the 3–254-character normalized primary key; `registered_at` is required with insertion-time default; `confirmation_claimed_at` and `confirmation_sent_at` are nullable UTC timestamps; rate-limit key is `(ip_hash, window_start)` with nonnegative `attempts`.
- [ ] T006 Add private database registration logic in `supabase/migrations/` that atomically rejects duplicates and enforces `capacity = 150` under concurrent requests; revoke anonymous table/function access and enable RLS.
- [ ] T007 Add focused SQL assertions in `supabase/tests/registration.sql` for uniqueness, 149-to-150 concurrency, and anonymous read/write denial.
- [ ] T008 Define shared event instant and typed public response shapes in `src/lib/api.ts`, matching `contracts/public-interface.md`.

## Phase 3: US1 (P1) — Learn about the event

Goal: a responsive home page with event information, live countdown/count, and contact drawer.

Independent check: at phone and desktop widths, verify date, time, place, countdown, aggregate count, centered CTA, and right drawer with both handles.

- [ ] T009 [US1] Implement aggregate-only `GET /status` in `supabase/functions/status/index.ts`; never return registered email addresses.
- [ ] T010 [US1] Build the accessible home layout, event details, countdown, count, and centered CTA in `src/App.tsx`.
- [ ] T011 [US1] Add the right-side Base UI Contact Us Drawer with `@organizer` and `@winhks25` in `src/App.tsx`.
- [ ] T012 [US1] Apply responsive Memphis-inspired styling and visible focus states in `src/index.css`.

## Phase 4: US2 (P1) — Register once

Goal: one valid registration per normalized email, with a hard 150-person cap and clear UI states.

Independent check: valid submit increases count once; duplicate casing/spacing is rejected; simultaneous submissions cannot pass 150; full/closed states prevent registration.

- [ ] T013 [US2] Implement email validation, a keyed hash of trusted client IP, atomic shared limit of 30 attempts per IP per minute, atomic registration call, and structured response codes in `supabase/functions/register/index.ts`.
- [ ] T014 [US2] Add the Base UI email Dialog with `type=email`, `name=email`, `autocomplete=email`, success/error states, and accessible labels in `src/components/RegistrationDialog.tsx`.
- [ ] T015 [US2] Wire the CTA, capacity/closed state, dialog, status refresh, and local success marker in `src/App.tsx`; store no email in `localStorage`.
- [ ] T016 [US2] Add focused function assertions for invalid email, duplicate, full, closed, and 429 responses in `supabase/functions/register/index.test.ts`.

## Phase 5: US3 (P1) — Receive confirmation email

Goal: confirmation after successful registration, with automatic delayed delivery when the free email quota is exhausted.

Independent check: one confirmation per new registration; quota-limited sends remain pending; a repeated processor invocation sends no completed confirmation again; uncertain delivery is visible.

- [ ] T017 [US3] Add a shared Resend confirmation sender with deterministic idempotency key in `supabase/functions/_shared/send-confirmation.ts`; call it after committed insert from `supabase/functions/register/index.ts`, record sent state, and return `confirmation: "pending"` when the daily quota is exhausted.
- [ ] T018 [US3] Reuse the shared sender from `supabase/functions/process-confirmations/index.ts` for secret-authenticated oldest-first pending processing, claim-before-send deduplication, quota stop, and uncertain-outcome logging.
- [ ] T019 [US3] Schedule daily 01:00 UTC Supabase Cron invocation with a Vault-held secret in `supabase/migrations/` to process pending confirmations.
- [ ] T020 [US3] Add focused quota, retry, no-duplicate, and uncertain-outcome assertions in `supabase/functions/process-confirmations/index.test.ts`.

## Phase 6: Polish and release validation

- [ ] T021 Verify mobile/desktop layout, keyboard focus, autofill, and error states against `specs/001-sochill-event/quickstart.md`; fix only observed issues in `src/App.tsx`, `src/components/RegistrationDialog.tsx`, or `src/index.css`.
- [ ] T022 Document deployment, sender-domain setup, pending-confirmation Cron monitoring, data retention, and free-tier delayed-email limitations in `README.md`.
- [ ] T023 Deploy the static frontend and Supabase resources, then run the production smoke checks in `specs/001-sochill-event/quickstart.md`.

## Dependencies and delivery strategy

`T001–T004` set up the project. `T005–T008` are shared prerequisites. Complete US1, then US2, then US3; US1 UI styling can proceed alongside US1 status function after setup. `T010–T012` may proceed alongside `T009` using the contract. In US2, `T014` may proceed alongside `T013` because the contract is fixed. In US3, `T018` follows the shared sender in `T017`, and `T019` follows `T018`. `T021–T023` follow all stories.

Suggested MVP: US1 plus US2, with US3 required before the stated final deliverable. Use [Conventional Commits 1.0.0](https://www.conventionalcommits.org/en/v1.0.0/#specification) for every code-change commit; follow `AGENTS.md` for clean, human-readable code.
