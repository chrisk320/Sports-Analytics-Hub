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
# Reads DATABASE_URL from server/.env. Point that at whichever database you
# mean to touch before running — this deletes rows.
set -euo pipefail

SEASON="${1:-}"
if [[ -z "$SEASON" ]]; then
  echo "Usage: $0 <season>   e.g. $0 2024" >&2
  exit 1
fi

cd "$(dirname "$0")/.."

psql_url=$(grep -E '^DATABASE_URL=' .env | head -1 | cut -d= -f2- | tr -d '"'"'"'')
if [[ -z "$psql_url" ]]; then
  echo "No DATABASE_URL in server/.env" >&2
  exit 1
fi

echo "Target: $(psql "$psql_url" -tAc 'SELECT current_database()')"
echo
echo "Before:"
psql "$psql_url" -c "
  SELECT p.sport,
         count(*) AS players,
         (SELECT count(*) FROM player_game_logs g WHERE g.sport = p.sport) AS logs
  FROM players p GROUP BY p.sport ORDER BY p.sport;"

read -r -p "Delete ALL sport='nfl' rows and reload season $SEASON? [y/N] " ok
[[ "$ok" == "y" || "$ok" == "Y" ]] || { echo "Aborted."; exit 1; }

# Logs first: player_game_logs.player_id references players.
psql "$psql_url" -v ON_ERROR_STOP=1 -c "
  BEGIN;
  DELETE FROM player_game_logs WHERE sport = 'nfl';
  DELETE FROM players          WHERE sport = 'nfl';
  COMMIT;"

echo
echo "Reloading season $SEASON..."
cd python_scripts
# shellcheck disable=SC1091
source venv/bin/activate
python fetch_nfl_stats.py --season "$SEASON"
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
