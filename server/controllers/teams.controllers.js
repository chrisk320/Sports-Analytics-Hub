import pg from 'pg';

const { Pool } = pg;
const pool = new Pool({
    user: 'christiankim',
    host: 'localhost',
    database: 'nba_stats',
    password: '',
    port: 5432,
});

export const getTeams = async (req, res) => {
    console.log('Received request for all teams list.');
    try {
        const query = 'SELECT team_name, team_abbreviation FROM teams ORDER BY team_name ASC;';
        const result = await pool.query(query);
        res.status(200).json(result.rows);
    } catch (err) {
        console.error('Error fetching team list', err.stack);
        res.status(500).send('Server Error');
    }
}