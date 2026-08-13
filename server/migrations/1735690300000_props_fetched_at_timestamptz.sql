-- Up Migration
--
-- Make player_props.fetched_at a timestamptz.
--
-- WHY: it records an instant -- "when were these odds pulled" -- and
-- `timestamp without time zone` cannot represent one. The column has no offset,
-- so every reader has to guess a zone, and the two ends guessed differently:
-- the loader wrote UTC (via NOW(), or an explicit UTC string), while node-pg
-- parses a naive timestamp as LOCAL time on read. A row stored at 22:30 UTC
-- came back to the API as 05:30 the next day -- about seven hours in the
-- future.
--
-- That is not cosmetic. Two things depend on this column being an instant:
--
--   1. player_props_latest picks the current line with ORDER BY fetched_at
--      DESC. Mixed interpretations reorder snapshots and the view can serve a
--      stale line as though it were current.
--   2. The freshness badge computes age as now - fetched_at. A future
--      timestamp clamps to "just now" forever, so a stalled pipeline would
--      never be flagged -- the failure mode the badge exists to catch.
--
-- Existing values were written as UTC wall-clock, so USING ... AT TIME ZONE
-- 'UTC' reinterprets them correctly rather than shifting them.
--
-- The view has to be dropped first: Postgres refuses to alter the type of a
-- column a view depends on. It is recreated verbatim below.

DROP VIEW IF EXISTS player_props_latest;

ALTER TABLE player_props
  ALTER COLUMN fetched_at TYPE timestamptz USING fetched_at AT TIME ZONE 'UTC';

ALTER TABLE player_props
  ALTER COLUMN fetched_at SET DEFAULT NOW();

CREATE OR REPLACE VIEW player_props_latest AS
SELECT DISTINCT ON (player_name, game_id, market, bookmaker) *
FROM player_props
ORDER BY player_name, game_id, market, bookmaker, fetched_at DESC;

-- Down Migration
--
-- Back to a naive timestamp, normalising to UTC so the stored wall-clock
-- matches what the old writers produced.

DROP VIEW IF EXISTS player_props_latest;

ALTER TABLE player_props
  ALTER COLUMN fetched_at TYPE timestamp USING fetched_at AT TIME ZONE 'UTC';

ALTER TABLE player_props
  ALTER COLUMN fetched_at SET DEFAULT NOW();

CREATE OR REPLACE VIEW player_props_latest AS
SELECT DISTINCT ON (player_name, game_id, market, bookmaker) *
FROM player_props
ORDER BY player_name, game_id, market, bookmaker, fetched_at DESC;
