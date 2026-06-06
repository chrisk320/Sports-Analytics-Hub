"""
Backfill Basketball Reference game logs + advanced box scores for a date range.

Why this exists: the bulk scrapers (fetch_bref_all_stats / the `main()` in
fetch_bref_advanced_stats) stop at the regular-season end date, so the playoffs
never got scraped. The DAILY scrapers pull by date from the box-score pages
(which DO include playoff games) but only ran a couple of times. This backfills
every date in [--start, --end] (default end = yesterday) by reusing the daily
scrapers' proven per-date logic. Idempotent — safe to re-run (upserts).

Usage:
    python fetch_bref_backfill.py --start 2026-04-13 [--end 2026-06-04]
"""
import argparse
from datetime import date, datetime, timedelta

import fetch_bref_yesterdays_games as G
import fetch_bref_advanced_stats as A


def parse_date(s):
    return datetime.strptime(s, "%Y-%m-%d").date()


def daterange(start, end):
    d = start
    while d <= end:
        yield d
        d += timedelta(days=1)


def backfill_date(conn, d):
    """Scrape one date: basic box scores -> game logs, then advanced -> ratings."""
    season = G.get_season_string(d)
    home_teams = G.get_games_on_date(d)
    if not home_teams:
        print(f"{d}: no games")
        return 0, 0

    print(f"{d}: {len(home_teams)} game(s) -> {', '.join(home_teams)} [{season}]")
    logs = adv = 0
    for home in home_teams:
        # basic box score (both teams) -> player_game_logs
        # Slightly longer delays than the daily script: this run makes ~200
        # requests, so stay well under Basketball Reference's rate limit.
        G.random_delay(4, 7)
        for s in G.fetch_box_scores_for_game(d, home):
            pid = G.get_or_create_player(conn, s["name"], s["team"])
            if G.insert_game_log(conn, pid, d, s["opponent"], s, season):
                logs += 1
        conn.commit()

        # advanced box score (same page, advanced table) -> advanced_box_scores
        A.random_delay(4, 7)
        for s in A.fetch_advanced_box_score(d, home):
            glid = A.get_game_log_id(conn, s["name"], d, season)
            if glid and A.upsert_advanced_stats(conn, glid, s):
                adv += 1
        conn.commit()

    print(f"    -> {logs} game logs, {adv} advanced rows")
    return logs, adv


def main():
    ap = argparse.ArgumentParser()
    ap.add_argument("--start", required=True, type=parse_date, help="YYYY-MM-DD (inclusive)")
    ap.add_argument(
        "--end",
        type=parse_date,
        default=date.today() - timedelta(days=1),
        help="YYYY-MM-DD (inclusive, default: yesterday)",
    )
    args = ap.parse_args()

    print("=" * 60)
    print(f"Backfill {args.start} -> {args.end}")
    print("=" * 60)

    conn = G.get_db_connection()
    G.log_connection_info(conn)
    G.setup_database(conn)

    tot_logs = tot_adv = 0
    for d in daterange(args.start, args.end):
        l, a = backfill_date(conn, d)
        tot_logs += l
        tot_adv += a

    conn.close()
    print("=" * 60)
    print(f"Done. {tot_logs} game logs, {tot_adv} advanced rows inserted/updated.")
    print("=" * 60)


if __name__ == "__main__":
    main()
