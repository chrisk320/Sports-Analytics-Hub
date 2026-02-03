"""
Fetch game stats for today's NBA games.

This script reads the scheduled games from todays_games.json (created by
fetch_todays_scheduled_games.py in the morning) and fetches game logs +
advanced stats for all players on those teams.

Run this script at night after all games have completed.
"""

import json
import time
import random
from datetime import datetime, date, timedelta
from pathlib import Path

import pandas as pd
from dotenv import load_dotenv
from nba_api.stats.endpoints import playergamelogs
from nba_api.stats.endpoints.commonteamroster import CommonTeamRoster
from nba_api.stats.library import http

from fetch_todays_stats import (
    get_db_connection,
    log_connection_info,
    setup_database,
    random_delay,
    parse_opponent,
)

SEASON = "2025-26"
TEST_MODE = False
REQUEST_TIMEOUT = 120  # Increased timeout for cloud environments
MAX_RETRIES = 5  # More retries for flaky connections

# Custom headers to help bypass NBA API restrictions on datacenter IPs
# The NBA API blocks requests that don't look like they're from a browser
CUSTOM_HEADERS = {
    'Host': 'stats.nba.com',
    'User-Agent': 'Mozilla/5.0 (Windows NT 10.0; Win64; x64; rv:109.0) Gecko/20100101 Firefox/115.0',
    'Accept': 'application/json, text/plain, */*',
    'Accept-Language': 'en-US,en;q=0.5',
    'Accept-Encoding': 'gzip, deflate, br',
    'Origin': 'https://www.nba.com',
    'Connection': 'keep-alive',
    'Referer': 'https://www.nba.com/',
    'Sec-Fetch-Dest': 'empty',
    'Sec-Fetch-Mode': 'cors',
    'Sec-Fetch-Site': 'same-site',
}

# Override the default headers in nba_api
http.NBAStatsHTTP.headers = CUSTOM_HEADERS
DATA_DIR = Path(__file__).parent.parent / "data"
GAMES_FILE = DATA_DIR / "todays_games.json"


def to_float(value):
    try:
        return float(value)
    except (TypeError, ValueError):
        return None


def load_todays_games():
    """Load scheduled games from JSON file.

    Returns:
        tuple: (games list, game_date as date object)
    """
    if not GAMES_FILE.exists():
        raise FileNotFoundError(
            f"Games file not found: {GAMES_FILE}\n"
            "Run fetch_todays_scheduled_games.py first to fetch today's games."
        )

    with open(GAMES_FILE, "r") as f:
        data = json.load(f)

    stored_date = data.get("date")
    games = data.get("games", [])

    print(f"Loaded {len(games)} games from {GAMES_FILE}")
    print(f"  Stored date (UTC): {stored_date}")
    print(f"  Fetched at: {data.get('fetched_at', 'unknown')}")

    # Parse the stored date and subtract 1 day
    # The Odds API stores dates in UTC, so evening games (e.g., Jan 29 7pm PT)
    # appear as the next day (Jan 30 UTC). The NBA API uses US dates,
    # so we need to subtract 1 day to get the actual game date.
    stored = date.fromisoformat(stored_date) if stored_date else date.today()
    game_date = stored - timedelta(days=1)
    print(f"  NBA API date (adjusted): {game_date.isoformat()}")

    return games, game_date


def build_team_name_mapping(conn):
    """Build mapping from Odds API team names to local teams table."""
    with conn.cursor() as cur:
        cur.execute("SELECT team_id, team_name, team_abbreviation FROM teams")
        rows = cur.fetchall()
    return {
        row[1]: {  # team_name as key
            "id": row[0],  # team_id
            "abbreviation": row[2],  # team_abbreviation
        }
        for row in rows
    }


