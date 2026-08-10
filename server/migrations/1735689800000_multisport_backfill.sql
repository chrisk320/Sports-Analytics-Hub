-- Up Migration
--
-- MIGRATE step: copy the existing NBA box-score columns into the new `stats`
-- JSONB blob. This DUPLICATES data rather than moving it — the original columns
-- stay authoritative until the contract migration drops them, so this step is
-- fully reversible and nothing can read a half-migrated row.
--
-- Idempotent: re-running rebuilds the same blob from the same source columns.

-- Fold the basic box score + the advanced_box_scores row (when one exists) into
-- one object. jsonb_strip_nulls keeps the blob small: a game with no advanced
-- row stores just the basic keys rather than six explicit nulls.
--
-- Key names are the ones the frontend market registry will read via
-- statFromLog() — 'pts'/'reb'/'ast' stay verbatim so the NBA market definitions
-- need no remapping, while the advanced metrics get shorter, sport-neutral
-- names than their column equivalents.
UPDATE player_game_logs g
SET stats = jsonb_strip_nulls(
    jsonb_build_object(
        'min',        g.min,
        'pts',        g.pts,
        'reb',        g.reb,
        'ast',        g.ast,
        'stl',        g.stl,
        'blk',        g.blk,
        'off_rating', a.offensive_rating,
        'def_rating', a.defensive_rating,
        'net_rating', a.net_rating,
        'efg_pct',    a.effective_fg_percentage,
        'ts_pct',     a.true_shooting_percentage,
        'usg_pct',    a.usage_percentage
    )
)
FROM advanced_box_scores a
WHERE a.game_log_id = g.game_log_id;

-- Same fold for logs with no advanced row (LEFT JOIN semantics, done as a
-- second pass so the first can use the cheaper inner join).
UPDATE player_game_logs g
SET stats = jsonb_strip_nulls(
    jsonb_build_object(
        'min', g.min,
        'pts', g.pts,
        'reb', g.reb,
        'ast', g.ast,
        'stl', g.stl,
        'blk', g.blk
    )
)
WHERE NOT EXISTS (SELECT 1 FROM advanced_box_scores a WHERE a.game_log_id = g.game_log_id);

-- Backfill the team the player played for. This is a best-effort approximation:
-- players.team_abbreviation is the player's CURRENT team, so a traded player's
-- historical rows get their present team, not the one they actually played for.
-- Correct history requires re-scraping with per-game team attribution; recording
-- the limitation here so nobody later mistakes this column for ground truth on
-- pre-migration rows.
UPDATE player_game_logs g
SET team = p.team_abbreviation
FROM players p
WHERE p.player_id = g.player_id
  AND g.team IS NULL;

-- Down Migration
--
-- Safe to blank: the source columns (pts/reb/ast/... and advanced_box_scores)
-- were never modified by the up migration, so clearing the derived blob loses
-- nothing. `team` is reset only where it matches the value we derived.
UPDATE player_game_logs SET stats = '{}'::jsonb;
UPDATE player_game_logs g SET team = NULL
FROM players p
WHERE p.player_id = g.player_id AND g.team = p.team_abbreviation;
