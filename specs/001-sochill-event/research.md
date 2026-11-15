# Research and decisions

The user approved minimal registration delivery metadata, a small rate-limit table, and SGT for the event. They removed reminder emails and chose delayed confirmations when the free email quota is exhausted.

## Email volume

**Finding:** [Resend's free plan](https://resend.com/pricing) allows 100 emails per day. **Decision:** retain 150 places and the free plan, attempt confirmation immediately, and process quota-limited confirmations on later days. **Tradeoff:** a late registration may receive its confirmation after the event.

## Database-owned capacity

**Decision:** use one transaction with a transaction-scoped lock, duplicate lookup, count, and insert. **Rationale:** concurrent requests must not both see the final open place. **Alternative:** frontend count check or a standalone count value; both can drift or race. Restrict table access and privileged database routines under Supabase's [RLS and API guidance](https://supabase.com/docs/guides/database/postgres/row-level-security).

## Function exposure

**Decision:** public status/register functions and a separately secret-authenticated pending-confirmation processor; all table access remains server-side. **Rationale:** there is no user login, but the Cron caller can authenticate with a secret key stored in Vault. **Alternative:** browser Data API writes, which would expose a write path requiring complex public policies. See [Edge Function authentication](https://supabase.com/docs/guides/functions/auth) and [scheduled functions](https://supabase.com/docs/guides/functions/schedule-functions).

## Confirmation deduplication

**Decision:** persist claim/sent state and use deterministic Resend idempotency keys. **Rationale:** Resend retains idempotency keys for [24 hours](https://resend.com/docs/dashboard/emails/idempotency-keys), while database state survives later retries. **Alternative:** one email column cannot track the pending confirmation queue. Exact delivery semantics at an external email boundary remain limited by ambiguous network failures; record and inspect those cases rather than blindly resending.

## Rate limiting

**Decision:** use the approved small shared database table with keyed IP hash and minute-window counters. **Rationale:** Edge Function memory is not shared across instances. **Alternative:** [Upstash Redis](https://supabase.com/docs/guides/functions/examples/rate-limiting) adds another service; a local-memory limit is weaker and inconsistent.

## UI and timing

**Decision:** use the requested shadcn [Base UI Dialog](https://ui.shadcn.com/docs/components/base/dialog) and [right-side Drawer](https://ui.shadcn.com/docs/components/base/drawer), with native email autofill. Use the approved absolute 2026-11-20T19:00:00+08:00 event instant. **Alternative:** local browser time construction, which would shift the countdown for visitors elsewhere.

## Tooling

The installed Spec Kit directory is empty: no setup scripts, templates, extension hooks, or constitution exist. Planning artifacts are authored directly in `specs/001-sochill-event/`; no scripts or hooks were available to run. Supabase's [November 2026 changelog](https://supabase.com/changelog.md) notes CLI v3 behavior changes, so implementation should inspect local CLI help and pin versions before deployment.
