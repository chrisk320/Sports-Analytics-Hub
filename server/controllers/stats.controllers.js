import pg from 'pg';
import dotenv from 'dotenv';

dotenv.config();

const { Pool } = pg;
const pool = new Pool({
    connectionString: process.env.DATABASE_URL,
    ssl: { rejectUnauthorized: false }
});

// Every endpoint here is sport-scoped via ?sport=, defaulting to nba so the
// deployed frontend keeps working unchanged while it adopts the parameter.
const VALID_SPORTS = new Set(['nba', 'nfl', 'mlb']);
const sportOf = (req) => {
    const s = String(req.query.sport || 'nba').toLowerCase();
    return VALID_SPORTS.has(s) ? s : 'nba';
};

// Game-log rows carry sport-specific numbers in the `stats` JSONB column.
// Flatten them onto the row so the frontend's statFromLog() can read
// `passing_yards` for the NFL exactly as it reads `pts` for the NBA.
const flattenStats = (rows) => rows.map(({ stats, ...rest }) => ({ ...rest, ...(stats || {}) }));

export const getPlayers = async (req, res) => {
    console.log(`Received request for all players list.`);
    try {
        const query = `SELECT player_id, full_name, headshot_url, position, team_abbreviation
                       FROM players WHERE sport = $1 ORDER BY full_name ASC;`;
        const result = await pool.query(query, [sportOf(req)]);
        res.status(200).json(result.rows);
    } catch (err) {
        console.error('Error fetchign player list', err.stack);
    }
}

export const getPlayer = async (req, res) => {
    const { playerId } = req.params;
    console.log(`Received request for player info for ID: ${playerId}`);
    try {
        const query = `SELECT player_id, full_name, headshot_url, position, team_abbreviation, sport
                       FROM players WHERE player_id = $1;`;
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
        // Computed live from game logs (the player_season_stats table was
        // dropped — only the retired NBA.com scraper ever populated it, and
        // these averages are fully derivable from the now-complete game logs).
        const query = `
            SELECT
                g.season,
                p.team_abbreviation,
                COUNT(*)::int                                        AS games_played,
                ROUND(AVG(g.pts)::numeric, 1)::float                 AS points_avg,
                ROUND(AVG(g.reb)::numeric, 1)::float                 AS rebounds_avg,
                ROUND(AVG(g.ast)::numeric, 1)::float                 AS assists_avg,
                ROUND(AVG(g.stl)::numeric, 1)::float                 AS steals_avg,
                ROUND(AVG(g.blk)::numeric, 1)::float                 AS blocks_avg,
                ROUND(AVG(a.true_shooting_percentage)::numeric, 1)::float AS ts_pct,
                ROUND(AVG(a.usage_percentage)::numeric, 1)::float    AS usg_pct,
                ROUND(AVG(a.offensive_rating)::numeric, 1)::float    AS off_rating
            FROM player_game_logs g
            JOIN players p ON p.player_id = g.player_id
            LEFT JOIN advanced_box_scores a ON a.game_log_id = g.game_log_id
            WHERE g.player_id = $1
            GROUP BY g.season, p.team_abbreviation
            ORDER BY g.season DESC
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
              -- Recent form does not cross a season boundary. Without this, a
              -- player who missed time has their window reach back into the
              -- previous year: Joe Burrow played 8 games in 2025, so "last 10"
              -- averaged those together with two games from 2024 -- a year-old
              -- form read presented as current. The window is now "the last N
              -- games of this player's most recent season", which returns
              -- fewer than N when the season is short or still young.
              AND pgl.season = (
                SELECT MAX(season) FROM player_game_logs WHERE player_id = $1
              )
            ORDER BY pgl.game_date DESC
            LIMIT $2;
        `;
        // The window is caller-driven: "last 10" suits an 82-game NBA season,
        // but is nearly half a 17-game NFL season. Bounded server-side.
        const limit = Math.min(parseInt(req.query.limit, 10) || 10, 100);
        const result = await pool.query(query, [playerId, limit]);
        res.status(200).json(flattenStats(result.rows));
    } catch (err) {
        console.error('Error fetching full game logs', err.stack);
        res.status(500).send('Server Error');
    }
}

