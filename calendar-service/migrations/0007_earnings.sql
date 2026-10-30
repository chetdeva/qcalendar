-- A teacher earns a credit for each student seat in a class they taught; earned_at says it was reported to billing-service.
-- Seats from classes that had already ended are marked done here, so only classes taught from now on earn (earlier ones can be
-- credited by hand by an admin).
alter table calendar.event_participants add column earned_at timestamptz;
update calendar.event_participants p set earned_at = now() from calendar.events e where e.id = p.event_id and e.end_at <= now();
