#!/usr/bin/env bash
# Runs the portal's row-level-security tests against a throwaway PostgreSQL
# instance: Supabase stubs -> migrations -> supabase/tests/rls_test.sql.
# Requires PostgreSQL 15+ binaries (initdb, pg_ctl, psql) on PATH or PG_BIN.
set -euo pipefail

ROOT="$(cd "$(dirname "$0")/.." && pwd)"
PG_BIN="${PG_BIN:-$(dirname "$(command -v initdb 2>/dev/null || ls -d /usr/lib/postgresql/*/bin/initdb 2>/dev/null | sort -V | tail -1)")}"
WORK="$(mktemp -d)"
PORT="${PGTEST_PORT:-54329}"

# PostgreSQL refuses to run as root; use the postgres system user when needed.
as_pg() {
  if [ "$(id -u)" = "0" ]; then runuser -u postgres -- "$@"; else "$@"; fi
}
[ "$(id -u)" = "0" ] && chown postgres "$WORK"

cleanup() {
  as_pg "$PG_BIN/pg_ctl" -D "$WORK/data" -m immediate stop >/dev/null 2>&1 || true
  rm -rf "$WORK"
}
trap cleanup EXIT

as_pg "$PG_BIN/initdb" -D "$WORK/data" -U postgres --auth=trust >/dev/null
as_pg "$PG_BIN/pg_ctl" -D "$WORK/data" -o "-p $PORT -k $WORK -c listen_addresses=''" -l "$WORK/log" -w start >/dev/null

PSQL=("$PG_BIN/psql" -h "$WORK" -p "$PORT" -U postgres -d postgres -v ON_ERROR_STOP=1 -q -t -A)
as_pg "${PSQL[@]}" -f "$ROOT/supabase/tests/supabase_stubs.sql"
for f in "$ROOT"/supabase/migrations/*.sql; do
  as_pg "${PSQL[@]}" -f "$f"
done
as_pg "${PSQL[@]}" -f "$ROOT/supabase/tests/rls_test.sql" 2>&1 | sed 's/^psql:[^ ]* NOTICE:  /  /'
