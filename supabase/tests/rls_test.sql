-- Security tests for the goaltender portal. Run with: npm run test:db
-- Every check raises an exception on failure (psql runs with ON_ERROR_STOP).

\set QUIET on
set client_min_messages = notice;

-- ---------------------------------------------------------------------------
-- Helpers
-- ---------------------------------------------------------------------------
create schema t;
grant usage on schema t to anon, authenticated;

create function t.login(p_user uuid) returns void language sql as $$
  select set_config('request.jwt.claims', json_build_object('sub', p_user)::text, false);
  set role authenticated;
$$;

create function t.check(p_ok boolean, p_msg text) returns void language plpgsql as $$
begin
  if not coalesce(p_ok, false) then raise exception 'FAILED: %', p_msg; end if;
  raise notice 'ok - %', p_msg;
end $$;

-- Runs SQL that must fail (permission or policy violation).
create function t.denied(p_sql text, p_msg text) returns void language plpgsql as $$
begin
  begin
    execute p_sql;
  -- Only access-control outcomes count; a typo (syntax error etc.) must still fail the test.
  exception when insufficient_privilege or check_violation or not_null_violation or invalid_text_representation then
    raise notice 'ok - % (denied)', p_msg;
    return;
  end;
  raise exception 'FAILED: % (was allowed)', p_msg;
end $$;

-- Counts rows of a query as the current role (affected-row counts reveal silent RLS filtering).
create function t.count(p_sql text) returns int language plpgsql as $$
declare n int;
begin
  execute 'select count(*) from (' || p_sql || ') q' into n;
  return n;
end $$;

-- Rows affected by a DML statement (RLS silently filters UPDATE/DELETE instead of raising).
create function t.affected(p_sql text) returns int language plpgsql as $$
declare n int;
begin
  execute p_sql;
  get diagnostics n = row_count;
  return n;
end $$;

grant execute on all functions in schema t to anon, authenticated;

-- ---------------------------------------------------------------------------
-- Fixture (as superuser)
-- ---------------------------------------------------------------------------
-- Coaches A and B; goaltender users Erik, William, an unconfirmed user and a stranger.
insert into auth.users values
  ('aaaaaaaa-0000-0000-0000-000000000001', 'coach.a@club.se', now()),
  ('bbbbbbbb-0000-0000-0000-000000000002', 'coach.b@club.se', now()),
  ('eeeeeeee-0000-0000-0000-000000000003', 'erik@mail.se', now()),
  ('cccccccc-0000-0000-0000-000000000004', 'william@mail.se', now()),
  ('dddddddd-0000-0000-0000-000000000005', 'oliver@mail.se', null),
  ('ffffffff-0000-0000-0000-000000000006', 'stranger@mail.se', now()),
  ('99999999-0000-0000-0000-000000000009', 'admin@goalievision.se', now());
-- The admin is added the same way as in production: by SQL, as the database owner.
insert into public.admins (user_id) values ('99999999-0000-0000-0000-000000000009');
-- A tiny level for the limit tests.
insert into public.plans (id, name, max_storage_bytes, max_goaltenders) values ('mini', 'Mini', 100, 1);

-- ---------------------------------------------------------------------------
-- Coach A sets up profiles and publishes
-- ---------------------------------------------------------------------------
select t.login('aaaaaaaa-0000-0000-0000-000000000001');
insert into public.coaches (id, name) values (auth.uid(), 'Coach A');

-- New coach waits for the admin
select t.check((select status from public.coaches) = 'pending', 'a new coach starts as pending');
select t.denied($$update public.coaches set status = 'active'$$, 'coach cannot activate themselves');
select t.denied($$update public.coaches set plan_id = 'start', paid_until = '2099-01-01'$$, 'coach cannot pick a level or pay date');
select t.denied($$insert into public.coaches (id, name, status) values (gen_random_uuid(), 'X', 'active')$$,
  'coach row cannot be created as active');
select t.denied($$insert into public.goaltenders (id, coach_id, first_name, email, consent_confirmed_at)
  values (gen_random_uuid(), auth.uid(), 'Early', 'early@mail.se', now())$$,
  'pending coach cannot add goaltenders');
