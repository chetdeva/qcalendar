-- A free trial class is its own kind of lesson (shown as "Trial", paid for with the free trial).
alter table calendar.events drop constraint events_category_check;
alter table calendar.events add constraint events_category_check check (category in ('tutoring', 'office_hours', 'personal', 'trial'));
