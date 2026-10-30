-- Admin credit adjustments for students: a block of credits needs no subscription, and every ledger row can say who and why.
alter table billing.credit_grants alter column subscription_id drop not null;
alter table billing.credit_ledger add column note text;
alter table billing.credit_ledger add column actor_email text;
alter table billing.credit_ledger drop constraint credit_ledger_reason_check;
alter table billing.credit_ledger add constraint credit_ledger_reason_check check (reason in ('grant', 'use', 'refund', 'expiry', 'admin'));

-- What a teacher is paid per credit they earn (money in minor units: cents, paise).
create table billing.teacher_rates (
  teacher_id uuid primary key,
  rate_cents integer not null check (rate_cents >= 0),
  currency   text not null default 'INR' check (char_length(currency) = 3),
  updated_by text,
  updated_at timestamptz not null default now()
);

-- A teacher earns one credit for each student who was in a class they taught. Append-only: an admin correction is a new row
-- (kind 'admin', with a reason), never an edit. payout_id says which payout settled it; null = still owed.
create table billing.teacher_earnings (
  id         bigserial primary key,
  teacher_id uuid not null,
  ref        text not null unique,
  credits    integer not null check (credits <> 0),
  kind       text not null check (kind in ('class', 'admin')),
  note       text,
  actor_email text,
  earned_at  timestamptz not null default now(),
  payout_id  uuid
);
create index teacher_earnings_teacher on billing.teacher_earnings (teacher_id, earned_at);

-- A record that a teacher was paid for the credits it lists. The rate is copied in: later rate changes do not rewrite history.
create table billing.payouts (
  id           uuid primary key default gen_random_uuid(),
  teacher_id   uuid not null,
  credits      integer not null check (credits > 0),
  rate_cents   integer not null,
  currency     text not null,
  amount_cents bigint not null,
  reference    text not null check (char_length(reference) between 1 and 200),
  notes        text check (notes is null or char_length(notes) <= 500),
  paid_at      timestamptz not null default now(),
  paid_by      text
);
create index payouts_teacher on billing.payouts (teacher_id, paid_at);
alter table billing.teacher_earnings add constraint teacher_earnings_payout_fk foreign key (payout_id) references billing.payouts (id);

alter table billing.teacher_rates    enable row level security;
alter table billing.teacher_earnings enable row level security;
alter table billing.payouts          enable row level security;
