import time
import random
from datetime import datetime

from nba_api.stats.endpoints.commonteamroster import CommonTeamRoster
from nba_api.stats.static import teams as static_teams

from fetch_todays_stats import (
    get_db_connection,
    setup_database,
    fetch_player_game_logs,
)

SEASON = "2025-26"
SEASON_TYPE = "Regular Season"
TEST_MODE = False
TEST_TEAM_ID = 1610612744  # Warriors
REQUEST_TIMEOUT = 60
MAX_RETRIES = 3


def random_delay(min_ms=1500, max_ms=3000):
    time.sleep(random.uniform(min_ms, max_ms) / 1000)


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


def ensure_player_exists(conn, player_id, player_name, team_abbr):
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


def main():
    with get_db_connection() as conn:
        setup_database(conn)

        team_list = static_teams.get_teams()
        team_lookup = {team["id"]: team["abbreviation"] for team in team_list}
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

            team_abbr = team_lookup.get(team_id)
            for player_id, player_name in roster_players:
                player_map[player_id] = {
                    "name": player_name,
                    "team_abbr": team_abbr,
                }
            random_delay(1500, 3000)

        print(f"Found {len(player_map)} unique players across all teams.")

        insert_query = """
            INSERT INTO player_game_logs
            (player_id, season, game_date, opponent, min, pts, reb, ast, stl, blk)
            VALUES (%s, %s, %s, %s, %s, %s, %s, %s, %s, %s)
            ON CONFLICT (player_id, season, game_date) DO NOTHING;
        """

        for player_id in sorted(player_map.keys()):
            player_name = player_map[player_id]["name"]
            team_abbr = player_map[player_id]["team_abbr"]
            try:
                logs = fetch_player_game_logs(player_id, SEASON)
            except Exception as exc:
                print(f"Failed to fetch logs for {player_name} ({player_id}): {exc}")
                random_delay(2000, 5000)
                continue

            if not logs:
                print(f"No logs returned for {player_name} in {SEASON}.")
                random_delay(2000, 5000)
                continue

            if TEST_MODE:
                sample_logs = logs[:3]
                print(f"{player_name}: fetched {len(logs)} games (sample below).")
                for log in sample_logs:
                    print(
                        f"  {log['game_date']} vs {log['opponent']} "
                        f"- MIN {log['min']} PTS {log['pts']} "
                        f"REB {log['reb']} AST {log['ast']} "
                        f"STL {log['stl']} BLK {log['blk']}"
                    )
                random_delay(2000, 5000)
                continue

            ensure_player_exists(conn, player_id, player_name, team_abbr)

            inserted_count = 0
            with conn.cursor() as cur:
                for log in logs:
                    cur.execute(
                        insert_query,
                        (
                            player_id,
                            SEASON,
                            log["game_date"],
                            log["opponent"],
                            log["min"],
                            log["pts"],
                            log["reb"],
                            log["ast"],
                            log["stl"],
                            log["blk"],
                        ),
                    )
                    if cur.rowcount == 1:
                        inserted_count += 1
            conn.commit()
            print(f"{player_name}: fetched {len(logs)}, inserted {inserted_count}.")
            random_delay(2000, 5000)

        print("All team roster game logs have been processed.")


if __name__ == "__main__":
    main()
