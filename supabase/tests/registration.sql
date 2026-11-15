-- Focused database assertions for registration logic.
-- Run with `supabase test db` against the local stack. Uses pgTAP; the
-- 149-to-150 capacity check opens two real concurrent connections with dblink.
--
-- Every statement that touches the registrations table runs on a dblink
-- connection (autocommit), never in this outer transaction: a
-- register_participant call holds its advisory serialization lock, and even
-- a plain count(*) holds ACCESS SHARE, until end of transaction — either
-- would deadlock the concurrent section below.

begin;
select plan(12);

-- dblink lives in the extensions schema; qualify every call explicitly.
create extension if not exists dblink with schema extensions;

-- Persistent connection for sequential checks; each remote statement
-- commits immediately, releasing whatever locks it took.
select extensions.dblink_connect(
    'seq',
    'host=db port=5432 dbname=postgres user=postgres password=postgres');

-- A duplicate email is rejected atomically and never double-counted.
-- One-shot dblink is synchronous: each call commits remotely and leaves the
-- connection ready for the next statement.
select is(
    (select result
     from extensions.dblink(
         'seq',
         'select result, registration_count from private.register_participant(''first@example.com'')'
     ) as t(result text, registration_count int)),
    'registered',
    'first registration succeeds');
select is(
    (select count from extensions.dblink('seq', 'select count(*)::int from public.registrations') as t(count int)),
    1,
    'registered row is stored once');
select is(
    (select result
     from extensions.dblink(
         'seq',
         'select result, registration_count from private.register_participant(''first@example.com'')'
     ) as t(result text, registration_count int)),
    'duplicate',
    'duplicate registration is rejected');
select is(
    (select count from extensions.dblink('seq', 'select count(*)::int from public.registrations') as t(count int)),
    1,
    'duplicate does not add a row');

-- Reset state and seed 149 registrations through the committed connection.
select extensions.dblink('seq', 'truncate public.registrations');
select extensions.dblink(
    'seq',
    'insert into public.registrations (email)
     select ''seed'' || g || ''@example.com'' from generate_series(1, 149) g');
select is(
    (select count from extensions.dblink('seq', 'select count(*)::int from public.registrations') as t(count int)),
    149,
    '149 places are seeded for the concurrency check');

-- Concurrency: at 149 registrations, two simultaneous callers can only
-- claim one remaining place.
select extensions.dblink_connect(
    'cap1',
    'host=db port=5432 dbname=postgres user=postgres password=postgres');
select extensions.dblink_connect(
    'cap2',
    'host=db port=5432 dbname=postgres user=postgres password=postgres');
select extensions.dblink_send_query(
    'cap1', 'select result, registration_count from private.register_participant(''cap-a@example.com'')');
select extensions.dblink_send_query(
    'cap2', 'select result, registration_count from private.register_participant(''cap-b@example.com'')');

create temp table cap_results as
    select result from extensions.dblink_get_result('cap1') as t(result text, registration_count int)
    union all
    select result from extensions.dblink_get_result('cap2') as t(result text, registration_count int);

-- Drain the connections so their commands finish and they can close cleanly.
select * from extensions.dblink_get_result('cap1') as t(result text, registration_count int);
select * from extensions.dblink_get_result('cap2') as t(result text, registration_count int);
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
    (select count from extensions.dblink('seq', 'select count(*)::int from public.registrations') as t(count int)),
    150,
    'concurrent attempts never exceed capacity 150');

-- Anonymous clients get no read, write, or execution access.
set local role anon;
select throws_ok(
    'select count(*) from public.registrations',
    '42501',
    'permission denied for table registrations',
    'anonymous clients cannot read registrations');
select throws_ok(
    'insert into public.registrations (email) values (''anon@example.com'')',
    '42501',
    'permission denied for table registrations',
    'anonymous clients cannot write registrations');
select throws_ok(
    'select count(*) from public.registration_rate_limits',
    '42501',
    'permission denied for table registration_rate_limits',
    'anonymous clients cannot read the rate-limit table');
select throws_ok(
    'select private.register_participant(''anon@example.com'')',
    '42501',
    'permission denied for schema private',
    'anonymous clients cannot execute the private registration function');

select extensions.dblink_disconnect('seq');

rollback;
