"""
Fetch NBA player props from The Odds API and store in database.

This script fetches player prop betting lines for today's NBA games
and stores them in the player_props table for quick retrieval.

Designed for free tier API usage (~500 calls/month):
- Run once daily (or twice on game days)
- Fetches props for all games in one batch

Usage:
    python fetch_player_props.py
"""

import os
import sys
import time
import requests
from datetime import datetime, timedelta
from zoneinfo import ZoneInfo

import psycopg
from dotenv import load_dotenv

# NBA's reference timezone. A game tipping in the evening ET is already past
# midnight UTC, so dating it by the UTC day would push it to "tomorrow".
EASTERN = ZoneInfo("America/New_York")

# This loader is NBA-only (the endpoints below are basketball_nba). Naming it
# rather than leaving it implicit is what lets the player lookup scope itself
# to one sport now that three leagues share the players table.
SPORT = "nba"

# Markets to fetch
MARKETS = [
    'player_points',
    'player_rebounds',
    'player_assists',
    'player_points_rebounds',
    'player_points_assists',
    'player_rebounds_assists'
]

# Bookmakers to include
BOOKMAKERS = 'draftkings,fanduel,betmgm,betus,fanatics,espnbet'


def get_db_connection():
    """Get a database connection."""
    load_dotenv()
    database_url = os.getenv("DATABASE_URL")
    if database_url:
        return psycopg.connect(database_url, sslmode="require")

    return psycopg.connect(
        dbname=os.getenv("PGDATABASE", "nba_stats"),
        user=os.getenv("PGUSER", "postgres"),
        password=os.getenv("PGPASSWORD"),
        host=os.getenv("PGHOST", "localhost"),
        port=os.getenv("PGPORT", "5432"),
    )


def get_odds_api_key():
    """Get the Odds API key from environment."""
    load_dotenv()
    api_key = os.getenv("ODDS_API_KEY")
    if not api_key:
        print("Error: ODDS_API_KEY not set in environment")
        sys.exit(1)
    return api_key


def fetch_nba_events(api_key):
    """Fetch NBA game events from The Odds API."""
    today = datetime.now()
    start_date = today.strftime('%Y-%m-%dT00:00:00Z')
    end_date = (today + timedelta(days=2)).strftime('%Y-%m-%dT23:59:59Z')

    url = "https://api.the-odds-api.com/v4/sports/basketball_nba/events"
    params = {
        'apiKey': api_key,
        'dateFormat': 'iso',
        'commenceTimeFrom': start_date,
        'commenceTimeTo': end_date
    }

    response = requests.get(url, params=params)
    response.raise_for_status()

    return response.json()


def fetch_props_for_event(api_key, event_id):
    """Fetch player props for a specific event."""
    url = f"https://api.the-odds-api.com/v4/sports/basketball_nba/events/{event_id}/odds/"
    params = {
        'apiKey': api_key,
        'regions': 'us,us2',
        'markets': ','.join(MARKETS),
        'bookmakers': BOOKMAKERS,
        'oddsFormat': 'american',
        'dateFormat': 'iso'
    }

    response = requests.get(url, params=params)
    response.raise_for_status()

    return response.json()


def link_player_name_to_id(conn, player_name, sport=SPORT):
    """Match a prop's player name to a player_id WITHIN one sport.

    The sport filter is load-bearing now that players from three leagues share
    the table. "Spencer Jones" is both an NBA and an MLB player and "Tyler
    Smith" is both NBA and NFL, so an unscoped LIMIT 1 can attach an NBA prop
    to a baseball player_id -- which then reads that player's game logs and
    produces a confidently wrong hit rate.

    Returns None on an ambiguous match rather than guessing. A prop with a null
    player_id is merely unlinked; one linked to the wrong player is wrong.
    """
    with conn.cursor() as cur:
        cur.execute(
            "SELECT player_id FROM players WHERE sport = %s AND LOWER(full_name) = LOWER(%s)",
            (sport, player_name),
        )
        rows = cur.fetchall()
        if len(rows) == 1:
            return rows[0][0]
        if len(rows) > 1:
            print(f"  ! ambiguous name within {sport}: {player_name} -> {len(rows)} players; leaving unlinked")
        return None


# How long to keep every intermediate snapshot, and how long to keep the final
# one. Full history powers "the line moved 25.5 -> 26.5"; the closing line alone
# is what closing-line value needs, and that stays worth having long after the
# intraday movement stops being interesting.
FULL_HISTORY_DAYS = 14
CLOSING_LINE_DAYS = 365


