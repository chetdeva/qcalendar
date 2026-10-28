-- A new student's request for the free first class; a teacher schedules it and the request is marked scheduled.
create table calendar.trial_requests (
  id            uuid primary key default gen_random_uuid(),
  student_id    uuid not null,
  student_email text,
  student_name  text,
  note          text check (note is null or char_length(note) <= 500),
  status        text not null default 'requested' check (status in ('requested', 'scheduled', 'cancelled')),
  event_id      uuid references calendar.events (id) on delete set null,
  created_at    timestamptz not null default now()
);
-- One open request per student.
create unique index trial_requests_one_open on calendar.trial_requests (student_id) where status = 'requested';
alter table calendar.trial_requests enable row level security;
