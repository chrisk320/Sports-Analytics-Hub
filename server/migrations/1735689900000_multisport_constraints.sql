-- Up Migration
--
-- Row identity and query paths for the multi-sport tables.

-- --------------------------------------------------------------------------
-- player_game_logs identity
-- --------------------------------------------------------------------------
-- The old key, UNIQUE(player_id, season, game_date), cannot express two
-- legitimate multi-sport cases:
--   1. MLB doubleheaders  -> same player, same date, two games  (game_seq)
--   2. Two-way players    -> Ohtani's batting AND pitching line for ONE game (role)
-- Without both, the second row of each pair silently fails to insert.
--
-- COALESCE(role, '') is required because NULL never equals NULL in a unique
-- index, which would let duplicate NBA rows (role IS NULL) slip through.
ALTER TABLE player_game_logs
  DROP CONSTRAINT IF EXISTS player_game_logs_player_id_season_game_date_key;

CREATE UNIQUE INDEX IF NOT EXISTS player_game_logs_identity_idx
  ON player_game_logs (player_id, season, game_date, game_seq, COALESCE(role, ''));

-- --------------------------------------------------------------------------
-- Query paths
-- --------------------------------------------------------------------------
-- Every stats query filters by sport first, then season.
CREATE INDEX IF NOT EXISTS player_game_logs_sport_season_idx
  ON player_game_logs (sport, season);

-- Leaderboards sort on a single stat key. Expression B-tree indexes on the few
-- HOT keys, deliberately not a GIN index over the whole blob: GIN accelerates
-- containment/existence lookups, not the ORDER BY ... DESC that getLeaderboard
-- actually runs, and it would be far larger.
CREATE INDEX IF NOT EXISTS player_game_logs_stats_pts_idx
  ON player_game_logs (((stats->>'pts')::numeric)) WHERE sport = 'nba';
CREATE INDEX IF NOT EXISTS player_game_logs_stats_reb_idx
  ON player_game_logs (((stats->>'reb')::numeric)) WHERE sport = 'nba';
CREATE INDEX IF NOT EXISTS player_game_logs_stats_ast_idx
  ON player_game_logs (((stats->>'ast')::numeric)) WHERE sport = 'nba';

-- Player lookups are always scoped by sport now (this is what stops the two
-- NFL "Josh Allen"s from resolving to one row during prop name-matching).
CREATE INDEX IF NOT EXISTS players_sport_name_idx
  ON players (sport, LOWER(full_name));

-- The slate query is "today's props for sport X".
CREATE INDEX IF NOT EXISTS player_props_sport_date_idx
  ON player_props (sport, game_date);

-- team_id holds NBA franchise ids and has no meaning for other leagues, so
-- (sport, abbreviation) becomes the real cross-sport identity.
CREATE UNIQUE INDEX IF NOT EXISTS teams_sport_abbr_idx
  ON teams (sport, team_abbreviation);

-- Down Migration
DROP INDEX IF EXISTS teams_sport_abbr_idx;
DROP INDEX IF EXISTS player_props_sport_date_idx;
DROP INDEX IF EXISTS players_sport_name_idx;
DROP INDEX IF EXISTS player_game_logs_stats_ast_idx;
DROP INDEX IF EXISTS player_game_logs_stats_reb_idx;
DROP INDEX IF EXISTS player_game_logs_stats_pts_idx;
DROP INDEX IF EXISTS player_game_logs_sport_season_idx;
DROP INDEX IF EXISTS player_game_logs_identity_idx;

ALTER TABLE player_game_logs
  ADD CONSTRAINT player_game_logs_player_id_season_game_date_key
  UNIQUE (player_id, season, game_date);
