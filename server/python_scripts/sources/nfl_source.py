"""NFL data from nflverse.

Reads nflverse's published Parquet releases directly with pandas rather than
going through the `nfl_data_py` package.

WHY NOT nfl_data_py: it pins pandas<2, and installing it silently downgraded
this venv from pandas 2.2.2 to 1.5.3 — which breaks nba_api (requires >=2.1.0)
and therefore the existing NBA pipeline. The package is also unmaintained
(0.3.3, Sep 2024). It is a thin wrapper over exactly these files, so reading
them directly removes a dependency, a version conflict, and a maintenance risk
in one go.

These are static files on GitHub Releases, not a scraped site — which is also
why this can run from GitHub Actions, unlike the Basketball Reference scraper
that 403s from datacenter IPs.

Data: nflverse (https://github.com/nflverse/nflverse-data), CC BY 4.0.
"""

import pandas as pd

BASE = "https://github.com/nflverse/nflverse-data/releases/download"

# Weekly stat columns worth storing. Deliberately a whitelist: the source has
# 114 columns and most are modeling intermediates we would never surface.
STAT_COLUMNS = [
    "completions", "attempts", "passing_yards", "passing_tds",
    "carries", "rushing_yards", "rushing_tds",
    "receptions", "targets", "receiving_yards", "receiving_tds",
    "fantasy_points_ppr",
]

# Identity/context columns needed to build a game-log row.
META_COLUMNS = [
    "player_id", "player_display_name", "player_name", "position",
    "season", "week", "season_type", "team", "opponent_team", "headshot_url",
]


def weekly_stats(season):
    """One row per player per week for a season.

    Returns a DataFrame with META_COLUMNS + whichever STAT_COLUMNS exist
    (nflverse adds and renames fields between seasons, so absent columns are
    filled with 0 rather than raising).
    """
    df = pd.read_parquet(f"{BASE}/player_stats/stats_player_week_{season}.parquet")

    for col in STAT_COLUMNS:
        if col not in df.columns:
            df[col] = 0
    missing_meta = [c for c in META_COLUMNS if c not in df.columns]
    if missing_meta:
        raise RuntimeError(
            f"nflverse schema changed for {season}: missing {missing_meta}. "
            "Check https://nflreadr.nflverse.com/articles/dictionary_player_stats.html"
        )

    df = df[META_COLUMNS + STAT_COLUMNS].copy()
    # Regular season only. Preseason lines are not modeled, and mixing playoff
    # weeks into "last N games" would silently change what a hit rate means.
    df = df[df["season_type"] == "REG"]
    df = df.fillna({c: 0 for c in STAT_COLUMNS})
    return _offensive_producers_only(df)


def _offensive_producers_only(df):
    """Drop players who never produce a stat this app models.

    nflverse publishes a weekly row for anyone on a gameday roster, so a raw
    2024 load is ~2,000 players of whom ~1,400 are corners, linemen, punters
    and linebackers with all-zero passing/rushing/receiving lines. Every one of
    them would land in player search with an empty detail page, because the
    prop markets here are offensive only.

    Filtered per PLAYER, not per row: a receiver held to zero catches still had
    a real game, and dropping that row would quietly inflate their average.
    Anyone with at least one non-zero week keeps their whole season — including
    the lineman who caught a trick-play touchdown, which is correct.
    """
    produced = df.groupby("player_id")[STAT_COLUMNS].max().sum(axis=1) > 0
    return df[df["player_id"].isin(produced[produced].index)]


def schedules(season):
    """Game-level schedule for a season, used to date each weekly row.

    Weekly stats carry (season, week, team, opponent) but no date, so the
    game_date on a log row has to come from here.
    """
    df = pd.read_parquet(f"{BASE}/schedules/games.parquet")
    return df[df["season"] == int(season)]


def season_available(season):
    """Whether nflverse has published weekly stats for a season yet."""
    try:
        pd.read_parquet(f"{BASE}/player_stats/stats_player_week_{season}.parquet")
        return True
    except Exception:
        return False