select t.denied($$insert into storage.objects (bucket_id, name) values
  ('videos', 'aaaaaaaa-0000-0000-0000-000000000001/11111111-0000-0000-0000-00000000e30a/early.mov')$$,
  'pending coach cannot upload');
select t.check(not public.is_admin(), 'coach is not admin');
select t.denied('select * from public.admin_list_coaches()', 'coach cannot list coaches');
select t.denied($$select public.admin_update_coach(auth.uid(), 'active', 'start', null)$$, 'coach cannot approve themselves');
select t.denied($$select public.admin_save_plan('start', 'Start', 999999999999, 999, '', 1)$$, 'coach cannot change levels');
select t.denied($$insert into public.admins (user_id) values (auth.uid())$$, 'coach cannot make themselves admin');
select t.denied('select * from public.admins', 'coach cannot read the admin list');
select t.denied($$update public.plans set max_storage_bytes = 999999999999$$, 'coach cannot edit a level directly');
select t.check(t.count('select * from public.plans') = 2, 'coach can read the levels');
select t.check((select status from public.my_coach_account()) = 'pending' and not (select is_active from public.my_coach_account()),
  'coach sees own pending status');
reset role;

-- Admin approves after payment
select t.login('99999999-0000-0000-0000-000000000009');
select t.check(public.is_admin(), 'admin is recognised');
select t.check(t.count('select * from public.admin_list_coaches()') = 1, 'admin lists all coaches');
select t.check((select email from public.admin_list_coaches()) = 'coach.a@club.se', 'admin sees the coach''s e-mail');
select t.denied($$select public.admin_update_coach('aaaaaaaa-0000-0000-0000-000000000001', 'active', null, null)$$,
  'activation requires a level');
select public.admin_update_coach('aaaaaaaa-0000-0000-0000-000000000001', 'active', 'start', current_date + 30);
select public.admin_save_plan('plus', 'Plus', 5368709120, 30, '299 kr/mån', 2);
select t.check(t.count('select * from public.plans') = 3, 'admin creates a level');
select t.check(t.count('select * from public.goaltenders') = 0 and t.count('select * from public.published_videos') = 0,
  'admin role gives no access to goaltenders or videos');
reset role;

select t.login('aaaaaaaa-0000-0000-0000-000000000001');
select t.check((select is_active and plan_name = 'Start' from public.my_coach_account()), 'coach is active on level Start');
insert into public.goaltenders (id, coach_id, first_name, jersey_number, email, consent_confirmed_at) values
  ('11111111-0000-0000-0000-00000000e30a', auth.uid(), 'Erik', 30, 'Erik@Mail.se', now()),
  ('11111111-0000-0000-0000-00000000b35a', auth.uid(), 'William', 35, 'william@mail.se', now()),
  ('11111111-0000-0000-0000-00000000d01a', auth.uid(), 'Oliver', 1, 'oliver@mail.se', now());

select t.denied($$insert into public.goaltenders (id, coach_id, first_name, email, consent_confirmed_at, user_id)
  values (gen_random_uuid(), auth.uid(), 'X', 'x@mail.se', now(), 'ffffffff-0000-0000-0000-000000000006')$$,
  'coach cannot set user_id directly');
select t.denied($$insert into public.goaltenders (id, coach_id, first_name, email)
  values (gen_random_uuid(), auth.uid(), 'NoConsent', 'nc@mail.se')$$,
  'goaltender profile requires recorded consent');
select t.denied($$insert into public.goaltenders (id, coach_id, first_name, email, consent_confirmed_at)
  values (gen_random_uuid(), 'bbbbbbbb-0000-0000-0000-000000000002', 'X', 'x@mail.se', now())$$,
  'coach cannot create profiles for another coach');

-- Upload files to storage, then publish rows.
insert into storage.objects (bucket_id, name, metadata) values
  ('videos', 'aaaaaaaa-0000-0000-0000-000000000001/11111111-0000-0000-0000-00000000e30a/v-erik.mov', '{"size": 6000000}'),
  ('videos', 'aaaaaaaa-0000-0000-0000-000000000001/11111111-0000-0000-0000-00000000b35a/v-will.mov', '{"size": 2000000}');
