// Base UI email dialog for US2: one valid registration per normalized email.
// Success and error states mirror the POST /register contract codes; the
// email goes to the backend only and is never stored locally.
import { useState, type FormEvent } from 'react'
import { Button } from '@/components/ui/button'
import {
  Dialog,
  DialogClose,
  DialogContent,
  DialogDescription,
  DialogFooter,
  DialogHeader,
  DialogTitle,
} from '@/components/ui/dialog'
import { Input } from '@/components/ui/input'
import { registerParticipant, type RegisterErrorCode } from '@/lib/api'

// Friendly copy for every contract error code.
const ERROR_MESSAGES: Record<RegisterErrorCode, string> = {
  invalid_email:
    "That doesn't look like an email address — check it and try again.",
  already_registered:
    'This email is already on the list — one spot per person!',
  full: 'All 150 spots were just taken — see you there!',
  closed: 'Registration closed when the event started.',
  rate_limited:
    'Too many tries from your network — wait a minute and try again.',
  unavailable:
    'The sign-up desk is unreachable — check your connection and try again.',
}

interface RegistrationDialogProps {
  open: boolean
  onOpenChange(open: boolean): void
  /** Called once a registration commits; the app refreshes the count. */
  onRegistered(confirmation: 'sent' | 'pending'): void
}

// editing → submitting → (success | editing with error)
type Phase = 'editing' | 'submitting' | 'success'

function RegistrationDialog({
  open,
  onOpenChange,
  onRegistered,
}: RegistrationDialogProps) {
  const [phase, setPhase] = useState<Phase>('editing')
  const [error, setError] = useState<string | null>(null)
  const [result, setResult] = useState<{
    confirmation: 'sent' | 'pending'
    count: number
  } | null>(null)

  // Fresh form every time the dialog closes; Base UI reports every close
  // route (ESC, overlay, close button) through onOpenChange.
  function handleOpenChange(next: boolean) {
    if (!next) {
      setPhase('editing')
      setError(null)
      setResult(null)
    }
    onOpenChange(next)
  }

  async function handleSubmit(event: FormEvent<HTMLFormElement>) {
    event.preventDefault()
    const email = String(new FormData(event.currentTarget).get('email') ?? '')
    setPhase('submitting')
    setError(null)
    const response = await registerParticipant(email)
    if (response.code === 'registered') {
      setResult({
        confirmation: response.confirmation,
        count: response.count,
      })
      setPhase('success')
      onRegistered(response.confirmation)
    } else {
      setError(ERROR_MESSAGES[response.code])
      setPhase('editing')
    }
  }

  return (
    <Dialog open={open} onOpenChange={handleOpenChange}>
      <DialogContent>
        {phase === 'success' && result ? (
          <div className="flex flex-col gap-4">
            <DialogHeader>
              <DialogTitle className="memphis-title text-2xl font-extrabold">
                You're in! 🎉
              </DialogTitle>
              <DialogDescription>
                Spot {result.count} of 150 is saved for SoChill.
              </DialogDescription>
            </DialogHeader>
            <p className="text-sm font-medium" aria-live="polite">
              {result.confirmation === 'sent'
                ? 'A confirmation email is on its way to your inbox.'
                : 'Registration saved! The confirmation email may arrive later — check your spam folder if you don\'t see it.'}
            </p>
            <DialogFooter>
              <DialogClose
                render={
                  <Button variant="secondary" className="font-extrabold">
                    Done
                  </Button>
                }
              />
            </DialogFooter>
          </div>
        ) : (
          <form onSubmit={handleSubmit} className="flex flex-col gap-4">
            <DialogHeader>
              <DialogTitle className="memphis-title text-2xl font-extrabold">
                Count me in 🎉
              </DialogTitle>
              <DialogDescription>
                Save your spot — free bubble tea awaits!
              </DialogDescription>
            </DialogHeader>
            <div className="flex flex-col gap-1.5">
              <label
                htmlFor="registration-email"
                className="text-sm font-bold"
              >
                Email
              </label>
              <Input
                id="registration-email"
                type="email"
                name="email"
                autoComplete="email"
                required
                placeholder="you@example.com"
                className="h-10"
                disabled={phase === 'submitting'}
              />
            </div>
            <p
              className="min-h-5 text-sm font-medium text-destructive"
              aria-live="assertive"
            >
              {error}
            </p>
            <DialogFooter>
              <Button
                type="submit"
                disabled={phase === 'submitting'}
                className="font-extrabold"
              >
                {phase === 'submitting' ? 'Saving…' : 'Save my spot'}
              </Button>
            </DialogFooter>
          </form>
        )}
      </DialogContent>
    </Dialog>
  )
}

export default RegistrationDialog
