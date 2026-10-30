-- The time the student picked on the calendar for their free class (the free-text note is no longer written).
alter table calendar.trial_requests add column requested_start timestamptz;
alter table calendar.trial_requests add column duration_minutes int not null default 60 check (duration_minutes between 15 and 240);
