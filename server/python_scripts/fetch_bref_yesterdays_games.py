"""
Fetch game stats for yesterday's NBA games from Basketball Reference.

This script replaces fetch_yesterdays_games.py to avoid NBA API
datacenter IP blocking issues in GitHub Actions.

Uses basketball_reference_web_scraper library which is more reliable.

Fetches all player box scores for yesterday's games. Run daily at 3 AM PT
after all games have completed.
"""

import os
import time
import random
from datetime import date, timedelta

import psycopg
from dotenv import load_dotenv
from basketball_reference_web_scraper import client

# Configuration
SEASON_STRING = "2025-26"
TEST_MODE = False

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
        cur.execute("""
            CREATE TABLE IF NOT EXISTS advanced_box_scores (
                game_log_id INT PRIMARY KEY REFERENCES player_game_logs(game_log_id),
                offensive_rating REAL,
                defensive_rating REAL,
                net_rating REAL,
                effective_fg_percentage REAL,
                true_shooting_percentage REAL,
                usage_percentage REAL,
                pace REAL,
                player_impact_estimate REAL
            );
        """)
    conn.commit()


def team_enum_to_abbr(team_enum):
    """Convert Team enum to abbreviation."""
    if team_enum is None:
        return None
    team_name = str(team_enum).replace("Team.", "").replace("_", " ")
    return TEAM_TO_ABBR.get(team_name, team_name[:3])


def random_delay(min_sec=3, max_sec=5):
    """Add delay to respect rate limits (20 req/min = 3 sec minimum)."""
    time.sleep(random.uniform(min_sec, max_sec))


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
        print(f"    Created new player: {player_name} (ID: {player_id})")
        return player_id


def calculate_points(box_score):
    """Calculate points from box score data."""
    made_fg = box_score.get("made_field_goals", 0) or 0
    made_3pt = box_score.get("made_three_point_field_goals", 0) or 0
    made_ft = box_score.get("made_free_throws", 0) or 0
    return made_fg * 2 + made_3pt + made_ft


def calculate_rebounds(box_score):
    """Calculate total rebounds from box score."""
    orb = box_score.get("offensive_rebounds", 0) or 0
    drb = box_score.get("defensive_rebounds", 0) or 0
    return orb + drb


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


def insert_game_log(conn, player_id, game_date, opponent, stats):
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
                SEASON_STRING,
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

    print(f"\nFetching stats for games on {game_date.isoformat()}...")

    # Fetch all box scores for the day
    print(f"\nFetching all box scores for {game_date}...")
    box_scores = fetch_box_scores_for_date(game_date)

    if not box_scores:
        print("No box score data found for this date.")
        return

    print(f"Found {len(box_scores)} player performances")

    if TEST_MODE:
        print("\n** TEST_MODE enabled - DRY RUN (no database writes) **\n")
        print("Sample game logs (first 15):")
        for i, box in enumerate(box_scores[:15]):
            name = box.get("name")
            if not name:
                continue
            team = team_enum_to_abbr(box.get("team"))
            opponent = team_enum_to_abbr(box.get("opponent"))
            seconds = box.get("seconds_played", 0) or 0
            minutes = round(seconds / 60)
            pts = calculate_points(box)
            reb = calculate_rebounds(box)
            ast = box.get("assists", 0) or 0
            stl = box.get("steals", 0) or 0
            blk = box.get("blocks", 0) or 0
            print(f"  {name} ({team}) vs {opponent}: {pts} pts, {reb} reb, {ast} ast, {stl} stl, {blk} blk, {minutes} min")

        print("\n" + "=" * 60)
        print("TEST_MODE complete - no data was written to database.")
        print("=" * 60)
        return

    # Production mode - actual database operations
    with get_db_connection() as conn:
        log_connection_info(conn)
        setup_database(conn)

        total_inserted = 0

        for box in box_scores:
            name = box.get("name")
            if not name:
                continue

            team = team_enum_to_abbr(box.get("team"))
            opponent = team_enum_to_abbr(box.get("opponent"))

            # Get or create player
            player_id = get_or_create_player(conn, name, team)

            # Calculate stats
            seconds = box.get("seconds_played", 0) or 0
            minutes = round(seconds / 60)
            pts = calculate_points(box)
            reb = calculate_rebounds(box)
            ast = box.get("assists", 0) or 0
            stl = box.get("steals", 0) or 0
            blk = box.get("blocks", 0) or 0

            stats = {
                "min": minutes,
                "pts": pts,
                "reb": reb,
                "ast": ast,
                "stl": stl,
                "blk": blk,
            }

            # Insert game log
            game_log_id = insert_game_log(conn, player_id, game_date, opponent, stats)

            if game_log_id:
                total_inserted += 1

        conn.commit()

        print("\n" + "=" * 60)
        print(f"Complete! Inserted/updated {total_inserted} player game logs.")
        print("=" * 60)


if __name__ == "__main__":
    main()
