-- Generic conversations between users. A user is only an id (the profile id): no roles, names or emails are stored here.
create schema if not exists chat;

create table chat.conversations (
  id uuid primary key default gen_random_uuid(),
  -- Optional pointer to whatever the owning service means by it (e.g. 'class' / <event id>); chat never interprets it.
  ref_type text check (ref_type is null or char_length(ref_type) between 1 and 50),
  ref_id text check (ref_id is null or char_length(ref_id) between 1 and 200),
  -- Sorted member ids joined by ':', set only for two-person chats so the same pair always gets the same conversation.
  direct_key text unique,
  created_at timestamptz not null default now(),
  last_message_at timestamptz not null default now()
);

create table chat.conversation_members (
  conversation_id uuid not null references chat.conversations (id) on delete cascade,
  user_id uuid not null,
  joined_at timestamptz not null default now(),
  last_read_at timestamptz not null default now(),
  primary key (conversation_id, user_id)
);
create index conversation_members_user on chat.conversation_members (user_id);

create table chat.messages (
  id integer generated always as identity primary key, -- also the polling cursor: "everything after id N"
  conversation_id uuid not null references chat.conversations (id) on delete cascade,
  sender_id uuid not null,
  body text not null check (char_length(body) between 1 and 2000),
  created_at timestamptz not null default now()
);
create index messages_conversation on chat.messages (conversation_id, id);

-- Only this service's own connection reads these tables.
alter table chat.conversations enable row level security;
alter table chat.conversation_members enable row level security;
alter table chat.messages enable row level security;
do $$
begin
  if exists (select 1 from pg_roles where rolname = 'anon') then
    revoke all on schema chat from anon;
    revoke all on all tables in schema chat from anon;
    revoke all on all sequences in schema chat from anon;
  end if;
  if exists (select 1 from pg_roles where rolname = 'authenticated') then
    revoke all on schema chat from authenticated;
    revoke all on all tables in schema chat from authenticated;
    revoke all on all sequences in schema chat from authenticated;
  end if;
end $$;
