-- Up Migration
--
-- EXPAND step of an expand -> migrate -> contract rollout for multi-sport support.
-- Purely additive: every column is nullable or carries a DEFAULT, so existing
-- NBA rows and every current query keep working untouched. No column is dropped
-- here — that happens in a separate CONTRACT migration, weeks later, only after
-- all readers have been cut over and verified.
--
-- Why 'nba' as the default: every row that exists today is NBA by definition, so
-- the default backfills the discriminator correctly with no UPDATE pass.

-- --------------------------------------------------------------------------
-- players: sport discriminator, position, and stable external ids
-- --------------------------------------------------------------------------
-- external_ids holds the source-system keys we need to re-sync a player without
-- relying on name matching (bref_id for Basketball Reference, gsis_id for
-- nflverse, mlbam_id for MLB Stats API). Name matching is what makes two NFL
-- "Josh Allen"s collide, so we want an id path available.
ALTER TABLE players
  ADD COLUMN IF NOT EXISTS sport        VARCHAR(8)  NOT NULL DEFAULT 'nba',
  ADD COLUMN IF NOT EXISTS position     VARCHAR(8),
  ADD COLUMN IF NOT EXISTS external_ids JSONB       NOT NULL DEFAULT '{}'::jsonb;

-- --------------------------------------------------------------------------
-- player_game_logs: sport, the JSONB stat blob, and per-sport row identity
-- --------------------------------------------------------------------------
-- stats holds the sport-specific numbers. The alternative (a wide sparse table)
-- would grow this to ~70 mostly-NULL columns and require DDL for every new
-- sport; JSONB keeps one table and one code path.
--
-- role: NULL for NBA, 'QB'/'RB'/'WR'/... for NFL, 'batter'/'pitcher' for MLB.
--   It is part of row identity because a two-way MLB player (Ohtani) produces a
--   batting line AND a pitching line for the same game — without role in the
--   unique key, one would silently overwrite the other.
-- game_seq: MLB doubleheaders put two games on one date for one player.
-- team: the team actually played FOR. Today this is inferred from
--   players.team_abbreviation, which is wrong for any traded player's history.
ALTER TABLE player_game_logs
  ADD COLUMN IF NOT EXISTS sport     VARCHAR(8)  NOT NULL DEFAULT 'nba',
  ADD COLUMN IF NOT EXISTS stats     JSONB       NOT NULL DEFAULT '{}'::jsonb,
  ADD COLUMN IF NOT EXISTS role      VARCHAR(12),
  ADD COLUMN IF NOT EXISTS team      VARCHAR(8),
  ADD COLUMN IF NOT EXISTS home_away CHAR(1),
  ADD COLUMN IF NOT EXISTS game_ref  VARCHAR(64),
  ADD COLUMN IF NOT EXISTS game_seq  SMALLINT    NOT NULL DEFAULT 1;

-- --------------------------------------------------------------------------
-- player_props / user_favorites / teams: sport scoping
-- --------------------------------------------------------------------------
-- NOTE ON player_props: the existing UNIQUE(player_name, game_id, market,
-- bookmaker) is deliberately left alone. game_id is The Odds API's globally
-- unique event UUID and market keys are disjoint across sports
-- ('player_points' vs 'batter_hits'), so a cross-sport collision is not
-- possible. sport is added purely as a filter column. Rebuilding a unique index
-- on a live table to defend against an impossible collision would be pure risk.
--
-- commence_time lets us distinguish an early game from a late one on the same
-- date, which game_date alone cannot.
ALTER TABLE player_props
  ADD COLUMN IF NOT EXISTS sport         VARCHAR(8) NOT NULL DEFAULT 'nba',
  ADD COLUMN IF NOT EXISTS commence_time TIMESTAMPTZ;

-- user_favorites.player_id already points at a globally unique SERIAL, so
-- UNIQUE(user_id, player_id) stays correct. sport is denormalized here only so
-- GET /users/:id/favorites?sport=nfl can filter without a join.
ALTER TABLE user_favorites
  ADD COLUMN IF NOT EXISTS sport VARCHAR(8) NOT NULL DEFAULT 'nba';

-- teams.team_id holds canonical NBA franchise ids (1610612737+). MLB uses
-- 108-158 and nflverse has no numeric id at all, so (sport, team_abbreviation)
-- becomes the real identity — added in the constraints migration.
ALTER TABLE teams
  ADD COLUMN IF NOT EXISTS sport VARCHAR(8) NOT NULL DEFAULT 'nba';

-- Down Migration
ALTER TABLE players           DROP COLUMN IF EXISTS sport,
                              DROP COLUMN IF EXISTS position,
                              DROP COLUMN IF EXISTS external_ids;
ALTER TABLE player_game_logs  DROP COLUMN IF EXISTS sport,
                              DROP COLUMN IF EXISTS stats,
                              DROP COLUMN IF EXISTS role,
                              DROP COLUMN IF EXISTS team,
                              DROP COLUMN IF EXISTS home_away,
                              DROP COLUMN IF EXISTS game_ref,
                              DROP COLUMN IF EXISTS game_seq;
ALTER TABLE player_props      DROP COLUMN IF EXISTS sport,
                              DROP COLUMN IF EXISTS commence_time;
ALTER TABLE user_favorites    DROP COLUMN IF EXISTS sport;
ALTER TABLE teams             DROP COLUMN IF EXISTS sport;
