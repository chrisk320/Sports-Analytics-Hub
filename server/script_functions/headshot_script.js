import pg from 'pg';

const { Pool } = pg;
const pool = new Pool({
    user: 'christiankim',
    host: 'localhost',
    database: 'nba_stats',
    password: '',
    port: 5432,
});

const main = async () => {
    console.log('--- Starting headshot URL generation script ---');
    const client = await pool.connect();

    try {
        console.log('Fetching all players from the database...');
        const playersResult = await client.query('SELECT player_id FROM players');
        const players = playersResult.rows;
        console.log(`Found ${players.length} players to update.`);

        for (const player of players) {
            const { player_id } = player;
            
            const headshot_url = `https://cdn.nba.com/headshots/nba/latest/1040x760/${player_id}.png`;

            const updateQuery = `
                UPDATE players 
                SET headshot_url = $1 
                WHERE player_id = $2;
            `;
            await client.query(updateQuery, [headshot_url, player_id]);
            
            console.log(`Updated headshot URL for player ID: ${player_id}`);
        }

        console.log('✅ All player headshot URLs have been successfully updated.');

    } catch (err) {
        console.error('❌ An error occurred during the process:', err);
    } finally {
        await client.release();
        await pool.end();
        console.log('--- Script finished ---');
    }
};

main();