export const getSeasons = async (req, res) => {
    console.log(`Received request for available seasons.`);
    try {
        const result = await pool.query(
            'SELECT DISTINCT season FROM player_game_logs WHERE sport = $1 ORDER BY season DESC;',
            [sportOf(req)]
        );
        res.status(200).json(result.rows.map((r) => r.season));
    } catch (err) {
        console.error('Error fetching seasons', err.stack);
        res.status(500).send('Server Error');
    }
};

// Whitelist of leaderboard stats -> SQL aggregate expression, per sport. Keys
// come from the request, so we never interpolate raw column names from user
// input — the whitelist IS the injection defense.
//
// NBA still reads its legacy columns (which remain authoritative until the
// contract migration drops them); NFL reads the JSONB blob. Same shape, so the
// query below is identical for both.
// Average a stat out of the JSONB blob, treating an absent key as zero.
//
// Without the COALESCE, AVG skips rows where the key is missing while
// games_played still counts them, so the two columns disagree: a receiver with
// two productive games out of fifteen was ranked on a 40.0 average next to a
// games_played of 15, when his real per-game figure was 5.3. Loaders now store
// explicit zeros, but the query should not depend on that.
const jsonAvg = (key) => `AVG(COALESCE((pgl.stats->>'${key}')::numeric, 0))`;

// Season total rather than a per-game rate. Baseball counting stats are always
// discussed as totals -- "35 home runs", never "0.3 home runs per game", which
// is both unidiomatic and useless at one decimal place because it compresses
// every slugger in the league onto the same number. Basketball and football
// are the opposite convention, so this is per-stat rather than per-sport.
const jsonSum = (key) => `SUM(COALESCE((pgl.stats->>'${key}')::numeric, 0))`;

const LEADERBOARD_STATS_BY_SPORT = {
    nba: {
        pts: 'AVG(pgl.pts)',
        reb: 'AVG(pgl.reb)',
        ast: 'AVG(pgl.ast)',
        stl: 'AVG(pgl.stl)',
        blk: 'AVG(pgl.blk)',
        ts: 'AVG(abs.true_shooting_percentage)',
        usage: 'AVG(abs.usage_percentage)',
    },
    nfl: {
        pass_yds: jsonAvg('passing_yards'),
        pass_tds: jsonAvg('passing_tds'),
        rush_yds: jsonAvg('rushing_yards'),
        rec: jsonAvg('receptions'),
        rec_yds: jsonAvg('receiving_yards'),
        ppr: jsonAvg('fantasy_points_ppr'),
    },
    // Baseball splits into two populations that share stat NAMES but not
    // meaning: `strike_outs` on a batter row is times struck out, on a pitcher
    // row it is strikeouts thrown. Each entry therefore carries the role its
    // stat belongs to, and the query filters on it -- otherwise a hitter with
    // 180 strikeouts would top the strikeout leaderboard ahead of every
    // pitcher in baseball.
    mlb: {
        hits:        { expr: jsonSum('hits'),        role: 'batter',  agg: 'total' },
        home_runs:   { expr: jsonSum('home_runs'),   role: 'batter',  agg: 'total' },
        total_bases: { expr: jsonSum('total_bases'), role: 'batter',  agg: 'total' },
        rbi:         { expr: jsonSum('rbi'),         role: 'batter',  agg: 'total' },
        strikeouts:  { expr: jsonSum('strike_outs'), role: 'pitcher', agg: 'total' },
        earned_runs: { expr: jsonSum('earned_runs'), role: 'pitcher', agg: 'total' },
    },
};