select t.check(true, 'coach uploads into own folder for consented goaltender');
select t.denied($$insert into storage.objects (bucket_id, name) values
  ('videos', 'bbbbbbbb-0000-0000-0000-000000000002/11111111-0000-0000-0000-00000000e30a/x.mov')$$,
  'coach cannot upload into another coach''s folder');

insert into public.published_videos (id, coach_id, goaltender_id, storage_path, focus_area, recorded_at, duration_ms) values
  ('22222222-0000-0000-0000-0000000000e1', auth.uid(), '11111111-0000-0000-0000-00000000e30a',
   'aaaaaaaa-0000-0000-0000-000000000001/11111111-0000-0000-0000-00000000e30a/v-erik.mov', 'Förflyttningar', now(), 120000),
  ('22222222-0000-0000-0000-0000000000b1', auth.uid(), '11111111-0000-0000-0000-00000000b35a',
   'aaaaaaaa-0000-0000-0000-000000000001/11111111-0000-0000-0000-00000000b35a/v-will.mov', 'Förflyttningar', now(), 30000);
select t.denied($$insert into public.published_videos (id, coach_id, goaltender_id, storage_path, recorded_at, duration_ms)
  values (gen_random_uuid(), auth.uid(), '11111111-0000-0000-0000-00000000e30a',
   'aaaaaaaa-0000-0000-0000-000000000001/11111111-0000-0000-0000-00000000b35a/wrong-folder.mov', now(), 1)$$,
  'storage path must match the goaltender');
select t.check(t.count('select * from public.published_videos') = 2, 'coach sees own published videos');
reset role;

-- ---------------------------------------------------------------------------
-- Coach B cannot see or touch coach A's data
-- ---------------------------------------------------------------------------
select t.login('bbbbbbbb-0000-0000-0000-000000000002');
insert into public.coaches (id, name) values (auth.uid(), 'Coach B');
reset role;
select t.login('99999999-0000-0000-0000-000000000009');
select public.admin_update_coach('bbbbbbbb-0000-0000-0000-000000000002', 'active', 'mini', null);
reset role;
select t.login('bbbbbbbb-0000-0000-0000-000000000002');
select t.check(t.count('select * from public.goaltenders') = 0, 'coach B sees none of coach A''s goaltenders');
select t.check(t.count('select * from public.published_videos') = 0, 'coach B sees none of coach A''s videos');
select t.check(t.count('select * from storage.objects') = 0, 'coach B sees none of coach A''s files');
select t.denied($$insert into public.published_videos (id, coach_id, goaltender_id, storage_path, recorded_at, duration_ms)
  values (gen_random_uuid(), auth.uid(), '11111111-0000-0000-0000-00000000e30a',
   'bbbbbbbb-0000-0000-0000-000000000002/11111111-0000-0000-0000-00000000e30a/x.mov', now(), 1)$$,
  'coach B cannot publish to coach A''s goaltender');
-- Coach B also trains Erik (same e-mail) – a separate profile.
insert into public.goaltenders (id, coach_id, first_name, email, consent_confirmed_at)
  values ('11111111-0000-0000-0000-00000000e30b', auth.uid(), 'Erik', 'erik@mail.se', now());
reset role;

-- ---------------------------------------------------------------------------
-- Goaltender Erik: claims profiles and only sees his own videos
-- ---------------------------------------------------------------------------
select t.login('eeeeeeee-0000-0000-0000-000000000003');
select t.check(t.count('select * from public.published_videos') = 0, 'before claiming, Erik sees nothing');
select t.check(public.claim_my_goaltender_profiles() = 2, 'Erik claims both profiles registered to his e-mail (case-insensitive)');
select t.check(public.claim_my_goaltender_profiles() = 0, 'claiming again is a no-op');
select t.check(t.count('select * from public.goaltenders') = 2, 'Erik sees only his own profiles');
select t.check(t.count('select * from public.published_videos') = 1, 'Erik sees exactly his own video');
select t.check(t.count($$select * from public.published_videos where goaltender_id = '11111111-0000-0000-0000-00000000b35a'$$) = 0,
  'Erik cannot see William''s video');
select t.check(t.count('select * from storage.objects') = 1, 'Erik can access only his own file');
select t.check(t.count($$select * from storage.objects where name like '%v-will.mov'$$) = 0, 'Erik cannot access William''s file');

