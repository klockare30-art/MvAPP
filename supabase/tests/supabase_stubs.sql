-- TEST ONLY: minimal stand-ins for the parts of Supabase the migration relies on
-- (roles, auth.uid(), auth.users, storage.buckets/objects, storage.foldername).
-- Lets the RLS policies be exercised against a plain PostgreSQL server.
create role anon nologin;
create role authenticated nologin;

create schema auth;
create table auth.users (
  id uuid primary key,
  email text,
  email_confirmed_at timestamptz
);
create function auth.uid() returns uuid language sql stable as $$
  select nullif(current_setting('request.jwt.claims', true)::jsonb ->> 'sub', '')::uuid
$$;

create schema storage;
create table storage.buckets (
  id text primary key, name text, public boolean, file_size_limit bigint, allowed_mime_types text[]
);
create table storage.objects (
  id uuid primary key default gen_random_uuid(),
  bucket_id text references storage.buckets (id),
  name text not null,
  owner uuid default auth.uid(),
  unique (bucket_id, name)
);
alter table storage.objects enable row level security;
-- Same definition as Supabase's storage.foldername.
create function storage.foldername(name text) returns text[] language plpgsql as $$
declare _parts text[];
begin
  select string_to_array(name, '/') into _parts;
  return _parts[1:array_length(_parts, 1) - 1];
end
$$;

grant usage on schema auth, storage, public to anon, authenticated;
grant select, insert, delete on storage.objects to authenticated;
grant select on storage.objects to anon;
-- Supabase grants broad default privileges on public tables; the migration must revoke what it doesn't want.
alter default privileges in schema public grant all on tables to anon, authenticated;
