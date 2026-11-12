-- One row per charge attempt the gateway told us about, for the student's payment history. Money in minor units (cents, paise);
-- a failed attempt carries no amount. The gateway event id makes a replayed webhook harmless.
create table billing.payments (
  id              uuid primary key default gen_random_uuid(),
  user_id         uuid not null,
  subscription_id uuid references billing.subscriptions (id),
  gateway         text not null,
  event_id        text not null,
  status          text not null check (status in ('succeeded', 'failed')),
  amount_cents    integer,
  currency        text,
  plan_key        text,
  interval        text check (interval in ('month', 'year')),
  created_at      timestamptz not null default now(),
  unique (gateway, event_id)
);
create index payments_user on billing.payments (user_id, created_at desc);

alter table billing.payments enable row level security;
