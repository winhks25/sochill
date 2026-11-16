// Focused assertions for the process-confirmations Edge Function handler (T020).
// Run against the local stack: `supabase start`, then
// `deno test --allow-all supabase/functions/process-confirmations/`.
// Covers the US3 independent check: oldest-first sending, no duplicate
// confirmations on repeated runs, quota stop with released claims, retry
// once quota returns, and uncertain outcomes that stay claimed for review.
import { Pool } from 'jsr:@db/postgres@^0'
import { assertEquals } from 'jsr:@std/assert@1'
import { confirmationIdempotencyKey } from '../_shared/send-confirmation.ts'

// Local database credentials and the expected caller credential; set before
// importing the handler module so it reads them per request.
const DB_URL = 'postgres://postgres:postgres@127.0.0.1:54322/postgres'
Deno.env.set('SUPABASE_DB_URL', DB_URL)
Deno.env.set('SUPABASE_SERVICE_ROLE_KEY', 'test-service-key')

const { handleProcessConfirmations } = await import('./index.ts')

// Separate pool for seeding and asserting database state.
const db = new Pool(DB_URL, 1)

// A fetch stub never touches the network: it records requests and answers
// from a per-test script.
interface RecordedRequest {
  url: string
  headers: Headers
  body: { from: string; to: string[]; subject: string; html: string }
}
type FetchScript = Array<Response | 'throw'>

function stubFetch(script: FetchScript): {
  fetchImpl: typeof fetch
  requests: RecordedRequest[]
} {
  const requests: RecordedRequest[] = []
  const fetchImpl = ((
    input: RequestInfo | URL,
    init?: RequestInit,
  ): Promise<Response> => {
    const step = script.shift()
    requests.push({
      url: String(input),
      headers: new Headers(init?.headers),
      body: JSON.parse(String(init?.body)),
    })
    if (step === 'throw') return Promise.reject(new Error('network down'))
    return Promise.resolve(step as Response)
  }) as typeof fetch
  return { fetchImpl, requests }
}

// POST with (or without) the credential the Cron job would present.
function post(authorization?: string): Request {
  return new Request(
    'http://localhost:54321/functions/v1/process-confirmations',
    {
      method: 'POST',
      headers: authorization
        ? { authorization }
        : { 'content-type': 'application/json' },
      body: '{}',
    },
  )
}

async function clearTables(): Promise<void> {
  const connection = await db.connect()
  try {
    await connection.queryObject`truncate table public.registrations`
  } finally {
    connection.release()
  }
}

// Seeds one unclaimed, unsent registration with an explicit registered_at
// so the oldest-first order is deterministic.
async function seedPending(email: string, registeredAt: string): Promise<void> {
  const connection = await db.connect()
  try {
    await connection.queryObject`insert into public.registrations
      (email, registered_at) values (${email}, ${registeredAt}::timestamptz)`
  } finally {
    connection.release()
  }
}

interface RowState {
  claimed: boolean
  sent: boolean
}

async function rowState(email: string): Promise<RowState> {
  const connection = await db.connect()
  try {
    const { rows } = await connection.queryObject<{
      claimed: boolean
      sent: boolean
    }>`select
         (confirmation_claimed_at is not null) as claimed,
         (confirmation_sent_at is not null) as sent
       from public.registrations where email = ${email}`
    return rows[0]
  } finally {
    connection.release()
  }
}

async function sentTimestamp(
  email: string,
): Promise<string | undefined> {
  const connection = await db.connect()
  try {
    const { rows } = await connection
      .queryObject<{ sent_at: string }>`select confirmation_sent_at as sent_at
        from public.registrations where email = ${email}`
    return rows[0]?.sent_at
  } finally {
    connection.release()
  }
}

Deno.test('requests without the service credential are forbidden', async () => {
  await clearTables()
  await seedPending('guard@example.com', '2026-11-15T10:00:00Z')
  const { fetchImpl, requests } = stubFetch([])
  const missing = await handleProcessConfirmations(post(), { fetchImpl })
  assertEquals(missing.status, 403)
  const wrong = await handleProcessConfirmations(
    post('Bearer not-the-service-key'),
    { fetchImpl },
  )
  assertEquals(wrong.status, 403)
  assertEquals(requests.length, 0)
  // No send was attempted, so the row is still unclaimed pending.
  assertEquals(await rowState('guard@example.com'), { claimed: false, sent: false })
})

Deno.test('pending confirmations are sent oldest first and marked sent', async () => {
  await clearTables()
  await seedPending('third@example.com', '2026-11-15T12:00:00Z')
  await seedPending('first@example.com', '2026-11-15T10:00:00Z')
  await seedPending('second@example.com', '2026-11-15T11:00:00Z')
  const ok = () =>
    new Response(JSON.stringify({ id: 'resend-message' }), { status: 200 })
  const { fetchImpl, requests } = stubFetch([ok(), ok(), ok()])

  const response = await handleProcessConfirmations(
    post('Bearer test-service-key'),
    { fetchImpl, apiKey: 'test-resend-key' },
  )
  assertEquals(response.status, 200)
  assertEquals(await response.json(), { processed: 3, stopped: 'drained' })
  assertEquals(
    requests.map((request) => request.body.to[0]),
    ['first@example.com', 'second@example.com', 'third@example.com'],
  )
  for (const state of ['first', 'second', 'third']) {
    assertEquals(await rowState(`${state}@example.com`), {
      claimed: false,
      sent: true,
    })
  }
})

