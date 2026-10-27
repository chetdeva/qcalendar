-- Profile pictures. The image lives in a private Storage bucket (never a public URL); only the service role
-- (users-service) reads or writes it, and it serves a picture to its owner only. profiles.avatar_updated_at says
-- whether there is one and doubles as the cache-busting version.

alter table public.profiles add column avatar_updated_at timestamptz;

insert into storage.buckets (id, name, public, file_size_limit, allowed_mime_types)
values ('avatars', 'avatars', false, 262144, array['image/png', 'image/jpeg', 'image/webp'])
on conflict (id) do nothing;
