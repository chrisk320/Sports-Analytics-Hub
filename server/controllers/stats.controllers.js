import pg from 'pg';
import dotenv from 'dotenv';

dotenv.config();

const { Pool } = pg;
const pool = new Pool({
    connectionString: process.env.DATABASE_URL,
    ssl: { rejectUnauthorized: false }
});

export const getPlayers = async (req, res) => {
    console.log(`Received request for all players list.`);
    try {
        const query = 'SELECT player_id, full_name, headshot_url FROM players ORDER BY full_name ASC;';
        const result = await pool.query(query);
        res.status(200).json(result.rows);
    } catch (err) {
        console.error('Error fetchign player list', err.stack);
    }
}

export const getPlayer = async (req, res) => {
    const { playerId } = req.params;
    console.log(`Received request for player info for ID: ${playerId}`);
    try {
        const query = 'SELECT player_id, full_name, headshot_url FROM players WHERE player_id = $1;';
        const result = await pool.query(query, [playerId]);
        if (result.rows.length === 0) {
            return res.status(404).json({ message: 'Player not found' });
        }
        res.status(200).json(result.rows[0]);
    } catch (err) {
        console.error('Error fetching player info', err.stack);
        res.status(500).send('Server Error');
    }
};

export const getSeasonAverages = async (req, res) => {
    const { playerId } = req.params;
    console.log(`Received request for season averages for player ID: ${playerId}`);
    try {
        const query = `
            SELECT * FROM player_season_stats 
            WHERE player_id = $1 
            ORDER BY season DESC
            LIMIT 1;
        `;
        const result = await pool.query(query, [playerId]);
        res.status(200).json(result.rows[0] || null);
    } catch (err) {
        console.error('Error fetching season averages', err.stack);
        res.status(500).send('Server Error');
    }
}

export const getGameLogs = async (req, res) => {
    const { playerId } = req.params;
    console.log(`Received request for game logs for player ID: ${playerId}`);

    try {
        const query = `
            SELECT * FROM player_game_logs 
            WHERE player_id = $1 
            ORDER BY game_date DESC
            LIMIT 10;
        `;
        const result = await pool.query(query, [playerId]);
        res.status(200).json(result.rows);
    } catch (err) {
        console.error('Error executing query for game logs', err.stack);
        res.status(500).send('Server Error');
    }
}

export const getFullGameLogs = async (req, res) => {
    const { playerId } = req.params;
    try {
        const query = `
            SELECT
                pgl.*,
                abs.offensive_rating,
                abs.defensive_rating,
                abs.net_rating,
                abs.effective_fg_percentage,
                abs.true_shooting_percentage,
                abs.usage_percentage
            FROM player_game_logs pgl
            LEFT JOIN advanced_box_scores abs ON pgl.game_log_id = abs.game_log_id
            WHERE pgl.player_id = $1
            ORDER BY pgl.game_date DESC
            LIMIT 10;
        `;
        const result = await pool.query(query, [playerId]);
        res.status(200).json(result.rows);
    } catch (err) {
        console.error('Error fetching full game logs', err.stack);
        res.status(500).send('Server Error');
    }
}

export const getGameLogsByOpponent = async (req, res) => {
    const { playerId, opponentAbbr } = req.params;
    console.log(`Received request for player ${playerId} vs ${opponentAbbr}`);
    try {
        const query = `
            SELECT
                pgl.*,
                abs.offensive_rating,
                abs.defensive_rating,
                abs.net_rating,
                abs.effective_fg_percentage,
                abs.true_shooting_percentage,
                abs.usage_percentage
            FROM player_game_logs pgl
            LEFT JOIN advanced_box_scores abs ON pgl.game_log_id = abs.game_log_id
            WHERE pgl.player_id = $1 AND pgl.opponent = $2
            ORDER BY pgl.game_date DESC
            LIMIT 5;
        `;
        const result = await pool.query(query, [playerId, opponentAbbr]);
        res.status(200).json(result.rows);
    } catch (err) {
        console.error('Error fetching filtered game logs', err.stack);
        res.status(500).send('Server Error');
    }
}