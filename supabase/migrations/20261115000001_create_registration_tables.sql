-- Registration tables for the SoChill event.
-- Only the backend (service role) ever touches these rows; RLS and grants
-- are locked down in a later migration.

create table public.registrations (
    -- Normalized (trimmed, lowercased) address; one unique participant.
    email text primary key
        check (char_length(email) between 3 and 254)
        -- Stored value must already be normalized by the Edge Function.
        check (email = lower(btrim(email))),
    -- UTC timestamp defaulting to insertion time, for oldest-first processing.
    registered_at timestamptz not null default now(),
    -- Set before invoking Resend; blocks concurrent or uncertain retries.
    confirmation_claimed_at timestamptz,
    -- Null until Resend accepts the confirmation.
    confirmation_sent_at timestamptz
);

create table public.registration_rate_limits (
    -- Keyed hash of the trusted request IP; the raw IP is never stored.
    ip_hash text not null,
    -- Fixed one-minute window start (UTC minute timestamp).
    window_start timestamptz not null,
    -- Reject after 30 attempts in the window.
    attempts integer not null default 0 check (attempts >= 0),
    primary key (ip_hash, window_start)
);
