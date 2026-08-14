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

# nflverse renamed the weekly-stats release tag. `stats_player` is current and
# carries 2023 onward; `player_stats` is the old tag and stopped being updated
# after 2024. Probing both, new first, means a rename does not silently make
# every future season look unpublished -- which is exactly what happened: 2025
# had been out for months while season_available() reported False.
WEEKLY_TAGS = ("stats_player", "player_stats")


def _weekly_url(tag, season):
    return f"{BASE}/{tag}/stats_player_week_{season}.parquet"


def _read_weekly(season):
    """Weekly stats for a season, from whichever release tag currently has it."""
    errors = []
    for tag in WEEKLY_TAGS:
        try:
            return pd.read_parquet(_weekly_url(tag, season))
        except Exception as e:  # noqa: BLE001 - any failure means "try the next tag"
            errors.append(f"{tag}: {type(e).__name__}")
    raise FileNotFoundError(
        f"nflverse has no weekly stats for {season} under any known tag ({'; '.join(errors)}). "
        f"Check https://github.com/nflverse/nflverse-data/releases for a renamed artifact."
    )

# Weekly stat columns worth storing. Deliberately a whitelist: the source has
# 114 columns and most are modeling intermediates we would never surface.
STAT_COLUMNS = [
    "completions", "attempts", "passing_yards", "passing_tds",
    "carries", "rushing_yards", "rushing_tds",
    "receptions", "targets", "receiving_yards", "receiving_tds",
    "fantasy_points_ppr",
]

# The subset of STAT_COLUMNS that actually backs a prop market. Used to decide
# whether a player is worth loading at all.
#
# Deliberately excludes completions/attempts/carries/targets/fantasy_points:
# those are volume and context, not markets. A cornerback thrown at once all
# season registers a target and nothing else — counting that as production put
# him in player search with a page that has nothing on it.
MARKET_COLUMNS = [
    "passing_yards", "passing_tds",
    "rushing_yards", "rushing_tds",
    "receptions", "receiving_yards", "receiving_tds",
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
    df = _read_weekly(season)

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
    per_player_max = df.groupby("player_id")[MARKET_COLUMNS].max()
    # `.any(axis=1)` rather than summing the row: summing lets a negative week
    # cancel a real one, so a quarterback with 50 passing yards and a -60 yard
    # kneel-down week would net out to "produced nothing".
    produced = (per_player_max > 0).any(axis=1)
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
        _read_weekly(season)
        return True
    except Exception:
        return False
