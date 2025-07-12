import puppeteer from 'puppeteer';
import pg from 'pg';

const TEST_MODE = false;

const { Pool } = pg;
const pool = new Pool({
    user: 'christiankim',
    host: 'localhost',
    database: 'nba_stats',
    password: '',
    port: 5432,
});

const sleep = (ms) => new Promise(r => setTimeout(r, ms));
const randomDelay = (min, max) => Math.random() * (max - min) + min;

const setupDatabase = async () => {
    console.log('Verifying database tables...');
    const createTableQuery = `
    CREATE TABLE IF NOT EXISTS advanced_scoring_box_scores (
      advanced_scoring_box_score_id SERIAL PRIMARY KEY,
      game_log_id INT UNIQUE REFERENCES player_game_logs(game_log_id) ON DELETE CASCADE,
      percent_fga_2pt REAL,
      percent_fga_3pt REAL,
      percent_pts_2pt REAL,
      percent_pts_3pt REAL
    );
  `;
    try {
        const client = await pool.connect();
        await client.query(createTableQuery);
        client.release();
        console.log('✅ Advanced scoring box scores table is ready.');
    } catch (err) {
        console.error('❌ Error setting up database tables:', err);
        process.exit(1);
    }
};

const scrapeAdvancedScoringBoxScores = async (browser, player, season) => {
    if (!player || !player.player_id || !season) {
        console.log('Invalid player or season data provided.');
        return [];
    }
    console.log(`--- Scraping advanced scoring box scores for ${player.full_name} (ID: ${player.player_id}) for the ${season} season ---`);
    const page = await browser.newPage();
    let allGameLogs = [];
    try {
        await page.setUserAgent('Mozilla/5.0 (Macintosh; Intel Mac OS X 10_15_7) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/114.0.0.0 Safari/537.36');

        const url = `https://www.nba.com/stats/player/${player.player_id}/boxscores-scoring?Season=${season}&SeasonType=Regular+Season`;

        await page.goto(url, { waitUntil: 'domcontentloaded', timeout: 60000 });
        try {
            await page.waitForSelector('#onetrust-accept-btn-handler', { timeout: 5000 });
            await page.click('#onetrust-accept-btn-handler');
        } catch (e) {
            console.log('Cookie consent button not found or already handled.');
        }

        const tableSelector = 'section.nba-stats-content-block table';
        const noDataSelector = 'div[class*="NoData"]';

        try {
            await Promise.race([
                page.waitForSelector(tableSelector, { timeout: 30000 }),
                page.waitForSelector(noDataSelector, { timeout: 30000 })
            ]);

            const noDataElement = await page.$(noDataSelector);
            if (noDataElement) {
                console.log(`No data available for ${player.full_name} in ${season}. Skipping.`);
                return [];
            }
        } catch (err) {
            console.error(`Timeout or error waiting for content for ${player.full_name}. Skipping.`);
            return [];
        }

        let currentPage = 1;
        while (true) {
            const gameLogsOnPage = await page.evaluate((selector) => {
                const logs = [];
                const rows = document.querySelectorAll(`${selector} tbody tr`);
                rows.forEach(row => {
                    const columns = row.querySelectorAll('td');
                    if (columns.length > 15) {
                        const combinedText = columns[0]?.innerText || '';
                        const parts = combinedText.split(' - ');
                        const gameDate = parts[0]?.trim();
                        const percent_fga_2pt = parseFloat(columns[3]?.innerText) || 0;
                        const percent_fga_3pt = parseFloat(columns[4]?.innerText, 10) || 0;
                        const percent_pts_2pt = parseFloat(columns[5]?.innerText, 10) || 0;
                        const percent_pts_3pt = parseFloat(columns[7]?.innerText, 10) || 0;
                        logs.push({ gameDate, percent_fga_2pt, percent_fga_3pt, percent_pts_2pt, percent_pts_3pt });
                    }
                });
                return logs;
            }, tableSelector);

            allGameLogs.push(...gameLogsOnPage);

            const nextButtonSelector = 'button[title="Next Page Button"]:not([disabled])';
            const nextButton = await page.$(nextButtonSelector);

            if (nextButton) {
                await nextButton.click();
                await sleep(randomDelay(1500, 3000));
                currentPage++;
            } else {
                break;
            }
        }
        console.log(`Found a total of ${allGameLogs.length} advanced scoring box scores for ${player.full_name} in the ${season} season.`);
        return allGameLogs;
    } catch (err) {
        console.error(`❌ Top-level error scraping game logs for ${player.full_name}:`, err.message);
        return [];
    } finally {
        await page.close();
    }
}

