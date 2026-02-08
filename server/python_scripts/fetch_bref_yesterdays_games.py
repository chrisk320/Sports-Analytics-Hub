"""
Fetch game stats for yesterday's NBA games from Basketball Reference.

This script replaces fetch_yesterdays_games.py to avoid NBA API
datacenter IP blocking issues in GitHub Actions.

Uses direct requests with browser headers instead of third-party libraries
to avoid 403 blocks from datacenter IPs.

Fetches all player box scores for yesterday's games. Run daily at 3 AM PT
after all games have completed.
"""

import os
import re
import time
import random
from datetime import date, timedelta
from io import StringIO

import requests
import pandas as pd
import psycopg
from dotenv import load_dotenv

# Configuration
TEST_MODE = False

# Request headers to avoid blocking
HEADERS = {
    "User-Agent": "Mozilla/5.0 (Macintosh; Intel Mac OS X 10_15_7) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/120.0.0.0 Safari/537.36",
    "Accept": "text/html,application/xhtml+xml,application/xml;q=0.9,image/webp,*/*;q=0.8",
    "Accept-Language": "en-US,en;q=0.5",
    "Connection": "keep-alive",
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

        # Find all box score links like /boxscores/202502060ATL.html
        pattern = rf'/boxscores/{target_date.strftime("%Y%m%d")}0([A-Z]{{3}})\.html'
        matches = re.findall(pattern, response.text)

        return list(set(matches))  # Unique home teams
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


def fetch_box_scores_for_game(target_date, home_team):
    """Fetch basic box score stats for a specific game."""
    date_str = target_date.strftime("%Y%m%d")
    url = f"https://www.basketball-reference.com/boxscores/{date_str}0{home_team}.html"

    try:
        response = requests.get(url, headers=HEADERS, timeout=30)
        response.raise_for_status()

        html = response.text
        players_stats = []

        # Find basic box score tables (id like "box-ATL-game-basic")
        pattern = r'id="box-([A-Z]{3})-game-basic"'
        teams = re.findall(pattern, html)

        # Get the opponent team (the one that's not the home team)
        away_team = None
        for team in teams:
            if team != home_team:
                away_team = team
                break

        for team in teams:
            table_id = f"box-{team}-game-basic"

            # Extract the table HTML
            table_pattern = rf'<table[^>]*id="{table_id}"[^>]*>.*?</table>'
            table_match = re.search(table_pattern, html, re.DOTALL)

            if not table_match:
                continue

            table_html = table_match.group(0)

            try:
                dfs = pd.read_html(StringIO(table_html))
                if not dfs:
                    continue

                df = dfs[0]

                # Handle multi-level columns if present
                if isinstance(df.columns, pd.MultiIndex):
                    df.columns = df.columns.get_level_values(-1)

                # Get the player name column (usually first column)
                name_col = df.columns[0]

                for _, row in df.iterrows():
                    player_name = str(row[name_col])

                    # Skip header rows and totals
                    if player_name in ['Starters', 'Reserves', 'Team Totals', 'nan', '']:
                        continue
                    if 'Did Not' in player_name or 'Not With' in player_name:
                        continue
                    if 'Inactive' in player_name:
                        continue

                    try:
                        # Parse stats from the row
                        minutes = parse_minutes(row.get('MP'))
                        pts = parse_int(row.get('PTS'))
                        trb = parse_int(row.get('TRB'))
                        ast = parse_int(row.get('AST'))
                        stl = parse_int(row.get('STL'))
                        blk = parse_int(row.get('BLK'))

                        # Skip players who didn't play
                        if minutes == 0 and pts == 0:
                            continue

                        team_abbr = TEAM_ABBR_MAP.get(team, team)

                        # Determine opponent
                        if team == home_team:
                            opponent = TEAM_ABBR_MAP.get(away_team, away_team) if away_team else None
                        else:
                            opponent = TEAM_ABBR_MAP.get(home_team, home_team)

                        players_stats.append({
                            'name': player_name,
                            'team': team_abbr,
                            'opponent': opponent,
                            'min': round(minutes),
                            'pts': pts,
                            'reb': trb,
                            'ast': ast,
                            'stl': stl,
                            'blk': blk,
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

        # Create new player with explicit ID
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


def insert_game_log(conn, player_id, game_date, opponent, stats, season_string):
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
                opponent,
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


def main():
    print("=" * 60)
    print("Fetch Yesterday's Game Stats from Basketball Reference")
    print("=" * 60)

    # Calculate yesterday's date
    yesterday = date.today() - timedelta(days=1)
    game_date = yesterday
    season_string = get_season_string(game_date)

    print(f"\nDate: {game_date.isoformat()}")
    print(f"Season: {season_string}")

    # Get list of games
    print(f"\nFetching games for {game_date}...")
    home_teams = get_games_on_date(game_date)

    if not home_teams:
        print("No games found for this date.")
        return

    print(f"Found {len(home_teams)} games: {', '.join(home_teams)}")

    all_players_stats = []

    for home_team in home_teams:
        random_delay(3, 5)  # Respect rate limits

        players_stats = fetch_box_scores_for_game(game_date, home_team)

        if not players_stats:
            print(f"  No box scores found for {home_team} game")
            continue

        print(f"  {home_team} game: {len(players_stats)} players")
        all_players_stats.extend(players_stats)

    if not all_players_stats:
        print("No player stats found.")
        return

    print(f"\nTotal: {len(all_players_stats)} player performances")

    if TEST_MODE:
        print("\n** TEST_MODE enabled - DRY RUN (no database writes) **\n")
        print("Sample game logs (first 15):")
        for stats in all_players_stats[:15]:
            print(f"  {stats['name']} ({stats['team']}) vs {stats['opponent']}: "
                  f"{stats['pts']} pts, {stats['reb']} reb, {stats['ast']} ast, "
                  f"{stats['stl']} stl, {stats['blk']} blk, {stats['min']} min")

        print("\n" + "=" * 60)
        print("TEST_MODE complete - no data was written to database.")
        print("=" * 60)
        return

    # Production mode - actual database operations
    with get_db_connection() as conn:
        log_connection_info(conn)
        setup_database(conn)

        total_inserted = 0

        for stats in all_players_stats:
            # Get or create player
            player_id = get_or_create_player(conn, stats['name'], stats['team'])

            # Insert game log
            game_log_id = insert_game_log(
                conn, player_id, game_date, stats['opponent'],
                stats, season_string
            )

            if game_log_id:
                total_inserted += 1

        conn.commit()

        print("\n" + "=" * 60)
        print(f"Complete! Inserted/updated {total_inserted} player game logs.")
        print("=" * 60)


if __name__ == "__main__":
    main()
