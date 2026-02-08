"""
Fetch NBA player rosters and game logs from Basketball Reference.

This script replaces fetch_team_rosters_and_logs.py to avoid NBA API
datacenter IP blocking issues in GitHub Actions.

Uses basketball_reference_web_scraper library which is more reliable.

Run this for initial data population or full season updates.

Usage:
    python fetch_bref_rosters_and_logs.py [season_end_year]

Examples:
    python fetch_bref_rosters_and_logs.py 2024  # 2023-24 season
    python fetch_bref_rosters_and_logs.py 2025  # 2024-25 season
    python fetch_bref_rosters_and_logs.py 2026  # 2025-26 season (default)
"""

import os
import sys
import time
import random
from datetime import datetime, date, timedelta

import psycopg
from dotenv import load_dotenv
from basketball_reference_web_scraper import client

# Season start dates (approximate - actual dates vary slightly)
SEASON_START_DATES = {
    2024: date(2023, 10, 24),  # 2023-24 season
    2025: date(2024, 10, 22),  # 2024-25 season
    2026: date(2025, 10, 21),  # 2025-26 season
}

# Season end dates (regular season ends mid-April)
SEASON_END_DATES = {
    2024: date(2024, 4, 14),   # 2023-24 regular season end
    2025: date(2025, 4, 13),   # 2024-25 regular season end
    2026: date(2026, 4, 12),   # 2025-26 regular season end (estimated)
}

TEST_MODE = False


def get_season_config(season_end_year):
    """Get season configuration for a given end year."""
    season_start_year = season_end_year - 1
    return {
        "end_year": season_end_year,
        "string": f"{season_start_year}-{str(season_end_year)[2:]}",
        "start_date": SEASON_START_DATES.get(season_end_year, date(season_start_year, 10, 22)),
        "end_date": SEASON_END_DATES.get(season_end_year, date(season_end_year, 4, 15)),
    }

