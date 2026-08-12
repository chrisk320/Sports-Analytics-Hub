#!/usr/bin/env bash
# Clear and reload a season of NFL data.
#
#   ./scripts/reload_nfl.sh 2024
#
# Needed when the *selection* logic in sources/nfl_source.py changes, not just
# the stat values: the loader upserts, so it can correct a row it still emits
# but can never remove one it has stopped emitting. The offensive-producer
# filter is exactly that kind of change — it dropped ~1,400 players who were
# already in the table, and only a delete removes them.
#
# Scoped to sport='nfl' throughout. NBA rows are counted before and after so a
# mistake in that scoping is impossible to miss.
#
# The target database must be named explicitly — there is no default. This
# script deletes rows, and server/.env holds both a production URL and a test
# branch URL under similar names; defaulting to either one is how you reload
# the wrong database at 1am.
set -euo pipefail

SEASON="${1:-}"
DB_VAR="${2:-}"
if [[ -z "$SEASON" || -z "$DB_VAR" ]]; then
  cat >&2 <<USAGE
Usage: $0 <season> <ENV_VAR_HOLDING_THE_URL>

  $0 2024 MIGRATION_TEST_DATABASE_URL   # Neon test branch
  $0 2024 DATABASE_URL                  # production

Naming the variable is required so that the database you are about to
delete NFL rows from is a decision, not a default.
USAGE
  exit 1
fi

cd "$(dirname "$0")/.."

psql_url=$(grep -E "^${DB_VAR}=" .env | head -1 | cut -d= -f2- | tr -d '"'"'"'')
if [[ -z "$psql_url" ]]; then
  echo "No ${DB_VAR} in server/.env" >&2
  exit 1
fi

# Show host and database, not the URL — it carries a password.
echo "Target: $(psql "$psql_url" -tAc \
  "SELECT current_database() || ' @ ' || COALESCE(host(inet_server_addr()), 'local')") [\$${DB_VAR}]"
echo
echo "Before:"
psql "$psql_url" -c "
  SELECT p.sport,
         count(*) AS players,
         (SELECT count(*) FROM player_game_logs g WHERE g.sport = p.sport) AS logs
  FROM players p GROUP BY p.sport ORDER BY p.sport;"

read -r -p "Replace ALL sport='nfl' rows in \$${DB_VAR} with season $SEASON? [y/N] " ok
[[ "$ok" == "y" || "$ok" == "Y" ]] || { echo "Aborted."; exit 1; }

# The delete lives inside the loader's own transaction (--replace), not here.
# An earlier version deleted first and then shelled out to the loader, so a
# failed download left the table empty with no way back except another run.
# Now the download happens first and the delete+insert commit together: either
# the swap lands whole or the old rows are still there.
echo
echo "Reloading season $SEASON..."
cd python_scripts
# shellcheck disable=SC1091
source venv/bin/activate
# The loader reads DATABASE_URL. Pass the chosen URL through explicitly, or the
# delete and the reload would target different databases whenever DB_VAR is not
# DATABASE_URL. python-dotenv does not override variables already in the
# environment, so this wins over the .env entry.
DATABASE_URL="$psql_url" python fetch_nfl_stats.py --season "$SEASON" --replace
cd ..

echo
echo "After:"
psql "$psql_url" -c "
  SELECT p.sport,
         count(*) AS players,
         (SELECT count(*) FROM player_game_logs g WHERE g.sport = p.sport) AS logs
  FROM players p GROUP BY p.sport ORDER BY p.sport;"

echo
echo "NBA player and log counts above must be unchanged from 'Before'."
