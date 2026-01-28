import time
import random
from datetime import datetime

import pandas as pd
from nba_api.stats.endpoints import playergamelogs
from nba_api.stats.endpoints.commonteamroster import CommonTeamRoster
from nba_api.stats.static import teams as static_teams

from fetch_todays_stats import get_db_connection, log_connection_info

SEASON = "2025-26"
TEST_MODE = False
TEST_TEAM_ID = 1610612744  # Warriors
REQUEST_TIMEOUT = 60
MAX_RETRIES = 3


def random_delay(min_ms=1500, max_ms=3000):
    time.sleep(random.uniform(min_ms, max_ms) / 1000)


def to_float(value):
    try:
        return float(value)
    except (TypeError, ValueError):
        return None


def fetch_team_players(team_id, season):
    last_error = None
    roster = None
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
            sleep_ms = 1000 * attempt + random.randint(0, 500)
            time.sleep(sleep_ms / 1000)
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


def setup_database(conn):
    with conn.cursor() as cur:
        # Migrate: if the old table with advanced_box_score_id exists, drop and recreate
        cur.execute(
            """
            SELECT 1
            FROM information_schema.columns
            WHERE table_name = 'advanced_box_scores'
              AND column_name = 'advanced_box_score_id';
            """
        )
        if cur.fetchone() is not None:
            print("Migrating advanced_box_scores: dropping old table with serial ID...")
            cur.execute("DROP TABLE advanced_box_scores;")

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


def fetch_player_advanced_game_logs(player_id, season):
    """Fetch all advanced per-game stats for a player in a single API call."""
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
            return df
        except Exception as exc:
            if attempt == MAX_RETRIES:
                raise
            sleep_ms = 1000 * attempt + random.randint(0, 500)
            time.sleep(sleep_ms / 1000)
    return pd.DataFrame()


def get_game_log_lookup(conn, player_id, season):
    """Returns dicts mapping game_date -> game_log_id and game_id -> game_log_id."""
    with conn.cursor() as cur:
        cur.execute(
            "SELECT game_log_id, game_date, game_id FROM player_game_logs WHERE player_id = %s AND season = %s",
            (player_id, season),
        )
        rows = cur.fetchall()

    date_lookup = {}
    game_id_lookup = {}
    for game_log_id, game_date, game_id in rows:
        date_lookup[game_date] = game_log_id
        if game_id:
            game_id_lookup[str(game_id)] = game_log_id

    return date_lookup, game_id_lookup


def get_existing_advanced_game_log_ids(conn, player_id, season):
    """Returns set of game_log_ids that already have advanced_box_scores rows."""
    with conn.cursor() as cur:
        cur.execute(
            """SELECT abs.game_log_id
               FROM advanced_box_scores abs
               JOIN player_game_logs pgl ON abs.game_log_id = pgl.game_log_id
               WHERE pgl.player_id = %s AND pgl.season = %s""",
            (player_id, season),
        )
        return {row[0] for row in cur.fetchall()}


def parse_game_date(raw_value):
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


def extract_advanced_stats_from_row(row, columns):
    """Extract the 8 advanced stats from a DataFrame row."""
    col_set = set(columns)

    def get_value(*keys):
        for key in keys:
            if key in col_set:
                value = row.get(key) if hasattr(row, "get") else row[columns.index(key)] if key in columns else None
                if value is not None:
                    return to_float(value)
        return None

    def get_pct_as_whole(*keys):
        """Get a decimal percentage value and convert to a whole number (e.g. 0.567 -> 56.7)."""
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


def insert_advanced_stats(conn, game_log_id, stats):
    insert_query = """
        INSERT INTO advanced_box_scores
        (game_log_id, offensive_rating, defensive_rating, net_rating, effective_fg_percentage,
         true_shooting_percentage, usage_percentage, pace, player_impact_estimate)
        VALUES (%s, %s, %s, %s, %s, %s, %s, %s, %s)
        ON CONFLICT (game_log_id) DO NOTHING;
    """
    with conn.cursor() as cur:
        cur.execute(
            insert_query,
            (
                game_log_id,
                stats["offensive_rating"],
                stats["defensive_rating"],
                stats["net_rating"],
                stats["effective_fg_percentage"],
                stats["true_shooting_percentage"],
                stats["usage_percentage"],
                stats["pace"],
                stats["player_impact_estimate"],
            ),
        )


