-- A student's note when declining, and a student's request to move a (one-to-one) class.
alter table calendar.event_participants add column note text check (note is null or char_length(note) <= 500);

create table calendar.change_requests (
  id              uuid primary key default gen_random_uuid(),
  event_id        uuid not null references calendar.events (id) on delete cascade,
  participant_id  uuid not null references calendar.event_participants (id) on delete cascade,
  requested_start timestamptz not null,
  requested_end   timestamptz not null check (requested_end > requested_start),
  note            text check (note is null or char_length(note) <= 500),
  status          text not null default 'pending' check (status in ('pending', 'approved', 'rejected', 'withdrawn')),
  created_at      timestamptz not null default now(),
  decided_at      timestamptz
);
-- One open request per class: a new one replaces it.
create unique index change_requests_one_pending on calendar.change_requests (event_id) where status = 'pending';
create index change_requests_event on calendar.change_requests (event_id, created_at desc);

-- Notes to the teacher use the same outbox as invitations.
alter table calendar.email_outbox drop constraint email_outbox_kind_check;
alter table calendar.email_outbox add constraint email_outbox_kind_check check (kind in ('invite', 'update', 'cancel', 'declined', 'change_request'));

alter table calendar.change_requests enable row level security;
do $$
begin
  if exists (select 1 from pg_roles where rolname = 'anon') then
    execute 'revoke all on calendar.change_requests from anon, authenticated';
  end if;
end $$;
