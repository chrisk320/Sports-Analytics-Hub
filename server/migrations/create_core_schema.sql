-- Core schema for a fresh database (used for the Supabase -> Neon migration).
-- Table definitions match the CURRENT Basketball Reference pipeline
-- (server/python_scripts/fetch_bref_all_stats.py) so the scrapers' INSERTs
-- line up. The older puppeteer JS scrapers used a conflicting `players`
-- definition (INT PK, no headshot_url) — this file is the authoritative one
-- (SERIAL PK + headshot_url, which the /players endpoint reads).
-- Safe to run repeatedly (IF NOT EXISTS). Run BEFORE create_player_props_table.sql
-- (player_props has an FK to players).

CREATE TABLE IF NOT EXISTS players (
    player_id SERIAL PRIMARY KEY,
    full_name VARCHAR(255) NOT NULL,
    team_abbreviation VARCHAR(5),
    headshot_url VARCHAR(255)
);

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

CREATE TABLE IF NOT EXISTS advanced_box_scores (
    game_log_id INT PRIMARY KEY REFERENCES player_game_logs(game_log_id),
    offensive_rating REAL,
    defensive_rating REAL,
    net_rating REAL,
    effective_fg_percentage REAL,
    true_shooting_percentage REAL,
    usage_percentage REAL
);

-- NOTE: player_season_stats was intentionally removed. Season averages are
-- computed live from player_game_logs in getSeasonAverages (stats.controllers.js);
-- the only thing that ever populated this table was the retired NBA.com scraper.

CREATE TABLE IF NOT EXISTS teams (
    team_id BIGINT PRIMARY KEY,
    team_name VARCHAR(255) NOT NULL,
    team_abbreviation VARCHAR(10),
    url_slug VARCHAR(255)
);