# Map Team enum to standard NBA abbreviations
TEAM_TO_ABBR = {
    "ATLANTA HAWKS": "ATL",
    "BOSTON CELTICS": "BOS",
    "BROOKLYN NETS": "BKN",
    "CHARLOTTE HORNETS": "CHA",
    "CHICAGO BULLS": "CHI",
    "CLEVELAND CAVALIERS": "CLE",
    "DALLAS MAVERICKS": "DAL",
    "DENVER NUGGETS": "DEN",
    "DETROIT PISTONS": "DET",
    "GOLDEN STATE WARRIORS": "GSW",
    "HOUSTON ROCKETS": "HOU",
    "INDIANA PACERS": "IND",
    "LOS ANGELES CLIPPERS": "LAC",
    "LOS ANGELES LAKERS": "LAL",
    "MEMPHIS GRIZZLIES": "MEM",
    "MIAMI HEAT": "MIA",
    "MILWAUKEE BUCKS": "MIL",
    "MINNESOTA TIMBERWOLVES": "MIN",
    "NEW ORLEANS PELICANS": "NOP",
    "NEW YORK KNICKS": "NYK",
    "OKLAHOMA CITY THUNDER": "OKC",
    "ORLANDO MAGIC": "ORL",
    "PHILADELPHIA 76ERS": "PHI",
    "PHOENIX SUNS": "PHX",
    "PORTLAND TRAIL BLAZERS": "POR",
    "SACRAMENTO KINGS": "SAC",
    "SAN ANTONIO SPURS": "SAS",
    "TORONTO RAPTORS": "TOR",
    "UTAH JAZZ": "UTA",
    "WASHINGTON WIZARDS": "WAS",
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
    conn.commit()


def team_enum_to_abbr(team_enum):
    """Convert Team enum to abbreviation."""
    if team_enum is None:
        return None
    team_name = str(team_enum).replace("Team.", "").replace("_", " ")
    return TEAM_TO_ABBR.get(team_name, team_name[:3])


def get_or_create_player(conn, player_name, team_abbr):
    """Get player_id by name, or create new player if not exists."""
    with conn.cursor() as cur:
        cur.execute(
            "SELECT player_id FROM players WHERE full_name = %s",
            (player_name,)
        )
        row = cur.fetchone()
        if row:
            # Update team if changed
            cur.execute(
                "UPDATE players SET team_abbreviation = %s WHERE player_id = %s",
                (team_abbr, row[0])
            )
            return row[0]

        # Create new player with explicit ID (table doesn't use SERIAL)
        cur.execute(
            """
            INSERT INTO players (player_id, full_name, team_abbreviation)
            VALUES ((SELECT COALESCE(MAX(player_id), 0) + 1 FROM players), %s, %s)
            RETURNING player_id
            """,
            (player_name, team_abbr)
        )
        player_id = cur.fetchone()[0]
        print(f"  Created new player: {player_name} (ID: {player_id})")
        return player_id


def calculate_points(box_score):
    """Calculate points from box score data."""
    # Points = 2-pointers + 3-pointers + free throws
    # made_field_goals includes both 2s and 3s
    made_fg = box_score.get("made_field_goals", 0) or 0
    made_3pt = box_score.get("made_three_point_field_goals", 0) or 0
    made_ft = box_score.get("made_free_throws", 0) or 0
    return made_fg * 2 + made_3pt + made_ft


def calculate_rebounds(box_score):
    """Calculate total rebounds from box score."""
    orb = box_score.get("offensive_rebounds", 0) or 0
    drb = box_score.get("defensive_rebounds", 0) or 0
    return orb + drb


def random_delay(min_sec=3, max_sec=5):
    """Add delay to respect rate limits (20 req/min = 3 sec minimum)."""
    time.sleep(random.uniform(min_sec, max_sec))


def fetch_box_scores_for_date(target_date):
    """Fetch all player box scores for a specific date."""
    try:
        box_scores = client.player_box_scores(
            day=target_date.day,
            month=target_date.month,
            year=target_date.year
        )
        return box_scores
    except Exception as exc:
        print(f"  Error fetching box scores for {target_date}: {exc}")
        return []


def main(season_end_year=2026):
    """Main function to fetch rosters and game logs for a season."""
    config = get_season_config(season_end_year)
    season_string = config["string"]
    season_start = config["start_date"]
    season_end = config["end_date"]

    print("=" * 60)
    print("Fetch Rosters and Game Logs from Basketball Reference")
    print("=" * 60)
    print(f"Season: {season_string}")

    # For past seasons, use season end date; for current season, use today
    today = date.today()
    if season_end < today:
        end_date = season_end
        print(f"Date range: {season_start} to {season_end} (completed season)")
    else:
        end_date = today
        print(f"Date range: {season_start} to {today} (current season)")

    if TEST_MODE:
        print("\n** TEST_MODE enabled - DRY RUN (no database writes) **\n")
        # Fetch a sample of data and display it
        print("Fetching season totals to preview players...")
        try:
            season_totals = client.players_season_totals(season_end_year=season_end_year)
            print(f"Found {len(season_totals)} players in {season_string} season")
            print("\nSample players (first 5):")
            for i, player in enumerate(season_totals[:5]):
                name = player.get("name")
                team = team_enum_to_abbr(player.get("team"))
                print(f"  {i+1}. {name} ({team})")
        except Exception as exc:
            print(f"Error fetching season totals: {exc}")
            return

        random_delay(3, 5)

        # Fetch one day of box scores as sample
        sample_date = today - timedelta(days=1)
        print(f"\nFetching sample box scores for {sample_date}...")
        box_scores = fetch_box_scores_for_date(sample_date)

        if box_scores:
            print(f"Found {len(box_scores)} player performances")
            print("\nSample game logs (first 10):")
            for i, box in enumerate(box_scores[:10]):
                name = box.get("name")
                team = team_enum_to_abbr(box.get("team"))
                opponent = team_enum_to_abbr(box.get("opponent"))
                seconds = box.get("seconds_played", 0) or 0
                minutes = round(seconds / 60)
                pts = calculate_points(box)
                reb = calculate_rebounds(box)
                ast = box.get("assists", 0) or 0
                print(f"  {name} ({team}) vs {opponent}: {pts} pts, {reb} reb, {ast} ast, {minutes} min")
        else:
            print("No box scores found for sample date.")

        print("\n" + "=" * 60)
        print("TEST_MODE complete - no data was written to database.")
        print("=" * 60)
        return

    # Production mode - actual database operations
    with get_db_connection() as conn:
        log_connection_info(conn)
        setup_database(conn)

        # Step 1: Fetch all players from season totals to get roster
        print("\nFetching season totals to get all players...")
        try:
            season_totals = client.players_season_totals(season_end_year=season_end_year)
            print(f"Found {len(season_totals)} players in {season_string} season")
        except Exception as exc:
            print(f"Error fetching season totals: {exc}")
            return

        # Create/update players in database
        player_map = {}  # name -> player_id
        for player in season_totals:
            name = player.get("name")
            team = team_enum_to_abbr(player.get("team"))
            if name:
                player_id = get_or_create_player(conn, name, team)
                player_map[name] = player_id
        conn.commit()
        print(f"Processed {len(player_map)} players")

        random_delay(3, 5)

        # Step 2: Fetch box scores for each day of the season
        start_date = season_start

        insert_query = """
            INSERT INTO player_game_logs
            (player_id, season, game_date, opponent, min, pts, reb, ast, stl, blk)
            VALUES (%s, %s, %s, %s, %s, %s, %s, %s, %s, %s)
            ON CONFLICT (player_id, season, game_date) DO UPDATE
            SET min = EXCLUDED.min, pts = EXCLUDED.pts, reb = EXCLUDED.reb,
                ast = EXCLUDED.ast, stl = EXCLUDED.stl, blk = EXCLUDED.blk;
        """

        current_date = start_date
        total_games = 0
        total_inserted = 0

        while current_date <= end_date:
            print(f"\nFetching games for {current_date.isoformat()}...")

            box_scores = fetch_box_scores_for_date(current_date)

            if not box_scores:
                print("  No games on this date")
                current_date += timedelta(days=1)
                random_delay(1, 2)
                continue

            print(f"  Found {len(box_scores)} player performances")

            with conn.cursor() as cur:
                for box in box_scores:
                    name = box.get("name")
                    if name not in player_map:
                        # Create player if not in our map
                        team = team_enum_to_abbr(box.get("team"))
                        player_id = get_or_create_player(conn, name, team)
                        player_map[name] = player_id
                    else:
                        player_id = player_map[name]

                    # Calculate stats
                    opponent = team_enum_to_abbr(box.get("opponent"))
                    seconds = box.get("seconds_played", 0) or 0
                    minutes = round(seconds / 60)
                    pts = calculate_points(box)
                    reb = calculate_rebounds(box)
                    ast = box.get("assists", 0) or 0
                    stl = box.get("steals", 0) or 0
                    blk = box.get("blocks", 0) or 0

                    cur.execute(
                        insert_query,
                        (player_id, season_string, current_date, opponent,
                         minutes, pts, reb, ast, stl, blk)
                    )
                    if cur.rowcount == 1:
                        total_inserted += 1
                    total_games += 1

            conn.commit()
            current_date += timedelta(days=1)
            random_delay(3, 5)  # Respect rate limits

        print("\n" + "=" * 60)
        print(f"Complete! Processed {total_games} box scores, {total_inserted} new records.")
        print("=" * 60)


if __name__ == "__main__":
    # Parse command-line argument for season end year
    if len(sys.argv) > 1:
        try:
            year = int(sys.argv[1])
            if year < 2000 or year > 2030:
                print(f"Invalid year: {year}. Use a year between 2000-2030.")
                sys.exit(1)
            main(season_end_year=year)
        except ValueError:
            print(f"Invalid argument: {sys.argv[1]}. Please provide a year (e.g., 2024, 2025, 2026).")
            sys.exit(1)
    else:
        main()  # Default to 2026
