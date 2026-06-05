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
