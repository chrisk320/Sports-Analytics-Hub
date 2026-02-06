"""
Fetch NBA player headshot URLs using nba_api.

This script runs after fetch_bref_rosters_and_logs.py to populate
headshot URLs for players. Uses NBA.com CDN with player IDs from nba_api.

Can be run locally or in GitHub Actions (player search endpoint is
less likely to be blocked than stats endpoints).
"""

import os
import time
import random
import unicodedata

import psycopg
from dotenv import load_dotenv
from nba_api.stats.static import players as nba_players

# Configuration
TEST_MODE = False
HEADSHOT_URL_TEMPLATE = "https://cdn.nba.com/headshots/nba/latest/1040x760/{player_id}.png"


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


def normalize_name(name):
    """Normalize player name for matching.

    - Remove accents (ć -> c, ü -> u)
    - Lowercase
    - Remove suffixes like Jr., Sr., III, II
    """
    # Remove accents
    normalized = unicodedata.normalize('NFKD', name)
    normalized = ''.join(c for c in normalized if not unicodedata.combining(c))

    # Lowercase
    normalized = normalized.lower()

    # Remove common suffixes
    for suffix in [' jr.', ' jr', ' sr.', ' sr', ' iii', ' ii', ' iv']:
        if normalized.endswith(suffix):
            normalized = normalized[:-len(suffix)]

    return normalized.strip()


def find_nba_player_id(player_name):
    """Find NBA player ID by name using nba_api static data."""
    normalized_search = normalize_name(player_name)

    # Get all NBA players (this is static data, no API call)
    all_players = nba_players.get_players()

    # Try exact match first
    for player in all_players:
        if normalize_name(player['full_name']) == normalized_search:
            return player['id']

    # Try partial match (first and last name)
    search_parts = normalized_search.split()
    if len(search_parts) >= 2:
        first_name = search_parts[0]
        last_name = search_parts[-1]

        for player in all_players:
            player_normalized = normalize_name(player['full_name'])
            player_parts = player_normalized.split()
            if len(player_parts) >= 2:
                if player_parts[0] == first_name and player_parts[-1] == last_name:
                    return player['id']

    return None


def main():
    print("=" * 60)
    print("Fetch Player Headshots from NBA.com")
    print("=" * 60)

    if TEST_MODE:
        print("\n** TEST_MODE enabled - only processing first 20 players **\n")

    with get_db_connection() as conn:
        log_connection_info(conn)

        # Get players without headshot URLs
        with conn.cursor() as cur:
            cur.execute("""
                SELECT player_id, full_name
                FROM players
                WHERE headshot_url IS NULL OR headshot_url = ''
                ORDER BY player_id
            """)
            players_to_update = cur.fetchall()

        print(f"Found {len(players_to_update)} players without headshots")

        if TEST_MODE:
            players_to_update = players_to_update[:20]
            print(f"TEST_MODE: Processing only {len(players_to_update)} players")

        updated = 0
        not_found = 0

        for player_id, full_name in players_to_update:
            nba_id = find_nba_player_id(full_name)

            if nba_id:
                headshot_url = HEADSHOT_URL_TEMPLATE.format(player_id=nba_id)

                with conn.cursor() as cur:
                    cur.execute(
                        "UPDATE players SET headshot_url = %s WHERE player_id = %s",
                        (headshot_url, player_id)
                    )

                updated += 1
                if TEST_MODE or updated <= 10:
                    print(f"  {full_name} -> NBA ID {nba_id}")
            else:
                not_found += 1
                if TEST_MODE or not_found <= 10:
                    print(f"  {full_name} -> NOT FOUND")

        conn.commit()

        print("\n" + "=" * 60)
        print(f"Complete! Updated {updated} headshots, {not_found} not found.")
        print("=" * 60)


if __name__ == "__main__":
    main()
