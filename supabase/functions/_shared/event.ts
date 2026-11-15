// Shared event constants for the Edge Functions, mirroring src/lib/api.ts.
// The frontend and functions cannot share modules, so keep both copies in sync.

// Hard capacity enforced by the database (see migrations).
export const CAPACITY = 150

// Absolute event instant, Singapore time (UTC+8); registrations close here.
export const EVENT_START_ISO = '2026-11-20T19:00:00+08:00'

// Millisecond instant used for the closed check.
export const EVENT_START_MS = new Date(EVENT_START_ISO).getTime()