select t.denied($$insert into storage.objects (bucket_id, name) values
  ('videos', 'eeeeeeee-0000-0000-0000-000000000003/11111111-0000-0000-0000-00000000e30a/upload.mov')$$,
  'goaltender cannot upload files');
select t.denied($$insert into public.published_videos (id, coach_id, goaltender_id, storage_path, recorded_at, duration_ms)
  values (gen_random_uuid(), auth.uid(), '11111111-0000-0000-0000-00000000e30a', 'x', now(), 1)$$,
  'goaltender cannot publish videos');
select t.denied($$update public.goaltenders set user_id = 'ffffffff-0000-0000-0000-000000000006'$$,
  'goaltender cannot reassign a profile');
select t.check(t.affected($$update public.goaltenders set first_name = 'Hacker'$$) = 0, 'goaltender cannot edit profiles');
select t.check(t.affected($$delete from public.published_videos$$) = 0, 'goaltender cannot delete videos');

-- Comments
insert into public.video_comments (video_id, author_role, timestamp_ms, content)
  values ('22222222-0000-0000-0000-0000000000e1', 'goaltender', 18000, 'Varför tappar jag vinkeln här?');
select t.check(true, 'Erik can comment on his own video');
select t.denied($$insert into public.video_comments (video_id, author_role, content)
  values ('22222222-0000-0000-0000-0000000000e1', 'trainer', 'Låtsastränare')$$,
  'goaltender cannot post as trainer');
select t.denied($$insert into public.video_comments (video_id, author_role, content)
  values ('22222222-0000-0000-0000-0000000000b1', 'goaltender', 'Spionerar')$$,
  'Erik cannot comment on William''s video');
reset role;

-- ---------------------------------------------------------------------------
-- Other users
-- ---------------------------------------------------------------------------
select t.login('cccccccc-0000-0000-0000-000000000004');
select t.check(public.claim_my_goaltender_profiles() = 1, 'William claims his profile');
select t.check(t.count('select * from public.published_videos') = 1, 'William sees exactly his own video');
select t.check(t.count('select * from public.video_comments') = 0, 'William cannot read comments on Erik''s video');
reset role;

select t.login('dddddddd-0000-0000-0000-000000000005');
select t.check(public.claim_my_goaltender_profiles() = 0, 'unverified e-mail cannot claim a profile');
select t.check(t.count('select * from public.goaltenders') = 0, 'unverified user sees nothing');
reset role;

select t.login('ffffffff-0000-0000-0000-000000000006');
select t.check(t.count('select * from public.published_videos') = 0, 'stranger sees no videos');
select t.check(public.claim_my_goaltender_profiles() = 0, 'stranger has nothing to claim');
select t.check(t.count('select * from storage.objects') = 0, 'stranger sees no files');
reset role;

select set_config('request.jwt.claims', '', false);
set role anon;
select t.denied('select * from public.published_videos', 'anonymous users have no table access');
select t.check(t.count('select * from storage.objects') = 0, 'anonymous users see no files');
reset role;

-- ---------------------------------------------------------------------------
-- Coach reads goaltender comments, then revokes access / changes e-mail
-- ---------------------------------------------------------------------------
select t.login('aaaaaaaa-0000-0000-0000-000000000001');
select t.check(t.count('select * from public.video_comments') = 1, 'coach reads the goaltender''s comment');
insert into public.video_comments (video_id, author_role, timestamp_ms, content)
  values ('22222222-0000-0000-0000-0000000000e1', 'trainer', 18000, 'Håll balansen längre efter förflyttningen.');
update public.goaltenders set access_revoked_at = now() where id = '11111111-0000-0000-0000-00000000e30a';
update public.goaltenders set email = 'william.new@mail.se' where id = '11111111-0000-0000-0000-00000000b35a';
select t.denied($$insert into storage.objects (bucket_id, name) values
  ('videos', 'aaaaaaaa-0000-0000-0000-000000000001/11111111-0000-0000-0000-00000000e30a/after-revoke.mov')$$,
  'no new uploads to a goaltender whose access is revoked');
reset role;

select t.login('eeeeeeee-0000-0000-0000-000000000003');
select t.check(t.count('select * from public.published_videos') = 0, 'revoked: Erik no longer sees coach A''s video');
select t.check(t.count('select * from storage.objects') = 0, 'revoked: Erik no longer reaches the file');
select t.check(t.count('select * from public.goaltenders') = 1, 'Erik still sees his profile with coach B');
reset role;

