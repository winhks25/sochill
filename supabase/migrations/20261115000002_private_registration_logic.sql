-- Private registration logic and access lockdown.
-- The Edge Function calls private.register_participant(text) with the
-- service role; anonymous clients get no table or function access.

-- The privileged schema is deliberately outside the API's exposed schemas
-- (see supabase/config.toml, [api].schemas).
create schema private;

-- Atomic registration attempt: serializes concurrent requests, checks
-- duplicate and capacity, and inserts at most one row. The Edge Function
-- maps each result code to its contract response.
create or replace function private.register_participant(p_email text)
returns table (result text, registration_count integer)
language plpgsql
security definer
set search_path = ''
as $$
declare
    v_count integer;
begin
    -- Serialize the capacity check and insert across all concurrent calls;
    -- a fixed advisory key makes this one gate for the whole event.
    perform pg_advisory_xact_lock(150001150);

    select count(*) into v_count from public.registrations;
    if v_count >= 150 then
        return query select 'full'::text, v_count;
        return;
    end if;

    begin
        insert into public.registrations (email) values (p_email);
        return query select 'registered'::text, v_count + 1;
    exception
        when unique_violation then
            return query select 'duplicate'::text,
                -- RETURN QUERY needs the declared column type (integer);
                -- a bare count(*) is bigint and would fail at runtime.
                (select count(*)::int from public.registrations);
    end;
end;
$$;

revoke all on function private.register_participant(text)
    from public, anon, authenticated;
grant execute on function private.register_participant(text) to service_role;

-- RLS with no policies denies every anonymous/authenticated table access,
-- even if a grant were re-added later.
alter table public.registrations enable row level security;
alter table public.registration_rate_limits enable row level security;

revoke all on public.registrations from anon, authenticated;
revoke all on public.registration_rate_limits from anon, authenticated;

-- The service role bypasses RLS; no table grants are needed beyond defaults.
