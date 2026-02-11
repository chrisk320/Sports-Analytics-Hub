"""
Fetch all player stats from Basketball Reference in a single pass.

This script combines basic box scores (pts, reb, ast, etc.) and advanced
box scores (ORtg, DRtg, TS%, etc.) into a single fetch operation,
reducing HTTP requests by 50%.

Usage:
    python fetch_bref_all_stats.py              # Full season backfill
    python fetch_bref_all_stats.py --yesterday  # Yesterday's games only
    python fetch_bref_all_stats.py 2026         # Specific season
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
TEST_MODE = False

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

# Basketball Reference team abbreviations to standard NBA abbreviations
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


def setup_database(conn):
    """Ensure required tables exist."""
    with conn.cursor() as cur:
        cur.execute("""
            CREATE TABLE IF NOT EXISTS players (
                player_id SERIAL PRIMARY KEY,
                full_name VARCHAR(255) NOT NULL,
                team_abbreviation VARCHAR(5),
                headshot_url VARCHAR(255)
            );
        """)
        cur.execute("""
            CREATE TABLE IF NOT EXISTS player_game_logs (
                game_log_id SERIAL PRIMARY KEY,
                player_id INT REFERENCES players(player_id),
                season VARCHAR(10) NOT NULL,
                game_date DATE NOT NULL,
                opponent VARCHAR(5),
                min REAL,
                pts INT,
                reb INT,
                ast INT,
                stl INT,
                blk INT,
                UNIQUE(player_id, season, game_date)
            );
        """)
        cur.execute("""
            CREATE TABLE IF NOT EXISTS advanced_box_scores (
                game_log_id INT PRIMARY KEY REFERENCES player_game_logs(game_log_id),
                offensive_rating REAL,
                defensive_rating REAL,
                net_rating REAL,
                effective_fg_percentage REAL,
                true_shooting_percentage REAL,
                usage_percentage REAL
            );
        """)
    conn.commit()


def random_delay(min_sec=3, max_sec=5):
    """Add delay to respect rate limits."""
    time.sleep(random.uniform(min_sec, max_sec))


def get_games_on_date(target_date):
    """Get list of games (home team abbreviations) for a date."""
    url = f"https://www.basketball-reference.com/boxscores/?month={target_date.month}&day={target_date.day}&year={target_date.year}"

    try:
        response = requests.get(url, headers=HEADERS, timeout=30)
        response.raise_for_status()

        pattern = rf'/boxscores/{target_date.strftime("%Y%m%d")}0([A-Z]{{3}})\.html'
        matches = re.findall(pattern, response.text)

        return list(set(matches))
    except Exception as exc:
        print(f"  Error getting games for {target_date}: {exc}")
        return []


def parse_minutes(mp_str):
    """Parse minutes played from MM:SS format."""
    if mp_str is None or pd.isna(mp_str):
        return 0
    try:
        mp_str = str(mp_str).strip()
        if ':' in mp_str:
            parts = mp_str.split(':')
            return int(parts[0]) + int(parts[1]) / 60
        return float(mp_str)
    except (ValueError, TypeError):
        return 0


def parse_int(val):
    """Parse integer value, returning 0 for invalid values."""
    if val is None or pd.isna(val):
        return 0
    try:
        return int(float(val))
    except (ValueError, TypeError):
        return 0


def parse_pct(val):
    """Parse percentage value."""
    if val is None or pd.isna(val):
        return 0.0
    s = str(val).strip()
    if s.startswith('.'):
        s = '0' + s
    try:
        return float(s) if s else 0.0
    except (ValueError, TypeError):
        return 0.0


def parse_rating(val):
    """Parse rating value."""
    if val is None or pd.isna(val):
        return 0.0
    try:
        return float(val)
    except (ValueError, TypeError):
        return 0.0


def fetch_all_stats_for_game(target_date, home_team):
    """Fetch both basic and advanced stats for a specific game in one request."""
    date_str = target_date.strftime("%Y%m%d")
    url = f"https://www.basketball-reference.com/boxscores/{date_str}0{home_team}.html"

    try:
        response = requests.get(url, headers=HEADERS, timeout=30)
        response.raise_for_status()

        html = response.text
        players_data = {}  # name -> {basic stats, advanced stats}

        # Find all teams in this game
        basic_pattern = r'id="box-([A-Z]{3})-game-basic"'
        teams = re.findall(basic_pattern, html)

        # Determine away team
        away_team = None
        for team in teams:
            if team != home_team:
                away_team = team
                break

        # Parse BASIC stats for each team
        for team in teams:
            table_id = f"box-{team}-game-basic"
            table_pattern = rf'<table[^>]*id="{table_id}"[^>]*>.*?</table>'
            table_match = re.search(table_pattern, html, re.DOTALL)

            if not table_match:
                continue

            try:
                dfs = pd.read_html(StringIO(table_match.group(0)))
                if not dfs:
                    continue

                df = dfs[0]
                if isinstance(df.columns, pd.MultiIndex):
                    df.columns = df.columns.get_level_values(-1)

                name_col = df.columns[0]

                for _, row in df.iterrows():
                    player_name = str(row[name_col])

                    if player_name in ['Starters', 'Reserves', 'Team Totals', 'nan', '']:
                        continue
                    if 'Did Not' in player_name or 'Not With' in player_name:
                        continue
                    if 'Inactive' in player_name:
                        continue

                    minutes = parse_minutes(row.get('MP'))
                    pts = parse_int(row.get('PTS'))

                    # Skip players who didn't play
                    if minutes == 0 and pts == 0:
                        continue

                    team_abbr = TEAM_ABBR_MAP.get(team, team)
                    opponent = TEAM_ABBR_MAP.get(away_team if team == home_team else home_team,
                                                  away_team if team == home_team else home_team)

                    players_data[player_name] = {
                        'name': player_name,
                        'team': team_abbr,
                        'opponent': opponent,
                        'min': round(minutes),
                        'pts': pts,
                        'reb': parse_int(row.get('TRB')),
                        'ast': parse_int(row.get('AST')),
                        'stl': parse_int(row.get('STL')),
                        'blk': parse_int(row.get('BLK')),
                        # Advanced stats placeholders
                        'ts_pct': None,
                        'efg_pct': None,
                        'ortg': None,
                        'drtg': None,
                        'net_rtg': None,
                        'usg_pct': None,
                    }

            except Exception as exc:
                print(f"    Error parsing basic table for {team}: {exc}")
                continue

        # Parse ADVANCED stats for each team
        for team in teams:
            table_id = f"box-{team}-game-advanced"
            table_pattern = rf'<table[^>]*id="{table_id}"[^>]*>.*?</table>'
            table_match = re.search(table_pattern, html, re.DOTALL)

            if not table_match:
                continue

            try:
                dfs = pd.read_html(StringIO(table_match.group(0)))
                if not dfs:
                    continue

                df = dfs[0]
                if isinstance(df.columns, pd.MultiIndex):
                    df.columns = df.columns.get_level_values(-1)

                name_col = df.columns[0]

                for _, row in df.iterrows():
                    player_name = str(row[name_col])

                    if player_name in ['Starters', 'Reserves', 'Team Totals', 'nan', '']:
                        continue
                    if 'Did Not' in player_name or 'Not With' in player_name:
                        continue

                    # Only add advanced stats if we have basic stats for this player
                    if player_name not in players_data:
                        continue

                    ortg = parse_rating(row.get('ORtg'))
                    drtg = parse_rating(row.get('DRtg'))

                    if ortg == 0 and drtg == 0:
                        continue

                    # TS% and eFG% come as decimals, multiply by 100
                    players_data[player_name]['ts_pct'] = parse_pct(row.get('TS%')) * 100
                    players_data[player_name]['efg_pct'] = parse_pct(row.get('eFG%')) * 100
                    players_data[player_name]['ortg'] = ortg
                    players_data[player_name]['drtg'] = drtg
                    players_data[player_name]['net_rtg'] = ortg - drtg if ortg and drtg else 0.0
                    # USG% is already in percentage format
                    players_data[player_name]['usg_pct'] = parse_pct(row.get('USG%'))

            except Exception as exc:
                print(f"    Error parsing advanced table for {team}: {exc}")
                continue

        return list(players_data.values())

    except Exception as exc:
        print(f"  Error fetching {url}: {exc}")
        return []


def get_or_create_player(conn, player_name, team_abbr):
    """Get player_id by name, or create new player if not exists."""
    with conn.cursor() as cur:
        cur.execute(
            "SELECT player_id FROM players WHERE full_name = %s",
            (player_name,)
        )
        row = cur.fetchone()
        if row:
            cur.execute(
                "UPDATE players SET team_abbreviation = %s WHERE player_id = %s",
                (team_abbr, row[0])
            )
            return row[0]

        cur.execute(
            """
            INSERT INTO players (player_id, full_name, team_abbreviation)
            VALUES ((SELECT COALESCE(MAX(player_id), 0) + 1 FROM players), %s, %s)
            RETURNING player_id
            """,
            (player_name, team_abbr)
        )
        player_id = cur.fetchone()[0]
        print(f"    Created new player: {player_name} (ID: {player_id})")
        return player_id


def get_season_string(game_date):
    """Get season string for a given date."""
    if game_date.month >= 10:
        season_end_year = game_date.year + 1
    else:
        season_end_year = game_date.year

    season_start_year = season_end_year - 1
    return f"{season_start_year}-{str(season_end_year)[2:]}"


def insert_game_log(conn, player_id, game_date, stats, season_string):
    """Insert a game log and return the game_log_id."""
    with conn.cursor() as cur:
        cur.execute(
            """
            INSERT INTO player_game_logs
            (player_id, season, game_date, opponent, min, pts, reb, ast, stl, blk)
            VALUES (%s, %s, %s, %s, %s, %s, %s, %s, %s, %s)
            ON CONFLICT (player_id, season, game_date) DO UPDATE
            SET min = EXCLUDED.min, pts = EXCLUDED.pts, reb = EXCLUDED.reb,
                ast = EXCLUDED.ast, stl = EXCLUDED.stl, blk = EXCLUDED.blk
            RETURNING game_log_id;
            """,
            (
                player_id,
                season_string,
                game_date,
                stats["opponent"],
                stats["min"],
                stats["pts"],
                stats["reb"],
                stats["ast"],
                stats["stl"],
                stats["blk"],
            ),
        )
        result = cur.fetchone()
        return result[0] if result else None


def upsert_advanced_stats(conn, game_log_id, stats):
    """Insert or update advanced stats for a game log."""
    # Skip if no advanced stats available
    if stats.get('ortg') is None:
        return False

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
    """Process all stats for all games on a specific date."""
    print(f"\nProcessing {target_date.isoformat()}...")

    home_teams = get_games_on_date(target_date)

    if not home_teams:
        print("  No games found")
        return 0, 0, 0

    print(f"  Found {len(home_teams)} games: {', '.join(home_teams)}")

    total_basic = 0
    total_advanced = 0
    all_players_stats = []

    for home_team in home_teams:
        random_delay(3, 5)

        players_stats = fetch_all_stats_for_game(target_date, home_team)

        if not players_stats:
            print(f"    No stats found for {home_team} game")
            continue

        advanced_count = sum(1 for p in players_stats if p.get('ortg') is not None)
        print(f"    {home_team} game: {len(players_stats)} players ({advanced_count} with advanced stats)")
        all_players_stats.extend(players_stats)

    if not all_players_stats:
        return 0, 0, 0

    if dry_run:
        print(f"\n  Sample stats (first 5):")
        for stats in all_players_stats[:5]:
            adv = f"ORtg={stats['ortg']:.0f}" if stats.get('ortg') else "no advanced"
            print(f"    {stats['name']} ({stats['team']}): {stats['pts']} pts, {stats['reb']} reb, {stats['ast']} ast, {adv}")
        return len(all_players_stats), sum(1 for p in all_players_stats if p.get('ortg')), 0

    # Insert into database
    for stats in all_players_stats:
        player_id = get_or_create_player(conn, stats['name'], stats['team'])
        game_log_id = insert_game_log(conn, player_id, target_date, stats, season_string)

        if game_log_id:
            total_basic += 1
            if upsert_advanced_stats(conn, game_log_id, stats):
                total_advanced += 1

    return len(all_players_stats), total_advanced, total_basic


def process_yesterday():
    """Process all stats for yesterday's games."""
    today = date.today()
    yesterday = today - timedelta(days=1)
    season_string = get_season_string(yesterday)

    print("=" * 60)
    print("Fetch All Stats from Basketball Reference (Yesterday)")
    print("=" * 60)
    print(f"Date: {yesterday.isoformat()}")
    print(f"Season: {season_string}")

    if TEST_MODE:
        print("\n** TEST_MODE enabled - DRY RUN **\n")
        processed, advanced, _ = process_date(None, yesterday, season_string, dry_run=True)
        print(f"\nTEST_MODE complete - found {processed} players ({advanced} with advanced stats).")
        return

    with get_db_connection() as conn:
        log_connection_info(conn)
        setup_database(conn)

        processed, advanced, inserted = process_date(conn, yesterday, season_string)
        conn.commit()

        print("\n" + "=" * 60)
        print(f"Complete! {inserted} game logs, {advanced} advanced stats inserted.")
        print("=" * 60)


