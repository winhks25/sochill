# Data model

The user approved minimal delivery metadata on the registration table and a small rate-limit table. Event time is SGT. Only confirmation emails are sent.

## `registrations`

| Field | Constraint | Purpose |
| --- | --- | --- |
| `email` | `text` primary key; required; trimmed and lowercased before insert; 3–254 characters; backend email-format validation | One unique participant |
| `registered_at` | required UTC timestamp, defaulting to insertion time | Process pending confirmations oldest first |
| `confirmation_claimed_at` | nullable UTC timestamp | Set before invoking Resend; blocks concurrent or uncertain retries |
| `confirmation_sent_at` | nullable UTC timestamp | Null until Resend accepts the confirmation |

Only the backend may access rows. A successful registration is committed before confirmation is attempted. Confirmation transitions `pending → claimed → sent`. A confirmed daily-quota failure returns to pending for the next daily run; an uncertain network outcome remains claimed for operator inspection so it is not automatically resent after Resend's 24-hour idempotency window. A null sent timestamp is visible to an operator in the database and logs; the public response still says registration succeeded, with confirmation pending.

## `registration_rate_limits`

| Field | Constraint | Purpose |
| --- | --- | --- |
| `ip_hash` | required; part of primary key; keyed hash of trusted request IP | Limit attempts without storing raw IP |
| `window_start` | required UTC minute timestamp; part of primary key | Fixed one-minute window |
| `attempts` | required nonnegative integer | Reject after 30 requests in the window |

Increment and limit check are atomic. Delete windows older than one day. Do not expose this table to anonymous clients. A shared campus IP can hit the limit; return HTTP 429 with a clear retry message.

## Derived values and fixed instants

`registration_count = count(registrations)`; `capacity = 150`; `full = registration_count >= 150`. No mutable count column. Event start: `2026-11-20T19:00:00+08:00`; registrations close at that instant. The daily confirmation processor runs at 09:00 SGT while pending rows exist.
