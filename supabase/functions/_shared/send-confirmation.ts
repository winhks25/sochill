// Shared Resend confirmation sender for the register endpoint and the
// pending-confirmation processor. Both callers must use this routine so
// registrations and the daily Cron drain behave identically.
// Data model: specs/001-sochill-event/data-model.md
import type { Pool } from 'jsr:@db/postgres@^0'

// The pooled database connection the caller already holds; the sender only
// updates the confirmation columns of one row.
export type DbConnection = Awaited<ReturnType<Pool['connect']>>

// Delivery outcomes:
// - sent: Resend accepted the message.
// - quota_exhausted: known daily-quota failure; the row returns to pending
//   for a later run.
// - failed: definitive rejection (invalid key, rejected address); the row
//   stays claimed because retrying cannot succeed.
// - uncertain: ambiguous network outcome; the row stays claimed so an
//   automatic retry cannot duplicate a message.
export type SendOutcome = 'sent' | 'quota_exhausted' | 'failed' | 'uncertain'

// What the public contract exposes: 'sent' or 'pending' only.
export type ConfirmationStatus = 'sent' | 'pending'

// Injectable dependencies so tests never touch the network or real secrets.
export interface SendConfirmationDeps {
  apiKey?: string
  from?: string
  fetchImpl?: typeof fetch
}

// Free-tier sender identity; onboarding@resend.dev works for local testing.
const DEFAULT_FROM = 'SoChill <onboarding@resend.dev>'

// Simple, accurate copy: the event runs 20 November 2026, 7–9 PM, COM1 Foyer.
const SUBJECT = "You're in for SoChill!"
const HTML = [
  '<p>Hi there!</p>',
  "<p>Your spot at <strong>SoChill</strong> is confirmed — we've saved a place for you.</p>",
  '<p><strong>When:</strong> 20 November 2026, 7:00–9:00 PM (SGT)<br>',
  '<strong>Where:</strong> NUS COM1 Foyer</p>',
  '<p>See you there!<br>— The SoChill team</p>',
].join('')

// Deterministic per-registration key; Resend retains it for 24 hours, so a
// retry inside that window can never duplicate the message.
export async function confirmationIdempotencyKey(email: string): Promise<string> {
  const digest = await crypto.subtle.digest(
    'SHA-256',
    new TextEncoder().encode(email),
  )
  const hex = [...new Uint8Array(digest)]
    .map((byte) => byte.toString(16).padStart(2, '0'))
    .join('')
  return `sochill-confirmation-${hex.slice(0, 32)}`
}

// Call Resend and classify the response. No recipient address is logged;
// the idempotency key (a hash of the address) identifies the row instead.
async function requestResend(
  email: string,
  deps: SendConfirmationDeps,
): Promise<SendOutcome> {
  const apiKey = deps.apiKey ?? Deno.env.get('RESEND_API_KEY')
  if (!apiKey) {
    console.error(
      `RESEND_API_KEY is not set; confirmation ${await confirmationIdempotencyKey(email)} cannot be sent`,
    )
    return 'failed'
  }
  const from = deps.from ?? Deno.env.get('RESEND_FROM') ?? DEFAULT_FROM
  const doFetch = deps.fetchImpl ?? fetch
  try {
    const response = await doFetch('https://api.resend.com/emails', {
      method: 'POST',
      headers: {
        Authorization: `Bearer ${apiKey}`,
        'Content-Type': 'application/json',
        'Idempotency-Key': await confirmationIdempotencyKey(email),
      },
      body: JSON.stringify({ from, to: [email], subject: SUBJECT, html: HTML }),
    })
    if (response.ok) return 'sent'
    if (response.status === 429) {
      // Resend reports the exhausted daily quota as a 429 rate limit.
      console.error(
        `Resend daily quota exhausted; confirmation ${await confirmationIdempotencyKey(email)} stays pending`,
      )
      return 'quota_exhausted'
    }
    console.error(
      `Resend rejected confirmation ${await confirmationIdempotencyKey(email)} with HTTP ${response.status}`,
    )
    return 'failed'
  } catch (cause) {
    console.error(
      `Outcome of confirmation ${await confirmationIdempotencyKey(email)} is uncertain:`,
      cause,
    )
    return 'uncertain'
  }
}

// Sends one confirmation and records the delivery state. Callers map the
// outcome onto their own response ('sent' for the contract, 'pending' for
// everything else); the database state is authoritative for retries.
export async function sendConfirmation(
  connection: DbConnection,
  email: string,
  deps: SendConfirmationDeps = {},
): Promise<SendOutcome> {
  const outcome = await requestResend(email, deps)
  switch (outcome) {
    case 'sent':
      // Delivered: the row leaves the pending queue for good.
      await connection.queryObject`update public.registrations
        set confirmation_sent_at = now(), confirmation_claimed_at = null
        where email = ${email}`
      break
    case 'quota_exhausted':
      // Known quota failure: release any claim so the next daily run retries.
      await connection.queryObject`update public.registrations
        set confirmation_claimed_at = null where email = ${email}`
      break
    default:
      // Definitive or ambiguous failure: keep the row claimed for operator
      // inspection; neither is retried automatically.
      await connection.queryObject`update public.registrations
        set confirmation_claimed_at = now()
        where email = ${email} and confirmation_claimed_at is null`
      break
  }
  return outcome
}
