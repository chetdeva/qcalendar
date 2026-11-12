-- A payment is followed from the moment checkout opens (started) through the gateway's steps (authenticated, activated)
-- to its end (succeeded, failed, cancelled). gateway_ref is the gateway's subscription id, which later events name.
alter table billing.payments add column gateway_ref text;
alter table billing.payments add column updated_at timestamptz not null default now();
alter table billing.payments drop constraint payments_status_check;
alter table billing.payments add constraint payments_status_check check (status in ('started', 'authenticated', 'activated', 'succeeded', 'failed', 'cancelled'));
create index payments_ref on billing.payments (gateway, gateway_ref);
