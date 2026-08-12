"""Load NFL player stats from nflverse into the multi-sport schema.

    python fetch_nfl_stats.py --season 2024           # whole season
    python fetch_nfl_stats.py --season 2024 --week 5  # one week
    TEST_MODE=1 python fetch_nfl_stats.py --season 2024   # dry run, no writes

Writes `players` (sport='nfl') and `player_game_logs` (sport='nfl'), with the
sport-specific numbers in the `stats` JSONB column added by the multi-sport
migration. The legacy pts/reb/ast columns stay NULL for NFL rows — they are
basketball columns and mean nothing here, which is precisely why the JSONB
blob exists.

Unlike the Basketball Reference scraper, the source is static Parquet on
GitHub Releases, so this runs fine from GitHub Actions and does not need the
residential-IP local cron.
"""

import os
import sys

import psycopg
from psycopg.types.json import Jsonb
from dotenv import load_dotenv

sys.path.insert(0, os.path.dirname(os.path.abspath(__file__)))
from sources.nfl_source import weekly_stats, schedules, STAT_COLUMNS

TEST_MODE = os.getenv("TEST_MODE", "").lower() in ("1", "true", "yes")

# nflverse "position" is what the market registry calls `role` — it decides
# which prop markets apply (a QB gets passing markets, a WR receiving ones).
ROLE_COLUMN = "position"


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


def season_string(season):
    """NFL seasons are single years; store as '2024' to match nflverse."""
    return str(season)


def build_game_dates(season):
    """(week, team) -> (game_date, game_id) for the season.

    Weekly stat rows have no date, so it has to come from the schedule. Both
    the home and away side are indexed so either team resolves.
    """
    sch = schedules(season)
    out = {}
    for _, g in sch.iterrows():
        for team in (g.get("home_team"), g.get("away_team")):
            if team:
                out[(int(g["week"]), team)] = (g.get("gameday"), g.get("game_id"))
    return out


def upsert_player(cur, row):
    """Find-or-create an NFL player, keyed on gsis_id where possible.

    Matching on gsis_id rather than name matters: the NFL has multiple active
    players sharing a name (two Josh Allens), so name-only matching would
    merge them into one row.
    """
    gsis = row["player_id"]
    cur.execute(
        "SELECT player_id FROM players WHERE sport = 'nfl' AND external_ids->>'gsis_id' = %s",
        (gsis,),
    )
    hit = cur.fetchone()
    if hit:
        cur.execute(
            """UPDATE players
               SET team_abbreviation = %s, position = %s,
                   headshot_url = COALESCE(%s, headshot_url)
               WHERE player_id = %s""",
            (row["team"], row[ROLE_COLUMN], row.get("headshot_url") or None, hit[0]),
        )
        return hit[0]

    cur.execute(
        """INSERT INTO players (full_name, team_abbreviation, headshot_url, sport, position, external_ids)
           VALUES (%s, %s, %s, 'nfl', %s, %s)
           RETURNING player_id""",
        (
            row["player_display_name"] or row["player_name"],
            row["team"],
            row.get("headshot_url") or None,
            row[ROLE_COLUMN],
            Jsonb({"gsis_id": gsis}),
        ),
    )
    return cur.fetchone()[0]


def log_params(player_id, row, game_date, game_ref, season_str):
    """Build the parameter tuple for one player-week."""
    stats = {c: (float(row[c]) if row[c] % 1 else int(row[c])) for c in STAT_COLUMNS if row[c]}
    stats["week"] = int(row["week"])
    return (
        player_id,
        season_str,
        game_date,
        row["opponent_team"],
        row[ROLE_COLUMN],
        row["team"],
        game_ref,
        Jsonb(stats),
    )


# Batched, because a full season is ~18k rows and one round trip per row over a
# remote Postgres takes tens of minutes. executemany() pipelines the whole batch
# into a single flush.
INSERT_LOG_SQL = """
    INSERT INTO player_game_logs
      (player_id, season, game_date, opponent, sport, role, team, game_ref, stats)
    VALUES (%s, %s, %s, %s, 'nfl', %s, %s, %s, %s)
    ON CONFLICT (player_id, season, game_date, game_seq, role) DO UPDATE
    SET opponent = EXCLUDED.opponent,
        team     = EXCLUDED.team,
        game_ref = EXCLUDED.game_ref,
        stats    = player_game_logs.stats || EXCLUDED.stats
"""


