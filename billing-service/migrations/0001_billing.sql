create schema if not exists billing;

-- Prices live here, not in any gateway. A gateway adapter maps (plan key, interval) to whatever its provider needs.
create table billing.plans (
  key                 text primary key,
  min_grade           smallint not null,
  max_grade           smallint not null,
  monthly_cents       integer  not null check (monthly_cents > 0),
  annual_discount_pct integer  not null default 20 check (annual_discount_pct between 0 and 100),
  credits_per_month   integer  not null default 15 check (credits_per_month > 0)
);
insert into billing.plans (key, min_grade, max_grade, monthly_cents) values
  ('elementary', 1, 5, 30000), ('middle', 6, 8, 35000), ('high', 9, 10, 40000);

-- Which gateway customer a person is. Namespaced by gateway so two gateways can coexist during a switch.
create table billing.customers (
  user_id     uuid not null,
  gateway     text not null,
  gateway_ref text not null,
  primary key (user_id, gateway),
  unique (gateway, gateway_ref)
);

create table billing.subscriptions (
  id                   uuid primary key default gen_random_uuid(),
  user_id              uuid not null,
  plan_key             text not null references billing.plans (key),
  next_plan_key        text references billing.plans (key), -- a grade change: applied at the next renewal
  interval             text not null check (interval in ('month', 'year')),
  status               text not null check (status in ('active', 'past_due', 'canceled')),
  gateway              text not null,
  gateway_ref          text not null,
  current_period_start timestamptz not null,
  current_period_end   timestamptz not null,
  cancel_at_period_end boolean not null default false,
  created_at           timestamptz not null default now(),
  unique (gateway, gateway_ref)
);
create unique index subscriptions_one_live on billing.subscriptions (user_id) where status in ('active', 'past_due');

-- A block of lesson credits that expires at period_end (no rollover). Annual plans get one per month.
create table billing.credit_grants (
  id              uuid primary key default gen_random_uuid(),
  user_id         uuid not null,
  subscription_id uuid not null references billing.subscriptions (id),
  period_start    timestamptz not null,
  period_end      timestamptz not null,
  credits         integer not null,
  source          text not null check (source in ('payment', 'annual_topup', 'admin')),
  created_at      timestamptz not null default now(),
  unique (subscription_id, period_start) -- a replayed webhook or a second cron run cannot grant twice
);
create index credit_grants_user on billing.credit_grants (user_id, period_end);

-- Append-only. A grant's remaining credits = sum(delta) over its rows. Never updated in place.
create table billing.credit_ledger (
  id              bigserial primary key,
  user_id         uuid not null,
  grant_id        uuid not null references billing.credit_grants (id),
  delta           integer not null,
  reason          text not null check (reason in ('grant', 'use', 'refund', 'expiry')),
  ref             text,
  idempotency_key text not null unique,
  created_at      timestamptz not null default now()
);
create index credit_ledger_grant on billing.credit_ledger (grant_id);
create index credit_ledger_ref on billing.credit_ledger (user_id, ref);

create table billing.webhook_events (
  gateway      text not null,
  event_id     text not null,
  processed_at timestamptz not null default now(),
  primary key (gateway, event_id)
);

create table billing.trials (
  user_id  uuid primary key,
  event_id text not null,
  used_at  timestamptz not null default now()
);

alter table billing.plans             enable row level security;
alter table billing.customers         enable row level security;
alter table billing.subscriptions     enable row level security;
alter table billing.credit_grants     enable row level security;
alter table billing.credit_ledger     enable row level security;
alter table billing.webhook_events    enable row level security;
alter table billing.trials            enable row level security;
alter table billing.schema_migrations enable row level security;
do $$
begin
  if exists (select 1 from pg_roles where rolname = 'anon') then
    execute 'revoke all on schema billing from anon, authenticated';
    execute 'revoke all on all tables in schema billing from anon, authenticated';
    execute 'revoke all on all sequences in schema billing from anon, authenticated';
  end if;
end $$;

insert into billing.schema_migrations (name) values ('0001_billing') on conflict do nothing;
