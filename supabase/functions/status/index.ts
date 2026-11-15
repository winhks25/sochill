// Public aggregate status endpoint (GET /status).
// Returns only the sign-up count and closing state; never registered emails.
// Contract: specs/001-sochill-event/contracts/public-interface.md
import { createClient } from 'jsr:@supabase/supabase-js@2'
import { CAPACITY, EVENT_START_MS } from '../_shared/event.ts'

// Browser clients on another origin (Vercel) need CORS to call this function.
const corsHeaders = {
  'Access-Control-Allow-Origin': '*',
  'Access-Control-Allow-Methods': 'GET, OPTIONS',
  'Access-Control-Allow-Headers': 'authorization, content-type',
}

// Service role bypasses the lockdown RLS so the function can count rows;
// it reads an aggregate and returns no row data.
const supabase = createClient(
  Deno.env.get('SUPABASE_URL')!,
  Deno.env.get('SUPABASE_SERVICE_ROLE_KEY')!,
)

Deno.serve(async (req) => {
  if (req.method === 'OPTIONS') {
    return new Response('ok', { headers: corsHeaders })
  }
  if (req.method !== 'GET') {
    return Response.json({ code: 'unavailable' }, {
      status: 405,
      headers: corsHeaders,
    })
  }

  try {
    // Head-only exact count: no rows are transferred, only the number.
    const { count, error } = await supabase
      .from('registrations')
      .select('*', { count: 'exact', head: true })

    if (error) {
      console.error('status query failed:', error.message)
      return Response.json({ code: 'unavailable' }, {
        status: 503,
        headers: corsHeaders,
      })
    }

    const registrations = count ?? 0
    return Response.json({
      count: registrations,
      capacity: CAPACITY,
      full: registrations >= CAPACITY,
      closed: Date.now() >= EVENT_START_MS,
    }, { headers: corsHeaders })
  } catch (cause) {
    console.error('status handler failed:', cause)
    return Response.json({ code: 'unavailable' }, {
      status: 503,
      headers: corsHeaders,
    })
  }
})
