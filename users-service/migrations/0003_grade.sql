-- A student's school grade (1-10). It sets their price band, so a family cannot change it freely: an admin can
-- change it any time, a student once per school year (the school year starts on 1 August). Chosen at signup.

alter table public.profiles
  add column grade smallint check (grade between 1 and 10),
  add column grade_confirmed_year smallint;

-- The signup form sends the grade in user_metadata. Anything that is not a whole number 1-10 becomes null.
create or replace function private.handle_new_user() returns trigger
language plpgsql security definer set search_path = '' as $$
declare
  g smallint := case when new.raw_user_meta_data ->> 'grade' ~ '^([1-9]|10)$' then (new.raw_user_meta_data ->> 'grade')::smallint end;
begin
  insert into public.profiles (id, email, full_name, grade, grade_confirmed_year)
  values (
    new.id,
    new.email,
    coalesce(nullif(new.raw_user_meta_data ->> 'full_name', ''), nullif(new.raw_user_meta_data ->> 'name', '')),
    g,
    case when g is not null then extract(year from (now() - interval '7 months'))::smallint end
  );
  if new.email_confirmed_at is not null then
    perform private.apply_invitation(new.id, new.email);
  end if;
  return new;
end $$;
