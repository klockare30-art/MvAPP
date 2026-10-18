-- GoalieVision – klubbar och lag (struktur per tränare)
--
--   * Varje tränare äger sina klubbar, lag och målvakter. Ingen delning mellan tränare (ännu).
--   * En målvakt kan tillhöra ett av tränarens lag (eller inget).
--   * Raderas en klubb raderas dess lag; målvakterna finns kvar utan lag.

create table public.clubs (
  id uuid primary key default gen_random_uuid(),
  coach_id uuid not null default auth.uid() references public.coaches (id) on delete cascade,
  name text not null check (length(trim(name)) between 1 and 80),
  created_at timestamptz not null default now()
);
create index clubs_coach_idx on public.clubs (coach_id);

create table public.teams (
  id uuid primary key default gen_random_uuid(),
  coach_id uuid not null default auth.uid() references public.coaches (id) on delete cascade,
  club_id uuid not null references public.clubs (id) on delete cascade,
  name text not null check (length(trim(name)) between 1 and 80),
  season text not null default '' check (length(season) <= 20),
  created_at timestamptz not null default now()
);
create index teams_coach_idx on public.teams (coach_id);
create index teams_club_idx on public.teams (club_id);

alter table public.goaltenders
  add column team_id uuid references public.teams (id) on delete set null;
create index goaltenders_team_idx on public.goaltenders (team_id);

-- ---------------------------------------------------------------------------
-- Ownership helpers (security definer: no RLS recursion between the tables)
-- ---------------------------------------------------------------------------

create function public.caller_owns_club(p_club_id uuid)
returns boolean
language sql stable security definer set search_path = ''
as $$
  select exists (select 1 from public.clubs c where c.id = p_club_id and c.coach_id = auth.uid());
$$;

create function public.caller_owns_team(p_team_id uuid)
returns boolean
language sql stable security definer set search_path = ''
as $$
  select exists (select 1 from public.teams t where t.id = p_team_id and t.coach_id = auth.uid());
$$;

revoke execute on function public.caller_owns_club(uuid), public.caller_owns_team(uuid) from public, anon;
grant execute on function public.caller_owns_club(uuid), public.caller_owns_team(uuid) to authenticated;

-- ---------------------------------------------------------------------------
-- Privileges
-- ---------------------------------------------------------------------------

revoke all on public.clubs, public.teams from anon, authenticated;
grant select, delete on public.clubs, public.teams to authenticated;
grant insert (id, name), update (name) on public.clubs to authenticated;
grant insert (id, club_id, name, season), update (club_id, name, season) on public.teams to authenticated;
grant insert (team_id), update (team_id) on public.goaltenders to authenticated;

-- ---------------------------------------------------------------------------
-- Row-level security
-- ---------------------------------------------------------------------------

alter table public.clubs enable row level security;
alter table public.teams enable row level security;

create policy clubs_coach on public.clubs
  for all to authenticated
  using (coach_id = auth.uid())
  with check (coach_id = auth.uid());

create policy teams_coach on public.teams
  for all to authenticated
  using (coach_id = auth.uid())
  with check (coach_id = auth.uid() and public.caller_owns_club(club_id));

-- Goaltenders may only be placed in the coach's own teams.
drop policy goaltenders_coach_insert on public.goaltenders;
create policy goaltenders_coach_insert on public.goaltenders
  for insert to authenticated
  with check (
    coach_id = auth.uid()
    and public.caller_is_active_coach()
    and public.caller_has_goaltender_slot()
    and (team_id is null or public.caller_owns_team(team_id))
  );

drop policy goaltenders_coach_update on public.goaltenders;
create policy goaltenders_coach_update on public.goaltenders
  for update to authenticated
  using (coach_id = auth.uid())
  with check (coach_id = auth.uid() and (team_id is null or public.caller_owns_team(team_id)));
