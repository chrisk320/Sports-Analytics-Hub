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
