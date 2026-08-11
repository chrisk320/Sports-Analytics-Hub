"""Exercise the loader's database write path, then roll back.

Answers "does the database still work after the multi-sport migration?" by
calling the REAL functions the nightly job uses — not a reimplementation — so a
schema change that breaks the loader fails here instead of at 6am in cron.

Everything runs inside a transaction that is always rolled back, so it is safe
against any database, including production.

    python test_db_writes.py                              # tests MIGRATION_TEST_DATABASE_URL
    python test_db_writes.py DATABASE_URL                 # tests production (read-only in effect)

Exits non-zero if any check fails.
"""
import sys
import os

sys.path.insert(0, os.path.dirname(os.path.abspath(__file__)))

import psycopg
from dotenv import dotenv_values

from fetch_bref_all_stats import insert_game_log, upsert_advanced_stats, get_or_create_player

ENV_PATH = os.path.join(os.path.dirname(os.path.abspath(__file__)), "..", ".env")

# A realistic game line, matching the dict shape fetch_all_stats_for_game() builds.
SAMPLE = {
    "opponent": "BOS", "min": 34.5, "pts": 30, "reb": 8, "ast": 6, "stl": 2, "blk": 1,
    "ts_pct": 61.2, "efg_pct": 58.0, "ortg": 118, "drtg": 105, "net_rtg": 13, "usg_pct": 29.4,
}

# What the migration's backfill produces for the same numbers. The loader must
# agree key-for-key, or blobs written tonight differ from blobs written by the
# backfill and downstream readers see two shapes.
EXPECTED_BLOB = {
    "min": 34.5, "pts": 30, "reb": 8, "ast": 6, "stl": 2, "blk": 1,
    "off_rating": 118, "def_rating": 105, "net_rating": 13,
    "efg_pct": 58.0, "ts_pct": 61.2, "usg_pct": 29.4,
}

failures = []


def check(name, ok, detail=""):
    print(f"  {'ok  ' if ok else 'FAIL'} {name}{'' if ok else '  <- ' + str(detail)}")
    if not ok:
        failures.append(name)


def main():
    var = sys.argv[1] if len(sys.argv) > 1 else "MIGRATION_TEST_DATABASE_URL"
    url = dotenv_values(ENV_PATH).get(var)
    if not url:
        print(f"FAIL: {var} not found in server/.env")
        return 1

    conn = psycopg.connect(url, sslmode="require")
    conn.autocommit = False
    with conn.cursor() as c:
        c.execute("SELECT current_database()")
        print(f"Testing loader write path against {var} ({c.fetchone()[0]})\n")

    try:
        # 1. Player upsert — exercises the SERIAL sequence that was out of sync.
        pid = get_or_create_player(conn, "ZZ Migration Testcase", "BOS")
        check("get_or_create_player returns an id", pid is not None, pid)

        # 2. Basic game log write (legacy columns + JSONB blob).
        gid = insert_game_log(conn, pid, "2026-08-11", SAMPLE, "2025-26")
        check("insert_game_log returns a game_log_id", gid is not None, gid)

        with conn.cursor() as c:
            c.execute("SELECT pts, reb, ast, stats, sport, role, game_seq FROM player_game_logs WHERE game_log_id=%s", (gid,))
            pts, reb, ast, blob, sport, role, seq = c.fetchone()

        check("legacy columns written", (pts, reb, ast) == (30, 8, 6), (pts, reb, ast))
        check("sport defaults to 'nba'", sport == "nba", sport)
        check("role defaults to ''", role == "", repr(role))
        check("game_seq defaults to 1", seq == 1, seq)
        check("blob has basic keys only so far", set(blob) == {"min", "pts", "reb", "ast", "stl", "blk"}, sorted(blob))

        # 3. Advanced stats land in a SEPARATE pass and must merge, not replace.
        upsert_advanced_stats(conn, gid, SAMPLE)
        with conn.cursor() as c:
            c.execute("SELECT stats FROM player_game_logs WHERE game_log_id=%s", (gid,))
            blob = c.fetchone()[0]
        check("blob matches the migration's key set", blob == EXPECTED_BLOB, blob)

        with conn.cursor() as c:
            c.execute("SELECT offensive_rating FROM advanced_box_scores WHERE game_log_id=%s", (gid,))
            row = c.fetchone()
        check("advanced_box_scores row written", row is not None and row[0] == 118, row)

        # 4. Re-running the basic write must not clobber the advanced keys. This is
        #    the subtle one: a plain `stats = EXCLUDED.stats` would silently drop them.
        insert_game_log(conn, pid, "2026-08-11", SAMPLE, "2025-26")
        with conn.cursor() as c:
            c.execute("SELECT stats FROM player_game_logs WHERE game_log_id=%s", (gid,))
            blob = c.fetchone()[0]
        check("advanced keys survive a re-run", blob == EXPECTED_BLOB, blob)

        # 5. The upsert must update in place, not create duplicate rows.
        with conn.cursor() as c:
            c.execute("SELECT count(*) FROM player_game_logs WHERE player_id=%s AND game_date='2026-08-11'", (pid,))
            n = c.fetchone()[0]
        check("re-run updates in place (no duplicate row)", n == 1, n)

        # 6. Multi-sport identity: a second role for the same game is a DIFFERENT
        #    row (the MLB two-way case), while a true duplicate is rejected.
        with conn.cursor() as c:
            c.execute("""INSERT INTO player_game_logs (player_id, season, game_date, role, sport, stats)
                         VALUES (%s,'2025-26','2026-08-11','pitcher','mlb','{}'::jsonb)""", (pid,))
            c.execute("SELECT count(*) FROM player_game_logs WHERE player_id=%s AND game_date='2026-08-11'", (pid,))
            check("different role = separate row", c.fetchone()[0] == 2)

        try:
            with conn.cursor() as c:
                c.execute("""INSERT INTO player_game_logs (player_id, season, game_date, role, sport, stats)
                             VALUES (%s,'2025-26','2026-08-11','pitcher','mlb','{}'::jsonb)""", (pid,))
            check("true duplicate rejected", False, "insert unexpectedly succeeded")
        except psycopg.errors.UniqueViolation:
            check("true duplicate rejected", True)

    finally:
        conn.rollback()
        conn.close()

    print("\nRolled back — no rows were kept.")
    if failures:
        print(f"{len(failures)} check(s) FAILED: {', '.join(failures)}")
        return 1
    print("All checks passed.")
    return 0


if __name__ == "__main__":
    sys.exit(main())
