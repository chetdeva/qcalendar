-- A student opening a chat with a mentor from the mentor's card. Chat lets two people talk when they have a class together
-- (or an assignment); this adds "the student reached out to this mentor" so they can talk before any class.
create table calendar.chat_links (
  student_id uuid not null,
  teacher_id uuid not null,
  created_at timestamptz not null default now(),
  primary key (student_id, teacher_id)
);
create index chat_links_teacher on calendar.chat_links (teacher_id);
alter table calendar.chat_links enable row level security;
