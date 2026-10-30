-- Which teacher a student is assigned to, kept as history: each row is one assignment period. The active one has no ended_at
-- (at most one per student). Names and emails are copied in, because this service has no user directory and the people who
-- must be told (the previous teacher) may not be shown again.
create table calendar.student_teacher (
  id            uuid primary key default gen_random_uuid(),
  student_id    uuid not null,
  student_email text not null,
  student_name  text,
  teacher_id    uuid not null,
  teacher_email text not null,
  teacher_name  text,
  assigned_by   uuid,
  note          text check (note is null or char_length(note) <= 500),
  assigned_at   timestamptz not null default now(),
  ended_at      timestamptz,
  ended_by      uuid,
  ended_note    text check (ended_note is null or char_length(ended_note) <= 500)
);
create unique index student_teacher_one_active on calendar.student_teacher (student_id) where ended_at is null;
create index student_teacher_by_teacher on calendar.student_teacher (teacher_id) where ended_at is null;
alter table calendar.student_teacher enable row level security;

-- A notice about an assignment has no class to point at.
alter table calendar.email_outbox alter column event_id drop not null;
alter table calendar.email_outbox drop constraint email_outbox_kind_check;
alter table calendar.email_outbox add constraint email_outbox_kind_check check (kind in ('invite', 'update', 'cancel', 'declined', 'change_request', 'teacher_assigned'));
