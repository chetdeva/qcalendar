-- When the free class ends: the subscribe prompt appears after it. Null (older rows) counts as already taken.
alter table billing.trials add column lesson_end timestamptz;