const main = async () => {
    const browser = await puppeteer.launch({ executablePath: '/Applications/Google Chrome.app/Contents/MacOS/Google Chrome' });

    if (TEST_MODE) {
        if (TEST_MODE) {
            console.log("--- RUNNING IN TEST MODE ---");
            
            const testPlayer = { player_id: 1629660, full_name: 'Ty Jerome' };
            const testSeason = '2024-25';

            const gameLogs = await scrapeAdvancedScoringBoxScores(browser, testPlayer, testSeason);

            if (gameLogs.length > 0) {
                console.log(`\n--- Test scrape successful for ${testSeason} season! ---`);
                console.log("Here is a sample of the first 5 games found:");
                console.table(gameLogs.slice(0, 5));
            } else {
                console.log("\n--- Test scrape completed with no results. ---")
            }
        }
    } else {
        console.log("--- RUNNING IN PRODUCTION MODE (saving to database) ---");
        await setupDatabase();
        const client = await pool.connect();
        try {
            console.log('Fetching player list from the database...');
            const topPlayersQuery = `
                SELECT p.player_id, p.full_name 
                FROM player_season_stats s
                JOIN players p ON s.player_id = p.player_id
                WHERE s.season = '2024-25'
                ORDER BY s.assists_avg DESC
                LIMIT 100;
            `;
            const res = await client.query(topPlayersQuery);
            const topPlayersToScrape = res.rows;

            const seasonsToProcess = ['2024-25', '2023-24', '2022-23'];

            console.log(`Found ${topPlayersToScrape.length} top players to scrape for seasons: ${seasonsToProcess.join(', ')}.`);

            for (const player of topPlayersToScrape) {
                for (const season of seasonsToProcess) {
                    const checkQuery = `
                        SELECT 1 
                        FROM advanced_scoring_box_scores abs
                        JOIN player_game_logs pgl ON abs.game_log_id = pgl.game_log_id
                        WHERE pgl.player_id = $1 AND pgl.season = $2
                        LIMIT 1;
                    `;
                    const checkResult = await client.query(checkQuery, [player.player_id, season]);

                    if (checkResult.rowCount > 0) {
                        console.log(`Advanced scoring stats for ${player.full_name} in ${season} already exist. Skipping.`);
                        continue; 
                    }

                    console.log(`\nFetching existing game logs for ${player.full_name} in ${season}...`);
                    const gameLogRes = await client.query('SELECT game_log_id, game_date FROM player_game_logs WHERE player_id = $1 AND season = $2', [player.player_id, season]);
                    
                    const gameLogMap = new Map(gameLogRes.rows.map(row => [new Date(row.game_date).toLocaleDateString(), row.game_log_id]));

                    if (gameLogMap.size === 0) {
                        console.log(`No existing advanced scoring game logs found for ${player.full_name} in ${season}. Skipping advanced stats.`);
                        continue;
                    }

                    const advancedLogs = await scrapeAdvancedScoringBoxScores(browser, player, season);
                    
                    for (const log of advancedLogs) {
                        const formattedDate = new Date(log.gameDate).toLocaleDateString();
                        const game_log_id = gameLogMap.get(formattedDate);

                        if (game_log_id) {
                            await client.query(
                                `INSERT INTO advanced_scoring_box_scores (game_log_id, percent_fga_2pt, percent_fga_3pt, percent_pts_2pt, percent_pts_3pt) 
                                 VALUES ($1, $2, $3, $4, $5) 
                                 ON CONFLICT (game_log_id) DO NOTHING`,
                                [game_log_id, log.percent_fga_2pt, log.percent_fga_3pt, log.percent_pts_2pt, log.percent_pts_3pt]
                            );
                        } else {
                            console.warn(`Could not find matching game_log_id for date: ${formattedDate}`);
                        }
                    }
                    await sleep(randomDelay(2000, 5000));
                }
            }
        } catch (err) {
            console.error("\n❌ An error occurred during the main process:", err);
        } finally {
            if (client) client.release();
            await pool.end();
            console.log("\n🚀 All advanced scoring box scores have been processed.");
        }
    }

    await browser.close();
    console.log("\nScript finished.");
};

main();
