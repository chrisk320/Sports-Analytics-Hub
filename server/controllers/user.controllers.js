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
        // Scoped to one sport: three leagues share the players table, so an
        // unscoped list showed a user's NBA players on every NFL and MLB page.
        //
        // Filters on p.sport rather than the denormalized f.sport. The two agree
        // today, but only because every favorite so far is NBA and 'nba' is the
        // column default -- addFavorite never wrote it. p.sport is the fact;
        // f.sport is a cache of it.
        const sport = req.query.sport || 'nba';
        const query = `
            SELECT p.player_id, p.full_name, p.headshot_url, p.sport
            FROM players p
            JOIN user_favorites f ON p.player_id = f.player_id
            WHERE f.user_id = $1 AND p.sport = $2
            ORDER BY p.full_name ASC;
        `;
        const result = await pool.query(query, [userId, sport]);
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
        // The sport comes from the player row, not from the caller. Trusting a
        // client-supplied sport would let a wrong value be recorded, and this
        // column is exactly the one that has been silently defaulting to 'nba'.
        // SELECT-INSERT also means a nonexistent player_id inserts nothing
        // rather than creating an orphan the FK would have to catch.
        const query = `
            INSERT INTO user_favorites (user_id, player_id, sport)
            SELECT $1, player_id, sport FROM players WHERE player_id = $2
            ON CONFLICT DO NOTHING;
        `;
        const result = await pool.query(query, [userId, playerId]);
        if (result.rowCount === 0) {
            // Either the player does not exist or it was already a favorite.
            const exists = await pool.query('SELECT 1 FROM players WHERE player_id = $1', [playerId]);
            if (exists.rowCount === 0) {
                return res.status(404).send({ error: `No player ${playerId}` });
            }
        }
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