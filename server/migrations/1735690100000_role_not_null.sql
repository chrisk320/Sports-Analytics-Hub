-- Up Migration
--
-- Make player_game_logs.role NOT NULL DEFAULT '' and turn the identity index
-- into a real UNIQUE CONSTRAINT over plain columns.
--
-- WHY: the previous migration created the identity index as
--     UNIQUE (player_id, season, game_date, game_seq, COALESCE(role, ''))
-- Because that contains an expression, it is a plain unique INDEX and not a
-- CONSTRAINT, which has two bad consequences for writers:
--
--   1. `ON CONFLICT (player_id, season, game_date)` — what the existing loader
--      in fetch_bref_all_stats.py uses — stops matching any unique index and
--      fails outright with:
--        "there is no unique or exclusion constraint matching the ON CONFLICT
--         specification"
--      This broke the nightly Basketball Reference job.
--
--   2. The only way to keep upserting was to repeat the expression:
--        ON CONFLICT (player_id, season, game_date, game_seq, (COALESCE(role,'')))
--      which every future writer (the NFL and MLB loaders) would have to know
--      and get exactly right. Easy to get wrong, and it silently degrades to a
--      hard error rather than a subtle bug, but it is still a trap.
--
-- Using '' instead of NULL for "role does not apply" removes the expression
-- entirely: the index becomes plain columns, so it can be a real constraint and
-- ON CONFLICT works naturally. Semantically '' reads as "not applicable"
-- (every NBA row) while MLB uses 'batter'/'pitcher' and NFL uses the position.

-- Existing NBA rows carry NULL; normalize before tightening the column.
UPDATE player_game_logs SET role = '' WHERE role IS NULL;

ALTER TABLE player_game_logs
  ALTER COLUMN role SET DEFAULT '',
  ALTER COLUMN role SET NOT NULL;

-- Swap the expression index for a genuine constraint over plain columns.
DROP INDEX IF EXISTS player_game_logs_identity_idx;

ALTER TABLE player_game_logs
  ADD CONSTRAINT player_game_logs_identity_key
  UNIQUE (player_id, season, game_date, game_seq, role);

-- Down Migration
ALTER TABLE player_game_logs DROP CONSTRAINT IF EXISTS player_game_logs_identity_key;

ALTER TABLE player_game_logs
  ALTER COLUMN role DROP NOT NULL,
  ALTER COLUMN role DROP DEFAULT;

UPDATE player_game_logs SET role = NULL WHERE role = '';

CREATE UNIQUE INDEX IF NOT EXISTS player_game_logs_identity_idx
  ON player_game_logs (player_id, season, game_date, game_seq, COALESCE(role, ''));
