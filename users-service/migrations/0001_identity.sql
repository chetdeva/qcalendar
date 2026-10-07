-- Shared identity: profiles (one per auth user), invitations, and the role claim.
--
-- Security model
--   * Roles are NEVER taken from user_metadata (users can edit it). The role lives in public.profiles,
--     which only the service role (users-service) and the triggers below can write.
--   * private.sync_role_claim copies profiles.role into auth.users.raw_app_meta_data (server-only), so it
--     appears in the access token as app_metadata.role without needing a Supabase Auth hook.
--   * An invitation only grants its role once the invited email is CONFIRMED, so nobody can claim a teacher
--     invite by signing up with someone else's address.
--   * Functions live in the unexposed `private` schema so PostgREST cannot call them.

create schema if not exists private;
revoke all on schema private from public, anon, authenticated;

create type public.user_role as enum ('student', 'teacher', 'admin');
create type public.account_status as enum ('active', 'disabled');
create type public.invitation_status as enum ('pending', 'accepted', 'revoked');

create table public.profiles (
  id             uuid primary key references auth.users (id) on delete cascade,
  email          text not null,
  full_name      text,
  role           public.user_role not null default 'student',
  status         public.account_status not null default 'active',
  timezone       text,
  guardian_email text check (guardian_email is null or guardian_email ~* '^[^@\s]+@[^@\s]+\.[^@\s]+$'),
  created_at     timestamptz not null default now(),
  updated_at     timestamptz not null default now()
);
create unique index profiles_email_key on public.profiles (lower(email));
create index profiles_role_idx on public.profiles (role);

create table public.invitations (
  id          uuid primary key default gen_random_uuid(),
  email       text not null,
  role        public.user_role not null check (role <> 'student'),
  invited_by  uuid references public.profiles (id) on delete set null,
  status      public.invitation_status not null default 'pending',
  created_at  timestamptz not null default now(),
  expires_at  timestamptz not null default now() + interval '14 days',
  accepted_at timestamptz
);
create unique index invitations_one_pending_per_email on public.invitations (lower(email)) where status = 'pending';

-- Row level security: no client writes at all. A user may read only their own profile.
alter table public.profiles enable row level security;
alter table public.invitations enable row level security;
revoke all on public.profiles from anon, authenticated;
revoke all on public.invitations from anon, authenticated;
grant select on public.profiles to authenticated;
create policy "users read their own profile" on public.profiles
  for select to authenticated using (id = (select auth.uid()));

-- Keep updated_at honest.
create function private.touch_updated_at() returns trigger
language plpgsql set search_path = '' as $$
begin
  new.updated_at = now();
  return new;
end $$;
create trigger profiles_touch before update on public.profiles
  for each row execute function private.touch_updated_at();

-- Never let the last active admin be demoted or disabled (users-service checks too; this is the backstop).
create function private.protect_last_admin() returns trigger
language plpgsql security definer set search_path = '' as $$
begin
  if old.role = 'admin' and old.status = 'active'
     and (new.role <> 'admin' or new.status = 'disabled')
     and not exists (select 1 from public.profiles p where p.role = 'admin' and p.status = 'active' and p.id <> old.id) then
    raise exception 'cannot demote or disable the last active admin' using errcode = 'P0001';
  end if;
  return new;
end $$;
create trigger profiles_protect_last_admin before update of role, status on public.profiles
  for each row execute function private.protect_last_admin();

-- Mirror role and status into app_metadata so they ride along in the access token.
create function private.sync_role_claim() returns trigger
language plpgsql security definer set search_path = '' as $$
begin
  update auth.users
     set raw_app_meta_data = coalesce(raw_app_meta_data, '{}'::jsonb)
                             || jsonb_build_object('role', new.role::text, 'status', new.status::text)
   where id = new.id;
  return new;
end $$;
create trigger profiles_sync_claim after insert or update of role, status on public.profiles
  for each row execute function private.sync_role_claim();

-- Grant a pending invitation to a user whose email is confirmed.
create function private.apply_invitation(p_user uuid, p_email text) returns void
language plpgsql security definer set search_path = '' as $$
declare
  inv public.invitations;
begin
  select * into inv from public.invitations
   where lower(email) = lower(p_email) and status = 'pending' and expires_at > now()
   order by created_at desc limit 1
   for update;
  if found then
    update public.profiles set role = inv.role where id = p_user;
    update public.invitations set status = 'accepted', accepted_at = now() where id = inv.id;
  end if;
end $$;

-- New auth user: create the profile as a student; honour an invitation only if already confirmed (e.g. Google).
create function private.handle_new_user() returns trigger
language plpgsql security definer set search_path = '' as $$
begin
  insert into public.profiles (id, email, full_name)
  values (
    new.id,
    new.email,
    coalesce(nullif(new.raw_user_meta_data ->> 'full_name', ''), nullif(new.raw_user_meta_data ->> 'name', ''))
  );
  if new.email_confirmed_at is not null then
    perform private.apply_invitation(new.id, new.email);
  end if;
  return new;
end $$;
create trigger on_auth_user_created after insert on auth.users
  for each row execute function private.handle_new_user();

-- Email just got confirmed (invite accepted / verification link clicked): apply any pending invitation.
create function private.handle_user_confirmed() returns trigger
language plpgsql security definer set search_path = '' as $$
begin
  if old.email_confirmed_at is null and new.email_confirmed_at is not null then
    perform private.apply_invitation(new.id, new.email);
  end if;
  return new;
end $$;
create trigger on_auth_user_confirmed after update of email_confirmed_at on auth.users
  for each row execute function private.handle_user_confirmed();