select t.login('cccccccc-0000-0000-0000-000000000004');
select t.check(t.count('select * from public.published_videos') = 0, 'e-mail changed: old account unlinked');
reset role;

-- ---------------------------------------------------------------------------
-- Deletion cascades (GDPR erasure)
-- ---------------------------------------------------------------------------
select t.login('aaaaaaaa-0000-0000-0000-000000000001');
delete from public.goaltenders where id = '11111111-0000-0000-0000-00000000e30a';
select t.check(t.count($$select * from public.published_videos where goaltender_id = '11111111-0000-0000-0000-00000000e30a'$$) = 0,
  'deleting a goaltender removes their published videos');
select t.check(t.count($$select * from public.video_comments where video_id = '22222222-0000-0000-0000-0000000000e1'$$) = 0,
  'and the comments on them');
reset role;

-- ---------------------------------------------------------------------------
-- Level limits, expiry and suspension
-- ---------------------------------------------------------------------------
-- Coach B is on Mini (1 goaltender, 100 bytes) and already has Erik.
select t.login('bbbbbbbb-0000-0000-0000-000000000002');
select t.denied($$insert into public.goaltenders (id, coach_id, first_name, email, consent_confirmed_at)
  values (gen_random_uuid(), auth.uid(), 'Second', 'second@mail.se', now())$$,
  'goaltender limit of the level is enforced');
select t.check(t.affected($$update public.goaltenders set last_name = 'Svensson' where id = '11111111-0000-0000-0000-00000000e30b'$$) = 1,
  'existing goaltenders can still be edited at the limit');
insert into storage.objects (bucket_id, name, metadata) values
  ('videos', 'bbbbbbbb-0000-0000-0000-000000000002/11111111-0000-0000-0000-00000000e30b/b1.mov', '{"size": 150}');
select t.check(true, 'upload allowed while under the storage limit');
select t.check((select used_storage_bytes = 150 and max_storage_bytes = 100 from public.my_coach_account()),
  'coach sees used and allowed storage');
select t.denied($$insert into storage.objects (bucket_id, name) values
  ('videos', 'bbbbbbbb-0000-0000-0000-000000000002/11111111-0000-0000-0000-00000000e30b/b2.mov')$$,
  'storage limit of the level is enforced');
reset role;

select t.login('99999999-0000-0000-0000-000000000009');
select t.check((select storage_bytes = 150 and goaltender_count = 1 from public.admin_list_coaches()
  where id = 'bbbbbbbb-0000-0000-0000-000000000002'), 'admin sees each coach''s usage');
select public.admin_update_coach('aaaaaaaa-0000-0000-0000-000000000001', 'active', 'start', current_date - 1);
select public.admin_update_coach('bbbbbbbb-0000-0000-0000-000000000002', 'suspended', 'plus', null);
reset role;

select t.login('aaaaaaaa-0000-0000-0000-000000000001');
select t.check(not (select is_active from public.my_coach_account()), 'expired payment makes the coach inactive');
select t.denied($$insert into storage.objects (bucket_id, name) values
  ('videos', 'aaaaaaaa-0000-0000-0000-000000000001/11111111-0000-0000-0000-00000000d01a/late.mov')$$,
  'no uploads after the paid period');
select t.denied($$insert into public.goaltenders (id, coach_id, first_name, email, consent_confirmed_at)
  values (gen_random_uuid(), auth.uid(), 'Late', 'late@mail.se', now())$$,
  'no new goaltenders after the paid period');
reset role;

select t.login('bbbbbbbb-0000-0000-0000-000000000002');
select t.denied($$insert into storage.objects (bucket_id, name) values
  ('videos', 'bbbbbbbb-0000-0000-0000-000000000002/11111111-0000-0000-0000-00000000e30b/b3.mov')$$,
  'suspended coach cannot upload, even on a larger level');
select t.check(t.affected($$update public.goaltenders set access_revoked_at = now() where id = '11111111-0000-0000-0000-00000000e30b'$$) = 1,
  'suspended coach can still revoke access');