Deno.test('a repeated run sends no duplicate confirmations', async () => {
  await clearTables()
  await seedPending('once@example.com', '2026-11-15T10:00:00Z')
  const ok = () =>
    new Response(JSON.stringify({ id: 'resend-message' }), { status: 200 })
  const first = stubFetch([ok()])
  await handleProcessConfirmations(post('Bearer test-service-key'), {
    fetchImpl: first.fetchImpl,
    apiKey: 'test-resend-key',
  })
  const sentBefore = await sentTimestamp('once@example.com')

  // Second invocation: everything is already sent, so nothing is queued.
  const second = stubFetch([])
  const response = await handleProcessConfirmations(
    post('Bearer test-service-key'),
    { fetchImpl: second.fetchImpl, apiKey: 'test-resend-key' },
  )
  assertEquals(await response.json(), { processed: 0, stopped: 'drained' })
  assertEquals(second.requests.length, 0)
  assertEquals(await sentTimestamp('once@example.com'), sentBefore)
})

Deno.test('quota exhaustion stops the drain and releases the claim', async () => {
  await clearTables()
  await seedPending('quota1@example.com', '2026-11-15T10:00:00Z')
  await seedPending('quota2@example.com', '2026-11-15T11:00:00Z')
  const limited = () =>
    new Response(
      JSON.stringify({
        name: 'rate_limit_exceeded',
        message: 'You have reached your daily quota of emails',
      }),
      { status: 429 },
    )
  const { fetchImpl, requests } = stubFetch([limited()])
  const response = await handleProcessConfirmations(
    post('Bearer test-service-key'),
    { fetchImpl, apiKey: 'test-resend-key' },
  )
  assertEquals(await response.json(), {
    processed: 0,
    stopped: 'quota_exhausted',
  })
  // The drain stopped at the first quota failure instead of claiming the
  // whole queue.
  assertEquals(requests.length, 1)
  // Both rows returned to pending, ready for a later run.
  assertEquals(await rowState('quota1@example.com'), { claimed: false, sent: false })
  assertEquals(await rowState('quota2@example.com'), { claimed: false, sent: false })
})

Deno.test('pending confirmations retry once the quota is available', async () => {
  await clearTables()
  await seedPending('retry@example.com', '2026-11-15T10:00:00Z')
  const limited = () =>
    new Response(JSON.stringify({ name: 'rate_limit_exceeded' }), {
      status: 429,
    })
  const { fetchImpl: limitedFetch } = stubFetch([limited()])
  await handleProcessConfirmations(post('Bearer test-service-key'), {
    fetchImpl: limitedFetch,
    apiKey: 'test-resend-key',
  })
  assertEquals(await rowState('retry@example.com'), { claimed: false, sent: false })

  const ok = () =>
    new Response(JSON.stringify({ id: 'resend-message' }), { status: 200 })
  const retried = stubFetch([ok()])
  const response = await handleProcessConfirmations(
    post('Bearer test-service-key'),
    { fetchImpl: retried.fetchImpl, apiKey: 'test-resend-key' },
  )
  assertEquals(await response.json(), { processed: 1, stopped: 'drained' })
  assertEquals(await rowState('retry@example.com'), { claimed: false, sent: true })
  // The retry presents the same deterministic idempotency key.
  assertEquals(
    retried.requests[0].headers.get('Idempotency-Key'),
    await confirmationIdempotencyKey('retry@example.com'),
  )
})

Deno.test('uncertain outcomes stay claimed and are not retried automatically', async () => {
  await clearTables()
  await seedPending('flaky@example.com', '2026-11-15T10:00:00Z')
  const { fetchImpl, requests } = stubFetch(['throw'])
  const response = await handleProcessConfirmations(
    post('Bearer test-service-key'),
    { fetchImpl, apiKey: 'test-resend-key' },
  )
  assertEquals(await response.json(), { processed: 0, stopped: 'uncertain' })
  assertEquals(requests.length, 1)
  // The message may or may not have reached Resend, so the row stays claimed
  // for manual inspection instead of being resent automatically.
  assertEquals(await rowState('flaky@example.com'), { claimed: true, sent: false })

  // A later automatic run must skip the claimed row entirely.
  const rerun = stubFetch([
    new Response(JSON.stringify({ id: 'resend-message' }), { status: 200 }),
  ])
  const second = await handleProcessConfirmations(
    post('Bearer test-service-key'),
    { fetchImpl: rerun.fetchImpl, apiKey: 'test-resend-key' },
  )
  assertEquals(await second.json(), { processed: 0, stopped: 'drained' })
  assertEquals(rerun.requests.length, 0)
})

Deno.test('definitive rejections stay claimed instead of blocking or retrying', async () => {
  await clearTables()
  await seedPending('reject@example.com', '2026-11-15T10:00:00Z')
  const rejected = () =>
    new Response(
      JSON.stringify({ name: 'validation_error', message: 'invalid address' }),
      { status: 422 },
    )
  const { fetchImpl, requests } = stubFetch([rejected()])
  const response = await handleProcessConfirmations(
    post('Bearer test-service-key'),
    { fetchImpl, apiKey: 'test-resend-key' },
  )
  assertEquals(await response.json(), { processed: 0, stopped: 'failed' })
  assertEquals(requests.length, 1)
  assertEquals(await rowState('reject@example.com'), { claimed: true, sent: false })
})

Deno.test('idempotency keys are deterministic per registration', async () => {
  const first = await confirmationIdempotencyKey('stable@example.com')
  const second = await confirmationIdempotencyKey('stable@example.com')
  assertEquals(first, second)
  const other = await confirmationIdempotencyKey('other@example.com')
  assertEquals(first === other, false)
})

// Closes the test pool last so Deno's resource sanitizer stays quiet.
Deno.test('cleanup closes the test pool', async () => {
  await db.end()
})
