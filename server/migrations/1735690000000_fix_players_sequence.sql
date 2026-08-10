-- Up Migration
--
-- Repair players_player_id_seq, which is out of sync with the table.
--
-- Discovered while testing the multi-sport migration: players.player_id is a
-- SERIAL, but the sequence sits at 1 while MAX(player_id) is in the hundreds.
-- The rows were bulk-copied in with explicit ids during the Supabase -> Neon
-- move, and a direct INSERT with an explicit id does not advance the sequence.
--
-- Consequence: any plain `INSERT INTO players (full_name, ...)` that relies on
-- the SERIAL default fails with a duplicate-key error on players_pkey.
--
-- This has been masked in production because the loader hand-rolls its own id:
--     INSERT INTO players (player_id, full_name, team_abbreviation)
--     VALUES ((SELECT COALESCE(MAX(player_id), 0) + 1 FROM players), %s, %s)
--   -- server/python_scripts/fetch_bref_all_stats.py
--
-- That workaround is racy: two concurrent loaders read the same MAX and collide.
-- It held up while a single nightly NBA job was the only writer, but the NFL and
-- MLB loaders arriving next are additional writers, so fix the sequence properly
-- and let the SERIAL default do its job.
--
-- setval(..., is_called => true) means "this value is used, hand out MAX+1 next".
-- COALESCE covers a genuinely empty table.
SELECT setval(
    pg_get_serial_sequence('players', 'player_id'),
    COALESCE((SELECT MAX(player_id) FROM players), 1),
    true
);

-- Down Migration
--
-- No-op. Rewinding a sequence can only cause duplicate-key errors, never fix
-- them; there is no state worth restoring here.
SELECT 1;
