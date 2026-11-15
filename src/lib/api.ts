// Shared event instants and typed public response shapes, matching
// specs/001-sochill-event/contracts/public-interface.md.

// Absolute event instant, Singapore time (UTC+8); registrations close here.
export const EVENT_START_ISO = '2026-11-20T19:00:00+08:00'

// Millisecond instant used by the countdown.
export const EVENT_START_MS = new Date(EVENT_START_ISO).getTime()

// Hard capacity enforced by the database, mirrored here for display only.
export const CAPACITY = 150

// Aggregate status returned by GET /status; never contains email addresses.
export interface StatusResponse {
  count: number
  capacity: typeof CAPACITY
  full: boolean
  closed: boolean
}

// Outcome of a successful POST /register; the registration is committed even
// when the confirmation email is still pending.
export interface RegisteredResponse {
  code: 'registered'
  count: number
  confirmation: 'sent' | 'pending'
}

// Error codes returned by POST /register.
export type RegisterErrorCode =
  | 'invalid_email'
  | 'already_registered'
  | 'full'
  | 'closed'
  | 'rate_limited'
  | 'unavailable'

// Error body returned by POST /register.
export interface RegisterErrorResponse {
  code: RegisterErrorCode
}

// Any POST /register response body.
export type RegisterResponse = RegisteredResponse | RegisterErrorResponse

// Supabase Edge Functions base URL, public by design (anon origin).
const FUNCTIONS_BASE = `${import.meta.env.VITE_SUPABASE_URL}/functions/v1`

// Reads GET /status; throws on network or server failure so the UI can
// show a temporary-failure state instead of a misleading count.
export async function getStatus(): Promise<StatusResponse> {
  const response = await fetch(`${FUNCTIONS_BASE}/status`)
  if (!response.ok) {
    throw new Error(`status unavailable (HTTP ${response.status})`)
  }
  return response.json() as Promise<StatusResponse>
}
