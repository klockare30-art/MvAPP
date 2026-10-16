-- GoalieVision – administration av tränarkonton och nivåer
--
--   * Admin = rad i public.admins. Läggs bara till via Supabase SQL Editor (aldrig från appen/portalen).
--   * Nya tränare är 'pending'. Admin väljer nivå, sätter betalt-till-datum och aktiverar.
--   * Uppladdning och nya målvakter kräver aktiv tränare med nivå och giltigt betaldatum,
--     samt att nivåns gränser för lagring och antal målvakter inte är nådda.
--   * Ändra, återkalla och radera fungerar även för avstängda tränare (radering på begäran).

-- ---------------------------------------------------------------------------
-- Tables
-- ---------------------------------------------------------------------------

create table public.admins (
  user_id uuid primary key references auth.users (id) on delete cascade,
  created_at timestamptz not null default now()
);

create table public.plans (
  id text primary key check (id ~ '^[a-z0-9-]{1,40}$'),
  name text not null check (length(trim(name)) > 0),
  max_storage_bytes bigint not null check (max_storage_bytes >= 0),
  max_goaltenders int not null check (max_goaltenders >= 0),
  -- Shown to the admin only, e.g. "199 kr/mån". Payment happens outside the app.
  price_note text not null default '',
  sort_order int not null default 0,
  created_at timestamptz not null default now()
);

-- Starting point; change limits and add levels on the portal's admin page.
insert into public.plans (id, name, max_storage_bytes, max_goaltenders, sort_order)
values ('start', 'Start', 1073741824, 10, 1);

alter table public.coaches
  add column status text not null default 'pending' check (status in ('pending', 'active', 'suspended')),
  add column plan_id text references public.plans (id) on update cascade,
  -- null = no end date.
  add column paid_until date,
  add column updated_at timestamptz not null default now();

-- ---------------------------------------------------------------------------
-- Helpers (caller-scoped, so they reveal nothing about other accounts)
-- ---------------------------------------------------------------------------

create function public.is_admin()
returns boolean
language sql stable security definer set search_path = ''
as $$
  select exists (select 1 from public.admins a where a.user_id = auth.uid());
$$;

create function public.caller_storage_bytes()
returns bigint
language sql stable security definer set search_path = ''
as $$
  select coalesce(sum((o.metadata ->> 'size')::bigint), 0)::bigint
  from storage.objects o
  where o.bucket_id = 'videos' and o.name like auth.uid()::text || '/%';
$$;

create function public.caller_is_active_coach()
returns boolean
language sql stable security definer set search_path = ''
as $$
  select exists (
    select 1 from public.coaches c
    where c.id = auth.uid()
      and c.status = 'active'
      and c.plan_id is not null
      and (c.paid_until is null or c.paid_until >= current_date)
  );
$$;

create function public.caller_has_goaltender_slot()
returns boolean
language sql stable security definer set search_path = ''
as $$
  select exists (
    select 1 from public.coaches c join public.plans p on p.id = c.plan_id
    where c.id = auth.uid()
      and (select count(*) from public.goaltenders g where g.coach_id = c.id) < p.max_goaltenders
  );
$$;

