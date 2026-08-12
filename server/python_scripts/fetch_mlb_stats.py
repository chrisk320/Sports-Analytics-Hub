"""Load MLB player stats from the MLB Stats API into the multi-sport schema.

    python fetch_mlb_stats.py --start 2026-04-01 --end 2026-08-10
    python fetch_mlb_stats.py --season 2026                # whole season to date
    python fetch_mlb_stats.py --season 2026 --replace      # atomic full reload
    TEST_MODE=1 python fetch_mlb_stats.py --start 2026-08-08 --end 2026-08-08

Writes `players` (sport='mlb') and `player_game_logs` (sport='mlb'), with the
batting or pitching line in the `stats` JSONB column.

A player who both bats and pitches produces TWO rows for one game -- one per
role. That is exactly what `role` in the (player_id, season, game_date,
game_seq, role) identity key is for, and why the reload path below never
collapses them.

Data courtesy of MLB Advanced Media. Attribution required, non-commercial use
only: http://gdx.mlb.com/components/copyright.txt
"""

import os
import sys
from datetime import date

import psycopg
from psycopg.types.json import Jsonb
from dotenv import load_dotenv

sys.path.insert(0, os.path.dirname(os.path.abspath(__file__)))
from sources.mlb_source import schedule, boxscores, headshot_url

TEST_MODE = os.getenv("TEST_MODE", "").lower() in ("1", "true", "yes")

BATCH_SIZE = 1000


def get_db_connection():
    load_dotenv()
    url = os.getenv("DATABASE_URL")
    if url:
        return psycopg.connect(url, sslmode="require")
    return psycopg.connect(
        dbname=os.getenv("PGDATABASE", "nba_stats"),
        user=os.getenv("PGUSER", "christiankim"),
        password=os.getenv("PGPASSWORD", ""),
        host=os.getenv("PGHOST", "localhost"),
        port=os.getenv("PGPORT", "5432"),
    )


def upsert_player(cur, row):
    """Find-or-create an MLB player, keyed on the MLBAM person id.

    Keyed on the id rather than the name for the same reason as the NFL loader:
    name collisions across a 1,200-player pool are routine, and merging two
    players into one row corrupts both their game logs.
    """
    mlbam = row["mlbam_id"]
    cur.execute(
        "SELECT player_id FROM players WHERE sport = 'mlb' AND external_ids->>'mlbam_id' = %s",
        (str(mlbam),),
    )
    hit = cur.fetchone()
    if hit:
        cur.execute(
            """UPDATE players SET team_abbreviation = %s, position = %s
               WHERE player_id = %s""",
            (row["team"], row["position"], hit[0]),
        )
        return hit[0]

    cur.execute(
        """INSERT INTO players (full_name, team_abbreviation, headshot_url, sport, position, external_ids)
           VALUES (%s, %s, %s, 'mlb', %s, %s)
           RETURNING player_id""",
        (
            row["name"],
            row["team"],
            headshot_url(mlbam),
            row["position"],
            Jsonb({"mlbam_id": str(mlbam)}),
        ),
    )
    return cur.fetchone()[0]


INSERT_LOG_SQL = """
    INSERT INTO player_game_logs
      (player_id, season, game_date, opponent, sport, role, team, game_ref, game_seq, stats)
    VALUES (%s, %s, %s, %s, 'mlb', %s, %s, %s, %s, %s)
    ON CONFLICT (player_id, season, game_date, game_seq, role) DO UPDATE
    SET opponent = EXCLUDED.opponent,
        team     = EXCLUDED.team,
        game_ref = EXCLUDED.game_ref,
        stats    = player_game_logs.stats || EXCLUDED.stats
"""


def season_bounds(season):
    """Regular season roughly spans late March to early October."""
    end = date.today().isoformat() if int(season) == date.today().year else f"{season}-11-01"
    return f"{season}-03-01", end


def run(start, end, replace=False, season_for_replace=None):
    print("=" * 60)
    print(f"MLB stats from statsapi.mlb.com — {start} to {end}")
    print("=" * 60)

    games = list(schedule(start, end))
    if not games:
        print("No completed regular-season games in that range.")
        return
    print(f"Completed games: {len(games):,}")

    if TEST_MODE:
        print("\n** TEST_MODE — DRY RUN, nothing written **\n")
        g, lines = next(iter(boxscores(games[:1])))
        print(f"  {g['away']} @ {g['home']}  {g['game_date']}  (gamePk {g['game_pk']})")
        for r in lines[:6]:
            top = {k: v for k, v in sorted(r["stats"].items()) if v}
            print(f"    {r['name']:24} {r['role']:8} {r['team']:3} {top}")
        print(f"    ... {len(lines)} lines total")
        return

    inserted = players_seen = 0
    with get_db_connection() as conn:
        with conn.cursor() as cur:
            cur.execute("SELECT current_database()")
            print(f"Connected to {cur.fetchone()[0]}\n")

            if replace:
                # Inside the same transaction as the inserts, and only after the
                # schedule call has succeeded. Deleting in a separate step means
                # a mid-run failure leaves the table empty with no way back.
                cur.execute("DELETE FROM player_game_logs WHERE sport = 'mlb'")
                logs_gone = cur.rowcount
                cur.execute("DELETE FROM players WHERE sport = 'mlb'")
                print(f"Replacing: removed {logs_gone:,} logs / {cur.rowcount:,} players\n")

            player_cache = {}
            batch = []
            print(f"Fetching {len(games):,} boxscores...")
            for g, lines in boxscores(games, progress=lambda i: print(f"  {i:,} games...", flush=True)):
                for r in lines:
                    if not r["mlbam_id"] or not r["team"]:
                        continue
                    pid = player_cache.get(r["mlbam_id"])
                    if pid is None:
                        pid = upsert_player(cur, r)
                        player_cache[r["mlbam_id"]] = pid
                        players_seen += 1
                    opponent = g["away"] if r["team"] == g["home"] else g["home"]
                    batch.append((
                        pid, g["season"], g["game_date"], opponent, r["role"],
                        r["team"], str(g["game_pk"]), g["game_seq"], Jsonb(r["stats"]),
                    ))
                    inserted += 1
                if len(batch) >= BATCH_SIZE:
                    cur.executemany(INSERT_LOG_SQL, batch)
                    batch = []
            if batch:
                cur.executemany(INSERT_LOG_SQL, batch)
        conn.commit()

    print("\n" + "=" * 60)
    print(f"Done. {inserted:,} game logs, {players_seen:,} players, {len(games):,} games.")
    print("=" * 60)


if __name__ == "__main__":
    args = sys.argv[1:]

    def opt(name):
        return args[args.index(name) + 1] if name in args and args.index(name) + 1 < len(args) else None

    replace = "--replace" in args
    season, start, end = opt("--season"), opt("--start"), opt("--end")

    if season:
        start, end = season_bounds(season)
    if not (start and end):
        print("Usage: python fetch_mlb_stats.py (--season YYYY | --start YYYY-MM-DD --end YYYY-MM-DD) [--replace]")
        print("  --replace  drop existing MLB rows and reload, atomically")
        sys.exit(1)
    if replace and not season:
        print("--replace clears the whole sport, so pair it with --season, not a date range.")
        sys.exit(1)

    run(start, end, replace=replace)