def flush_logs(cur, batch):
    if batch:
        cur.executemany(INSERT_LOG_SQL, batch)


def run(season, week=None, replace=False):
    season_str = season_string(season)
    print("=" * 60)
    print(f"NFL stats from nflverse — season {season}" + (f", week {week}" if week else ""))
    print("=" * 60)

    df = weekly_stats(season)
    if week:
        df = df[df["week"] == int(week)]
    if df.empty:
        print("No rows for that selection.")
        return

    dates = build_game_dates(season)
    print(f"Rows to load: {len(df):,}  ({df['player_id'].nunique():,} distinct players)")

    if TEST_MODE:
        print("\n** TEST_MODE — DRY RUN, nothing written **\n")
        for _, r in df.sort_values("passing_yards", ascending=False).head(5).iterrows():
            gd, _ = dates.get((int(r["week"]), r["team"]), (None, None))
            print(f"  {r['player_display_name']:24} {r['position']:3} {r['team']:3} "
                  f"wk{int(r['week']):<2} vs {r['opponent_team']:3} {gd}  "
                  f"{int(r['passing_yards'])} pass / {int(r['rushing_yards'])} rush / {int(r['receiving_yards'])} rec")
        return

    inserted = skipped = 0
    with get_db_connection() as conn:
        with conn.cursor() as cur:
            cur.execute("SELECT current_database()")
            print(f"Connected to {cur.fetchone()[0]}\n")

            if replace:
                # Inside the same transaction as the inserts below, and only
                # after the source data is in hand. The loader upserts, so it
                # can correct a row it still emits but never remove one it has
                # stopped emitting -- changing which players qualify needs a
                # delete. Doing that here rather than in a separate step means
                # a download failure aborts before anything is removed, instead
                # of leaving the table empty.
                cur.execute("DELETE FROM player_game_logs WHERE sport = 'nfl'")
                logs_gone = cur.rowcount
                cur.execute("DELETE FROM players WHERE sport = 'nfl'")
                print(f"Replacing: removed {logs_gone:,} logs / {cur.rowcount:,} players\n")

            # Players first. One row per DISTINCT player (~2k for a season),
            # not per player-week, so this stays a manageable number of trips.
            player_cache = {}
            latest = df.sort_values("week").groupby("player_id").tail(1)
            print(f"Upserting {len(latest):,} players...")
            for _, r in latest.iterrows():
                player_cache[r["player_id"]] = upsert_player(cur, r)

            # Then the game logs, batched.
            print(f"Writing {len(df):,} game logs...")
            batch = []
            for _, r in df.iterrows():
                game_date, game_ref = dates.get((int(r["week"]), r["team"]), (None, None))
                if not game_date:
                    skipped += 1
                    continue
                pid = player_cache.get(r["player_id"])
                if pid is None:
                    skipped += 1
                    continue
                batch.append(log_params(pid, r, game_date, game_ref, season_str))
                inserted += 1
                if len(batch) >= 1000:
                    flush_logs(cur, batch)
                    batch = []
                    print(f"  {inserted:,} rows...", flush=True)
            flush_logs(cur, batch)
        conn.commit()

    print("\n" + "=" * 60)
    print(f"Done. {inserted:,} game logs, {len(player_cache):,} players."
          + (f" {skipped} rows skipped (no scheduled game matched)." if skipped else ""))
    print("=" * 60)


if __name__ == "__main__":
    args = sys.argv[1:]
    season, week = None, None
    replace = "--replace" in args
    for i, a in enumerate(args):
        if a == "--season" and i + 1 < len(args):
            season = int(args[i + 1])
        if a == "--week" and i + 1 < len(args):
            week = int(args[i + 1])
    if not season:
        print("Usage: python fetch_nfl_stats.py --season YYYY [--week N] [--replace]")
        print("  --replace  drop existing NFL rows and reload, atomically")
        sys.exit(1)
    if replace and week:
        print("--replace clears the whole sport, so pair it with --season, not --week.")
        sys.exit(1)
    run(season, week, replace=replace)
