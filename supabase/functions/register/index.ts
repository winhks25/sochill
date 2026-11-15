// Public registration endpoint (POST /register).
// Validates and normalizes the email, applies a shared 30-attempts-per-IP
// minute limit, and calls the private atomic registration transaction.
// Contract: specs/001-sochill-event/contracts/public-interface.md
import { Pool } from 'jsr:@db/postgres@^0'
import { EVENT_START_MS } from '../_shared/event.ts'

// Shared limit per IP per minute (see specs/001-sochill-event/data-model.md).
export const MAX_ATTEMPTS_PER_MINUTE = 30

// Reject oversized bodies before doing any database work.
const MAX_BODY_BYTES = 1024

// The WHATWG HTML5 email pattern: one @, a non-empty local part, and a
// domain of dot-separated labels of 1–63 characters.
const EMAIL_PATTERN =
  /^[a-zA-Z0-9.!#$%&'*+/=?^_`{|}~-]+@[a-zA-Z0-9](?:[a-zA-Z0-9-]{0,61}[a-zA-Z0-9])?(?:\.[a-zA-Z0-9](?:[a-zA-Z0-9-]{0,61}[a-zA-Z0-9])?)*$/

// Normalizes (trim, lowercase) and validates; null means invalid_email.
export function normalizeEmail(raw: unknown): string | null {
  if (typeof raw !== 'string') return null
  const email = raw.trim().toLowerCase()
  if (email.length < 3 || email.length > 254) return null
  return EMAIL_PATTERN.test(email) ? email : null
}

// Keyed hash of the request IP; the raw address is never stored.
export async function ipHash(ip: string): Promise<string> {
  const secret = Deno.env.get('IP_HASH_SECRET') ?? 'dev-only-insecure'
  const key = await crypto.subtle.importKey(
    'raw',
    new TextEncoder().encode(secret),
    { name: 'HMAC', hash: 'SHA-256' },
    false,
    ['sign'],
  )
  const digest = await crypto.subtle.sign(
    'HMAC',
    key,
    new TextEncoder().encode(ip),
  )
  return [...new Uint8Array(digest)]
    .map((byte) => byte.toString(16).padStart(2, '0'))
    .join('')
}

// Injectable clock so tests can run the handler after the event instant.
export interface RegisterDeps {
  now: () => number
}

// Browser clients on another origin (Vercel) need CORS to call this function.
const corsHeaders = {
  'Access-Control-Allow-Origin': '*',
  'Access-Control-Allow-Methods': 'POST, OPTIONS',
  'Access-Control-Allow-Headers': 'authorization, content-type',
}

// JSON response carrying the shared CORS headers.
function json(body: unknown, status: number): Response {
  return Response.json(body, { status, headers: corsHeaders })
}

// The proxy sets x-forwarded-for, so its first entry is the trusted client
// IP. Without it (local runs) every caller shares one bucket.
function trustedIp(req: Request): string {
  const forwarded = req.headers.get('x-forwarded-for') ?? ''
  return forwarded.split(',')[0].trim() || 'unknown'
}

export async function handleRegister(
  req: Request,
  deps: RegisterDeps = { now: Date.now },
): Promise<Response> {
  if (req.method === 'OPTIONS') {
    return new Response('ok', { headers: corsHeaders })
  }
  if (req.method !== 'POST') {
    return json({ code: 'unavailable' }, 405)
  }

  // Read a small JSON body of the shape { email }.
  const bodyText = await req.text()
  if (bodyText.length > MAX_BODY_BYTES) {
    return json({ code: 'invalid_email' }, 400)
  }
  let body: unknown
  try {
    body = JSON.parse(bodyText)
  } catch {
    return json({ code: 'invalid_email' }, 400)
  }
  const email = normalizeEmail(
    typeof body === 'object' && body !== null
      ? (body as { email?: unknown }).email
      : undefined,
  )
  if (!email) {
    return json({ code: 'invalid_email' }, 400)
  }

  // Registrations close at the event instant, before any database work.
  if (deps.now() >= EVENT_START_MS) {
    return json({ code: 'closed' }, 410)
  }

  // One connection per request is plenty for this event's traffic and keeps
  // every code path leak-free.
  const pool = new Pool(Deno.env.get('SUPABASE_DB_URL')!, 1)
  try {
    const connection = await pool.connect()
    try {
      // Shared per-IP minute window; a rate-limited request makes no
      // registration attempt.
      const { rows: attempts } = await connection.queryObject<{
        attempts: number
      }>`select private.consume_rate_limit(${await ipHash(trustedIp(req))}) as attempts`
      if ((attempts[0]?.attempts ?? 0) > MAX_ATTEMPTS_PER_MINUTE) {
        return json({ code: 'rate_limited' }, 429)
      }

      // Atomic duplicate + capacity + insert (private.register_participant).
      const { rows: outcomes } = await connection.queryObject<{
        result: string
        registration_count: number
      }>`select result, registration_count from private.register_participant(${email})`
      switch (outcomes[0]?.result) {
        case 'registered':
          // T017 wires the real Resend sender; until then every committed
          // registration reports a pending confirmation.
          return json(
            {
              code: 'registered',
              count: outcomes[0].registration_count,
              confirmation: 'pending',
            },
            201,
          )
        case 'duplicate':
          return json({ code: 'already_registered' }, 409)
        default: // 'full' or no row: the event is at capacity.
          return json({ code: 'full' }, 409)
      }
    } finally {
      connection.release()
    }
  } catch (cause) {
    console.error('register handler failed:', cause)
    return json({ code: 'unavailable' }, 503)
  } finally {
    await pool.end()
  }
}

// Only serve when run directly; tests import the handler instead.
if (import.meta.main) {
  Deno.serve((req) => handleRegister(req))
}
