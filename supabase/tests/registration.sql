-- Focused database assertions for registration logic.
-- Run with `supabase test db` against the local stack. Uses pgTAP; the
-- 149-to-150 capacity check opens two real concurrent connections with dblink.

begin;
select plan(11);

-- dblink lives in the extensions schema; qualify every call explicitly.
create extension if not exists dblink with schema extensions;

-- A duplicate email is rejected atomically and never double-counted.
select is(
    (select result from private.register_participant('first@example.com')),
    'registered',
    'first registration succeeds');
select is(
    (select count(*) from public.registrations),
    1::bigint,
    'registered row is stored once');
select is(
    (select result from private.register_participant('first@example.com')),
    'duplicate',
    'duplicate registration is rejected');
select is(
    (select count(*) from public.registrations),
    1::bigint,
    'duplicate does not add a row');

-- Concurrency: at 149 registrations, two simultaneous callers can only
-- claim one remaining place.
truncate public.registrations;
insert into public.registrations (email)
select 'seed' || g || '@example.com' from generate_series(1, 149) g;

select extensions.dblink_connect('cap1', 'dbname=postgres');
select extensions.dblink_connect('cap2', 'dbname=postgres');
select extensions.dblink_send_query(
    'cap1', 'select result, registration_count from private.register_participant(''cap-a@example.com'')');
select extensions.dblink_send_query(
    'cap2', 'select result, registration_count from private.register_participant(''cap-b@example.com'')');

create temp table cap_results as
    select result from extensions.dblink_get_result('cap1') as t(result text, registration_count int)
    union all
    select result from extensions.dblink_get_result('cap2') as t(result text, registration_count int);

-- Drain the connections so they can close cleanly.
perform extensions.dblink_get_result('cap1') as t(result text, registration_count int);
perform extensions.dblink_get_result('cap2') as t(result text, registration_count int);
select extensions.dblink_disconnect('cap1');
select extensions.dblink_disconnect('cap2');

select is(
    (select count(*) from cap_results where result = 'registered'),
    1::bigint,
    'exactly one concurrent caller registers the 150th place');
select is(
    (select count(*) from cap_results where result = 'full'),
    1::bigint,
    'the other concurrent caller is rejected as full');
select is(
    (select count(*) from public.registrations),
    150::bigint,
    'concurrent attempts never exceed capacity 150');

-- Anonymous clients get no read, write, or execution access.
set local role anon;
select throws_ok(
    'select count(*) from public.registrations',
    '42501',
    'anonymous clients cannot read registrations');
select throws_ok(
    'insert into public.registrations (email) values (''anon@example.com'')',
    '42501',
    'anonymous clients cannot write registrations');
select throws_ok(
    'select count(*) from public.registration_rate_limits',
    '42501',
    'anonymous clients cannot read the rate-limit table');
select throws_ok(
    'select private.register_participant(''anon@example.com'')',
    '42501',
    'anonymous clients cannot execute the private registration function');

rollback;
