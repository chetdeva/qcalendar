-- Multi-user calendar: every event belongs to a teacher (owner), classes can have many participants,
-- and invitation emails are queued in an outbox. Lives in its own schema, away from the identity tables.
-- Safe to run twice; recorded in calendar.schema_migrations (by the migration runner or by this file itself).

create schema if not exists calendar;

create table if not exists calendar.schema_migrations (
  name       text primary key,
  applied_at timestamptz not null default now()
);

-- One row per teacher; a teacher without a row uses the service defaults.
create table calendar.teacher_settings (
  user_id           uuid primary key,
  timezone          text not null,
  working_hours     jsonb not null,
  buffer_minutes    int not null default 0 check (buffer_minutes between 0 and 240),
  slot_step_minutes int not null default 30 check (slot_step_minutes between 5 and 240),
  updated_at        timestamptz not null default now()
);

create table calendar.events (
  id           uuid primary key default gen_random_uuid(),
  owner_id     uuid not null,                       -- the teacher whose calendar this is
  owner_email  text,                                -- shown as the organiser on invitations
  owner_name   text,
  title        text not null check (length(title) between 1 and 200),
  description  text,
  location     text,
  meeting_url  text,
  start_at     timestamptz not null,
  end_at       timestamptz not null,
  timezone     text not null,
  category     text not null default 'tutoring' check (category in ('tutoring', 'office_hours', 'personal')),
  status       text not null default 'confirmed' check (status in ('confirmed', 'cancelled')),
  external_ref text,
  sequence     int not null default 0,              -- bumped on every change people must hear about (iCalendar SEQUENCE)
  created_by   uuid,
  created_at   timestamptz not null default now(),
  updated_at   timestamptz not null default now(),
  check (end_at > start_at)
);
create index events_owner_time on calendar.events (owner_id, start_at, end_at) where status = 'confirmed';
create index events_time on calendar.events (start_at, end_at);
create index events_external_ref on calendar.events (external_ref) where external_ref is not null;

create table calendar.event_participants (
  id           uuid primary key default gen_random_uuid(),
  event_id     uuid not null references calendar.events (id) on delete cascade,
  user_id      uuid,                                -- filled in once we know which account owns the email
  email        text not null,
  name         text,
  status       text not null default 'invited' check (status in ('invited', 'accepted', 'declined')),
  created_at   timestamptz not null default now(),
  responded_at timestamptz
);
create unique index participants_event_email on calendar.event_participants (event_id, lower(email));
create index participants_user on calendar.event_participants (user_id) where user_id is not null;
create index participants_email on calendar.event_participants (lower(email));

-- Invitation / update / cancellation emails waiting to be sent (retried with backoff).
create table calendar.email_outbox (
  id         bigserial primary key,
  kind       text not null check (kind in ('invite', 'update', 'cancel')),
  event_id   uuid not null,
  to_email   text not null,
  payload    jsonb not null,
  status     text not null default 'pending' check (status in ('pending', 'sent', 'failed')),
  attempts   int not null default 0,
  next_at    timestamptz not null default now(),
  last_error text,
  created_at timestamptz not null default now(),
  sent_at    timestamptz
);
create index outbox_due on calendar.email_outbox (next_at) where status = 'pending';

create table calendar.webhook_queue (
  id       bigserial primary key,
  type     text not null,
  payload  text not null,
  attempts int not null default 0,
  next_at  timestamptz not null default now(),
  done     boolean not null default false
);
create index webhook_due on calendar.webhook_queue (next_at) where not done;

-- Defence in depth. This schema is reached only through the service's own database connection, never through
-- Supabase's public API. RLS with no policies plus revoked grants means that even if the schema were ever exposed
-- by mistake, anonymous and signed-in clients could read nothing. (Skipped on plain Postgres without those roles.)
alter table calendar.teacher_settings   enable row level security;
alter table calendar.events             enable row level security;
alter table calendar.event_participants enable row level security;
alter table calendar.email_outbox       enable row level security;
alter table calendar.webhook_queue      enable row level security;
alter table calendar.schema_migrations  enable row level security;
do $$
begin
  if exists (select 1 from pg_roles where rolname = 'anon') then
    execute 'revoke all on schema calendar from anon, authenticated';
    execute 'revoke all on all tables in schema calendar from anon, authenticated';
    execute 'revoke all on all sequences in schema calendar from anon, authenticated';
  end if;
end $$;

insert into calendar.schema_migrations (name) values ('0001_calendar') on conflict do nothing;
