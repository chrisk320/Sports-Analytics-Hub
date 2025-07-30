import pg from 'pg';
import OpenAI from 'openai';
import dotenv from 'dotenv';

dotenv.config();

const { Pool } = pg;
const pool = new Pool({
    user: 'christiankim',
    host: 'localhost',
    database: 'nba_stats',
    password: '',
    port: 5432,
});

const openai = new OpenAI({
    apiKey: process.env.OPENAI_API_KEY,
});

const executeQuery = async (query, params = []) => {
    try {
        const result = await pool.query(query, params);
        return result.rows;
    } catch (error) {
        console.error('Database query error:', error);
        throw new Error('Failed to execute database query');
    }
};

const findPlayerId = async (playerName) => {
    const query = `
        SELECT player_id, full_name 
        FROM players 
        WHERE LOWER(full_name) LIKE LOWER($1) 
        OR LOWER(full_name) LIKE LOWER($2)
        OR LOWER(full_name) LIKE LOWER($3)
        LIMIT 1
    `;
    const patterns = [
        `%${playerName}%`,
        `%${playerName.split(' ')[0]}%`,
        `%${playerName.split(' ').slice(-1)[0]}%`
    ];

    const results = await executeQuery(query, patterns);
    return results.length > 0 ? results[0] : null;
};

const findTeamAbbr = async (teamName) => {
    const teamMap = {
        'rockets': 'HOU', 'warriors': 'GSW', 'lakers': 'LAL', 'celtics': 'BOS',
        'heat': 'MIA', 'nets': 'BKN', 'knicks': 'NYK', 'bulls': 'CHI',
        'mavs': 'DAL', 'suns': 'PHX', 'clippers': 'LAC', 'nuggets': 'DEN',
        'bucks': 'MIL', '76ers': 'PHI', 'raptors': 'TOR', 'hawks': 'ATL',
        'wizards': 'WAS', 'magic': 'ORL', 'pistons': 'DET', 'cavaliers': 'CLE',
        'pacers': 'IND', 'hornets': 'CHA', 'timberwolves': 'MIN', 'thunder': 'OKC',
        'pelicans': 'NOP', 'grizzlies': 'MEM', 'kings': 'SAC', 'jazz': 'UTA',
        'trail blazers': 'POR', 'spurs': 'SAS'
    };

    const normalizedTeam = teamName.toLowerCase();
    return teamMap[normalizedTeam] || null;
};

