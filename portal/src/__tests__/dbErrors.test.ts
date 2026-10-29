import { describe, expect, test } from 'vitest';

import { explainDbError } from '../dbErrors';

describe('database error messages', () => {
  test('a missing table or column names the migration to run', () => {
    expect(explainDbError({ code: '42703', message: 'column goaltenders.team_id does not exist' })).toContain('20261018000000_clubs_teams.sql');
    expect(explainDbError({ code: 'PGRST205', message: "Could not find the table 'public.clubs' in the schema cache" })).toContain('klubbar och lag');
    expect(explainDbError({ code: 'PGRST202', message: 'Could not find the function public.save_my_tag_types(p_types) in the schema cache' })).toContain('tag_types.sql');
    expect(explainDbError({ code: 'PGRST204', message: "Could not find the 'session_kind' column of 'published_videos' in the schema cache" })).toContain('20261020000000_session_kind.sql');
    expect(explainDbError({ code: 'PGRST204', message: "Could not find the 'sort_order' column of 'published_videos' in the schema cache" })).toContain('20261029000000_clip_order.sql');
    expect(explainDbError({ code: 'PGRST202', message: 'Could not find the function public.my_coach_account without parameters in the schema cache' })).toContain('coach_access.sql');
  });
  test('permission errors get a hint, other errors pass through', () => {
    expect(explainDbError({ code: '42501', message: 'new row violates row-level security policy for table "teams"' })).toContain('godkänt');
    expect(explainDbError({ code: '23505', message: 'duplicate key' })).toBe('duplicate key');
  });
});
