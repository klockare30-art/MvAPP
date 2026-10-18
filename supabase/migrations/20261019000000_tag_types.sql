-- GoalieVision – tränarens egna taggar (kontrollpanelen)
--
--   * Varje tränare har sin egen lista med taggar: namn, kortkommando, färg och klipplängd.
--   * F och B är reserverade för snabbspolning framåt/bakåt.
--   * Saknar tränaren egna taggar används standardlistan i portalen.

create table public.coach_tag_types (
  coach_id uuid not null default auth.uid() references public.coaches (id) on delete cascade,
  id text not null check (id ~ '^[a-z0-9-]{1,40}$'),
  label text not null check (length(trim(label)) between 1 and 30),
  shortcut text not null check (shortcut ~ '^[a-z0-9åäö]$' and shortcut not in ('f', 'b')),
  color text not null check (color ~ '^#[0-9a-fA-F]{6}$'),
  before_sec int not null default 6 check (before_sec between 0 and 60),
  after_sec int not null default 3 check (after_sec between 0 and 60),
  sort_order int not null default 0,
  primary key (coach_id, id),
  unique (coach_id, shortcut),
  unique (coach_id, label)
);

revoke all on public.coach_tag_types from anon, authenticated;
grant select, delete on public.coach_tag_types to authenticated;
grant insert (id, label, shortcut, color, before_sec, after_sec, sort_order) on public.coach_tag_types to authenticated;

alter table public.coach_tag_types enable row level security;
create policy tag_types_coach on public.coach_tag_types
  for all to authenticated
  using (coach_id = auth.uid())
  with check (coach_id = auth.uid());

-- Replaces the caller's whole list in one transaction (so swapping two shortcuts works).
-- SECURITY INVOKER: runs with the caller's rights, so the policies above apply.
create function public.save_my_tag_types(p_types jsonb)
returns void
language plpgsql volatile security invoker set search_path = ''
as $$
begin
  if jsonb_typeof(p_types) is distinct from 'array' or jsonb_array_length(p_types) > 30 then
    raise exception 'Högst 30 taggar.' using errcode = 'check_violation';
  end if;
  delete from public.coach_tag_types where coach_id = auth.uid();
  insert into public.coach_tag_types (id, label, shortcut, color, before_sec, after_sec, sort_order)
  select t.id, trim(t.label), lower(t.shortcut), t.color, t.before_sec, t.after_sec, (t.ord - 1)::int
  from rows from (
    jsonb_to_recordset(p_types) as (id text, label text, shortcut text, color text, before_sec int, after_sec int)
  ) with ordinality as t(id, label, shortcut, color, before_sec, after_sec, ord);
end;
$$;

revoke execute on function public.save_my_tag_types(jsonb) from public, anon;
grant execute on function public.save_my_tag_types(jsonb) to authenticated;
