# Public interface contract

Base path: Supabase Edge Functions. Responses contain JSON; no registered email list is public.

| Interface | Input | Success | Other outcomes |
| --- | --- | --- | --- |
| `GET /status` | none | `200 { count: number, capacity: 150, full: boolean, closed: boolean }` | `503 { code: "unavailable" }` |
| `POST /register` | `{ email: string }` | `201 { code: "registered", count: number, confirmation: "sent" \| "pending" }` | `400 invalid_email`; `409 already_registered`; `409 full`; `410 closed`; `429 rate_limited`; `503 unavailable` |

The registration response reflects database state. A confirmation that cannot be sent immediately because of the daily quota is `confirmation: "pending"`, not an uncommitted registration. The UI explains that the email may arrive later. A rate-limited request has made no registration attempt. The response must never disclose whether any other address is registered.

The private `process-confirmations` function accepts only a Cron/service credential and is not a browser endpoint. It processes pending confirmations oldest first, respects the free daily email quota, and does not automatically resend sent or uncertain confirmations. It sends no reminder email.

## UI contract

- Home shows SoChill, date/time/location, countdown, aggregate count, and a centered `Count Me In` Button.
- `Count Me In` opens a shadcn Base UI Dialog with labeled email input, browser autofill, submit feedback, and keyboard/focus support.
- Full/closed state disables registration with a clear explanation. Stored local success marker shows a returning visitor's registration state, but backend remains authoritative.
- Navbar `Contact Us` opens a right-side shadcn Base UI Drawer with event Telegram `@organizer` and website Telegram `@winhks25`.
