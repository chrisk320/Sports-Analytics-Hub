import pg from 'pg';

const { Pool } = pg;
const pool = new Pool({
    user: 'christiankim',
    host: 'localhost',
    database: 'nba_stats',
    password: '',
    port: 5432,
});

export const getPlayers = async (req, res) => {
    console.log(`Received request for all players list.`);
    try {
        const query = 'SELECT player_id, full_name FROM players ORDER BY full_name ASC;';
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
        const query = 'SELECT player_id, full_name FROM players WHERE player_id = $1;';
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
            ORDER BY season DESC;
        `;
        const result = await pool.query(query, [playerId]);
        res.status(200).json(result.rows);
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
            ORDER BY game_date DESC;
        `;
        const result = await pool.query(query, [playerId]);
        res.status(200).json(result.rows);
    } catch (err) {
        console.error('Error executing query for game logs', err.stack);
        res.status(500).send('Server Error');
    }
}