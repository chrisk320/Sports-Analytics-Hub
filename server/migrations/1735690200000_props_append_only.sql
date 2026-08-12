-- Up Migration
--
-- Make player_props append-only so line movement survives.
--
-- WHY: the loader upserts on (player_name, game_id, market, bookmaker), so each
-- fetch overwrites the previous snapshot in place. Every credit spent on the
-- Odds API buys a line that is then thrown away within twelve hours. "This line
-- moved 25.5 -> 26.5 since open" and closing-line value both need the history
-- that the UPDATE is currently destroying, and both cost zero additional API
-- calls once the rows are kept.
--
-- Dropping the unique constraint is what allows several snapshots of the same
-- prop to coexist. Readers that want "the current line" go through the
-- player_props_latest view added below rather than assuming one row per key.

ALTER TABLE player_props
  DROP CONSTRAINT IF EXISTS player_props_player_name_game_id_market_bookmaker_key;

-- Supports both access patterns: the DISTINCT ON in the view (which needs the
-- key columns followed by fetched_at) and a straight history scan for one prop.
CREATE INDEX IF NOT EXISTS player_props_key_fetched_idx
  ON player_props (player_name, game_id, market, bookmaker, fetched_at DESC);

-- Most reads want only the newest snapshot. A view keeps that a one-word change
-- at each call site instead of five hand-written DISTINCT ON queries that can
-- drift apart.
CREATE OR REPLACE VIEW player_props_latest AS
SELECT DISTINCT ON (player_name, game_id, market, bookmaker) *
FROM player_props
ORDER BY player_name, game_id, market, bookmaker, fetched_at DESC;

-- Down Migration
--
-- Restoring the unique constraint requires collapsing history down to one row
-- per key, which is lossy. Deliberately deletes the older snapshots rather than
-- failing, since that is the only way back to the old shape.

DROP VIEW IF EXISTS player_props_latest;
DROP INDEX IF EXISTS player_props_key_fetched_idx;

DELETE FROM player_props p
WHERE EXISTS (
  SELECT 1 FROM player_props q
  WHERE q.player_name = p.player_name
    AND q.game_id     = p.game_id
    AND q.market      = p.market
    AND q.bookmaker   = p.bookmaker
    AND (q.fetched_at > p.fetched_at
         OR (q.fetched_at = p.fetched_at AND q.id > p.id))
);

ALTER TABLE player_props
  ADD CONSTRAINT player_props_player_name_game_id_market_bookmaker_key
  UNIQUE (player_name, game_id, market, bookmaker);
