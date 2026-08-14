"""MLB data from the MLB Stats API.

Reads statsapi.mlb.com directly with `requests` rather than using the
`MLB-StatsAPI` package. Two reasons: that package is GPL-3.0, which raises a
copyleft question in a repo published as a portfolio piece, and only two
endpoints are actually needed here. No key, no quota, no dependency.

Like the nflverse Parquet files and unlike the Basketball Reference scraper,
this is a public JSON API that accepts datacenter IPs -- the same one MLB.com's
own scoreboard calls -- so this pipeline can be cloud-scheduled.

Data courtesy of MLB Advanced Media. Attribution required, non-commercial use
only: http://gdx.mlb.com/components/copyright.txt
"""

import time

import requests

BASE = "https://statsapi.mlb.com/api/v1"
SPORT_ID = 1  # 1 == MLB. Minors and international leagues have their own ids.

# Regular season only. Spring training lines are not modeled, and folding
# postseason games into "last N games" would silently change what a hit rate
# means -- the same reasoning as the NFL loader's season_type filter.
GAME_TYPE_REGULAR = "R"

# Politeness delay between boxscore calls. The API is unmetered and public, but
# a full season is ~2,400 requests and there is no reason to hammer it.
REQUEST_DELAY_S = 0.1

_session = requests.Session()
_session.headers["User-Agent"] = "sports-analytics-hub/1.0 (personal project)"


def _get(path, **params):
    r = _session.get(f"{BASE}/{path}", params=params, timeout=30)
    r.raise_for_status()
    return r.json()


def schedule(start_date, end_date):
    """Finished regular-season games in a date range.

    Yields one dict per game with the identity a game log needs. `game_seq`
    comes from gameNumber so the two halves of a doubleheader stay distinct --
    they share a date, and without it the second game would overwrite the first
    through the (player_id, season, game_date, game_seq, role) key.
    """
    data = _get(
        "schedule",
        sportId=SPORT_ID,
        startDate=start_date,
        endDate=end_date,
        hydrate="probablePitcher,team",
    )
    for day in data.get("dates", []):
        for g in day.get("games", []):
            if g.get("gameType") != GAME_TYPE_REGULAR:
                continue
            # Only completed games. A live or postponed game has partial or no
            # stat lines, and loading those would poison season averages.
            if g.get("status", {}).get("codedGameState") != "F":
                continue
            yield {
                "game_pk": g["gamePk"],
                "game_date": day["date"],
                "season": str(g.get("season") or day["date"][:4]),
                "game_seq": int(g.get("gameNumber") or 1),
                "home": g["teams"]["home"]["team"].get("abbreviation"),
                "away": g["teams"]["away"]["team"].get("abbreviation"),
            }


def probable_pitchers(start_date, end_date):
    """Announced starters for upcoming games, keyed by gamePk.

    Comes free with the schedule call and is the single most useful thing on an
    MLB game card -- the starter drives every strikeout market on the slate.
    """
    data = _get(
        "schedule",
        sportId=SPORT_ID,
        startDate=start_date,
        endDate=end_date,
        hydrate="probablePitcher,team",
    )
    out = {}
    for day in data.get("dates", []):
        for g in day.get("games", []):
            sides = {}
            for side in ("home", "away"):
                pp = g["teams"][side].get("probablePitcher")
                if pp:
                    sides[side] = {"id": pp["id"], "name": pp["fullName"]}
            if sides:
                out[g["gamePk"]] = sides
    return out


# --- Stat extraction -------------------------------------------------------
#
# Batting and pitching are separate namespaces in the boxscore, and several
# keys mean OPPOSITE things across them: a pitcher's `hits` is hits allowed,
# and their `strikeOuts` is strikeouts thrown rather than struck out. Storing
# both under one name would let a pitcher's hits-allowed masquerade as batting
# hits. The pitching side is therefore renamed on the way in.

