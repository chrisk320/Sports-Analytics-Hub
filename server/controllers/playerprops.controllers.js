import pg from 'pg';
import dotenv from 'dotenv';

dotenv.config();

const { Pool } = pg;
const pool = new Pool({
    connectionString: process.env.DATABASE_URL,
    ssl: { rejectUnauthorized: false }
});

// Helper to get today's date range for filtering
function getTodaysDateRange() {
    const today = new Date();
    const startOfDay = new Date(today.getFullYear(), today.getMonth(), today.getDate());
    const endOfDay = new Date(today.getFullYear(), today.getMonth(), today.getDate() + 1);
    return {
        start: startOfDay.toISOString(),
        end: endOfDay.toISOString()
    };
}

// NOTE: the write path used to live here as refreshPlayerProps, a public
// unauthenticated POST that looped every game and called the Odds API per
// event -- 6 markets x 2 regions = 12 credits a game, roughly 120 credits for
// one HTTP request against a 500-credit monthly tier. Nothing called it; the
// scheduled loader in scripts/fetch_props.mjs does this job.
// Deleted rather than guarded, on the same reasoning that removed the two
// fan-out handlers in nbabets/nflbets: an endpoint that cannot be reached
// cannot be abused. This file is now read-only.

export const getTodaysProps = async (req, res) => {
    try {
        const query = `
            SELECT
                pp.*,
                p.full_name,
                p.headshot_url
            FROM player_props_latest pp
            LEFT JOIN players p ON pp.player_id = p.player_id
            WHERE pp.game_date = (
                SELECT MIN(game_date) FROM player_props_latest
                WHERE game_date >= (NOW() AT TIME ZONE 'America/New_York')::date
            )
            ORDER BY pp.game_id, pp.player_name, pp.market, pp.bookmaker;
        `;

        const result = await pool.query(query);
        res.json(result.rows);

    } catch (error) {
        console.error('Error fetching today\'s props:', error);
        res.status(500).json({ error: 'Failed to fetch today\'s props' });
    }
};

// Get every prop for a single game (for the Game Detail page).
// Includes player team_abbreviation so the UI can split rosters home vs away.
export const getPropsByGame = async (req, res) => {
    const { gameId } = req.params;
    try {
        const query = `
            SELECT
                pp.*,
                p.full_name,
                p.headshot_url,
                p.team_abbreviation
            FROM player_props_latest pp
            LEFT JOIN players p ON pp.player_id = p.player_id
            WHERE pp.game_id = $1
            ORDER BY pp.player_name, pp.market, pp.bookmaker;
        `;
        const result = await pool.query(query, [gameId]);
        res.json(result.rows);
    } catch (error) {
        console.error('Error fetching props by game:', error);
        res.status(500).json({ error: 'Failed to fetch props for game' });
    }
};

// Get props for a specific player (for StatsModal)
export const getPlayerProps = async (req, res) => {
    const { playerId } = req.params;
    console.log(`Fetching props for player ID: ${playerId}`);

    try {
        // The player's next slate on/after today (Eastern) — see getTodaysProps.
        const query = `
            SELECT
                pp.*,
                p.full_name
            FROM player_props_latest pp
            LEFT JOIN players p ON pp.player_id = p.player_id
            WHERE pp.player_id = $1
              AND pp.game_date = (
                SELECT MIN(game_date) FROM player_props_latest
                WHERE player_id = $1
                  AND game_date >= (NOW() AT TIME ZONE 'America/New_York')::date
              )
            ORDER BY pp.market, pp.bookmaker;
        `;

        const result = await pool.query(query, [playerId]);

        if (result.rows.length === 0) {
            // Try matching by player name as fallback
            const playerQuery = `SELECT full_name FROM players WHERE player_id = $1`;
            const playerResult = await pool.query(playerQuery, [playerId]);

            if (playerResult.rows.length > 0) {
                const playerName = playerResult.rows[0].full_name;
                const nameQuery = `
                    SELECT * FROM player_props_latest
                    WHERE LOWER(player_name) = LOWER($1)
                      AND game_date = (
                        SELECT MIN(game_date) FROM player_props_latest
                        WHERE LOWER(player_name) = LOWER($1)
                          AND game_date >= (NOW() AT TIME ZONE 'America/New_York')::date
                      )
                    ORDER BY market, bookmaker;
                `;
                const nameResult = await pool.query(nameQuery, [playerName]);
                return res.json(nameResult.rows);
            }
        }

        res.json(result.rows);

    } catch (error) {
        console.error('Error fetching player props:', error);
        res.status(500).json({ error: 'Failed to fetch player props' });
    }
};

// Get game info for a player if they play today
export const getPlayerGameToday = async (req, res) => {
    const { playerId } = req.params;

    try {
        const query = `
            SELECT game_id, game_date, home_team, away_team
            FROM player_props_latest
            WHERE player_id = $1
              AND game_date >= (NOW() AT TIME ZONE 'America/New_York')::date
            ORDER BY game_date
            LIMIT 1;
        `;

        const result = await pool.query(query, [playerId]);

        if (result.rows.length === 0) {
            return res.json(null);
        }

        res.json(result.rows[0]);

    } catch (error) {
        console.error('Error checking player game today:', error);
        res.status(500).json({ error: 'Failed to check player game' });
    }
};