export const chatWithAI = async (req, res) => {
    const { message } = req.body;

    if (!message) {
        return res.status(400).json({ error: 'Message is required' });
    }

    try {
        const analysisResponse = await openai.chat.completions.create({
            model: "gpt-3.5-turbo",
            messages: [
                {
                    role: "system",
                    content: `You are an NBA stats assistant. Analyze the user's question and extract the following information in JSON format:
                    {
                        "player_name": "player name if mentioned",
                        "team_name": "team name if mentioned", 
                        "stat_type": "specific stat mentioned (points/rebounds/assists/usage_percentage/etc) or null if general stats",
                        "time_period": "last X games/season/etc",
                        "query_type": "player_stats/player_vs_team/general_stats",
                        "requested_advanced_stats": true/false (true if user explicitly asks for advanced stats, usage percentage, ratings, etc.)
                    }
                    
                    Basic stats: points, rebounds, assists, steals, blocks, minutes
                    Advanced stats: usage_percentage, offensive_rating, defensive_rating, net_rating, effective_fg_percentage, true_shooting_percentage, pace, player_impact_estimate
                    
                    Set requested_advanced_stats to true only if user explicitly asks for advanced stats, usage percentage, ratings, etc.
                    
                    Return only the JSON object, nothing else.`
                },
                {
                    role: "user",
                    content: message
                }
            ],
            temperature: 0.1
        });

        const analysis = JSON.parse(analysisResponse.choices[0].message.content);
        console.log('AI Analysis:', analysis);

        let data = null;
        let queryDescription = '';

        if (analysis.player_name) {
            const player = await findPlayerId(analysis.player_name);
            if (!player) {
                return res.status(404).json({
                    error: `Player "${analysis.player_name}" not found in the database`
                });
            }

            if (analysis.query_type === 'player_vs_team' && analysis.team_name) {
                const teamAbbr = await findTeamAbbr(analysis.team_name);
                if (!teamAbbr) {
                    return res.status(404).json({
                        error: `Team "${analysis.team_name}" not found`
                    });
                }

                const limit = analysis.time_period?.match(/\d+/)?.[0] || 5;
                data = await executeQuery(`
                    SELECT 
                        pgl.*,
                        abs.usage_percentage,
                        abs.offensive_rating,
                        abs.defensive_rating,
                        abs.net_rating,
                        abs.effective_fg_percentage,
                        abs.true_shooting_percentage,
                        abs.pace,
                        abs.player_impact_estimate
                    FROM player_game_logs pgl
                    LEFT JOIN advanced_box_scores abs ON pgl.game_log_id = abs.game_log_id
                    WHERE pgl.player_id = $1 AND pgl.opponent = $2
                    ORDER BY pgl.game_date DESC
                    LIMIT $3
                `, [player.player_id, teamAbbr, limit]);

                queryDescription = `${player.full_name}'s last ${limit} games against the ${analysis.team_name}`;

            } else {
                const limit = analysis.time_period?.match(/\d+/)?.[0] || 5;
                data = await executeQuery(`
                    SELECT 
                        pgl.*,
                        abs.usage_percentage,
                        abs.offensive_rating,
                        abs.defensive_rating,
                        abs.net_rating,
                        abs.effective_fg_percentage,
                        abs.true_shooting_percentage,
                        abs.pace,
                        abs.player_impact_estimate
                    FROM player_game_logs pgl
                    LEFT JOIN advanced_box_scores abs ON pgl.game_log_id = abs.game_log_id
                    WHERE pgl.player_id = $1
                    ORDER BY pgl.game_date DESC
                    LIMIT $2
                `, [player.player_id, limit]);

                queryDescription = `${player.full_name}'s last ${limit} games`;
            }
        }

        if (!data || data.length === 0) {
            return res.status(404).json({
                error: 'No data found for the specified query'
            });
        }

                // Preprocess data for consistent formatting
        const processedData = data.map(game => ({
            game_date: game.game_date,
            opponent: game.opponent,
            minutes: game.min,
            points: game.pts,
            rebounds: game.reb,
            assists: game.ast,
            steals: game.stl,
            blocks: game.blk,
            usage_percentage: game.usage_percentage,
            offensive_rating: game.offensive_rating,
            defensive_rating: game.defensive_rating,
            net_rating: game.net_rating,
            effective_fg_percentage: game.effective_fg_percentage,
            true_shooting_percentage: game.true_shooting_percentage,
            pace: game.pace,
            player_impact_estimate: game.player_impact_estimate
        }));

        // Calculate averages for multiple games
        const averages = data.length > 1 ? {
            avg_points: (data.reduce((sum, game) => sum + (game.pts || 0), 0) / data.length).toFixed(1),
            avg_rebounds: (data.reduce((sum, game) => sum + (game.reb || 0), 0) / data.length).toFixed(1),
            avg_assists: (data.reduce((sum, game) => sum + (game.ast || 0), 0) / data.length).toFixed(1),
            avg_steals: (data.reduce((sum, game) => sum + (game.stl || 0), 0) / data.length).toFixed(1),
            avg_blocks: (data.reduce((sum, game) => sum + (game.blk || 0), 0) / data.length).toFixed(1),
            avg_minutes: (data.reduce((sum, game) => sum + (game.min || 0), 0) / data.length).toFixed(1),
            avg_usage: analysis.requested_advanced_stats && data.filter(game => game.usage_percentage).length > 0 
                ? (data.reduce((sum, game) => sum + (game.usage_percentage || 0), 0) / data.filter(game => game.usage_percentage).length).toFixed(1)
                : null
        } : null;

        const formattedResponse = await openai.chat.completions.create({
            model: "gpt-3.5-turbo",
            messages: [
                                {
                    role: "system",
                    content: `You are an NBA stats assistant. Format responses consistently with the following structure:

1. Briefly acknowledge the query
2. Provide 2-3 key highlights from the data
3. List each game with stats in bullet format
4. Add brief insights about what the numbers mean

Format guidelines:
- Display each game as a separate bullet point with the date and opponent
- For BASIC STATS (default): Show only minutes, points, rebounds, assists, steals, blocks
- For ADVANCED STATS (when requested): Include usage %, offensive/defensive/net ratings, effective FG%, true shooting %, pace, player impact estimate
- Use sub-bullets to organize stats clearly
- Include averages when multiple games are shown
- For usage percentage: explain it as "percentage of team plays used by the player"
- For ratings: explain offensive/defensive/net ratings briefly
- Keep opening and context concise but informative
- Use consistent terminology and formatting`
                },
                {
                    role: "user",
                    content: `User asked: "${message}"
                    
                    Query description: ${queryDescription}
                    Advanced stats requested: ${analysis.requested_advanced_stats}
                    
                    Game Data: ${JSON.stringify(processedData, null, 2)}
                    
                    ${averages ? `Averages: ${JSON.stringify(averages, null, 2)}` : ''}
                    
                    Please provide a consistent, well-formatted response about this data. Only show advanced stats if they were explicitly requested.`
                }
            ],
            temperature: 0.1
        });

        const response = formattedResponse.choices[0].message.content;

        res.json({
            answer: response,
            data: data,
            query: analysis
        });

    } catch (error) {
        console.error('Chat error:', error);
        res.status(500).json({
            error: 'Failed to process your question. Please try again.'
        });
    }
}; 