-- GoalieVision – match eller träning per publicerat klipp
--
--   * session_kind: 'match' (matchtaggning) eller 'traning' (iPad-appens träningspass).
--   * Äldre klipp får null och visas som "Utan typ" tills tränaren ändrar dem.
--   * Filen kan köras flera gånger.

alter table public.published_videos
  add column if not exists session_kind text check (session_kind in ('match', 'traning'));

grant update (session_kind) on public.published_videos to authenticated;
