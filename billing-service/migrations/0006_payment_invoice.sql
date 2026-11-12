-- The gateway's invoice for a charge, so the student can open it from their payment history.
alter table billing.payments add column invoice_ref text;