// Entries are either a bare SQL expression or {expr, role}. Normalizing here
// keeps the three sports' shapes from leaking into the query builder.
const statConfig = (allowed, stat) => {
    const entry = allowed[stat];
    if (!entry) return null;
    return typeof entry === 'string'
        ? { expr: entry, role: null, agg: 'per_game' }
        : { role: null, agg: 'per_game', ...entry };
};

// Minimum games to appear on a leaderboard. Sport-specific because 20 games is
// a quarter of an NBA season but larger than an entire NFL one.
const MIN_GAMES_BY_SPORT = { nba: 20, nfl: 4, mlb: 20 };

export const getLeaderboard = async (req, res) => {
    const sport = sportOf(req);
    const allowed = LEADERBOARD_STATS_BY_SPORT[sport] || {};
    // Default to the sport's first configured stat rather than a hardcoded
    // 'pts', which does not exist outside basketball.
    const { season, stat = Object.keys(allowed)[0] } = req.query;
    const limit = Math.min(parseInt(req.query.limit, 10) || 25, 100);
    const minGames = MIN_GAMES_BY_SPORT[sport] ?? 20;
    const cfg = statConfig(allowed, stat);
    const statExpr = cfg?.expr;
    console.log(`Received leaderboard request: sport=${sport} season=${season || 'latest'} stat=${stat}`);

    if (!cfg) {
        return res.status(400).json({
            error: Object.keys(allowed).length
                ? `Invalid stat '${stat}' for ${sport}. Allowed: ${Object.keys(allowed).join(', ')}`
                : `No leaderboard stats configured for ${sport}`,
        });
    }

    try {
        const params = [sport];
        const sportParam = `$${params.length}`;
        let seasonFilter;
        if (season) {
            params.push(season);
            seasonFilter = `pgl.season = $${params.length}`;
        } else {
            // Latest season FOR THIS SPORT — seasons are strings like '2025-26'
            // (NBA) and '2024' (NFL), so a global MAX would be meaningless.
            seasonFilter = `pgl.season = (SELECT MAX(season) FROM player_game_logs WHERE sport = ${sportParam})`;
        }
        // Scope to one role where the sport defines them, so batting and
        // pitching leaderboards do not average across both populations.
        let roleFilter = '';
        if (cfg.role) {
            params.push(cfg.role);
            roleFilter = ` AND pgl.role = $${params.length}`;
        }
        params.push(minGames);
        const minGamesParam = `$${params.length}`;
        params.push(limit);
        const limitParam = `$${params.length}`;

        const query = `
            SELECT
                pgl.player_id,
                p.full_name,
                p.headshot_url,
                MAX(pgl.season)                          AS season,
                COUNT(*)::int                            AS games_played,
                -- Totals are whole numbers (35 home runs, not 35.0); rates
                -- keep one decimal. The agg marker travels with the rows so the
                -- client labels them correctly without keeping its own copy of
                -- this table in step.
                ROUND(${statExpr}::numeric, ${cfg.agg === 'total' ? 0 : 1})::float AS value,
                '${cfg.agg}'                             AS agg
            FROM player_game_logs pgl
            JOIN players p ON p.player_id = pgl.player_id
            LEFT JOIN advanced_box_scores abs ON abs.game_log_id = pgl.game_log_id
            WHERE pgl.sport = ${sportParam} AND ${seasonFilter}${roleFilter}
            GROUP BY pgl.player_id, p.full_name, p.headshot_url
            HAVING COUNT(*) >= ${minGamesParam} AND ${statExpr} IS NOT NULL
            -- Order on the UNROUNDED average, with a deterministic tie-break.
            -- Ordering by the rounded column let two players who both display
            -- 1.3 come back in arbitrary order, so the recap card and the
            -- leaderboard below it disagreed about who led the league.
            ORDER BY ${statExpr} DESC NULLS LAST, COUNT(*) DESC, p.full_name ASC
            LIMIT ${limitParam};
        `;
        const result = await pool.query(query, params);
        res.status(200).json(result.rows);
    } catch (err) {
        console.error('Error fetching leaderboard', err.stack);
        res.status(500).send('Server Error');
    }
};

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