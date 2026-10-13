-- GoalieVision – målvaktsportal (fas 4)
--
-- Säkerhetsmodell
--   * Endast videor som tränaren uttryckligen publicerar finns här; allt annat stannar på iPaden.
--   * Varje video tillhör exakt en målvakt. En målvakt ser bara sina egna videor.
--   * Målvaktens konto kopplas till profilen via verifierad e-postadress (claim_my_goaltender_profiles).
--   * Publicering kräver att tränaren registrerat samtycke (målvakt/vårdnadshavare).
--   * Videofiler ligger i en privat bucket och nås bara via tidsbegränsade signerade länkar.
--   * Åtkomst kan dras tillbaka (access_revoked_at) och all data raderas via cascade.

-- ---------------------------------------------------------------------------
-- Tables
-- ---------------------------------------------------------------------------

create table public.coaches (
  id uuid primary key references auth.users (id) on delete cascade,
  name text not null default '',
  created_at timestamptz not null default now()
);

create table public.goaltenders (
  -- Same UUID as the goaltender in the iPad app's local database.
  id uuid primary key,
  coach_id uuid not null references public.coaches (id) on delete cascade,
  first_name text not null check (length(trim(first_name)) > 0),
  last_name text not null default '',
  jersey_number int check (jersey_number between 0 and 99),
  email text not null check (email ~ '^[^\s@]+@[^\s@]+\.[^\s@]+$'),
  -- Set by claim_my_goaltender_profiles() when the goaltender logs in with this verified e-mail.
  user_id uuid references auth.users (id) on delete set null,
  consent_confirmed_at timestamptz not null,
  access_revoked_at timestamptz,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);
create index goaltenders_coach_idx on public.goaltenders (coach_id);
create index goaltenders_email_idx on public.goaltenders (lower(email));
create index goaltenders_user_idx on public.goaltenders (user_id);

create table public.published_videos (
  -- Same UUID as the video in the iPad app's local database.
  id uuid primary key,
  coach_id uuid not null references public.coaches (id) on delete cascade,
  goaltender_id uuid not null references public.goaltenders (id) on delete cascade,
  storage_path text not null unique,
  focus_area text,
  exercise text,
  session_title text,
  team_name text,
  recorded_at timestamptz not null,
  duration_ms int not null check (duration_ms >= 0),
  frame_rate real,
  width int,
  height int,
  coach_note text,
  published_at timestamptz not null default now(),
  -- Files live under <coach>/<goaltender>/… so storage policies can check ownership from the path.
  check (storage_path like coach_id::text || '/' || goaltender_id::text || '/%')
);
create index published_videos_goaltender_idx on public.published_videos (goaltender_id, recorded_at desc);
create index published_videos_coach_idx on public.published_videos (coach_id);

create table public.video_comments (
  id uuid primary key default gen_random_uuid(),
  video_id uuid not null references public.published_videos (id) on delete cascade,
  author_id uuid not null default auth.uid() references auth.users (id) on delete cascade,
  author_role text not null check (author_role in ('trainer', 'goaltender')),
  timestamp_ms int check (timestamp_ms >= 0),
  content text not null check (length(trim(content)) between 1 and 2000),
  created_at timestamptz not null default now()
);
create index video_comments_video_idx on public.video_comments (video_id, created_at);

-- ---------------------------------------------------------------------------
-- Helper functions (security definer so policies can look across tables
-- without recursive RLS evaluation). search_path is pinned for safety.
-- ---------------------------------------------------------------------------

create function public.is_goalie_of(p_goaltender_id uuid)
returns boolean
language sql stable security definer set search_path = ''
as $$
  select exists (
    select 1 from public.goaltenders g
    where g.id = p_goaltender_id
      and g.user_id = auth.uid()
      and g.access_revoked_at is null
  );
$$;

create function public.can_view_video(p_video_id uuid)
returns boolean
language sql stable security definer set search_path = ''
as $$
  select exists (
    select 1 from public.published_videos v
    where v.id = p_video_id
      and (v.coach_id = auth.uid() or public.is_goalie_of(v.goaltender_id))
  );
$$;

create function public.coach_can_publish_to(p_goaltender_id uuid)
returns boolean
language sql stable security definer set search_path = ''
as $$
  select exists (
    select 1 from public.goaltenders g
    where g.id = p_goaltender_id
      and g.coach_id = auth.uid()
      and g.consent_confirmed_at is not null
      and g.access_revoked_at is null
  );
$$;

-- Links goaltender profiles registered with the caller's *verified* e-mail to
-- the caller's account. Returns the number of newly linked profiles.
create function public.claim_my_goaltender_profiles()
returns int
language plpgsql volatile security definer set search_path = ''
as $$
declare
  v_email text;
  v_count int;
begin
  select lower(u.email) into v_email
  from auth.users u
  where u.id = auth.uid() and u.email_confirmed_at is not null;

  if v_email is null then
    return 0;
  end if;

  update public.goaltenders g
     set user_id = auth.uid(), updated_at = now()
   where lower(g.email) = v_email
     and g.user_id is null
     and g.access_revoked_at is null;
  get diagnostics v_count = row_count;
  return v_count;