def main(season_end_year=2026):
    """Main function to fetch all stats for a season."""
    season_start_year = season_end_year - 1
    season_string = f"{season_start_year}-{str(season_end_year)[2:]}"
    season_start = SEASON_START_DATES.get(season_end_year, date(season_start_year, 10, 22))
    season_end = SEASON_END_DATES.get(season_end_year, date(season_end_year, 4, 15))

    print("=" * 60)
    print("Fetch All Stats from Basketball Reference")
    print("=" * 60)
    print(f"Season: {season_string}")

    today = date.today()
    if season_end < today:
        end_date = season_end
        print(f"Date range: {season_start} to {season_end} (completed season)")
    else:
        end_date = today - timedelta(days=1)
        print(f"Date range: {season_start} to {end_date} (current season)")

    if TEST_MODE:
        print("\n** TEST_MODE enabled - DRY RUN **\n")
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

        processed, advanced, _ = process_date(None, sample_date, season_string, dry_run=True)
        print("\n" + "=" * 60)
        print(f"TEST_MODE complete - found {processed} players ({advanced} with advanced stats).")
        print("=" * 60)
        return

    with get_db_connection() as conn:
        log_connection_info(conn)
        setup_database(conn)

        current_date = season_start
        total_basic = 0
        total_advanced = 0

        while current_date <= end_date:
            _, advanced, basic = process_date(conn, current_date, season_string)
            total_basic += basic
            total_advanced += advanced
            conn.commit()
            current_date += timedelta(days=1)

        print("\n" + "=" * 60)
        print(f"Complete! {total_basic} game logs, {total_advanced} advanced stats inserted.")
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
