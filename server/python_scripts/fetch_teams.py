"""Load team name <-> abbreviation mappings.

    python fetch_teams.py --sport mlb

WHY THIS EXISTS: the app joins a game's team NAME, which the Odds API supplies
("Los Angeles Dodgers"), to the ABBREVIATION stored on a player row ("LAD").
With only the 30 NBA teams loaded, that lookup returned undefined for every MLB
game and the player-props section of a game page rendered empty -- 117 props
present in the response, none displayed.

NFL is not covered yet: nflverse publishes no teams artifact at the paths this
project reads, and NFL has no games on the board, so it is deferred rather than
hardcoded.
"""

import os
import sys

import psycopg
from dotenv import load_dotenv

sys.path.insert(0, os.path.dirname(os.path.abspath(__file__)))
from sources.mlb_source import teams as mlb_teams

LOADERS = {"mlb": mlb_teams}


def get_db_connection():
    load_dotenv()
    url = os.getenv("DATABASE_URL")
    if not url:
        raise SystemExit("DATABASE_URL is not set.")
    return psycopg.connect(url, sslmode="require")


def run(sport):
    rows = LOADERS[sport]()
    print(f"{sport}: {len(rows)} teams from source")

    with get_db_connection() as conn:
        with conn.cursor() as cur:
            written = 0
            for t in rows:
                # team_id is the primary key and carries the source's own id --
                # MLBAM numbers each club in the low hundreds while the NBA rows
                # use 1610612737+, so the two ranges cannot collide. Keying on it
                # makes a re-run correct a renamed club instead of duplicating it.
                cur.execute(
                    """
                    INSERT INTO teams (team_id, team_name, team_abbreviation, sport)
                    VALUES (%s, %s, %s, %s)
                    ON CONFLICT (team_id) DO UPDATE
                    SET team_name = EXCLUDED.team_name,
                        team_abbreviation = EXCLUDED.team_abbreviation,
                        sport = EXCLUDED.sport
                    """,
                    (t["team_id"], t["name"], t["abbreviation"], sport),
                )
                written += 1
        conn.commit()
    print(f"{sport}: {written} teams written")


if __name__ == "__main__":
    args = sys.argv[1:]
    sport = args[args.index("--sport") + 1] if "--sport" in args else None
    if sport not in LOADERS:
        print(f"Usage: python fetch_teams.py --sport {{{'|'.join(LOADERS)}}}")
        sys.exit(1)
    run(sport)
