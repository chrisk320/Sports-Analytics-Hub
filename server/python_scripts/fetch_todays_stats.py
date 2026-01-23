import os
import time
import random
from datetime import datetime

import psycopg
from dotenv import load_dotenv
from nba_api.stats.endpoints import playergamelogs

TEST_MODE = False

NBA_API_TIMEOUT = 60
NBA_API_RETRIES = 3


def get_db_connection():
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
    info = conn.info
    db_name = info.dbname or "unknown"
    user = info.user or "unknown"
    host = info.host or "unknown"
    port = info.port or "unknown"
    print(f"Connected to DB: {db_name} as {user}@{host}:{port}")


def setup_database(conn):
    create_table_query = """
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
    """
    with conn.cursor() as cur:
        cur.execute(create_table_query)
        cur.execute(
            """
            SELECT conname
            FROM pg_constraint
            WHERE conrelid = 'player_game_logs'::regclass
              AND contype = 'u'
              AND pg_get_constraintdef(oid) LIKE '%(player_id, game_date)%';
            """
        )
        row = cur.fetchone()
        if row:
            cur.execute(f'ALTER TABLE player_game_logs DROP CONSTRAINT IF EXISTS "{row[0]}";')
        cur.execute(
            """
            DO $$
            BEGIN
                IF NOT EXISTS (
                    SELECT 1
                    FROM pg_constraint
                    WHERE conrelid = 'player_game_logs'::regclass
                      AND contype = 'u'
                      AND pg_get_constraintdef(oid) LIKE '%(player_id, season, game_date)%'
                ) THEN
                    ALTER TABLE player_game_logs
                    ADD CONSTRAINT player_game_logs_player_season_date_key
                    UNIQUE (player_id, season, game_date);
                END IF;
            END$$;
            """
        )
        cur.execute("SELECT pg_get_serial_sequence('player_game_logs', 'game_log_id');")
        sequence_name = cur.fetchone()[0]
        if not sequence_name:
            cur.execute(
                """
                CREATE SEQUENCE IF NOT EXISTS player_game_logs_game_log_id_seq;
                ALTER TABLE player_game_logs
                ALTER COLUMN game_log_id
                SET DEFAULT nextval('player_game_logs_game_log_id_seq');
                ALTER SEQUENCE player_game_logs_game_log_id_seq
                OWNED BY player_game_logs.game_log_id;
                """
            )
            sequence_name = "player_game_logs_game_log_id_seq"
        cur.execute(
            f"""
            SELECT setval(
                '{sequence_name}',
                COALESCE((SELECT MAX(game_log_id) FROM player_game_logs), 0) + 1,
                false
            );
            """
        )
    conn.commit()


def random_delay(min_ms=1500, max_ms=3000):
    time.sleep(random.uniform(min_ms, max_ms) / 1000)


def parse_opponent(matchup):
    if not matchup:
        return None
    parts = matchup.strip().split()
    return parts[-1] if parts else None


def fetch_player_game_logs(player_id, season):
    last_error = None
    gamelogs = None
    for attempt in range(1, NBA_API_RETRIES + 1):
        try:
            gamelogs = playergamelogs.PlayerGameLogs(
                player_id_nullable=player_id,
                season_nullable=season,
                season_type_nullable="Regular Season",
                league_id_nullable="00",
                timeout=NBA_API_TIMEOUT,
            )
            break
        except Exception as exc:
            last_error = exc
            if attempt == NBA_API_RETRIES:
                raise
            sleep_ms = 1000 * attempt + random.randint(0, 500)
            time.sleep(sleep_ms / 1000)
    if last_error and gamelogs is None:
        raise last_error

    df = gamelogs.get_data_frames()[0]
    if df.empty:
        return []

    headers = list(df.columns)
    rows = df.values.tolist()

    try:
        idx_game_date = headers.index("GAME_DATE")
        idx_matchup = headers.index("MATCHUP")
        idx_min = headers.index("MIN")
        idx_pts = headers.index("PTS")
        idx_reb = headers.index("REB")
        idx_ast = headers.index("AST")
        idx_stl = headers.index("STL")
        idx_blk = headers.index("BLK")
    except ValueError:
        return []

    game_logs = []
    for row in rows:
        game_date_raw = row[idx_game_date]
        try:
            game_date = datetime.strptime(game_date_raw, "%b %d, %Y").date()
        except ValueError:
            iso_value = game_date_raw.replace("Z", "")
            game_date = datetime.fromisoformat(iso_value).date()
        matchup = row[idx_matchup]
        opponent = parse_opponent(matchup)
        game_logs.append(
            {
                "game_date": game_date,
                "opponent": opponent,
                "min": round(float(row[idx_min] or 0)),
                "pts": row[idx_pts] or 0,
                "reb": row[idx_reb] or 0,
                "ast": row[idx_ast] or 0,
                "stl": row[idx_stl] or 0,
                "blk": row[idx_blk] or 0,
            }
        )

    return game_logs


def main():
    with get_db_connection() as conn:
        log_connection_info(conn)
        setup_database(conn)

        if TEST_MODE:
            test_player_id = 201939
            test_player_name = "Stephen Curry"
            test_season = "2025-26"
            print("--- RUNNING IN TEST MODE ---")
            logs = fetch_player_game_logs(test_player_id, test_season)
            print(f"Found {len(logs)} games for {test_player_name} in {test_season}.")
            for log in logs[:5]:
                print(log)
            return

        with conn.cursor() as cur:
            top_players_query = """
                SELECT p.player_id, p.full_name
                FROM player_season_stats s
                JOIN players p ON s.player_id = p.player_id
                WHERE s.season = '2024-25'
                ORDER BY s.points_avg DESC
                LIMIT 100;
            """
            cur.execute(top_players_query)
            top_players = cur.fetchall()

        seasons_to_process = ["2025-26"]
        print(f"Found {len(top_players)} top players to scrape for seasons: {', '.join(seasons_to_process)}.")

        insert_query = """
            INSERT INTO player_game_logs
            (player_id, season, game_date, opponent, min, pts, reb, ast, stl, blk)
            VALUES (%s, %s, %s, %s, %s, %s, %s, %s, %s, %s)
            ON CONFLICT (player_id, season, game_date) DO NOTHING;
        """
        for season in seasons_to_process:
            print(f"\n--- PROCESSING SEASON: {season} ---")
            for player_id, full_name in top_players:
                try:
                    logs = fetch_player_game_logs(player_id, season)
                except Exception as exc:
                    print(f"Failed to fetch logs for {full_name}: {exc}")
                    random_delay(2000, 5000)
                    continue

                if not logs:
                    print(f"No logs returned for {full_name} in {season}.")
                    random_delay(2000, 5000)
                    continue

                inserted_count = 0
                with conn.cursor() as cur:
                    for log in logs:
                        cur.execute(
                            insert_query,
                            (
                                player_id,
                                season,
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
                print(
                    f"{full_name}: fetched {len(logs)} games, "
                    f"inserted {inserted_count} new rows."
                )
                random_delay(2000, 5000)

        print("\nAll game logs have been processed.")


if __name__ == "__main__":
    main()