def compact_old_props(conn):
    """Age out prop history in two stages instead of deleting yesterday's rows.

    The previous version deleted every prop for a past game date on each run,
    which made the append-only change pointless -- history would accumulate for
    one day and then be thrown away. Instead:

      1. Beyond FULL_HISTORY_DAYS, drop the intermediate snapshots but keep the
         LAST one per prop. That is the closing line, the only snapshot needed
         to grade a bet or compute CLV.
      2. Beyond CLOSING_LINE_DAYS, drop the row entirely.
    """
    with conn.cursor() as cur:
        cur.execute(
            """
            DELETE FROM player_props p
            WHERE p.game_date < (NOW() AT TIME ZONE 'America/New_York')::date
                                 - MAKE_INTERVAL(days => %s)
              AND EXISTS (
                SELECT 1 FROM player_props q
                WHERE q.player_name = p.player_name
                  AND q.game_id     = p.game_id
                  AND q.market      = p.market
                  AND q.bookmaker   = p.bookmaker
                  AND (q.fetched_at > p.fetched_at
                       OR (q.fetched_at = p.fetched_at AND q.id > p.id))
              )
            """,
            (FULL_HISTORY_DAYS,),
        )
        compacted = cur.rowcount

        cur.execute(
            """DELETE FROM player_props
               WHERE game_date < (NOW() AT TIME ZONE 'America/New_York')::date
                                  - MAKE_INTERVAL(days => %s)""",
            (CLOSING_LINE_DAYS,),
        )
        expired = cur.rowcount
        conn.commit()
        print(f"Compacted {compacted} intermediate snapshots, expired {expired} rows")


def store_player_prop(conn, prop_data):
    """Append one prop snapshot. Never updates an existing row."""
    with conn.cursor() as cur:
        cur.execute("""
            INSERT INTO player_props (
                player_name, player_id, game_id, game_date, home_team, away_team,
                market, bookmaker, over_line, over_odds, under_line, under_odds, fetched_at
            ) VALUES (%s, %s, %s, %s, %s, %s, %s, %s, %s, %s, %s, %s, NOW())
            -- Append, never overwrite. Each fetch is a snapshot; the sequence of
            -- them IS the line movement. Readers that want the current line use
            -- the player_props_latest view.
        """, (
            prop_data['player_name'],
            prop_data['player_id'],
            prop_data['game_id'],
            prop_data['game_date'],
            prop_data['home_team'],
            prop_data['away_team'],
            prop_data['market'],
            prop_data['bookmaker'],
            prop_data['over_line'],
            prop_data['over_odds'],
            prop_data['under_line'],
            prop_data['under_odds']
        ))


def main():
    print(f"Starting player props fetch at {datetime.now()}")

    api_key = get_odds_api_key()
    conn = get_db_connection()

    try:
        # Clear old props
        compact_old_props(conn)

        # Fetch NBA events
        print("Fetching NBA events...")
        events = fetch_nba_events(api_key)
        print(f"Found {len(events)} NBA games")

        # Offseason: no upcoming games. Stale rows are already cleared above, so
        # exit cleanly without making any per-event odds calls (saves API credits).
        if not events:
            print("No upcoming games — offseason no-op. Done.")
            return

        total_props = 0

        for event in events:
            game_id = event['id']
            home_team = event['home_team']
            away_team = event['away_team']
            # Date by US Eastern calendar day, not the UTC day (see EASTERN note).
            commence = datetime.fromisoformat(event['commence_time'].replace('Z', '+00:00'))
            game_date = commence.astimezone(EASTERN).date().isoformat()

            print(f"Fetching props for: {away_team} @ {home_team} ({game_date})")

            try:
                props_data = fetch_props_for_event(api_key, game_id)

                if not props_data.get('bookmakers'):
                    print(f"  No bookmaker data available")
                    continue

                for bookmaker in props_data['bookmakers']:
                    bookmaker_key = bookmaker['key']

                    for market in bookmaker.get('markets', []):
                        market_key = market['key']

                        # Group outcomes by player
                        player_outcomes = {}
                        for outcome in market.get('outcomes', []):
                            player_name = outcome.get('description', '')
                            if not player_name:
                                continue

                            if player_name not in player_outcomes:
                                player_outcomes[player_name] = {'over': None, 'under': None}

                            if outcome.get('name') == 'Over':
                                player_outcomes[player_name]['over'] = outcome
                            elif outcome.get('name') == 'Under':
                                player_outcomes[player_name]['under'] = outcome

                        # Store props for each player
                        for player_name, outcomes in player_outcomes.items():
                            player_id = link_player_name_to_id(conn, player_name)

                            prop_data = {
                                'player_name': player_name,
                                'player_id': player_id,
                                'game_id': game_id,
                                'game_date': game_date,
                                'home_team': home_team,
                                'away_team': away_team,
                                'market': market_key,
                                'bookmaker': bookmaker_key,
                                'over_line': outcomes['over'].get('point') if outcomes['over'] else None,
                                'over_odds': outcomes['over'].get('price') if outcomes['over'] else None,
                                'under_line': outcomes['under'].get('point') if outcomes['under'] else None,
                                'under_odds': outcomes['under'].get('price') if outcomes['under'] else None
                            }

                            store_player_prop(conn, prop_data)
                            total_props += 1

                conn.commit()

                # Small delay to be nice to the API
                time.sleep(0.2)

            except requests.exceptions.HTTPError as e:
                print(f"  Error fetching props: {e}")
                continue

        print(f"\nDone! Stored {total_props} player prop entries")

        # Show API usage info
        print("\nNote: Check your Odds API dashboard for remaining quota")

    finally:
        conn.close()


if __name__ == "__main__":
    main()