BATTING_STATS = {
    "at_bats": "atBats",
    "hits": "hits",
    "home_runs": "homeRuns",
    "total_bases": "totalBases",   # precomputed by the API; do not derive it
    "rbi": "rbi",
    "runs": "runs",
    "doubles": "doubles",
    "triples": "triples",
    "walks": "baseOnBalls",
    "strike_outs": "strikeOuts",   # times struck out
    "stolen_bases": "stolenBases",
    "plate_appearances": "plateAppearances",
}

PITCHING_STATS = {
    "strike_outs": "strikeOuts",       # thrown -- the batter key means the opposite
    "earned_runs": "earnedRuns",
    "hits_allowed": "hits",            # renamed: `hits` on a batter is a hit
    "walks_allowed": "baseOnBalls",
    "home_runs_allowed": "homeRuns",
    "outs": "outs",                    # integer; inningsPitched is a string
    "batters_faced": "battersFaced",
    "pitches": "numberOfPitches",
    "runs_allowed": "runs",
}


def _extract(raw, mapping):
    """Pull a role's stats, defaulting absent keys to 0 rather than omitting.

    Every key in a mapping applies to every player in that role, so a missing
    one means the player recorded none -- not that the value is unknown. The
    distinction matters downstream: an absent key reads as "no data" and drops
    the game from averages and hit-rate denominators entirely, which is how the
    NFL loader ended up reporting 40.0 receiving yards per game for a receiver
    whose real figure was 5.3.
    """
    out = {}
    for our_key, their_key in mapping.items():
        v = raw.get(their_key)
        try:
            out[our_key] = int(v) if v not in (None, "") else 0
        except (TypeError, ValueError):
            out[our_key] = 0
    return out


def boxscore_lines(game_pk):
    """Every batting and pitching line in one game.

    Returns dicts of {mlbam_id, name, position, team, role, stats}. A player
    who both bats and pitches yields TWO entries for the same game -- that is
    exactly why `role` is part of the game-log identity key.
    """
    box = _get(f"game/{game_pk}/boxscore")
    rows = []
    for side in ("home", "away"):
        team_side = box["teams"][side]
        team = team_side["team"].get("abbreviation")
        for entry in team_side.get("players", {}).values():
            person = entry.get("person", {})
            stats = entry.get("stats", {})
            base = {
                "mlbam_id": person.get("id"),
                "name": person.get("fullName"),
                "position": entry.get("position", {}).get("abbreviation"),
                "team": team,
            }
            batting = _extract(stats.get("batting", {}) or {}, BATTING_STATS)
            # plateAppearances rather than atBats: a walk or sacrifice is a real
            # appearance with zero at-bats, and dropping it would make the
            # player look absent from a game they played.
            if batting.get("plate_appearances"):
                rows.append({**base, "role": "batter", "stats": batting})

            pitching = _extract(stats.get("pitching", {}) or {}, PITCHING_STATS)
            if pitching.get("batters_faced"):
                rows.append({**base, "role": "pitcher", "stats": pitching})
    return rows


def boxscores(games, progress=None):
    """Boxscore lines for many games, with a politeness delay between calls."""
    for i, g in enumerate(games, 1):
        yield g, boxscore_lines(g["game_pk"])
        if progress and i % 25 == 0:
            progress(i)
        time.sleep(REQUEST_DELAY_S)


def headshot_url(mlbam_id):
    """Official headshot. Free, no key, and stable on the MLBAM person id."""
    return (
        "https://img.mlbstatic.com/mlb-photos/image/upload/"
        f"d_people:generic:headshot:67:current.png/w_213,q_auto:best/v1/people/{mlbam_id}/headshot/67/current"
    )


def teams():
    """All 30 MLB clubs: full name and the abbreviation the boxscores use.

    The app joins a game's team NAME (which the Odds API supplies) to the
    ABBREVIATION on a player row, so it needs both halves of this mapping. With
    only NBA teams loaded, that join failed for every MLB game and the player
    props section rendered empty despite the props being present.
    """
    data = _get("teams", sportId=SPORT_ID)
    out = []
    for t in data.get("teams", []):
        name, abbr = t.get("name"), t.get("abbreviation")
        if name and abbr:
            out.append({"team_id": t.get("id"), "name": name, "abbreviation": abbr})
    return out
