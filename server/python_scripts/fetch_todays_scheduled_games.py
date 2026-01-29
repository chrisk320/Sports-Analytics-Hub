"""
Fetch today's scheduled NBA games from The Odds API and save to JSON.

Run this script in the morning before games start.
The night script (fetch_todays_game_stats.py) will read this file after games complete.
"""

import os
import json
from datetime import datetime, date, timezone
from pathlib import Path

import requests
from dotenv import load_dotenv

TEST_MODE = False
ODDS_API_BASE_URL = "https://api.the-odds-api.com/v4"
DATA_DIR = Path(__file__).parent.parent / "data"
GAMES_FILE = DATA_DIR / "todays_games.json"


def fetch_todays_games(target_date=None):
    """Fetch NBA games from The Odds API for a specific date.

    Args:
        target_date: The date to fetch games for. Defaults to today.
    """
    load_dotenv()
    api_key = os.getenv("ODDS_API_KEY")
    if not api_key:
        raise ValueError("ODDS_API_KEY not found in environment")

    if target_date is None:
        target_date = date.today()

    start_of_day = datetime.combine(target_date, datetime.min.time()).replace(tzinfo=timezone.utc)
    end_of_day = datetime.combine(target_date, datetime.max.time()).replace(tzinfo=timezone.utc)

    url = f"{ODDS_API_BASE_URL}/sports/basketball_nba/events"
    params = {
        "apiKey": api_key,
        "dateFormat": "iso",
        "commenceTimeFrom": start_of_day.strftime("%Y-%m-%dT%H:%M:%SZ"),
        "commenceTimeTo": end_of_day.strftime("%Y-%m-%dT%H:%M:%SZ"),
    }

    print(f"Fetching NBA games for {target_date.isoformat()}...")
    print(f"  URL: {url}")
    print(f"  Date range: {params['commenceTimeFrom']} to {params['commenceTimeTo']}")

    response = requests.get(url, params=params, timeout=30)
    response.raise_for_status()
    events = response.json()

    print(f"  API returned {len(events)} events")
    return events, target_date


def fetch_all_upcoming_games():
    """Fetch all upcoming NBA games (no date filter) for debugging."""
    load_dotenv()
    api_key = os.getenv("ODDS_API_KEY")
    if not api_key:
        raise ValueError("ODDS_API_KEY not found in environment")

    url = f"{ODDS_API_BASE_URL}/sports/basketball_nba/events"
    params = {
        "apiKey": api_key,
        "dateFormat": "iso",
    }

    print("Fetching ALL upcoming NBA games (no date filter)...")
    response = requests.get(url, params=params, timeout=30)
    response.raise_for_status()
    events = response.json()

    print(f"  API returned {len(events)} upcoming events")
    return events


def save_games_to_json(events, target_date):
    """Save games to JSON file."""
    games = []
    for event in events:
        games.append({
            "event_id": event.get("id"),
            "home_team": event.get("home_team"),
            "away_team": event.get("away_team"),
            "commence_time": event.get("commence_time"),
        })

    data = {
        "date": target_date.isoformat(),
        "fetched_at": datetime.now(timezone.utc).isoformat(),
        "games_count": len(games),
        "games": games,
    }

    # Ensure data directory exists
    DATA_DIR.mkdir(parents=True, exist_ok=True)

    with open(GAMES_FILE, "w") as f:
        json.dump(data, f, indent=2)

    print(f"\nSaved {len(games)} games to {GAMES_FILE}")
    return data


def main():
    print("=" * 60)
    print("Fetch Today's Scheduled NBA Games")
    print("=" * 60)

    if TEST_MODE:
        print("\n** TEST_MODE enabled **\n")

    # Fetch all upcoming games (no date filter - handles UTC timezone issues)
    try:
        events = fetch_all_upcoming_games()
    except Exception as exc:
        print(f"Failed to fetch games from Odds API: {exc}")
        return

    if not events:
        print("\nNo upcoming NBA games found.")
        return

    # Group games by date (UTC)
    games_by_date = {}
    for event in events:
        commence = event.get("commence_time", "")
        if commence:
            game_date = commence[:10]  # Extract YYYY-MM-DD
            if game_date not in games_by_date:
                games_by_date[game_date] = []
            games_by_date[game_date].append(event)

    # Get the earliest date with games (tonight's games in UTC)
    earliest_date = min(games_by_date.keys())
    todays_events = games_by_date[earliest_date]

    print(f"\nFound {len(todays_events)} games for {earliest_date} (UTC):")
    for event in todays_events:
        home = event.get("home_team", "?")
        away = event.get("away_team", "?")
        time = event.get("commence_time", "?")
        print(f"  {away} @ {home} - {time}")

    if TEST_MODE:
        print("\nTEST_MODE: Would save to JSON file (not saving)")
        print(f"  File path: {GAMES_FILE}")
        return

    # Save to JSON using the game date (UTC)
    target_date = date.fromisoformat(earliest_date)
    save_games_to_json(todays_events, target_date)
    print("\nDone! Run fetch_yesterdays_games.py tonight after games complete.")


if __name__ == "__main__":
    main()
