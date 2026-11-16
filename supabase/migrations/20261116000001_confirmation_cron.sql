-- Daily 01:00 UTC (09:00 SGT) drain of pending confirmation emails.
-- Supabase Cron (pg_cron) fires net.http_post (pg_net) at the private
-- process-confirmations Edge Function, which owns all sending logic.
-- Research: specs/001-sochill-event/research.md (function exposure).

create extension if not exists pg_cron with schema pg_catalog;
-- Hosted Supabase requires pg_cron in pg_catalog and explicit cron grants
-- (Supabase Cron docs); the local stack already grants these.
grant usage on schema cron to postgres;
grant all privileges on all tables in schema cron to postgres;
-- pg_net always creates its own `net` schema; registering the extension in
-- `extensions` keeps the `net` schema out of `public` (Supabase docs).
create extension if not exists pg_net with schema "extensions";

-- The function base URL and caller credential live in Vault so neither is
-- ever committed to this repository. The operator creates them once per
-- environment (README documents the commands):
--   vault.create_secret('https://<project-ref>.supabase.co/functions/v1',
--                       'process_confirmations_url')          -- hosted
--   vault.create_secret('http://host.docker.internal:54321/functions/v1',
--                       'process_confirmations_url')          -- local stack
--   vault.create_secret('<service-role JWT>',
--                       'process_confirmations_secret')
-- The secret must be the service-role JWT: the function keeps verify_jwt,
-- and its handler rejects any other valid Supabase JWT. Note pg_net queues
-- the decrypted Authorization header in net.http_request_queue until the
-- request is sent (documented Supabase tradeoff for Vault-held secrets).
select cron.schedule(
    'process-confirmations',
    '0 1 * * *', -- 01:00 UTC every day (09:00 SGT)
    $$
    select net.http_post(
        url := (
            select decrypted_secret from vault.decrypted_secrets
            where name = 'process_confirmations_url' limit 1
        ) || '/process-confirmations',
        headers := jsonb_build_object(
            'Content-Type', 'application/json',
            'Authorization', 'Bearer ' || (
                select decrypted_secret from vault.decrypted_secrets
                where name = 'process_confirmations_secret' limit 1
            )
        ),
        body := '{}'::jsonb,
        timeout_milliseconds := 5000
    ) as request_id;
    $$
);

-- Re-running this migration overwrites the same-named job instead of
-- duplicating it; verify the single schedule with `select * from cron.job`.