-- Checked before each upload: one upload may end slightly above the limit (bounded by the bucket's max file size).
create function public.caller_has_storage_left()
returns boolean
language sql stable security definer set search_path = ''
as $$
  select exists (
    select 1 from public.coaches c join public.plans p on p.id = c.plan_id
    where c.id = auth.uid() and public.caller_storage_bytes() < p.max_storage_bytes
  );
$$;

-- Publishing now also requires an active, paid coach.
create or replace function public.coach_can_publish_to(p_goaltender_id uuid)
returns boolean
language sql stable security definer set search_path = ''
as $$
  select public.caller_is_active_coach() and exists (
    select 1 from public.goaltenders g
    where g.id = p_goaltender_id
      and g.coach_id = auth.uid()
      and g.consent_confirmed_at is not null
      and g.access_revoked_at is null
  );
$$;

-- The coach's own account, level and usage (shown in the iPad app).
create function public.my_coach_account()
returns table (
  status text, plan_name text, paid_until date, is_active boolean,
  max_storage_bytes bigint, used_storage_bytes bigint, max_goaltenders int, goaltender_count int
)
language sql stable security definer set search_path = ''
as $$
  select c.status, p.name, c.paid_until, public.caller_is_active_coach(),
         p.max_storage_bytes, public.caller_storage_bytes(), p.max_goaltenders,
         (select count(*) from public.goaltenders g where g.coach_id = c.id)::int
  from public.coaches c left join public.plans p on p.id = c.plan_id
  where c.id = auth.uid();
$$;

-- ---------------------------------------------------------------------------
-- Admin functions (raise insufficient_privilege for everyone else)
-- ---------------------------------------------------------------------------

create function public.admin_list_coaches()
returns table (
  id uuid, email text, name text, status text, plan_id text, paid_until date, created_at timestamptz,
  goaltender_count int, video_count int, storage_bytes bigint
)
language plpgsql stable security definer set search_path = ''
as $$
begin
  if not public.is_admin() then
    raise exception 'Endast för administratörer.' using errcode = 'insufficient_privilege';
  end if;
  return query
    select c.id, u.email::text, c.name, c.status, c.plan_id, c.paid_until, c.created_at,
           (select count(*) from public.goaltenders g where g.coach_id = c.id)::int,
           (select count(*) from public.published_videos v where v.coach_id = c.id)::int,
           (select coalesce(sum((o.metadata ->> 'size')::bigint), 0) from storage.objects o
             where o.bucket_id = 'videos' and o.name like c.id::text || '/%')::bigint
    from public.coaches c join auth.users u on u.id = c.id
    order by c.created_at desc;
end;
$$;

create function public.admin_update_coach(p_coach_id uuid, p_status text, p_plan_id text, p_paid_until date)
returns void
language plpgsql volatile security definer set search_path = ''
as $$
begin
  if not public.is_admin() then
    raise exception 'Endast för administratörer.' using errcode = 'insufficient_privilege';
  end if;
  if p_status = 'active' and p_plan_id is null then
    raise exception 'Välj en nivå innan tränaren aktiveras.' using errcode = 'check_violation';
  end if;
  update public.coaches
     set status = p_status, plan_id = p_plan_id, paid_until = p_paid_until, updated_at = now()
   where id = p_coach_id;
  if not found then
    raise exception 'Tränaren finns inte.' using errcode = 'no_data_found';
  end if;
end;
$$;

create function public.admin_save_plan(
  p_id text, p_name text, p_max_storage_bytes bigint, p_max_goaltenders int, p_price_note text, p_sort_order int
)
returns void
language plpgsql volatile security definer set search_path = ''
as $$
begin
  if not public.is_admin() then
    raise exception 'Endast för administratörer.' using errcode = 'insufficient_privilege';
  end if;
  insert into public.plans (id, name, max_storage_bytes, max_goaltenders, price_note, sort_order)
  values (p_id, p_name, p_max_storage_bytes, p_max_goaltenders, coalesce(p_price_note, ''), coalesce(p_sort_order, 0))
  on conflict (id) do update
    set name = excluded.name, max_storage_bytes = excluded.max_storage_bytes,
        max_goaltenders = excluded.max_goaltenders, price_note = excluded.price_note, sort_order = excluded.sort_order;
end;
$$;

-- ---------------------------------------------------------------------------
-- Privileges
-- ---------------------------------------------------------------------------

revoke all on public.admins, public.plans from anon, authenticated;
grant select on public.plans to authenticated;

-- Coaches may create their own row (id, name) and rename it; status/plan/paid_until are admin-only.
revoke insert, update on public.coaches from authenticated;
grant insert (id, name), update (name) on public.coaches to authenticated;

revoke execute on function
  public.is_admin(), public.caller_storage_bytes(), public.caller_is_active_coach(),
  public.caller_has_goaltender_slot(), public.caller_has_storage_left(), public.my_coach_account(),
  public.admin_list_coaches(), public.admin_update_coach(uuid, text, text, date),
  public.admin_save_plan(text, text, bigint, int, text, int)
  from public, anon;
grant execute on function
  public.is_admin(), public.caller_storage_bytes(), public.caller_is_active_coach(),
  public.caller_has_goaltender_slot(), public.caller_has_storage_left(), public.my_coach_account(),
  public.admin_list_coaches(), public.admin_update_coach(uuid, text, text, date),
  public.admin_save_plan(text, text, bigint, int, text, int)
  to authenticated;

-- ---------------------------------------------------------------------------
-- Row-level security
-- ---------------------------------------------------------------------------

alter table public.admins enable row level security; -- no policies: unreachable from clients
alter table public.plans enable row level security;
create policy plans_read on public.plans for select to authenticated using (true);

-- New goaltenders only for an active coach with a free slot; edit/revoke/delete always allowed.
drop policy goaltenders_coach on public.goaltenders;
create policy goaltenders_coach_read on public.goaltenders
  for select to authenticated using (coach_id = auth.uid());
create policy goaltenders_coach_insert on public.goaltenders
  for insert to authenticated
  with check (coach_id = auth.uid() and public.caller_is_active_coach() and public.caller_has_goaltender_slot());
create policy goaltenders_coach_update on public.goaltenders
  for update to authenticated using (coach_id = auth.uid()) with check (coach_id = auth.uid());
create policy goaltenders_coach_delete on public.goaltenders
  for delete to authenticated using (coach_id = auth.uid());

drop policy videos_storage_coach_insert on storage.objects;
create policy videos_storage_coach_insert on storage.objects
  for insert to authenticated
  with check (
    bucket_id = 'videos'
    and (storage.foldername(name))[1] = auth.uid()::text
    and public.coach_can_publish_to(((storage.foldername(name))[2])::uuid)
    and public.caller_has_storage_left()
  );
