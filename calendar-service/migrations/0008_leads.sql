-- Requests for the free class from the public website's form. status is for the teacher's follow-up ('new' until handled).
create table calendar.leads (
  id          bigserial primary key,
  created_at  timestamptz not null default now(),
  parent_name text not null,
  email       text not null,
  phone       text,
  grade       text not null,
  goal        text,
  time_zone   text,
  source      text,
  page        text,
  status      text not null default 'new'
);
create index leads_by_email_day on calendar.leads (lower(email), created_at);
alter table calendar.leads enable row level security;

-- The notices about a lead have no class to point at.
alter table calendar.email_outbox drop constraint email_outbox_kind_check;
alter table calendar.email_outbox add constraint email_outbox_kind_check check (kind in ('invite', 'update', 'cancel', 'declined', 'change_request', 'teacher_assigned', 'lead', 'lead_confirmation'));
