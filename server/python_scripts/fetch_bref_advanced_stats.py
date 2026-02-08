"""
Fetch advanced box score stats from Basketball Reference.

This script scrapes the advanced box score tables from Basketball Reference
to get offensive/defensive ratings, usage percentage, etc.

Stats fetched:
- offensive_rating (ORtg)
- defensive_rating (DRtg)
- net_rating (calculated: ORtg - DRtg)
- effective_fg_percentage (eFG%)
- true_shooting_percentage (TS%)
- usage_percentage (USG%)

Run this after fetch_bref_rosters_and_logs.py or fetch_bref_yesterdays_games.py.
"""

import os
import sys
import time
import random
import re
from datetime import date, timedelta
from io import StringIO

import requests
import pandas as pd
import psycopg
from dotenv import load_dotenv

# Configuration
TEST_MODE = True
SEASON_STRING = "2025-26"

# Season date ranges
SEASON_START_DATES = {
    2024: date(2023, 10, 24),
    2025: date(2024, 10, 22),
    2026: date(2025, 10, 21),
}

SEASON_END_DATES = {
    2024: date(2024, 4, 14),
    2025: date(2025, 4, 13),
    2026: date(2026, 4, 12),
}

# Basketball Reference team abbreviations (some differ from standard)
TEAM_ABBR_MAP = {
    "ATL": "ATL", "BOS": "BOS", "BRK": "BKN", "BKN": "BKN",
    "CHA": "CHA", "CHI": "CHI", "CLE": "CLE", "DAL": "DAL",
    "DEN": "DEN", "DET": "DET", "GSW": "GSW", "HOU": "HOU",
    "IND": "IND", "LAC": "LAC", "LAL": "LAL", "MEM": "MEM",
    "MIA": "MIA", "MIL": "MIL", "MIN": "MIN", "NOP": "NOP",
    "NYK": "NYK", "OKC": "OKC", "ORL": "ORL", "PHI": "PHI",
    "PHO": "PHX", "PHX": "PHX", "POR": "POR", "SAC": "SAC",
    "SAS": "SAS", "TOR": "TOR", "UTA": "UTA", "WAS": "WAS",
}

# Request headers to avoid blocking
HEADERS = {
    "User-Agent": "Mozilla/5.0 (Macintosh; Intel Mac OS X 10_15_7) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/120.0.0.0 Safari/537.36",
    "Accept": "text/html,application/xhtml+xml,application/xml;q=0.9,image/webp,*/*;q=0.8",
    "Accept-Language": "en-US,en;q=0.5",
    "Connection": "keep-alive",
}


def get_db_connection():
    """Get a database connection."""
    load_dotenv()
    database_url = os.getenv("DATABASE_URL")
    if database_url:
        return psycopg.connect(database_url, sslmode="require")

    return psycopg.connect(
        dbname=os.getenv("PGDATABASE", "nba_stats"),
        user=os.getenv("PGUSER", "christiankim"),
        password=os.getenv("PGPASSWORD", ""),
        host=os.getenv("PGHOST", "localhost"),
        port=os.getenv("PGPORT", "5432"),
    )


def log_connection_info(conn):
    """Log database connection details."""
    info = conn.info
    print(f"Connected to DB: {info.dbname} as {info.user}@{info.host}:{info.port}")


def random_delay(min_sec=3, max_sec=5):
    """Add delay to respect rate limits."""
    time.sleep(random.uniform(min_sec, max_sec))


def get_games_on_date(target_date):
    """Get list of games (home team abbreviations) for a date."""
    url = f"https://www.basketball-reference.com/boxscores/?month={target_date.month}&day={target_date.day}&year={target_date.year}"

    try:
        response = requests.get(url, headers=HEADERS, timeout=30)
        response.raise_for_status()

        # Find all box score links like /boxscores/202502060ATL.html
        pattern = rf'/boxscores/{target_date.strftime("%Y%m%d")}0([A-Z]{{3}})\.html'
        matches = re.findall(pattern, response.text)

        return list(set(matches))  # Unique home teams
    except Exception as exc:
        print(f"  Error getting games for {target_date}: {exc}")
        return []