select t.check(t.affected($$delete from public.goaltenders where id = '11111111-0000-0000-0000-00000000e30b'$$) = 1,
  'suspended coach can still erase a goaltender');
reset role;

-- ---------------------------------------------------------------------------
-- Clubs and teams (per coach)
-- ---------------------------------------------------------------------------
select t.login('aaaaaaaa-0000-0000-0000-000000000001');
insert into public.clubs (id, name) values ('c1000000-0000-0000-0000-00000000000a', 'Djurgården');
insert into public.teams (id, club_id, name, season)
  values ('7e000000-0000-0000-0000-00000000000a', 'c1000000-0000-0000-0000-00000000000a', 'J18', '2026/27');
select t.check(t.affected($$update public.goaltenders set team_id = '7e000000-0000-0000-0000-00000000000a'
  where id = '11111111-0000-0000-0000-00000000d01a'$$) = 1, 'coach places own goaltender in own team');
select t.denied($$insert into public.clubs (id, coach_id, name) values (gen_random_uuid(), 'bbbbbbbb-0000-0000-0000-000000000002', 'Fake')$$,
  'coach cannot create a club for another coach');
reset role;

select t.login('bbbbbbbb-0000-0000-0000-000000000002');
select t.check(t.count('select * from public.clubs') = 0 and t.count('select * from public.teams') = 0,
  'coach B sees none of coach A''s clubs or teams');
select t.denied($$insert into public.teams (club_id, name) values ('c1000000-0000-0000-0000-00000000000a', 'Intrång')$$,
  'coach B cannot add a team to coach A''s club');
select t.check(t.affected($$update public.clubs set name = 'Hackad'$$) = 0, 'coach B cannot rename coach A''s club');
select t.check(t.affected($$delete from public.teams$$) = 0, 'coach B cannot delete coach A''s teams');
insert into public.clubs (id, name) values ('c1000000-0000-0000-0000-00000000000b', 'AIK');
insert into public.teams (id, club_id, name) values ('7e000000-0000-0000-0000-00000000000b', 'c1000000-0000-0000-0000-00000000000b', 'U16');
select t.check(t.count('select * from public.teams') = 1, 'coach B sees only own team');
reset role;

select t.login('aaaaaaaa-0000-0000-0000-000000000001');
select t.denied($$update public.goaltenders set team_id = '7e000000-0000-0000-0000-00000000000b'
  where id = '11111111-0000-0000-0000-00000000d01a'$$, 'coach cannot place a goaltender in another coach''s team');
select t.denied($$update public.teams set club_id = 'c1000000-0000-0000-0000-00000000000b'$$,
  'coach cannot move a team into another coach''s club');
reset role;

select t.login('ffffffff-0000-0000-0000-000000000006');
select t.check(t.count('select * from public.clubs') = 0 and t.count('select * from public.teams') = 0,
  'other users see no clubs or teams');
reset role;
set role anon;
select t.denied('select * from public.clubs', 'anonymous users cannot read clubs');
reset role;

select t.login('aaaaaaaa-0000-0000-0000-000000000001');
delete from public.clubs where id = 'c1000000-0000-0000-0000-00000000000a';
select t.check(t.count('select * from public.teams') = 0, 'deleting a club deletes its teams');
select t.check(t.count($$select * from public.goaltenders where id = '11111111-0000-0000-0000-00000000d01a' and team_id is null$$) = 1,
  'goaltenders stay, without a team');
reset role;

-- Deleting clips: only the coach who published them
select t.login('bbbbbbbb-0000-0000-0000-000000000002');
select t.check(t.affected($$delete from public.published_videos where id = '22222222-0000-0000-0000-0000000000b1'$$) = 0,
  'coach B cannot delete coach A''s clip');
select t.check(t.affected($$delete from storage.objects where name like 'aaaaaaaa-%'$$) = 0,
  'coach B cannot delete coach A''s files');
reset role;
select t.login('aaaaaaaa-0000-0000-0000-000000000001');
select t.check(t.affected($$delete from public.published_videos where id = '22222222-0000-0000-0000-0000000000b1'$$) = 1,
  'coach A deletes own clip');
select t.check(t.affected($$delete from storage.objects where name like '%v-will.mov'$$) = 1, 'coach A deletes own file');
reset role;

\echo 'ALL RLS TESTS PASSED'
