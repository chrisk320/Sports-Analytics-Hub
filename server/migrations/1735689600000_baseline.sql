-- Up Migration
--
-- Baseline: the schema as it existed before node-pg-migrate was introduced.
-- Concatenated verbatim from the four hand-applied .sql files (now in
-- migrations/legacy/ for provenance). Every statement is IF NOT EXISTS /
-- ON CONFLICT, so running this against an already-provisioned database
-- (production, or a Neon branch of it) is a no-op — which is exactly how
-- an existing deployment adopts the migration runner without a reset.

-- ============================================================
-- from create_core_schema.sql
-- ============================================================
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

-- ============================================================
-- from create_player_props_table.sql
-- ============================================================
-- Create player_props table for storing fetched betting lines
CREATE TABLE IF NOT EXISTS player_props (
    id SERIAL PRIMARY KEY,
    player_name VARCHAR(100) NOT NULL,
    player_id INTEGER REFERENCES players(player_id),
    game_id VARCHAR(50) NOT NULL,
    game_date DATE NOT NULL,
    home_team VARCHAR(100),
    away_team VARCHAR(100),
    market VARCHAR(50) NOT NULL,
    bookmaker VARCHAR(50) NOT NULL,
    over_line DECIMAL(5,1),
    over_odds INTEGER,
    under_line DECIMAL(5,1),
    under_odds INTEGER,
    fetched_at TIMESTAMP DEFAULT NOW(),
    UNIQUE(player_name, game_id, market, bookmaker)
);

CREATE INDEX IF NOT EXISTS idx_player_props_player_id ON player_props(player_id);
CREATE INDEX IF NOT EXISTS idx_player_props_game_date ON player_props(game_date);
CREATE INDEX IF NOT EXISTS idx_player_props_player_name ON player_props(player_name);

-- ============================================================
-- from create_user_favorites_table.sql
-- ============================================================
-- user_favorites: the user's saved players (the one non-re-derivable table).
-- Was hand-created in the old Supabase DB and had no DDL in the repo; this
-- makes the schema reproducible on a fresh database (e.g. the Neon migration).
-- Matches the queries in server/controllers/user.controllers.js:
--   INSERT ... (user_id, player_id) VALUES ($1, $2) ON CONFLICT DO NOTHING
-- user_id is the Google OAuth account id (string). FK to players is intentionally
-- omitted so this can be created before the players table is populated.

CREATE TABLE IF NOT EXISTS user_favorites (
    user_id    VARCHAR(255) NOT NULL,
    player_id  INTEGER      NOT NULL,
    created_at TIMESTAMP    DEFAULT NOW(),
    UNIQUE (user_id, player_id)
);

CREATE INDEX IF NOT EXISTS idx_user_favorites_user_id ON user_favorites(user_id);

-- ============================================================
-- from seed_teams.sql
-- ============================================================
-- Seed the 30 NBA teams directly instead of scraping nba.com (which blocks
-- automation with ERR_HTTP2_PROTOCOL_ERROR and whose CSS selectors drift).
-- team_abbreviation matches the values in player_game_logs.opponent (NBA-standard,
-- from the Basketball Reference pipeline) so the opponent filter joins correctly.
-- team_id uses the canonical NBA franchise ids. Idempotent.

INSERT INTO teams (team_id, team_name, team_abbreviation, url_slug) VALUES
  (1610612737, 'Atlanta Hawks',          'ATL', 'hawks'),
  (1610612738, 'Boston Celtics',         'BOS', 'celtics'),
  (1610612751, 'Brooklyn Nets',          'BKN', 'nets'),
  (1610612766, 'Charlotte Hornets',      'CHA', 'hornets'),
  (1610612741, 'Chicago Bulls',          'CHI', 'bulls'),
  (1610612739, 'Cleveland Cavaliers',    'CLE', 'cavaliers'),
  (1610612742, 'Dallas Mavericks',       'DAL', 'mavericks'),
  (1610612743, 'Denver Nuggets',         'DEN', 'nuggets'),
  (1610612765, 'Detroit Pistons',        'DET', 'pistons'),
  (1610612744, 'Golden State Warriors',  'GSW', 'warriors'),
  (1610612745, 'Houston Rockets',        'HOU', 'rockets'),
  (1610612754, 'Indiana Pacers',         'IND', 'pacers'),
  (1610612746, 'LA Clippers',            'LAC', 'clippers'),
  (1610612747, 'Los Angeles Lakers',     'LAL', 'lakers'),
  (1610612763, 'Memphis Grizzlies',      'MEM', 'grizzlies'),
  (1610612748, 'Miami Heat',             'MIA', 'heat'),
  (1610612749, 'Milwaukee Bucks',        'MIL', 'bucks'),
  (1610612750, 'Minnesota Timberwolves', 'MIN', 'timberwolves'),
  (1610612740, 'New Orleans Pelicans',   'NOP', 'pelicans'),
  (1610612752, 'New York Knicks',        'NYK', 'knicks'),
  (1610612760, 'Oklahoma City Thunder',  'OKC', 'thunder'),
  (1610612753, 'Orlando Magic',          'ORL', 'magic'),
  (1610612755, 'Philadelphia 76ers',     'PHI', 'sixers'),
  (1610612756, 'Phoenix Suns',           'PHX', 'suns'),
  (1610612757, 'Portland Trail Blazers', 'POR', 'blazers'),
  (1610612758, 'Sacramento Kings',       'SAC', 'kings'),
  (1610612759, 'San Antonio Spurs',      'SAS', 'spurs'),
  (1610612761, 'Toronto Raptors',        'TOR', 'raptors'),
  (1610612762, 'Utah Jazz',              'UTA', 'jazz'),
  (1610612764, 'Washington Wizards',     'WAS', 'wizards')
ON CONFLICT (team_id) DO UPDATE SET
  team_name = EXCLUDED.team_name,
  team_abbreviation = EXCLUDED.team_abbreviation,
  url_slug = EXCLUDED.url_slug;

-- Down Migration
--
-- Intentionally empty. This baseline represents pre-existing production
-- state; rolling it back would drop live tables. Tear down a scratch
-- database by dropping the database itself, not by migrating down.
SELECT 1;