def fetch_advanced_box_score(target_date, home_team):
    """Fetch advanced box score for a specific game."""
    date_str = target_date.strftime("%Y%m%d")
    url = f"https://www.basketball-reference.com/boxscores/{date_str}0{home_team}.html"

    try:
        response = requests.get(url, headers=HEADERS, timeout=30)
        response.raise_for_status()

        # Parse the HTML to find advanced stats tables
        # Basketball Reference has tables with id like "box-{TEAM}-game-advanced"
        html = response.text

        # Find both teams' advanced stats
        players_stats = []

        # Look for advanced box score tables
        # They have IDs like "box-ATL-game-advanced" and "box-BOS-game-advanced"
        pattern = r'id="box-([A-Z]{3})-game-advanced"'
        teams = re.findall(pattern, html)

        for team in teams:
            table_id = f"box-{team}-game-advanced"

            # Extract the table HTML
            table_pattern = rf'<table[^>]*id="{table_id}"[^>]*>.*?</table>'
            table_match = re.search(table_pattern, html, re.DOTALL)

            if not table_match:
                continue

            table_html = table_match.group(0)

            try:
                # Use pandas to parse the table
                dfs = pd.read_html(StringIO(table_html))
                if not dfs:
                    continue

                df = dfs[0]

                # Handle multi-level columns if present
                if isinstance(df.columns, pd.MultiIndex):
                    df.columns = df.columns.get_level_values(-1)

                # Get the player name column (usually first column or "Starters"/"Reserves")
                name_col = df.columns[0]

                for _, row in df.iterrows():
                    player_name = str(row[name_col])

                    # Skip header rows and totals
                    if player_name in ['Starters', 'Reserves', 'Team Totals', 'nan', '']:
                        continue
                    if 'Did Not' in player_name or 'Not With' in player_name:
                        continue

                    # Extract stats - column names may vary
                    try:
                        # Parse percentage values (may be like ".410" or "41.0")
                        def parse_pct(val):
                            if val is None or pd.isna(val):
                                return 0.0
                            s = str(val).strip()
                            if s.startswith('.'):
                                s = '0' + s
                            return float(s) if s else 0.0

                        def parse_rating(val):
                            if val is None or pd.isna(val):
                                return 0.0
                            try:
                                return float(val)
                            except (ValueError, TypeError):
                                return 0.0

                        # TS% and eFG% come as decimals like ".410", multiply by 100
                        ts_pct = parse_pct(row.get('TS%')) * 100
                        efg_pct = parse_pct(row.get('eFG%')) * 100
                        ortg = parse_rating(row.get('ORtg'))
                        drtg = parse_rating(row.get('DRtg'))
                        # USG% is already in percentage format (e.g., "33.4")
                        usg_pct = parse_pct(row.get('USG%'))

                        # Skip if we couldn't parse any meaningful stats
                        if ortg == 0 and drtg == 0:
                            continue

                        # Net rating is ORtg - DRtg
                        net_rtg = ortg - drtg if ortg and drtg else 0.0

                        team_abbr = TEAM_ABBR_MAP.get(team, team)

                        players_stats.append({
                            'name': player_name,
                            'team': team_abbr,
                            'ts_pct': ts_pct,
                            'efg_pct': efg_pct,
                            'ortg': ortg,
                            'drtg': drtg,
                            'net_rtg': net_rtg,
                            'usg_pct': usg_pct,
                        })
                    except (ValueError, TypeError):
                        continue

            except Exception as exc:
                print(f"    Error parsing table for {team}: {exc}")
                continue

        return players_stats

    except Exception as exc:
        print(f"  Error fetching {url}: {exc}")
        return []


def get_game_log_id(conn, player_name, game_date, season_string):
    """Get game_log_id for a player's game."""
    with conn.cursor() as cur:
        cur.execute("""
            SELECT gl.game_log_id
            FROM player_game_logs gl
            JOIN players p ON gl.player_id = p.player_id
            WHERE p.full_name = %s
              AND gl.game_date = %s
              AND gl.season = %s
        """, (player_name, game_date, season_string))
        row = cur.fetchone()
        return row[0] if row else None


def upsert_advanced_stats(conn, game_log_id, stats):
    """Insert or update advanced stats for a game log."""
    with conn.cursor() as cur:
        cur.execute("""
            INSERT INTO advanced_box_scores
            (game_log_id, true_shooting_percentage, effective_fg_percentage,
             offensive_rating, defensive_rating, net_rating, usage_percentage)
            VALUES (%s, %s, %s, %s, %s, %s, %s)
            ON CONFLICT (game_log_id) DO UPDATE SET
                true_shooting_percentage = EXCLUDED.true_shooting_percentage,
                effective_fg_percentage = EXCLUDED.effective_fg_percentage,
                offensive_rating = EXCLUDED.offensive_rating,
                defensive_rating = EXCLUDED.defensive_rating,
                net_rating = EXCLUDED.net_rating,
                usage_percentage = EXCLUDED.usage_percentage
            RETURNING game_log_id
        """, (
            game_log_id,
            stats['ts_pct'],
            stats['efg_pct'],
            stats['ortg'],
            stats['drtg'],
            stats['net_rtg'],
            stats['usg_pct'],
        ))
        return cur.fetchone() is not None


