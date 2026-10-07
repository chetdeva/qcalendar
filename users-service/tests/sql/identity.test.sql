-- Rolled-back tests for 0001_identity.sql. Run against a database that has the migration applied
-- (psql, or the Supabase SQL editor / MCP execute_sql). Passes when the ONLY error is ALL_IDENTITY_TESTS_PASSED;
-- the raise at the end rolls everything back, so no test data is left behind.
do $$
declare
  u uuid;
  r record;
  ok boolean;
  n int;
  a1 uuid := gen_random_uuid();  -- sole admin
  a2 uuid := gen_random_uuid();  -- second admin
  s1 uuid := gen_random_uuid();  -- plain student
  sx uuid := gen_random_uuid();  -- student who tries to self-promote through user_metadata
  t1 uuid := gen_random_uuid();  -- invited teacher (confirms later)
  g1 uuid := gen_random_uuid();  -- invited teacher signing in with Google (already confirmed)
  e1 uuid := gen_random_uuid();  -- expired invite
  v1 uuid := gen_random_uuid();  -- revoked invite
begin
  -- Make sure no other admin exists in this transaction's view so the last-admin test is meaningful.
  select count(*) into n from public.profiles where role = 'admin';
  assert n = 0, 'test expects a database without admins (found ' || n || ')';

  -- 1. signup creates a student profile and mirrors the role into app_metadata
  insert into auth.users (id, aud, role, email, raw_user_meta_data, raw_app_meta_data, created_at, updated_at)
  values (s1, 'authenticated', 'authenticated', 'Stu@Example.test', '{"full_name":"Stu Dent"}', '{}', now(), now());
  select p.role::text as role, p.full_name, p.email, p.status::text as status, au.raw_app_meta_data as meta into r
    from public.profiles p join auth.users au on au.id = p.id where p.id = s1;
  assert r.role = 'student', 'new signup must be a student';
  assert r.full_name = 'Stu Dent', 'full name copied from metadata';
  assert r.meta ->> 'role' = 'student' and r.meta ->> 'status' = 'active', 'role + status mirrored to app_metadata';

  -- 2. user_metadata can never grant a role
  insert into auth.users (id, aud, role, email, raw_user_meta_data, raw_app_meta_data, created_at, updated_at)
  values (sx, 'authenticated', 'authenticated', 'sneaky@example.test', '{"role":"admin","app_role":"admin"}', '{}', now(), now());
  select p.role::text as role, au.raw_app_meta_data ->> 'role' as claim into r from public.profiles p join auth.users au on au.id = p.id where p.id = sx;
  assert r.role = 'student' and r.claim = 'student', 'user_metadata role must be ignored';

  -- 3. invited teacher: still a student until the email is confirmed, then promoted, invitation consumed
  insert into public.invitations (email, role) values ('Teach@Example.test', 'teacher');
  insert into auth.users (id, aud, role, email, raw_app_meta_data, created_at, updated_at)
  values (t1, 'authenticated', 'authenticated', 'teach@example.test', '{}', now(), now());
  select role::text as role into r from public.profiles where id = t1;
  assert r.role = 'student', 'unconfirmed invitee must not get the role yet';
  update auth.users set email_confirmed_at = now() where id = t1;
  select p.role::text as role, au.raw_app_meta_data ->> 'role' as claim into r from public.profiles p join auth.users au on au.id = p.id where p.id = t1;
  assert r.role = 'teacher' and r.claim = 'teacher', 'confirmed invitee becomes teacher (case-insensitive email match)';
  select count(*) into n from public.invitations where lower(email) = 'teach@example.test' and status = 'accepted' and accepted_at is not null;
  assert n = 1, 'invitation marked accepted';

  -- 4. already-confirmed signup (Google) with a pending invite is promoted immediately
  insert into public.invitations (email, role) values ('google@example.test', 'teacher');
  insert into auth.users (id, aud, role, email, email_confirmed_at, raw_app_meta_data, created_at, updated_at)
  values (g1, 'authenticated', 'authenticated', 'google@example.test', now(), '{}', now(), now());
  select role::text as role into r from public.profiles where id = g1;
  assert r.role = 'teacher', 'confirmed-at-signup invitee becomes teacher';

  -- 5. expired and revoked invitations are ignored
  insert into public.invitations (email, role, expires_at) values ('expired@example.test', 'admin', now() - interval '1 day');
  insert into public.invitations (email, role, status) values ('revoked@example.test', 'teacher', 'revoked');
  insert into auth.users (id, aud, role, email, email_confirmed_at, raw_app_meta_data, created_at, updated_at) values
    (e1, 'authenticated', 'authenticated', 'expired@example.test', now(), '{}', now(), now()),
    (v1, 'authenticated', 'authenticated', 'revoked@example.test', now(), '{}', now(), now());
  select count(*) into n from public.profiles where id in (e1, v1) and role = 'student';
  assert n = 2, 'expired / revoked invitations must not grant roles';

  -- 6. constraints
  ok := false;
  begin insert into public.invitations (email, role) values ('TEACH2@example.test', 'teacher'), ('teach2@example.test', 'admin');
  exception when unique_violation then ok := true; end;
  assert ok, 'one pending invitation per email (case-insensitive)';
  ok := false;
  begin insert into public.invitations (email, role) values ('x@example.test', 'student');
  exception when check_violation then ok := true; end;
  assert ok, 'invitations cannot grant the student role';
  ok := false;
  begin update public.profiles set guardian_email = 'not-an-email' where id = s1;
  exception when check_violation then ok := true; end;
  assert ok, 'guardian_email must look like an email';
  update public.profiles set guardian_email = 'parent@example.test' where id = s1;
  update public.profiles set guardian_email = null where id = s1;

  -- 7. the last active admin cannot be demoted or disabled; with a second admin it can
  insert into auth.users (id, aud, role, email, raw_app_meta_data, created_at, updated_at)
  values (a1, 'authenticated', 'authenticated', 'admin@example.test', '{}', now(), now()),
         (a2, 'authenticated', 'authenticated', 'admin2@example.test', '{}', now(), now());
  update public.profiles set role = 'admin' where id = a1;   -- promotion by the service role is allowed
  ok := false;
  begin update public.profiles set role = 'student' where id = a1;
  exception when sqlstate 'P0001' then ok := true; end;
  assert ok, 'sole admin must not be demotable';
  ok := false;
  begin update public.profiles set status = 'disabled' where id = a1;
  exception when sqlstate 'P0001' then ok := true; end;
  assert ok, 'sole admin must not be disable-able';
  update public.profiles set role = 'admin' where id = a2;   -- now there are two
  update public.profiles set role = 'student' where id = a1; -- allowed
  select raw_app_meta_data ->> 'role' as claim into r from auth.users where id = a1;
  assert r.claim = 'student', 'demotion is mirrored to the token claim';
  update public.profiles set role = 'admin' where id = a1;   -- restore two admins for the next checks

  -- 8. row level security: clients cannot write, cannot read other people, cannot touch invitations or private functions
  perform set_config('request.jwt.claims', json_build_object('sub', s1, 'role', 'authenticated')::text, true);
  set local role authenticated;
  select count(*) into n from public.profiles;
  assert n = 1, 'a signed-in user sees only their own profile (saw ' || n || ')';
  ok := false;
  begin update public.profiles set role = 'admin' where id = s1;
  exception when insufficient_privilege then ok := true; end;
  assert ok, 'clients must not be able to update profiles (role escalation)';
  ok := false;
  begin perform 1 from public.invitations;
  exception when insufficient_privilege then ok := true; end;
  assert ok, 'clients must not read invitations';
  ok := false;
  begin perform private.apply_invitation(s1, 'stu@example.test');
  exception when insufficient_privilege then ok := true; end;
  assert ok, 'clients must not call private functions';
  reset role;
  set local role anon;
  ok := false;
  begin perform 1 from public.profiles;
  exception when insufficient_privilege then ok := true; end;
  assert ok, 'anonymous users must not read profiles';
  reset role;

  raise exception 'ALL_IDENTITY_TESTS_PASSED';
end $$;