def fetch_team_players(team_id, season):
    """Fetch all players on a team's roster."""
    last_error = None
    roster = None

    # Initial delay before first request to avoid rate limiting
    time.sleep(random.uniform(2, 4))

    for attempt in range(1, MAX_RETRIES + 1):
        try:
            roster = CommonTeamRoster(
                team_id=team_id,
                season=season,
                timeout=REQUEST_TIMEOUT,
            )
            break
        except TypeError:
            roster = CommonTeamRoster(
                team_id_nullable=team_id,
                season_nullable=season,
                timeout=REQUEST_TIMEOUT,
            )
            break
        except Exception as exc:
            last_error = exc
            if attempt == MAX_RETRIES:
                raise
            # Exponential backoff with jitter for retries
            sleep_secs = (2 ** attempt) + random.uniform(1, 3)
            print(f"    Retry {attempt}/{MAX_RETRIES} in {sleep_secs:.1f}s...")
            time.sleep(sleep_secs)
    if last_error and roster is None:
        raise last_error

    data_frames = roster.get_data_frames()
    if not data_frames:
        return []
    df = data_frames[0]
    if df.empty:
        return []

    if "PLAYER_ID" not in df.columns or "PLAYER" not in df.columns:
        return []

    players = []
    for _, row in df[["PLAYER_ID", "PLAYER"]].dropna().iterrows():
        try:
            player_id = int(row["PLAYER_ID"])
        except (TypeError, ValueError):
            continue
        player_name = str(row["PLAYER"]).strip()
        players.append((player_id, player_name))
    return players


def ensure_player_exists(conn, player_id, player_name, team_abbr):
    """Insert or update player in players table."""
    headshot_url = f"https://cdn.nba.com/headshots/nba/latest/1040x760/{player_id}.png"
    with conn.cursor() as cur:
        cur.execute(
            """
            INSERT INTO players (player_id, full_name, team_abbreviation, headshot_url)
            VALUES (%s, %s, %s, %s)
            ON CONFLICT (player_id) DO UPDATE
            SET full_name = EXCLUDED.full_name,
                team_abbreviation = EXCLUDED.team_abbreviation,
                headshot_url = EXCLUDED.headshot_url;
            """,
            (player_id, player_name, team_abbr, headshot_url),
        )


def parse_game_date(raw_value):
    """Parse game date from various formats."""
    if not raw_value:
        return None
    raw_str = str(raw_value)
    try:
        return datetime.strptime(raw_str, "%b %d, %Y").date()
    except ValueError:
        pass
    try:
        iso_value = raw_str.replace("Z", "").replace("T00:00:00", "")
        return datetime.fromisoformat(iso_value).date()
    except ValueError:
        pass
    try:
        return pd.Timestamp(raw_value).date()
    except Exception:
        return None


def fetch_player_game_log_for_date(player_id, season, target_date):
    """Fetch a player's game log filtered to a specific date."""
    for attempt in range(1, MAX_RETRIES + 1):
        try:
            gamelogs = playergamelogs.PlayerGameLogs(
                player_id_nullable=player_id,
                season_nullable=season,
                season_type_nullable="Regular Season",
                league_id_nullable="00",
                timeout=REQUEST_TIMEOUT,
            )
            df = gamelogs.get_data_frames()[0]
            if df.empty:
                return None

            for _, row in df.iterrows():
                game_date_raw = row.get("GAME_DATE")
                if game_date_raw:
                    parsed_date = parse_game_date(game_date_raw)
                    if parsed_date == target_date:
                        matchup = row.get("MATCHUP")
                        return {
                            "game_date": parsed_date,
                            "opponent": parse_opponent(matchup),
                            "min": round(float(row.get("MIN") or 0)),
                            "pts": row.get("PTS") or 0,
                            "reb": row.get("REB") or 0,
                            "ast": row.get("AST") or 0,
                            "stl": row.get("STL") or 0,
                            "blk": row.get("BLK") or 0,
                        }
            return None
        except Exception as exc:
            if attempt == MAX_RETRIES:
                raise
            sleep_ms = 1000 * attempt + random.randint(0, 500)
            time.sleep(sleep_ms / 1000)
    return None


def fetch_player_advanced_for_date(player_id, season, target_date):
    """Fetch advanced stats for a player filtered to a specific date."""
    for attempt in range(1, MAX_RETRIES + 1):
        try:
            gamelogs = playergamelogs.PlayerGameLogs(
                player_id_nullable=player_id,
                season_nullable=season,
                season_type_nullable="Regular Season",
                league_id_nullable="00",
                measure_type_player_game_logs_nullable="Advanced",
                timeout=REQUEST_TIMEOUT,
            )
            df = gamelogs.get_data_frames()[0]
            if df.empty:
                return None

            for _, row in df.iterrows():
                game_date_raw = row.get("GAME_DATE")
                if game_date_raw:
                    parsed_date = parse_game_date(game_date_raw)
                    if parsed_date == target_date:
                        return extract_advanced_stats(row, list(df.columns))
            return None
        except Exception as exc:
            if attempt == MAX_RETRIES:
                raise
            sleep_ms = 1000 * attempt + random.randint(0, 500)
            time.sleep(sleep_ms / 1000)
    return None


