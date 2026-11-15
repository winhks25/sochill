-- Shared per-IP rate limiting for the public register endpoint.
-- The Edge Function calls private.consume_rate_limit(text) with the service
-- role; anonymous clients get no table or function access.

-- Count one attempt in this IP's current one-minute window and return the
-- new total. The upsert is a single statement, so concurrent callers can
-- never race past the limit. The Edge Function compares the returned total
-- with the 30-per-minute maximum (kept beside the handler).
create or replace function private.consume_rate_limit(p_ip_hash text)
returns integer
language plpgsql
security definer
set search_path = ''
as $$
declare
    v_attempts integer;
begin
    -- Keep the table tiny: drop windows older than one day.
    delete from public.registration_rate_limits
    where window_start < now() - interval '1 day';

    -- Create this minute's window or bump its counter, atomically.
    insert into public.registration_rate_limits (ip_hash, window_start, attempts)
    values (p_ip_hash, date_trunc('minute', now()), 1)
    on conflict (ip_hash, window_start)
    do update set attempts = registration_rate_limits.attempts + 1
    returning attempts into v_attempts;

    return v_attempts;
end;
$$;

revoke all on function private.consume_rate_limit(text)
    from public, anon, authenticated;
grant execute on function private.consume_rate_limit(text) to service_role;
