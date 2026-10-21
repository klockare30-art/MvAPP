/**
 * Turns database errors into Swedish messages. A missing table/column/function
 * almost always means a migration has not been run in Supabase → name the file.
 */
const MIGRATIONS: { match: RegExp; file: string; what: string }[] = [
  { match: /session_kind/, file: '20261020000000_session_kind.sql', what: 'match/träning' },
  { match: /coach_tag_types|save_my_tag_types/, file: '20261019000000_tag_types.sql', what: 'egna taggar' },
  { match: /\bclubs\b|\bteams\b|team_id|caller_owns_(club|team)/, file: '20261018000000_clubs_teams.sql', what: 'klubbar och lag' },
  { match: /\bplans\b|my_coach_account|admin_|is_admin|caller_|paid_until|plan_id/, file: '20261016000000_coach_access.sql', what: 'admin och nivåer' },
];

// Postgres: undefined table/column/function; PostgREST: not in schema cache.
const MISSING_CODES = new Set(['42P01', '42703', '42883', 'PGRST202', 'PGRST204', 'PGRST205']);

export function explainDbError(error: { message: string; code?: string; details?: string; hint?: string }): string {
  const text = [error.message, error.details, error.hint].filter(Boolean).join(' ');
  const missing =
    (error.code != null && MISSING_CODES.has(error.code)) ||
    /does not exist|could not find the (table|function)|schema cache/i.test(text);
  if (missing) {
    const m = MIGRATIONS.find((x) => x.match.test(text));
    return m
      ? `Databasen saknar uppdateringen för ${m.what}. Kör filen supabase/migrations/${m.file} i Supabase → SQL Editor. (${error.message})`
      : `Databasen saknar en uppdatering. Kör de senaste filerna i supabase/migrations i Supabase → SQL Editor. (${error.message})`;
  }
  if (error.code === '42501' || /row-level security/i.test(text)) {
    return `Åtgärden nekades av behörighetsreglerna. Kontrollera att ditt tränarkonto är godkänt och att nivåns gränser inte är nådda. (${error.message})`;
  }
  return error.message;
}
