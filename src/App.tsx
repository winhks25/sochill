// SoChill home page: event details, live countdown, aggregate count, and the
// centered "Count Me In" call to action. The registration dialog arrives with
// US2; for now the CTA reflects the backend's full/closed state.
import { useCallback, useEffect, useState } from 'react'
import { Button } from '@/components/ui/button'
import {
  CAPACITY,
  EVENT_START_MS,
  getStatus,
  type StatusResponse,
} from '@/lib/api'

// Seconds tick for the countdown; a single interval keeps it cheap.
function useNow() {
  const [now, setNow] = useState(() => Date.now())
  useEffect(() => {
    const timer = setInterval(() => setNow(Date.now()), 1000)
    return () => clearInterval(timer)
  }, [])
  return now
}

// Aggregate count and closing state from GET /status; null means the
// backend is temporarily unreachable and the UI must say so.
function useStatus() {
  const [status, setStatus] = useState<StatusResponse | null>(null)
  const refresh = useCallback(() => {
    getStatus()
      .then(setStatus)
      .catch(() => setStatus(null))
  }, [])
  useEffect(() => {
    refresh()
  }, [refresh])
  return { status, refresh }
}

// Broken-down remaining time; every value is zero once the event starts.
function splitCountdown(now: number) {
  const remaining = Math.max(0, EVENT_START_MS - now)
  const seconds = Math.floor(remaining / 1000)
  return {
    days: Math.floor(seconds / 86400),
    hours: Math.floor((seconds % 86400) / 3600),
    minutes: Math.floor((seconds % 3600) / 60),
    seconds: seconds % 60,
  }
}

function CountdownTile({ value, label }: { value: number; label: string }) {
  return (
    <div className="memphis-tile" aria-label={`${label}: ${value}`}>
      <span className="text-3xl font-extrabold tabular-nums sm:text-4xl">
        {value}
      </span>
      <span className="text-xs font-bold uppercase tracking-widest">
        {label}
      </span>
    </div>
  )
}

function App() {
  const now = useNow()
  const { status } = useStatus()
  const countdown = splitCountdown(now)

  const full = status?.full ?? false
  const closed = status?.closed ?? now >= EVENT_START_MS
  const registrationUnavailable = full || closed
  const ctaExplanation = full
    ? 'All 150 spots are taken — see you there!'
    : closed
      ? 'Registration closed when the event started.'
      : null

  return (
    <div className="memphis-page flex min-h-dvh flex-col">
      <header className="flex items-center justify-between px-4 py-3 sm:px-6">
        <span className="memphis-wordmark text-xl font-extrabold sm:text-2xl">
          SoChill 🧋
        </span>
        {/* The Contact Us drawer trigger lands here with T011. */}
      </header>

      <main className="mx-auto flex w-full max-w-3xl flex-1 flex-col items-center gap-8 px-4 py-8 text-center sm:px-6">
        <section className="flex flex-col items-center gap-3">
          <h1 className="memphis-title text-5xl font-extrabold sm:text-7xl">
            SoChill
          </h1>
          <p className="max-w-md text-base font-medium sm:text-lg">
            A study break with <strong>free bubble tea and snacks</strong> at
            NUS. Grab a spot before they are gone!
          </p>
        </section>

        <section
          className="flex flex-wrap justify-center gap-3"
          aria-label="Event details"
        >
          <div className="memphis-detail">
            <span aria-hidden="true">📅</span> Friday, 20 November 2026
          </div>
          <div className="memphis-detail">
            <span aria-hidden="true">🕖</span> 7:00 – 9:00 PM
          </div>
          <div className="memphis-detail">
            <span aria-hidden="true">📍</span> NUS COM1 Foyer
          </div>
        </section>

        <section className="flex flex-col items-center gap-3">
          <h2 className="text-sm font-bold uppercase tracking-widest">
            {closed ? 'The event has started' : 'Chill starts in'}
          </h2>
          <div
            className="flex justify-center gap-2 sm:gap-3"
            aria-label={`Countdown: ${countdown.days} days, ${countdown.hours} hours, ${countdown.minutes} minutes, ${countdown.seconds} seconds`}
          >
            <CountdownTile value={countdown.days} label="Days" />
            <CountdownTile value={countdown.hours} label="Hours" />
            <CountdownTile value={countdown.minutes} label="Mins" />
            <CountdownTile value={countdown.seconds} label="Secs" />
          </div>
        </section>

        <section className="flex flex-col items-center gap-2">
          <p
            className="text-lg font-bold sm:text-xl"
            aria-live="polite"
          >
            {status ? (
              <>
                {status.count} of {CAPACITY} spots filled
              </>
            ) : (
              <>Sign-up count unavailable right now…</>
            )}
          </p>
          {status && (
            <p className="text-sm text-muted-foreground">
              Registration closes when the event starts or spots run out.
            </p>
          )}
        </section>

        <section className="flex flex-col items-center gap-3">
          <Button
            size="lg"
            className="memphis-cta h-14 px-10 text-lg font-extrabold uppercase"
            disabled={registrationUnavailable || !status}
          >
            Count Me In
          </Button>
          {ctaExplanation && (
            <p className="text-sm font-medium">{ctaExplanation}</p>
          )}
          {!status && !closed && (
            <p className="text-sm text-muted-foreground">
              Cannot reach the sign-up desk — check your connection.
            </p>
          )}
        </section>
      </main>

      <footer className="px-4 pb-6 text-center text-xs text-muted-foreground sm:px-6">
        SoChill · COM1 Foyer · 20 November 2026, 7–9 PM
      </footer>
    </div>
  )
}

export default App