def process_date(conn, target_date, season_string, dry_run=False):
    """Process advanced stats for all games on a specific date."""
    print(f"\nProcessing {target_date.isoformat()}...")

    # Get list of games
    home_teams = get_games_on_date(target_date)

    if not home_teams:
        print("  No games found")
        return 0, 0

    print(f"  Found {len(home_teams)} games: {', '.join(home_teams)}")

    total_processed = 0
    total_inserted = 0

    for home_team in home_teams:
        random_delay(3, 5)  # Respect rate limits

        players_stats = fetch_advanced_box_score(target_date, home_team)

        if not players_stats:
            print(f"    No advanced stats found for {home_team} game")
            continue

        print(f"    {home_team} game: {len(players_stats)} players")

        for stats in players_stats:
            if dry_run:
                if total_processed < 5:
                    print(f"      {stats['name']}: TS%={stats['ts_pct']:.1f}%, eFG%={stats['efg_pct']:.1f}%, ORtg={stats['ortg']:.0f}, DRtg={stats['drtg']:.0f}, USG%={stats['usg_pct']:.1f}%")
                total_processed += 1
                continue

            # Find matching game log
            game_log_id = get_game_log_id(conn, stats['name'], target_date, season_string)

            if game_log_id:
                if upsert_advanced_stats(conn, game_log_id, stats):
                    total_inserted += 1

            total_processed += 1

    if dry_run and total_processed > 5:
        print(f"      ... and {total_processed - 5} more players")

    return total_processed, total_inserted


def main(season_end_year=2026):
    """Main function to populate advanced stats for a season."""
    season_start_year = season_end_year - 1
    season_string = f"{season_start_year}-{str(season_end_year)[2:]}"
    season_start = SEASON_START_DATES.get(season_end_year, date(season_start_year, 10, 22))
    season_end = SEASON_END_DATES.get(season_end_year, date(season_end_year, 4, 15))

    print("=" * 60)
    print("Fetch Advanced Box Scores from Basketball Reference")
    print("=" * 60)
    print(f"Season: {season_string}")

    # Determine date range
    today = date.today()
    if season_end < today:
        end_date = season_end
        print(f"Date range: {season_start} to {season_end} (completed season)")
    else:
        end_date = today - timedelta(days=1)
        print(f"Date range: {season_start} to {end_date} (current season)")

    if TEST_MODE:
        print("\n** TEST_MODE enabled - DRY RUN (no database writes) **\n")

        # Find a date with games (try last 5 days)
        sample_date = None
        for days_ago in range(1, 6):
            test_date = today - timedelta(days=days_ago)
            home_teams = get_games_on_date(test_date)
            if home_teams:
                sample_date = test_date
                break
            random_delay(1, 2)

        if not sample_date:
            print("No games found in the last 5 days")
            return

        processed, _ = process_date(None, sample_date, season_string, dry_run=True)

        print("\n" + "=" * 60)
        print(f"TEST_MODE complete - found {processed} player stats.")
        print("No data was written to database.")
        print("=" * 60)
        return

    # Production mode
    with get_db_connection() as conn:
        log_connection_info(conn)

        current_date = season_start
        total_processed = 0
        total_inserted = 0

        while current_date <= end_date:
            processed, inserted = process_date(conn, current_date, season_string)

            total_processed += processed
            total_inserted += inserted

            conn.commit()
            current_date += timedelta(days=1)

        print("\n" + "=" * 60)
        print(f"Complete! Processed {total_processed} players, {total_inserted} advanced stats inserted.")
        print("=" * 60)


def process_yesterday():
    """Process advanced stats for just yesterday's games."""
    today = date.today()
    yesterday = today - timedelta(days=1)

    # Determine season string
    if yesterday.month >= 10:
        season_end_year = yesterday.year + 1
    else:
        season_end_year = yesterday.year

    season_start_year = season_end_year - 1
    season_string = f"{season_start_year}-{str(season_end_year)[2:]}"

    print("=" * 60)
    print("Fetch Advanced Box Scores (Yesterday Only)")
    print("=" * 60)
    print(f"Date: {yesterday.isoformat()}")
    print(f"Season: {season_string}")

    if TEST_MODE:
        print("\n** TEST_MODE enabled - DRY RUN **\n")
        processed, _ = process_date(None, yesterday, season_string, dry_run=True)
        print(f"\nTEST_MODE complete - found {processed} player stats.")
        return

    with get_db_connection() as conn:
        log_connection_info(conn)

        processed, inserted = process_date(conn, yesterday, season_string)
        conn.commit()

        print("\n" + "=" * 60)
        print(f"Complete! Processed {processed} players, {inserted} advanced stats inserted.")
        print("=" * 60)


if __name__ == "__main__":
    if len(sys.argv) > 1:
        arg = sys.argv[1]
        if arg == "--yesterday":
            process_yesterday()
        else:
            try:
                year = int(arg)
                if year < 2000 or year > 2030:
                    print(f"Invalid year: {year}. Use a year between 2000-2030.")
                    sys.exit(1)
                main(season_end_year=year)
            except ValueError:
                print(f"Invalid argument: {arg}. Use --yesterday or a year (e.g., 2026).")
                sys.exit(1)
    else:
        main()
