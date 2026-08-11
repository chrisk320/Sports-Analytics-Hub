#!/usr/bin/env bash
# Post-migration integrity check.
#
# Run this immediately after `npm run migrate:up` against any database to prove
# the multi-sport migration preserved existing data. It is read-only.
#
#   ./scripts/verify_migration.sh                      # checks DATABASE_URL (production)
#   ./scripts/verify_migration.sh MIGRATION_TEST_DATABASE_URL   # checks the Neon branch
#
# Exits non-zero if any check fails, so it can gate a deploy.

set -uo pipefail
cd "$(dirname "$0")/.."

VAR="${1:-DATABASE_URL}"
URL=$(grep "^${VAR}" .env | cut -d= -f2- | tr -d '"'"'"' ')
if [ -z "$URL" ]; then echo "FAIL: $VAR not found in server/.env"; exit 1; fi

q() { psql "$URL" -tAc "$1" 2>/dev/null | tr -d ' '; }
fails=0
check() { # name expected actual
  if [ "$2" = "$3" ]; then printf "  ok   %-46s %s\n" "$1" "$3"
  else printf "  FAIL %-46s got %s, want %s\n" "$1" "$3" "$2"; fails=$((fails+1)); fi
}

echo "Verifying $VAR ($(q "SELECT current_database()"))"
echo

echo "Migrations applied:"
q "SELECT name FROM pgmigrations ORDER BY id" | sed 's/^/  /'
check "migration count" "6" "$(q "SELECT count(*) FROM pgmigrations")"
echo

echo "Data integrity — the JSONB blob must equal the source columns:"
check "basic stat mismatches" "0" "$(q "
  SELECT count(*) FROM player_game_logs
  WHERE (stats->>'pts')::int IS DISTINCT FROM pts
     OR (stats->>'reb')::int IS DISTINCT FROM reb
     OR (stats->>'ast')::int IS DISTINCT FROM ast
     OR (stats->>'stl')::int IS DISTINCT FROM stl
     OR (stats->>'blk')::int IS DISTINCT FROM blk")"
check "advanced stat mismatches" "0" "$(q "
  SELECT count(*) FROM player_game_logs g JOIN advanced_box_scores a USING (game_log_id)
  WHERE (g.stats->>'ts_pct')::real     IS DISTINCT FROM a.true_shooting_percentage
     OR (g.stats->>'usg_pct')::real    IS DISTINCT FROM a.usage_percentage
     OR (g.stats->>'off_rating')::real IS DISTINCT FROM a.offensive_rating")"
check "rows left with an empty blob" "0" "$(q "SELECT count(*) FROM player_game_logs WHERE stats = '{}'::jsonb")"
echo

echo "Sport discriminator:"
check "game logs not tagged 'nba'" "0" "$(q "SELECT count(*) FROM player_game_logs WHERE sport <> 'nba'")"
check "players not tagged 'nba'"   "0" "$(q "SELECT count(*) FROM players WHERE sport <> 'nba'")"
echo

echo "Schema objects:"
check "identity constraint present" "1" "$(q "SELECT count(*) FROM pg_constraint WHERE conname='player_game_logs_identity_key'")"
check "old unique constraint gone"  "0" "$(q "SELECT count(*) FROM pg_constraint WHERE conname='player_game_logs_player_id_season_game_date_key'")"
check "role is NOT NULL"            "NO" "$(q "SELECT is_nullable FROM information_schema.columns WHERE table_name='player_game_logs' AND column_name='role'")"
check "rows with NULL role"         "0" "$(q "SELECT count(*) FROM player_game_logs WHERE role IS NULL")"
check "players sequence in sync"    "$(q "SELECT max(player_id) FROM players")" "$(q "SELECT last_value FROM players_player_id_seq")"
echo

echo "Row counts (compare against your pre-migration numbers):"
psql "$URL" -tAc "
  SELECT 'players' t, count(*) c FROM players
  UNION ALL SELECT 'player_game_logs', count(*) FROM player_game_logs
  UNION ALL SELECT 'advanced_box_scores', count(*) FROM advanced_box_scores
  UNION ALL SELECT 'player_props', count(*) FROM player_props
  UNION ALL SELECT 'teams', count(*) FROM teams
  UNION ALL SELECT 'user_favorites', count(*) FROM user_favorites" 2>/dev/null \
  | awk -F'|' '{printf "  %-22s %s\n", $1":", $2}'
echo

if [ "$fails" -eq 0 ]; then echo "All checks passed."; else echo "$fails check(s) FAILED — do not wire this into the Render build command yet."; fi
exit "$fails"
