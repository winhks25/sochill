# SoChill event registration specification

Source: `product-brief.md`. Planning decisions are recorded in `plan.md`.

## User stories

### US1 (P1): Learn about the event

As a student, I can see the date, 7–9 PM time, COM1 Foyer location, remaining countdown, registration count, and contact details on a responsive home page so I can decide whether to attend.

Acceptance: event starts 20 November 2026; countdown reaches zero at start; the navbar opens a right-side Contact Us drawer with the two Telegram handles; the main call to action is centered and prominent.

### US2 (P1): Register once

As a student, I can open a shadcn Base UI dialog, autofill my email, and register once while places remain. I see success, already registered, full, invalid input, and temporary failure states accurately.

Acceptance: backend validates and normalizes email; duplicate emails are rejected; database commits at most 150 unique registrations even under concurrent requests; public clients cannot read registered email addresses or write the count; browser storage remembers a successful registration without acting as the source of truth; registration closes at capacity and after the event starts.

### US3 (P1): Receive confirmation email

As a registered student, I receive a confirmation email after registration. It may be delayed when Resend's free daily quota is exhausted.

Acceptance: only committed registrations receive mail; the backend attempts immediate confirmation, queues quota-limited confirmations, and retries them automatically when quota becomes available; repeated processing does not send duplicate confirmations; failed or uncertain sends are visible for an operator to inspect; no recipient list or email API key reaches the browser. No reminder is sent.

## Constraints

- React, Vite, TypeScript, Tailwind, shadcn Base UI, Supabase PostgreSQL/Edge Functions/Cron for pending confirmations, Resend, Vercel.
- Memphis-inspired bright, youthful styling and mobile accessibility.
- No authentication, check-in, attendance tracking, dashboard, Telegram integration, or payment.
- The registration table uses `email` as primary key and minimal delivery metadata, as approved by the user. A second small table stores rate-limit counters.
- All event times use Singapore time (SGT, UTC+08:00). No reminder email is sent.
