// Private pending-confirmation processor (POST /process-confirmations).
// Invoked by the daily Supabase Cron job; never a browser endpoint.
// Contract: specs/001-sochill-event/contracts/public-interface.md
// Plan: specs/001-sochill-event/plan.md (pending-confirmation flow)
import { Pool } from 'jsr:@db/postgres@^0'
import { sendConfirmation, type SendOutcome } from '../_shared/send-confirmation.ts'

// Why the drain stopped; returned so the Cron run is auditable in logs.
// - drained: every pending confirmation has been sent.
// - quota_exhausted: Resend hit its daily limit; claimed rows were released
//   back to pending for the next daily run.
// - failed: a definitive rejection kept its claim for operator inspection.
// - uncertain: an ambiguous network outcome kept its claim for the same
//   reason; retrying blindly could duplicate a message.
export type StopReason = 'drained' | 'quota_exhausted' | 'failed' | 'uncertain'

// Injectable dependencies so tests never touch the network or real secrets.
export interface ProcessorDeps {
  apiKey?: string
  from?: string
  fetchImpl?: typeof fetch
}

// The Cron caller presents the service-role JWT stored in Vault. The gateway
// (verify_jwt) already checked it is a valid Supabase JWT; this equality
// check additionally rejects any ordinary authenticated JWT, because a valid
// anon JWT must never be able to drain the confirmation queue.
export function isAuthorized(req: Request): boolean {
  const expected = Deno.env.get('SUPABASE_SERVICE_ROLE_KEY') ?? ''
  const header = req.headers.get('authorization') ?? ''
  return expected !== '' && header === `Bearer ${expected}`
}

// Drains pending confirmations oldest first. Each claim is a single atomic
// UPDATE ... FOR UPDATE SKIP LOCKED, so two concurrent runs can never claim
// (and send for) the same registration.
export async function handleProcessConfirmations(
  req: Request,
  deps: ProcessorDeps = {},
): Promise<Response> {
  if (req.method !== 'POST') {
    return Response.json({ code: 'unavailable' }, { status: 405 })
  }
  if (!isAuthorized(req)) {
    return Response.json({ code: 'forbidden' }, { status: 403 })
  }

  const pool = new Pool(Deno.env.get('SUPABASE_DB_URL')!, 1)
  try {
    const connection = await pool.connect()
    try {
      let processed = 0
      let stopped: StopReason = 'drained'
      for (;;) {
        // Claim the oldest unclaimed, unsent registration.
        const { rows } = await connection.queryObject<{ email: string }>`
          update public.registrations
          set confirmation_claimed_at = now()
          where email = (
            select email from public.registrations
            where confirmation_sent_at is null
              and confirmation_claimed_at is null
            order by registered_at asc, email asc
            limit 1
            for update skip locked
          )
          returning email`
        const claimed = rows[0]?.email
        if (!claimed) break // nothing left pending

        const outcome: SendOutcome = await sendConfirmation(
          connection,
          claimed,
          deps,
        )
        if (outcome === 'sent') {
          processed += 1
          continue
        }
        // quota_exhausted: the sender already released the claim so the next
        // daily run retries. failed/uncertain: the sender kept the claim for
        // operator inspection. Either way, stop so one bad outcome cannot
        // march through the whole queue claiming rows it cannot deliver.
        stopped = outcome
        break
      }
      return Response.json({ processed, stopped })
    } finally {
      connection.release()
    }
  } catch (cause) {
    console.error('process-confirmations handler failed:', cause)
    return Response.json({ code: 'unavailable' }, { status: 503 })
  } finally {
    await pool.end()
  }
}

// Only serve when run directly; tests import the handler instead.
if (import.meta.main) {
  Deno.serve((req) => handleProcessConfirmations(req))
}
