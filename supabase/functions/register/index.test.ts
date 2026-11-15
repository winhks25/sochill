// Focused assertions for the register Edge Function handler (T016).
// Run against the local stack: `supabase start`, then
// `deno test --allow-all supabase/functions/register/`.
// Covers the US2 independent check: invalid email, duplicate
// casing/spacing, full at 150, closed, and 429 rate limiting.
import { Pool } from 'jsr:@db/postgres@^0'
import { assertEquals } from 'jsr:@std/assert@1'
import { EVENT_START_MS } from '../_shared/event.ts'

// Local database credentials; set before importing the handler module so
// it reads them at startup.
const DB_URL = 'postgres://postgres:postgres@127.0.0.1:54322/postgres'
Deno.env.set('SUPABASE_DB_URL', DB_URL)
Deno.env.set('IP_HASH_SECRET', 'test-ip-hash-secret')

const { handleRegister, ipHash, MAX_ATTEMPTS_PER_MINUTE } = await import(
  './index.ts'
)

// Separate pool for seeding and asserting database state.
const db = new Pool(DB_URL, 1)

// POST /register request against the handler with a trusted client IP.
function post(email: unknown, ip = '203.0.113.9'): Request {
  return new Request('http://localhost:54321/functions/v1/register', {
    method: 'POST',
    headers: {
      'content-type': 'application/json',
      'x-forwarded-for': ip,
    },
    body: JSON.stringify({ email }),
  })
}

async function registrationCount(): Promise<number> {
  const connection = await db.connect()
  try {
    const { rows } = await connection
      .queryObject<{ count: number }>`select count(*)::int as count from public.registrations`
    return rows[0].count
  } finally {
    connection.release()
  }
}

async function rateLimitRowCount(): Promise<number> {
  const connection = await db.connect()
  try {
    const { rows } = await connection
      .queryObject<{ count: number }>`select count(*)::int as count from public.registration_rate_limits`
    return rows[0].count
  } finally {
    connection.release()
  }
}

async function clearTables(): Promise<void> {
  const connection = await db.connect()
  try {
    await connection.queryObject`truncate table public.registrations, public.registration_rate_limits`
  } finally {
    connection.release()
  }
}

// Seeds capacity-1..N participants directly, bypassing the endpoint.
async function seedRegistrations(total: number): Promise<void> {
  const connection = await db.connect()
  try {
    await connection.queryObject`insert into public.registrations (email)
      select 'seed' || g || '@example.com' from generate_series(1, ${total}) g`
  } finally {
    connection.release()
  }
}

Deno.test('invalid email returns 400 and registers nothing', async () => {
  await clearTables()
  const response = await handleRegister(post('not-an-email'))
  assertEquals(response.status, 400)
  assertEquals(await response.json(), { code: 'invalid_email' })
  assertEquals(await registrationCount(), 0)
})

Deno.test('missing or non-string email returns 400', async () => {
  await clearTables()
  const missing = await handleRegister(post(undefined))
  assertEquals(missing.status, 400)
  assertEquals(await missing.json(), { code: 'invalid_email' })
  const numeric = await handleRegister(post(42))
  assertEquals(numeric.status, 400)
  assertEquals(await registrationCount(), 0)
})

Deno.test('closed event returns 410 and registers nothing', async () => {
  await clearTables()
  const afterStart = { now: () => EVENT_START_MS + 1000 }
  const response = await handleRegister(post('late@example.com'), afterStart)
  assertEquals(response.status, 410)
  assertEquals(await response.json(), { code: 'closed' })
  assertEquals(await registrationCount(), 0)
  // The closed check runs before the rate limit, so no window is consumed.
  assertEquals(await rateLimitRowCount(), 0)
})

Deno.test('first valid email registers and bumps the count once', async () => {
  await clearTables()
  const response = await handleRegister(post('chill@example.com'))
  assertEquals(response.status, 201)
  const body = await response.json()
  assertEquals(body.code, 'registered')
  assertEquals(body.count, 1)
  // T017 replaces the pending placeholder with the real sender outcome.
  assertEquals(['sent', 'pending'].includes(body.confirmation), true)
  assertEquals(await registrationCount(), 1)
})

Deno.test('duplicate casing/spacing is rejected without a new row', async () => {
  await clearTables()
  await handleRegister(post('chill@example.com'))
  const response = await handleRegister(post('  CHILL@example.com  '))
  assertEquals(response.status, 409)
  assertEquals(await response.json(), { code: 'already_registered' })
  assertEquals(await registrationCount(), 1)
})

Deno.test('full event returns 409 without adding a row', async () => {
  await clearTables()
  await seedRegistrations(150)
  const response = await handleRegister(
    post('late@example.com', '203.0.113.10'),
  )
  assertEquals(response.status, 409)
  assertEquals(await response.json(), { code: 'full' })
  assertEquals(await registrationCount(), 150)
})

Deno.test('31st attempt in a minute returns 429 without registering', async () => {
  await clearTables()
  const hash = await ipHash('203.0.113.77')
  const connection = await db.connect()
  try {
    // Seed both the current and the previous minute window so crossing a
    // minute boundary between seed and request cannot flake the test.
    await connection.queryObject`insert into public.registration_rate_limits
      (ip_hash, window_start, attempts)
      values (${hash}, date_trunc('minute', now()), ${MAX_ATTEMPTS_PER_MINUTE}),
        (${hash}, date_trunc('minute', now()) - interval '1 minute', ${MAX_ATTEMPTS_PER_MINUTE})`
  } finally {
    connection.release()
  }
  const response = await handleRegister(post('spam@example.com', '203.0.113.77'))
  assertEquals(response.status, 429)
  assertEquals(await response.json(), { code: 'rate_limited' })
  assertEquals(await registrationCount(), 0)
})

// Closes the test pool last so Deno's resource sanitizer stays quiet.
Deno.test('cleanup closes the test pool', async () => {
  await db.end()
})
