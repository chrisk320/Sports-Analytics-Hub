"""
Fetch today's scheduled NBA games from The Odds API and save to JSON.

Run this script in the morning before games start.
The night script (fetch_todays_game_stats.py) will read this file after games complete.
"""

import os
import json
from datetime import datetime, date, timezone
from pathlib import Path
from zoneinfo import ZoneInfo

import requests
from dotenv import load_dotenv

TEST_MODE = False
PST = ZoneInfo("America/Los_Angeles")
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


def filter_games_by_pst_date(events, target_date):
    """Filter games that occur on target_date in PST/PDT timezone.

    Args:
        events: List of events from the API
        target_date: The date to filter for (in Pacific time)

    Returns:
        List of events that occur on target_date in Pacific time
    """
    # Create start and end of day in PST, then convert to UTC for comparison
    pst_start = datetime.combine(target_date, datetime.min.time()).replace(tzinfo=PST)
    pst_end = datetime.combine(target_date, datetime.max.time()).replace(tzinfo=PST)

    # Convert to UTC
    utc_start = pst_start.astimezone(timezone.utc)
    utc_end = pst_end.astimezone(timezone.utc)

    print(f"\nFiltering games for {target_date.isoformat()} (Pacific Time)")
    print(f"  PST range: {pst_start.strftime('%Y-%m-%d %I:%M %p %Z')} to {pst_end.strftime('%Y-%m-%d %I:%M %p %Z')}")
    print(f"  UTC range: {utc_start.isoformat()} to {utc_end.isoformat()}")

    filtered = []
    for event in events:
        commence_str = event.get("commence_time", "")
        if commence_str:
            # Parse ISO format datetime (replace Z with +00:00 for fromisoformat)
            commence = datetime.fromisoformat(commence_str.replace("Z", "+00:00"))
            if utc_start <= commence <= utc_end:
                filtered.append(event)

    return filtered


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

    # Filter games for today in PST
    today_pst = datetime.now(PST).date()
    todays_events = filter_games_by_pst_date(events, today_pst)

    print(f"\nFound {len(todays_events)} games for {today_pst.isoformat()} (Pacific Time):")
    for event in todays_events:
        home = event.get("home_team", "?")
        away = event.get("away_team", "?")
        commence_str = event.get("commence_time", "?")
        # Convert to PST for display
        if commence_str != "?":
            commence_utc = datetime.fromisoformat(commence_str.replace("Z", "+00:00"))
            commence_pst = commence_utc.astimezone(PST)
            time_display = commence_pst.strftime("%I:%M %p %Z")
        else:
            time_display = "?"
        print(f"  {away} @ {home} - {time_display}")

    if TEST_MODE:
        print("\nTEST_MODE: Would save to JSON file (not saving)")
        print(f"  File path: {GAMES_FILE}")
        return

    if not todays_events:
        print("\nNo games scheduled for today in Pacific Time.")
        return

    # Save to JSON using today's date (PST)
    save_games_to_json(todays_events, today_pst)
    print("\nDone! Run fetch_yesterdays_games.py tonight after games complete.")


if __name__ == "__main__":
    main()