end;
$$;

-- Changing a goaltender's e-mail unlinks the old account (e.g. a corrected address).
create function public.goaltenders_before_update()
returns trigger
language plpgsql set search_path = ''
as $$
begin
  if lower(new.email) is distinct from lower(old.email) then
    new.user_id := null;
  end if;
  new.updated_at := now();
  return new;
end;
$$;

create trigger goaltenders_before_update
before update on public.goaltenders
for each row execute function public.goaltenders_before_update();

-- ---------------------------------------------------------------------------
-- Privileges: clients may only touch the columns they own. user_id can only
-- be set through claim_my_goaltender_profiles().
-- ---------------------------------------------------------------------------

revoke all on public.coaches, public.goaltenders, public.published_videos, public.video_comments from anon, authenticated;
revoke execute on function public.claim_my_goaltender_profiles() from public, anon;
grant execute on function public.claim_my_goaltender_profiles() to authenticated;

grant select, insert, update (name) on public.coaches to authenticated;
grant select, delete on public.goaltenders to authenticated;
grant insert (id, coach_id, first_name, last_name, jersey_number, email, consent_confirmed_at, access_revoked_at)
  on public.goaltenders to authenticated;
grant update (first_name, last_name, jersey_number, email, consent_confirmed_at, access_revoked_at)
  on public.goaltenders to authenticated;
grant select, insert, delete on public.published_videos to authenticated;
grant update (focus_area, exercise, session_title, team_name, coach_note) on public.published_videos to authenticated;
grant select, insert, delete on public.video_comments to authenticated;

-- ---------------------------------------------------------------------------
-- Row-level security
-- ---------------------------------------------------------------------------

alter table public.coaches enable row level security;
alter table public.goaltenders enable row level security;
alter table public.published_videos enable row level security;
alter table public.video_comments enable row level security;

create policy coaches_self on public.coaches
  for all to authenticated
  using (id = auth.uid()) with check (id = auth.uid());

create policy goaltenders_coach on public.goaltenders
  for all to authenticated
  using (coach_id = auth.uid()) with check (coach_id = auth.uid());

create policy goaltenders_self_read on public.goaltenders
  for select to authenticated
  using (user_id = auth.uid() and access_revoked_at is null);

create policy videos_coach_read on public.published_videos
  for select to authenticated using (coach_id = auth.uid());

create policy videos_coach_insert on public.published_videos
  for insert to authenticated
  with check (coach_id = auth.uid() and public.coach_can_publish_to(goaltender_id));

create policy videos_coach_update on public.published_videos
  for update to authenticated using (coach_id = auth.uid()) with check (coach_id = auth.uid());

create policy videos_coach_delete on public.published_videos
  for delete to authenticated using (coach_id = auth.uid());

create policy videos_goalie_read on public.published_videos
  for select to authenticated using (public.is_goalie_of(goaltender_id));

create policy comments_read on public.video_comments
  for select to authenticated using (public.can_view_video(video_id));

create policy comments_insert on public.video_comments
  for insert to authenticated
  with check (
    author_id = auth.uid()
    and (
      (author_role = 'trainer' and exists (
        select 1 from public.published_videos v where v.id = video_id and v.coach_id = auth.uid()))
      or
      (author_role = 'goaltender' and exists (
        select 1 from public.published_videos v where v.id = video_id and public.is_goalie_of(v.goaltender_id)))
    )
  );

create policy comments_delete_own on public.video_comments
  for delete to authenticated using (author_id = auth.uid());

-- ---------------------------------------------------------------------------
-- Private video storage
-- ---------------------------------------------------------------------------

insert into storage.buckets (id, name, public, file_size_limit, allowed_mime_types)
values ('videos', 'videos', false, null, array['video/quicktime', 'video/mp4'])
on conflict (id) do update set public = false, allowed_mime_types = excluded.allowed_mime_types;

-- Coach uploads only into <own id>/<own, consented goaltender>/…
create policy videos_storage_coach_insert on storage.objects
  for insert to authenticated
  with check (
    bucket_id = 'videos'
    and (storage.foldername(name))[1] = auth.uid()::text
    and public.coach_can_publish_to(((storage.foldername(name))[2])::uuid)
  );

create policy videos_storage_coach_read on storage.objects
  for select to authenticated
  using (bucket_id = 'videos' and (storage.foldername(name))[1] = auth.uid()::text);

create policy videos_storage_coach_delete on storage.objects
  for delete to authenticated
  using (bucket_id = 'videos' and (storage.foldername(name))[1] = auth.uid()::text);

-- Goaltenders can read (create signed URLs for) a file only once it is published to them.
create policy videos_storage_goalie_read on storage.objects
  for select to authenticated
  using (
    bucket_id = 'videos'
    and exists (
      select 1 from public.published_videos v
      where v.storage_path = name and public.is_goalie_of(v.goaltender_id)
    )
  );
