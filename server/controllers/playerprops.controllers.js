import pg from 'pg';
import axios from 'axios';
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

// Fetch NBA event IDs from Odds API
async function fetchNBAEvents() {
    const today = new Date();
    const startDate = today.toISOString().split('.')[0] + 'Z';
    const endDate = new Date(today.getTime() + 2 * 24 * 60 * 60 * 1000).toISOString().split('.')[0] + 'Z';

    const response = await axios.get(`https://api.the-odds-api.com/v4/sports/basketball_nba/events`, {
        params: {
            apiKey: process.env.ODDS_API_KEY,
            dateFormat: 'iso',
            commenceTimeFrom: startDate,
            commenceTimeTo: endDate
        }
    });
    return response.data;
}

// Fetch player props for a specific event
async function fetchPropsForEvent(eventId) {
    const response = await axios.get(`https://api.the-odds-api.com/v4/sports/basketball_nba/events/${eventId}/odds/`, {
        params: {
            apiKey: process.env.ODDS_API_KEY,
            regions: 'us,us2',
            markets: 'player_points,player_rebounds,player_assists,player_points_rebounds,player_points_assists,player_rebounds_assists',
            bookmakers: 'draftkings,fanduel,betmgm,betus,fanatics,espnbet',
            oddsFormat: 'american',
            dateFormat: 'iso',
        }
    });
    return response.data;
}

// Link player name to player_id using case-insensitive matching
async function linkPlayerNameToId(playerName) {
    const query = `
        SELECT player_id FROM players
        WHERE LOWER(full_name) = LOWER($1)
        LIMIT 1;
    `;
    const result = await pool.query(query, [playerName]);
    return result.rows.length > 0 ? result.rows[0].player_id : null;
}

// Store props in database
async function storePlayerProp(prop) {
    const query = `
        INSERT INTO player_props (
            player_name, player_id, game_id, game_date, home_team, away_team,
            market, bookmaker, over_line, over_odds, under_line, under_odds, fetched_at
        ) VALUES ($1, $2, $3, $4, $5, $6, $7, $8, $9, $10, $11, $12, NOW())
        ON CONFLICT (player_name, game_id, market, bookmaker)
        DO UPDATE SET
            game_date = EXCLUDED.game_date,
            over_line = EXCLUDED.over_line,
            over_odds = EXCLUDED.over_odds,
            under_line = EXCLUDED.under_line,
            under_odds = EXCLUDED.under_odds,
            fetched_at = NOW();
    `;

    await pool.query(query, [
        prop.player_name,
        prop.player_id,
        prop.game_id,
        prop.game_date,
        prop.home_team,
        prop.away_team,
        prop.market,
        prop.bookmaker,
        prop.over_line,
        prop.over_odds,
        prop.under_line,
        prop.under_odds
    ]);
}

// Fetch and store all player props (called by cron/manual trigger)
export const refreshPlayerProps = async (req, res) => {
    console.log('Starting player props refresh...');

    try {
        // Clear old props from previous days (Eastern — the NBA's reference tz)
        await pool.query(`DELETE FROM player_props WHERE game_date < (NOW() AT TIME ZONE 'America/New_York')::date`);

        // Fetch all NBA events
        const events = await fetchNBAEvents();
        console.log(`Found ${events.length} NBA games`);

        let totalProps = 0;

        for (const event of events) {
            // Date the game by its US Eastern calendar day, not the UTC day — a
            // game tipping 8pm ET is already past midnight UTC, which would push
            // it to "tomorrow". en-CA formats as YYYY-MM-DD.
            const gameDate = new Date(event.commence_time).toLocaleDateString('en-CA', { timeZone: 'America/New_York' });

            try {
                const propsData = await fetchPropsForEvent(event.id);

                if (!propsData.bookmakers) continue;

                for (const bookmaker of propsData.bookmakers) {
                    for (const market of bookmaker.markets || []) {
                        // Group outcomes by player
                        const playerOutcomes = {};

                        for (const outcome of market.outcomes || []) {
                            const playerName = outcome.description;
                            if (!playerOutcomes[playerName]) {
                                playerOutcomes[playerName] = { over: null, under: null };
                            }
                            if (outcome.name === 'Over') {
                                playerOutcomes[playerName].over = outcome;
                            } else if (outcome.name === 'Under') {
                                playerOutcomes[playerName].under = outcome;
                            }
                        }

                        // Store each player's props
                        for (const [playerName, outcomes] of Object.entries(playerOutcomes)) {
                            const playerId = await linkPlayerNameToId(playerName);

                            await storePlayerProp({
                                player_name: playerName,
                                player_id: playerId,
                                game_id: event.id,
                                game_date: gameDate,
                                home_team: event.home_team,
                                away_team: event.away_team,
                                market: market.key,
                                bookmaker: bookmaker.key,
                                over_line: outcomes.over?.point || null,
                                over_odds: outcomes.over?.price || null,
                                under_line: outcomes.under?.point || null,
                                under_odds: outcomes.under?.price || null
                            });
                            totalProps++;
                        }
                    }
                }

                // Add small delay to avoid rate limiting
                await new Promise(resolve => setTimeout(resolve, 100));

            } catch (eventError) {
                console.error(`Error fetching props for event ${event.id}:`, eventError.message);
            }
        }

        console.log(`Stored ${totalProps} player prop entries`);
        res.json({ success: true, propsStored: totalProps });

    } catch (error) {
        console.error('Error refreshing player props:', error);
        res.status(500).json({ error: 'Failed to refresh player props' });
    }
};

// Get every player prop for the current slate (for Home dashboard + Compare).
// "Current slate" = the nearest game day on/after today in US Eastern (the NBA's
// reference tz). This populates the dashboard on off-days (shows the next slate)
// and surfaces tonight's games even when their game_date was derived in UTC.
// Joined with players for full_name + headshot_url so the UI can render cards.
export const getTodaysProps = async (req, res) => {
    try {
        const query = `
            SELECT
                pp.*,
                p.full_name,
                p.headshot_url
            FROM player_props pp
            LEFT JOIN players p ON pp.player_id = p.player_id
            WHERE pp.game_date = (
                SELECT MIN(game_date) FROM player_props
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
            FROM player_props pp
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
            FROM player_props pp
            LEFT JOIN players p ON pp.player_id = p.player_id
            WHERE pp.player_id = $1
              AND pp.game_date = (
                SELECT MIN(game_date) FROM player_props
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
                    SELECT * FROM player_props
                    WHERE LOWER(player_name) = LOWER($1)
                      AND game_date = (
                        SELECT MIN(game_date) FROM player_props
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
            FROM player_props
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
