-- A student with a plan asks a mentor for a class at a time they picked; the mentor approves (the class is created, with a
-- meeting link) or declines. The free first class has its own table (trial_requests): that one can be taken by any teacher.
create table calendar.class_requests (
  id               uuid primary key default gen_random_uuid(),
  student_id       uuid not null,
  student_email    text not null,
  student_name     text,
  teacher_id       uuid not null,
  teacher_email    text not null,
  teacher_name     text,
  requested_start  timestamptz not null,
  duration_minutes int not null default 60 check (duration_minutes between 15 and 240),
  note             text check (note is null or char_length(note) <= 500),
  status           text not null default 'requested' check (status in ('requested', 'scheduled', 'declined', 'cancelled')),
  decline_note     text check (decline_note is null or char_length(decline_note) <= 500),
  event_id         uuid references calendar.events (id) on delete set null,
  created_at       timestamptz not null default now(),
  decided_at       timestamptz
);
-- One open request per student and mentor: asking again replaces the time.
create unique index class_requests_one_open on calendar.class_requests (student_id, teacher_id) where status = 'requested';
create index class_requests_teacher on calendar.class_requests (teacher_id, status, requested_start);
alter table calendar.class_requests enable row level security;

alter table calendar.email_outbox drop constraint email_outbox_kind_check;
alter table calendar.email_outbox add constraint email_outbox_kind_check check (kind in ('invite', 'update', 'cancel', 'declined', 'change_request', 'teacher_assigned', 'lead', 'lead_confirmation', 'class_request', 'class_request_declined'));