def main():
    with get_db_connection() as conn:
        log_connection_info(conn)
        setup_database(conn)

        # Validate that player_game_logs exist for the season
        with conn.cursor() as cur:
            cur.execute(
                "SELECT COUNT(*) FROM player_game_logs WHERE season = %s",
                (SEASON,),
            )
            log_count = cur.fetchone()[0]
        if log_count == 0:
            print(
                f"No player_game_logs found for {SEASON}. "
                "Run fetch_team_rosters_and_logs.py first to populate game logs."
            )
            return
        print(f"Found {log_count} existing game log rows for {SEASON}.")

        # Build player roster from all teams
        team_list = static_teams.get_teams()
        if TEST_MODE:
            team_ids = [TEST_TEAM_ID]
            print(f"TEST_MODE: Using team ID {TEST_TEAM_ID} for {SEASON}.")
        else:
            team_ids = [team["id"] for team in team_list]
            print(f"Found {len(team_ids)} teams to process for {SEASON}.")

        player_map = {}
        for team_id in team_ids:
            try:
                roster_players = fetch_team_players(team_id, SEASON)
            except Exception as exc:
                print(f"Failed to fetch roster for team {team_id}: {exc}")
                random_delay(2000, 5000)
                continue

            if not roster_players:
                print(f"No roster data returned for team {team_id}.")
                random_delay(2000, 5000)
                continue

            for player_id, player_name in roster_players:
                player_map[player_id] = player_name
            random_delay(1500, 3000)

        total_players = len(player_map)
        print(f"Found {total_players} unique players across all teams.")

        # Process each player: one API call per player
        processed = 0
        for player_id in sorted(player_map.keys()):
            processed += 1
            player_name = player_map[player_id]

            # Get game_log_id lookups from DB
            date_lookup, game_id_lookup = get_game_log_lookup(conn, player_id, SEASON)
            if not date_lookup and not game_id_lookup:
                print(f"[{processed}/{total_players}] {player_name}: no game logs in DB, skipping.")
                continue

            # Check which games already have advanced stats
            existing_ids = get_existing_advanced_game_log_ids(conn, player_id, SEASON)
            all_game_log_ids = set(date_lookup.values()) | set(game_id_lookup.values())
            if all_game_log_ids and all_game_log_ids.issubset(existing_ids):
                print(f"[{processed}/{total_players}] {player_name}: all {len(existing_ids)} games already have advanced stats, skipping.")
                continue

            # Fetch advanced game logs — ONE API call per player
            try:
                df = fetch_player_advanced_game_logs(player_id, SEASON)
            except Exception as exc:
                print(f"[{processed}/{total_players}] {player_name}: failed to fetch advanced logs: {exc}")
                random_delay(2000, 5000)
                continue

            if df is None or df.empty:
                print(f"[{processed}/{total_players}] {player_name}: no advanced game logs returned.")
                random_delay(1500, 3000)
                continue

            # On first player, log the columns so we can verify the response shape
            if processed == 1:
                print(f"Advanced game logs columns: {df.columns.tolist()}")

            if TEST_MODE:
                print(f"[{processed}/{total_players}] {player_name}: fetched {len(df)} advanced game log rows (TEST_MODE — not inserting into DB).")
                sample = df.head(3)
                for _, row in sample.iterrows():
                    stats = extract_advanced_stats_from_row(row, list(df.columns))
                    print(f"  {row.get('GAME_DATE', 'N/A')} — {stats}")
                random_delay(1500, 3000)
                continue

            columns = list(df.columns)
            inserted = 0
            skipped = 0
            unmatched = 0

            for _, row in df.iterrows():
                # Match this row to a game_log_id
                game_log_id = None

                # Try matching by game_date first
                raw_date = row.get("GAME_DATE") if "GAME_DATE" in columns else None
                if raw_date is not None:
                    parsed_date = parse_game_date(raw_date)
                    if parsed_date:
                        game_log_id = date_lookup.get(parsed_date)

                # Fallback: match by game_id
                if game_log_id is None and "GAME_ID" in columns:
                    game_id = str(row.get("GAME_ID", "")).strip()
                    if game_id:
                        game_log_id = game_id_lookup.get(game_id)

                if game_log_id is None:
                    unmatched += 1
                    continue

                # Skip if already has advanced stats
                if game_log_id in existing_ids:
                    skipped += 1
                    continue

                stats = extract_advanced_stats_from_row(row, columns)
                insert_advanced_stats(conn, game_log_id, stats)
                inserted += 1

            conn.commit()
            print(
                f"[{processed}/{total_players}] {player_name}: "
                f"inserted {inserted}, skipped {skipped}, unmatched {unmatched} "
                f"(API returned {len(df)} rows)"
            )
            random_delay(1500, 3000)

        print("All advanced box scores have been processed.")


if __name__ == "__main__":
    main()
