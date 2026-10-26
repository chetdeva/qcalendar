-- Student and teacher dashboards. People are only ids (the profile id); names, emails and classes come from the other services.
create schema if not exists dashboard;

create table dashboard.mentor_profiles (
  user_id uuid primary key,
  headline text not null default '' check (char_length(headline) <= 120),
  specialties text[] not null default '{}',
  levels text[] not null default '{}' check (levels <@ array['elementary', 'middle', 'high', 'olympiad']),
  quote text not null default '' check (char_length(quote) <= 400),
  published boolean not null default false,
  updated_at timestamptz not null default now()
);

create table dashboard.student_settings (
  student_id uuid primary key,
  grade text check (grade is null or char_length(grade) <= 40),
  weekly_target integer not null default 5 check (weekly_target between 1 and 50)
);

create table dashboard.assignments (
  id uuid primary key default gen_random_uuid(),
  teacher_id uuid not null,
  student_id uuid not null,
  title text not null check (char_length(title) between 1 and 200),
  preset text check (preset is null or char_length(preset) <= 100),
  prompt text not null check (char_length(prompt) between 1 and 1000),
  due_date date not null,
  xp integer not null check (xp between 0 and 1000),
  steps_total integer not null default 5 check (steps_total between 1 and 20),
  steps_done integer not null default 0,
  created_at timestamptz not null default now(),
  check (steps_done between 0 and steps_total)
);
create index assignments_student on dashboard.assignments (student_id, created_at desc);
create index assignments_teacher on dashboard.assignments (teacher_id, created_at desc);

create table dashboard.attachments (
  id uuid primary key default gen_random_uuid(),
  owner_id uuid not null,
  content_type text not null check (content_type in ('image/png', 'image/jpeg', 'image/webp')),
  bytes bytea not null check (octet_length(bytes) <= 1572864),
  created_at timestamptz not null default now()
);

create table dashboard.submissions (
  id uuid primary key default gen_random_uuid(),
  assignment_id uuid not null unique references dashboard.assignments (id) on delete cascade,
  student_id uuid not null,
  answer text not null check (char_length(answer) between 1 and 5000),
  attachment_id uuid references dashboard.attachments (id),
  submitted_at timestamptz not null default now(),
  status text not null default 'pending' check (status in ('pending', 'graded')),
  score integer check (score between 0 and 100),
  tags text[] not null default '{}',
  note text not null default '',
  draft_score integer check (draft_score between 0 and 100),
  draft_tags text[],
  draft_note text,
  graded_at timestamptz,
  parent_sync text check (parent_sync in ('sent', 'no_guardian', 'failed'))
);
create index submissions_student on dashboard.submissions (student_id, submitted_at desc);

-- One row per day a student did something (saved progress or handed in work): the streak is counted from these.
create table dashboard.activity_days (
  student_id uuid not null,
  day date not null,
  primary key (student_id, day)
);

-- Parent-sync emails waiting to be sent (retried with backoff).
create table dashboard.mail_outbox (
  id bigint generated always as identity primary key,
  kind text not null check (kind in ('parent_sync')),
  to_email text not null,
  payload jsonb not null,
  status text not null default 'pending' check (status in ('pending', 'sent', 'failed')),
  attempts integer not null default 0,
  next_at timestamptz not null default now(),
  last_error text,
  sent_at timestamptz
);
create index mail_outbox_due on dashboard.mail_outbox (next_at) where status = 'pending';

-- Only this service's own connection reads these tables.
alter table dashboard.mentor_profiles enable row level security;
alter table dashboard.student_settings enable row level security;
alter table dashboard.assignments enable row level security;
alter table dashboard.attachments enable row level security;
alter table dashboard.submissions enable row level security;
alter table dashboard.activity_days enable row level security;
alter table dashboard.mail_outbox enable row level security;
do $$
begin
  if exists (select 1 from pg_roles where rolname = 'anon') then
    revoke all on schema dashboard from anon;
    revoke all on all tables in schema dashboard from anon;
    revoke all on all sequences in schema dashboard from anon;
  end if;
  if exists (select 1 from pg_roles where rolname = 'authenticated') then
    revoke all on schema dashboard from authenticated;
    revoke all on all tables in schema dashboard from authenticated;
    revoke all on all sequences in schema dashboard from authenticated;
  end if;
end $$;
