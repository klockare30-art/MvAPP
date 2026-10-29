-- GoalieVision – egen ordning på klippen inom en match/träning
--
--   * sort_order: tränarens ordning (0, 1, 2 …) inom ett tillfälle. Målvakten och
--     tränaren ser klippen i den ordningen; null = i tidsordning (äldre klipp, iPad-appen).
--   * Bara tränaren som äger klippet kan ändra ordningen (befintlig policy videos_coach_update).
--   * Filen kan köras flera gånger.

alter table public.published_videos
  add column if not exists sort_order integer check (sort_order >= 0);

grant update (sort_order) on public.published_videos to authenticated;
