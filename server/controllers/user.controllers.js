import pg from 'pg';
import dotenv from 'dotenv';

dotenv.config();

const { Pool } = pg;
const pool = new Pool({
    connectionString: process.env.DATABASE_URL,
    ssl: { rejectUnauthorized: false }
});

export const getFavorites = async (req, res) => {
    const { userId } = req.params;
    console.log(`Fetching favorites for user: ${userId}`);
    try {
        const query = `
            SELECT p.player_id, p.full_name, p.headshot_url 
            FROM players p
            JOIN user_favorites f ON p.player_id = f.player_id
            WHERE f.user_id = $1;
        `;
        const result = await pool.query(query, [userId]);
        res.status(200).json(result.rows);
    } catch (err) {
        console.error('Error fetching user favorites', err.stack);
        res.status(500).send('Server Error');
    }
}

export const addFavorite = async (req, res) => {
    const { userId } = req.params;
    const { playerId } = req.body; // Get playerId from the request body
    console.log(`Adding favorite player ${playerId} for user: ${userId}`);
    try {
        const query = 'INSERT INTO user_favorites (user_id, player_id) VALUES ($1, $2) ON CONFLICT DO NOTHING;';
        await pool.query(query, [userId, playerId]);
        res.status(201).send({ message: 'Favorite added' });
    } catch (err) {
        console.error('Error adding user favorite', err.stack);
        res.status(500).send('Server Error');
    }
}

export const deleteFavorite = async (req, res) => {
    const { userId, playerId } = req.params;
    console.log(`Removing favorite player ${playerId} for user: ${userId}`);
    try {
        const query = 'DELETE FROM user_favorites WHERE user_id = $1 AND player_id = $2;';
        await pool.query(query, [userId, playerId]);
        res.status(200).send({ message: 'Favorite removed' });
    } catch (err) {
        console.error('Error removing user favorite', err.stack);
        res.status(500).send('Server Error');
    }
}