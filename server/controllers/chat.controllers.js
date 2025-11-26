import pg from 'pg';
import OpenAI from 'openai';
import dotenv from 'dotenv';

dotenv.config();

const { Pool } = pg;
const pool = new Pool({
    connectionString: process.env.DATABASE_URL,
    ssl: { rejectUnauthorized: false }
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

// Query Template System for Scalability
const queryTemplates = {
    player_stats: {
        basic: `SELECT pgl.* FROM player_game_logs pgl WHERE pgl.player_id = $1 ORDER BY pgl.game_date DESC LIMIT $2`,
        advanced: `SELECT pgl.*, abs.usage_percentage, abs.offensive_rating, abs.defensive_rating, abs.net_rating, abs.effective_fg_percentage, abs.true_shooting_percentage, abs.pace, abs.player_impact_estimate FROM player_game_logs pgl LEFT JOIN advanced_box_scores abs ON pgl.game_log_id = abs.game_log_id WHERE pgl.player_id = $1 ORDER BY pgl.game_date DESC LIMIT $2`
    },
    player_vs_team: {
        basic: `SELECT pgl.* FROM player_game_logs pgl WHERE pgl.player_id = $1 AND pgl.opponent = $2 ORDER BY pgl.game_date DESC LIMIT $3`,
        advanced: `SELECT pgl.*, abs.usage_percentage, abs.offensive_rating, abs.defensive_rating, abs.net_rating, abs.effective_fg_percentage, abs.true_shooting_percentage, abs.pace, abs.player_impact_estimate FROM player_game_logs pgl LEFT JOIN advanced_box_scores abs ON pgl.game_log_id = abs.game_log_id WHERE pgl.player_id = $1 AND pgl.opponent = $2 ORDER BY pgl.game_date DESC LIMIT $3`
    },

    player_comparison: {
        basic: `SELECT pgl.*, p.full_name FROM player_game_logs pgl JOIN players p ON pgl.player_id = p.player_id WHERE pgl.player_id IN ($1, $2) ORDER BY pgl.game_date DESC LIMIT $3`,
        advanced: `SELECT pgl.*, p.full_name, abs.usage_percentage, abs.offensive_rating, abs.defensive_rating, abs.net_rating FROM player_game_logs pgl JOIN players p ON pgl.player_id = p.player_id LEFT JOIN advanced_box_scores abs ON pgl.game_log_id = abs.game_log_id WHERE pgl.player_id IN ($1, $2) ORDER BY pgl.game_date DESC LIMIT $3`
    },
    season_totals: {
        basic: `SELECT pgl.player_id, p.full_name, COUNT(*) as games_played, AVG(pgl.pts) as avg_points, AVG(pgl.reb) as avg_rebounds, AVG(pgl.ast) as avg_assists, AVG(pgl.stl) as avg_steals, AVG(pgl.blk) as avg_blocks, AVG(pgl.min) as avg_minutes FROM player_game_logs pgl JOIN players p ON pgl.player_id = p.player_id WHERE pgl.player_id = $1 AND pgl.game_date >= $2 GROUP BY pgl.player_id, p.full_name`,
        advanced: `SELECT pgl.player_id, p.full_name, COUNT(*) as games_played, AVG(pgl.pts) as avg_points, AVG(pgl.reb) as avg_rebounds, AVG(pgl.ast) as avg_assists, AVG(pgl.stl) as avg_steals, AVG(pgl.blk) as avg_blocks, AVG(pgl.min) as avg_minutes, AVG(abs.usage_percentage) as avg_usage, AVG(abs.offensive_rating) as avg_offensive_rating, AVG(abs.defensive_rating) as avg_defensive_rating, AVG(abs.net_rating) as avg_net_rating FROM player_game_logs pgl JOIN players p ON pgl.player_id = p.player_id LEFT JOIN advanced_box_scores abs ON pgl.game_log_id = abs.game_log_id WHERE pgl.player_id = $1 AND pgl.game_date >= $2 GROUP BY pgl.player_id, p.full_name`
    },
    head_to_head: {
        basic: `SELECT pgl1.*, p1.full_name as player1_name, pgl2.pts as player2_pts, pgl2.reb as player2_reb, pgl2.ast as player2_ast, p2.full_name as player2_name FROM player_game_logs pgl1 JOIN players p1 ON pgl1.player_id = p1.player_id JOIN player_game_logs pgl2 ON pgl1.game_date = pgl2.game_date AND pgl1.opponent = pgl2.opponent JOIN players p2 ON pgl2.player_id = p2.player_id WHERE pgl1.player_id = $1 AND pgl2.player_id = $2 ORDER BY pgl1.game_date DESC LIMIT $3`,
        advanced: `SELECT pgl1.*, p1.full_name as player1_name, pgl2.pts as player2_pts, pgl2.reb as player2_reb, pgl2.ast as player2_ast, p2.full_name as player2_name, abs1.usage_percentage as player1_usage, abs2.usage_percentage as player2_usage FROM player_game_logs pgl1 JOIN players p1 ON pgl1.player_id = p1.player_id JOIN player_game_logs pgl2 ON pgl1.game_date = pgl2.game_date AND pgl1.opponent = pgl2.opponent JOIN players p2 ON pgl2.player_id = p2.player_id LEFT JOIN advanced_box_scores abs1 ON pgl1.game_log_id = abs1.game_log_id LEFT JOIN advanced_box_scores abs2 ON pgl2.game_log_id = abs2.game_log_id WHERE pgl1.player_id = $1 AND pgl2.player_id = $2 ORDER BY pgl1.game_date DESC LIMIT $3`
    }
};

const executeQueryByTemplate = async (queryType, includeAdvanced, params) => {
    const template = queryTemplates[queryType];
    if (!template) {
        throw new Error(`Unsupported query type: ${queryType}`);
    }

    const query = includeAdvanced ? template.advanced : template.basic;
    return await executeQuery(query, params);
};

const getSeasonStartDate = () => {
    const now = new Date();
    const year = now.getMonth() >= 9 ? now.getFullYear() : now.getFullYear() - 1;
    return `${year}-10-01`; // NBA season typically starts in October
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
                    "query_type": "player_stats/player_vs_team/player_comparison/season_totals/head_to_head/general_stats/prediction",
                    "requested_advanced_stats": true/false,
                    "is_prediction_request": true/false,
                    "second_player_name": "second player name if comparing players"
                }
                
                Query type mapping:
                - "player_stats": general player statistics
                - "player_vs_team": player performance against specific team
                - "player_comparison": comparing two players' stats
                - "season_totals": season-long averages and totals
                - "head_to_head": direct player vs player comparison in same games
                - "prediction": future performance predictions
                
                - Set "query_type" to "prediction" and "is_prediction_request" to true if the user is asking for a prediction, projection, or estimate of a player's future performance.
                - Set "query_type" to "player_comparison" or "head_to_head" if comparing two players.
                - Set "query_type" to "season_totals" if asking for season averages or totals.
                - Only set "requested_advanced_stats" to true if the user explicitly asks for advanced stats, usage percentage, ratings, etc.
                
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

        if (analysis.is_prediction_request && analysis.player_name) {
            const player = await findPlayerId(analysis.player_name);
            if (!player) {
                return res.status(404).json({
                    error: `Player "${analysis.player_name}" not found in the database`
                });
            }

            const statKey = analysis.stat_type || 'pts';
            const statLabelMap = {
                points: 'pts',
                rebounds: 'reb',
                assists: 'ast',
                steals: 'stl',
                blocks: 'blk',
                minutes: 'min'
            };
            const statLabel = statLabelMap[statKey] || statKey;
            console.log(statLabel);
            const limit = 5;

            // Fetch last N games overall
            const gamesOverall = await executeQuery(
                `SELECT * FROM player_game_logs WHERE player_id = $1 ORDER BY game_date DESC LIMIT $2`,
                [player.player_id, limit]
            );
            console.log('DEBUG: Last 5 games overall:', gamesOverall);

            // Fetch last N games vs. opponent (if specified)
            let gamesVsOpponent = [];
            let teamAbbr = null;
            if (analysis.team_name) {
                teamAbbr = await findTeamAbbr(analysis.team_name);
                console.log('DEBUG: Team abbreviation for opponent:', teamAbbr);
                if (teamAbbr) {
                    gamesVsOpponent = await executeQuery(
                        `SELECT * FROM player_game_logs WHERE player_id = $1 AND opponent = $2 ORDER BY game_date DESC LIMIT $3`,
                        [player.player_id, teamAbbr, limit]
                    );
                }
            }
            console.log('DEBUG: Last 5 games vs opponent:', gamesVsOpponent);

            // Helper to calculate average
            function avgStat(games, key) {
                if (!games.length) return null;
                const values = games.map(g => g[key]);
                console.log('DEBUG: Stat values for averaging:', key, values);
                return values.reduce((sum, v) => sum + (v || 0), 0) / games.length;
            }

            const avgOverall = avgStat(gamesOverall, statLabel);
            const avgVsOpponent = avgStat(gamesVsOpponent, statLabel);
            let prediction = null;
            let usedAverages = [];

            if (avgOverall !== null && avgVsOpponent !== null) {
                prediction = (avgOverall + avgVsOpponent) / 2;
                usedAverages = [
                    `last ${limit} games overall (${avgOverall.toFixed(1)} ${statLabel})`,
                    `last ${limit} games vs. the ${analysis.team_name} (${avgVsOpponent.toFixed(1)} ${statLabel})`
                ];
            } else if (avgVsOpponent !== null) {
                prediction = avgVsOpponent;
                usedAverages = [
                    `last ${limit} games vs. the ${analysis.team_name} (${avgVsOpponent.toFixed(1)} ${statLabel})`
                ];
            } else if (avgOverall !== null) {
                prediction = avgOverall;
                usedAverages = [
                    `last ${limit} games overall (${avgOverall.toFixed(1)} ${statLabel})`
                ];
            }

            if (prediction === null) {
                return res.status(404).json({
                    error: `Not enough data to make a prediction for ${player.full_name}`
                });
            }

            // Format chatbot message
            let message = `Prediction for ${player.full_name}'s next game`;
            if (analysis.team_name) {
                message += ` vs. the ${analysis.team_name}`;
            }
            message += `:\n\n`;
            message += `**Projected ${statLabel}: ${prediction.toFixed(1)}**\n`;
            message += `\nBased on ${usedAverages.join(' and ')}.`;

            return res.json({
                answer: message,
                prediction: prediction.toFixed(1),
                stat: statLabel,
                player: player.full_name,
                gamesOverall,
                gamesVsOpponent
            });
        }

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
                data = await executeQueryByTemplate(
                    'player_vs_team',
                    analysis.requested_advanced_stats,
                    [player.player_id, teamAbbr, limit]
                );

                queryDescription = `${player.full_name}'s last ${limit} games against the ${analysis.team_name}`;

            } else {
                const limit = analysis.time_period?.match(/\d+/)?.[0] || 5;
                data = await executeQueryByTemplate(
                    'player_stats',
                    analysis.requested_advanced_stats,
                    [player.player_id, limit]
                );

                queryDescription = `${player.full_name}'s last ${limit} games`;
            }
        }



        if (analysis.query_type === 'player_comparison' && analysis.second_player_name) {
            const player2 = await findPlayerId(analysis.second_player_name);
            if (!player2) {
                return res.status(404).json({
                    error: `Player "${analysis.second_player_name}" not found in the database`
                });
            }

            const limit = analysis.time_period?.match(/\d+/)?.[0] || 5;
            data = await executeQueryByTemplate(
                'player_comparison',
                analysis.requested_advanced_stats,
                [player.player_id, player2.player_id, limit]
            );

            queryDescription = `Comparison of ${player.full_name} vs ${player2.full_name} - last ${limit} games`;
        }

        if (analysis.query_type === 'season_totals' && analysis.player_name) {
            const seasonStart = getSeasonStartDate();
            data = await executeQueryByTemplate(
                'season_totals',
                analysis.requested_advanced_stats,
                [player.player_id, seasonStart]
            );

            queryDescription = `${player.full_name}'s season totals and averages`;
        }

        if (analysis.query_type === 'head_to_head' && analysis.second_player_name) {
            const player2 = await findPlayerId(analysis.second_player_name);
            if (!player2) {
                return res.status(404).json({
                    error: `Player "${analysis.second_player_name}" not found in the database`
                });
            }

            const limit = analysis.time_period?.match(/\d+/)?.[0] || 5;
            data = await executeQueryByTemplate(
                'head_to_head',
                analysis.requested_advanced_stats,
                [player.player_id, player2.player_id, limit]
            );

            queryDescription = `Head-to-head comparison of ${player.full_name} vs ${player2.full_name} in same games - last ${limit} matchups`;
        }

        if (!data || data.length === 0) {
            return res.status(404).json({
                error: 'No data found for the specified query'
            });
        }

        let processedData;
        if (analysis.query_type === 'season_totals') {
            processedData = data;
        } else if (analysis.query_type === 'player_comparison' || analysis.query_type === 'head_to_head') {
            processedData = data.map(game => ({
                game_date: game.game_date,
                opponent: game.opponent,
                player_name: game.full_name,
                minutes: game.min,
                points: game.pts,
                rebounds: game.reb,
                assists: game.ast,
                steals: game.stl,
                blocks: game.blk,
                usage_percentage: game.usage_percentage,
                offensive_rating: game.offensive_rating,
                defensive_rating: game.defensive_rating,
                net_rating: game.net_rating
            }));
        } else {
            processedData = data.map(game => ({
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
        }

        let averages = null;
        if (data.length > 1) {
            if (analysis.query_type === 'season_totals') {
                averages = data[0];
            } else if (analysis.query_type === 'player_comparison' || analysis.query_type === 'head_to_head') {
                const playerGroups = {};
                data.forEach(game => {
                    const playerName = game.player_name;
                    if (!playerGroups[playerName]) {
                        playerGroups[playerName] = [];
                    }
                    playerGroups[playerName].push(game);
                });

                averages = {};
                Object.keys(playerGroups).forEach(playerName => {
                    const games = playerGroups[playerName];
                    averages[`${playerName}_avg_points`] = (games.reduce((sum, game) => sum + (game.points || 0), 0) / games.length).toFixed(1);
                    averages[`${playerName}_avg_rebounds`] = (games.reduce((sum, game) => sum + (game.rebounds || 0), 0) / games.length).toFixed(1);
                    averages[`${playerName}_avg_assists`] = (games.reduce((sum, game) => sum + (game.assists || 0), 0) / games.length).toFixed(1);
                    if (analysis.requested_advanced_stats) {
                        averages[`${playerName}_avg_usage`] = games.filter(game => game.usage_percentage).length > 0
                            ? (games.reduce((sum, game) => sum + (game.usage_percentage || 0), 0) / games.filter(game => game.usage_percentage).length).toFixed(1)
                            : null;
                    }
                });
            } else {
                averages = {
                    avg_points: (data.reduce((sum, game) => sum + (game.pts || 0), 0) / data.length).toFixed(1),
                    avg_rebounds: (data.reduce((sum, game) => sum + (game.reb || 0), 0) / data.length).toFixed(1),
                    avg_assists: (data.reduce((sum, game) => sum + (game.ast || 0), 0) / data.length).toFixed(1),
                    avg_steals: (data.reduce((sum, game) => sum + (game.stl || 0), 0) / data.length).toFixed(1),
                    avg_blocks: (data.reduce((sum, game) => sum + (game.blk || 0), 0) / data.length).toFixed(1),
                    avg_minutes: (data.reduce((sum, game) => sum + (game.min || 0), 0) / data.length).toFixed(1),
                    avg_usage: analysis.requested_advanced_stats && data.filter(game => game.usage_percentage).length > 0
                        ? (data.reduce((sum, game) => sum + (game.usage_percentage || 0), 0) / data.filter(game => game.usage_percentage).length).toFixed(1)
                        : null
                };
            }
        }

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
                            - Use consistent terminology and formatting
                            
                            Special formatting for different query types:
                            - PLAYER COMPARISON: Group stats by player and highlight differences
                            - SEASON TOTALS: Emphasize season averages and totals
                            - HEAD TO HEAD: Compare players in the same games, showing both players' stats side by side`
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