def extract_advanced_stats(row, columns):
    """Extract the 8 advanced stats from a DataFrame row."""
    col_set = set(columns)

    def get_value(*keys):
        for key in keys:
            if key in col_set:
                value = row.get(key) if hasattr(row, "get") else None
                if value is not None:
                    return to_float(value)
        return None

    def get_pct_as_whole(*keys):
        val = get_value(*keys)
        if val is not None:
            return round(val * 100, 1)
        return None

    return {
        "offensive_rating": get_value("OFF_RATING", "E_OFF_RATING"),
        "defensive_rating": get_value("DEF_RATING", "E_DEF_RATING"),
        "net_rating": get_value("NET_RATING", "E_NET_RATING"),
        "effective_fg_percentage": get_pct_as_whole("EFG_PCT"),
        "true_shooting_percentage": get_pct_as_whole("TS_PCT"),
        "usage_percentage": get_pct_as_whole("USG_PCT", "E_USG_PCT"),
        "pace": get_value("PACE", "E_PACE"),
        "player_impact_estimate": get_pct_as_whole("PIE"),
    }


def setup_advanced_table(conn):
    """Ensure advanced_box_scores table exists."""
    with conn.cursor() as cur:
        cur.execute("""
            CREATE TABLE IF NOT EXISTS advanced_box_scores (
                game_log_id INT PRIMARY KEY REFERENCES player_game_logs(game_log_id) ON DELETE CASCADE,
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


def insert_game_log(conn, player_id, season, log):
    """Insert game log. Returns game_log_id."""
    with conn.cursor() as cur:
        cur.execute(
            """
            INSERT INTO player_game_logs
            (player_id, season, game_date, opponent, min, pts, reb, ast, stl, blk)
            VALUES (%s, %s, %s, %s, %s, %s, %s, %s, %s, %s)
            ON CONFLICT (player_id, season, game_date) DO NOTHING
            RETURNING game_log_id;
            """,
            (player_id, season, log["game_date"], log["opponent"],
             log["min"], log["pts"], log["reb"], log["ast"], log["stl"], log["blk"]),
        )
        result = cur.fetchone()
        if result:
            return result[0]
        # If conflict, fetch existing game_log_id
        cur.execute(
            "SELECT game_log_id FROM player_game_logs WHERE player_id = %s AND season = %s AND game_date = %s",
            (player_id, season, log["game_date"]),
        )
        result = cur.fetchone()
        return result[0] if result else None


def insert_advanced_stats(conn, game_log_id, stats):
    """Insert advanced stats."""
    with conn.cursor() as cur:
        cur.execute(
            """
            INSERT INTO advanced_box_scores
            (game_log_id, offensive_rating, defensive_rating, net_rating, effective_fg_percentage,
             true_shooting_percentage, usage_percentage, pace, player_impact_estimate)
            VALUES (%s, %s, %s, %s, %s, %s, %s, %s, %s)
            ON CONFLICT (game_log_id) DO NOTHING;
            """,
            (game_log_id, stats["offensive_rating"], stats["defensive_rating"],
             stats["net_rating"], stats["effective_fg_percentage"],
             stats["true_shooting_percentage"], stats["usage_percentage"],
             stats["pace"], stats["player_impact_estimate"]),
        )


def main():
    load_dotenv()
    print("=" * 60)
    print("Fetch Game Stats")
    print("=" * 60)

    # Step 1: Load games from JSON file
    try:
        games, game_date = load_todays_games()
    except FileNotFoundError as exc:
        print(f"\nError: {exc}")
        return

    if not games:
        print("\nNo games in the JSON file. Nothing to process.")
        return

    print(f"\nFetching stats for games on {game_date.isoformat()}...")

    # Step 2: Map team names to IDs (requires DB connection)
    with get_db_connection() as conn:
        team_name_map = build_team_name_mapping(conn)

    teams_to_process = set()

    for game in games:
        home_team = game.get("home_team")
        away_team = game.get("away_team")

        home_info = team_name_map.get(home_team)
        away_info = team_name_map.get(away_team)

        if not home_info:
            print(f"Warning: Could not map home team '{home_team}'")
        else:
            teams_to_process.add((home_info["id"], home_info["abbreviation"], home_team))

        if not away_info:
            print(f"Warning: Could not map away team '{away_team}'")
        else:
            teams_to_process.add((away_info["id"], away_info["abbreviation"], away_team))

    if not teams_to_process:
        print("No teams could be mapped. Exiting.")
        return

    print(f"\nProcessing {len(teams_to_process)} teams from today's games...")

    if TEST_MODE:
        # Only process first team in test mode, no database writes
        teams_to_process = list(teams_to_process)[:1]
        print(f"TEST_MODE: Processing only {teams_to_process[0][2]} (no database writes)")

        for team_id, team_abbr, team_name in teams_to_process:
            print(f"\nProcessing {team_name}...")

            try:
                roster = fetch_team_players(team_id, SEASON)
            except Exception as exc:
                print(f"  Failed to fetch roster: {exc}")
                continue

            if not roster:
                print(f"  No roster data.")
                continue

            print(f"  Found {len(roster)} players on roster.")

            # Only fetch first 3 players in test mode
            for player_id, player_name in roster[:3]:
                try:
                    game_log = fetch_player_game_log_for_date(player_id, SEASON, game_date)
                except Exception as exc:
                    print(f"    {player_name}: failed to fetch game log: {exc}")
                    random_delay(1500, 3000)
                    continue

                if not game_log:
                    print(f"    {player_name}: did not play today")
                    random_delay(500, 1000)
                    continue

                print(f"    {player_name}: {game_log['pts']} pts, {game_log['reb']} reb, {game_log['ast']} ast")

                try:
                    advanced = fetch_player_advanced_for_date(player_id, SEASON, game_date)
                    if advanced:
                        print(f"      Advanced: TS%={advanced['true_shooting_percentage']}, USG%={advanced['usage_percentage']}")
                except Exception as exc:
                    print(f"      Failed to fetch advanced stats: {exc}")

                random_delay(1500, 3000)

        print("\nTEST_MODE complete. No data was written to the database.")
        return

    # Step 3: Connect to DB and process (production mode only)
    with get_db_connection() as conn:
        log_connection_info(conn)
        setup_database(conn)
        setup_advanced_table(conn)

        total_inserted = 0
        total_players = 0

        for team_id, team_abbr, team_name in teams_to_process:
            print(f"\nProcessing {team_name}...")

            # Fetch roster
            try:
                roster = fetch_team_players(team_id, SEASON)
            except Exception as exc:
                print(f"  Failed to fetch roster: {exc}")
                random_delay(2000, 5000)
                continue

            if not roster:
                print(f"  No roster data.")
                continue

            print(f"  Found {len(roster)} players on roster.")
            team_inserted = 0

            for player_id, player_name in roster:
                total_players += 1

                # Ensure player exists in DB
                ensure_player_exists(conn, player_id, player_name, team_abbr)

                # Fetch traditional game log for yesterday
                try:
                    game_log = fetch_player_game_log_for_date(player_id, SEASON, game_date)
                except Exception as exc:
                    print(f"    {player_name}: failed to fetch game log: {exc}")
                    random_delay(1500, 3000)
                    continue

                if not game_log:
                    # Player didn't play yesterday (DNP, injury, etc.)
                    random_delay(500, 1000)
                    continue

                # Insert game log
                game_log_id = insert_game_log(conn, player_id, SEASON, game_log)

                # Fetch and insert advanced stats
                if game_log_id:
                    try:
                        advanced = fetch_player_advanced_for_date(player_id, SEASON, game_date)
                        if advanced:
                            insert_advanced_stats(conn, game_log_id, advanced)
                    except Exception as exc:
                        print(f"    {player_name}: failed to fetch advanced stats: {exc}")

                conn.commit()
                team_inserted += 1
                total_inserted += 1
                print(f"    {player_name}: {game_log['pts']} pts, {game_log['reb']} reb, {game_log['ast']} ast")
                random_delay(1500, 3000)

            print(f"  {team_name}: inserted {team_inserted} player games.")

        print(f"\nProcessing complete. Inserted {total_inserted} game logs from {len(teams_to_process)} teams.")


if __name__ == "__main__":
    main()
