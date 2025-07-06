import puppeteer from 'puppeteer';
import pg from 'pg';

const TEST_MODE = true;

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
    CREATE TABLE IF NOT EXISTS advanced_box_scores (
      advanced_box_score_id SERIAL PRIMARY KEY,
      game_log_id INT UNIQUE REFERENCES player_game_logs(game_log_id) ON DELETE CASCADE,
      offensive_rating REAL,
      defensive_rating REAL,
      net_rating REAL,
      effective_fg_percentage REAL,
      true_shooting_percentage REAL,
      usage_percentage REAL,
      pace REAL,
      player_impact_estimate REAL
    );
  `;
    try {
        const client = await pool.connect();
        await client.query(createTableQuery);
        client.release();
        console.log('✅ Advanced box scores table is ready.');
    } catch (err) {
        console.error('❌ Error setting up database tables:', err);
        process.exit(1);
    }
};

const scrapeAdvancedBoxScores = async (browser, player, season) => {
    if (!player || !player.player_id || !season) {
        console.log('Invalid player or season data provided.');
        return [];
    }
    console.log(`--- Scraping advanced box scores for ${player.full_name} (ID: ${player.player_id}) for the ${season} season ---`);
    const page = await browser.newPage();
    let allGameLogs = [];
    try {
        await page.setUserAgent('Mozilla/5.0 (Macintosh; Intel Mac OS X 10_15_7) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/114.0.0.0 Safari/537.36');

        const url = `https://www.nba.com/stats/player/${player.player_id}/boxscores-advanced?Season=${season}&SeasonType=Regular+Season`;

        await page.goto(url, { waitUntil: 'domcontentloaded', timeout: 60000 });
        try {
            await page.waitForSelector('#onetrust-accept-btn-handler', { timeout: 5000 });
            await page.click('#onetrust-accept-btn-handler');
        } catch (e) {
            console.log('Cookie consent button not found or already handled.');
        }

        const tableSelector = 'section.Block_block__62M07 table';
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
                        const offensive_rating = parseFloat(columns[3]?.innerText) || 0;
                        const defensive_rating = parseFloat(columns[4]?.innerText, 10) || 0;
                        const net_rating = parseFloat(columns[5]?.innerText, 10) || 0;
                        const effective_fg_percentage = parseFloat(columns[13]?.innerText, 10) || 0;
                        const true_shooting_percentage = parseFloat(columns[14]?.innerText, 10) || 0;
                        const usage_percentage = parseFloat(columns[15]?.innerText, 10) || 0;
                        const pace = parseFloat(columns[16]?.innerText, 10) || 0;
                        const player_impact_estimate = parseFloat(columns[17]?.innerText, 10) || 0;
                        logs.push({ gameDate, offensive_rating, defensive_rating, net_rating, effective_fg_percentage, true_shooting_percentage, usage_percentage, pace, player_impact_estimate });
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
        console.log(`Found a total of ${allGameLogs.length} advanced box scores for ${player.full_name} in the ${season} season.`);
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
            
            const testPlayer = { player_id: 201939, full_name: 'Stephen Curry' };
            const testSeason = '2024-25';

            const gameLogs = await scrapeAdvancedBoxScores(browser, testPlayer, testSeason);

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
            console.log('Fetching top 100 players from the database based on 2024-25 PPG...');
            const topPlayersQuery = `
                SELECT p.player_id, p.full_name 
                FROM player_season_stats s
                JOIN players p ON s.player_id = p.player_id
                WHERE s.season = '2024-25'
                ORDER BY s.points_avg DESC
                LIMIT 100;
            `;
            const res = await client.query(topPlayersQuery);
            const topPlayersToScrape = res.rows;

            const seasonsToProcess = ['2024-25', '2023-24', '2022-23'];

            console.log(`Found ${topPlayersToScrape.length} top players to scrape for seasons: ${seasonsToProcess.join(', ')}.`);

            for (const season of seasonsToProcess) {
                console.log(`\n--- PROCESSING SEASON: ${season} ---`);
                for (const player of topPlayersToScrape) {
                    const checkQuery = `SELECT 1 FROM player_game_logs WHERE player_id = $1 AND season = $2 LIMIT 1`;
                    const checkResult = await client.query(checkQuery, [player.player_id, season]);

                    if (checkResult.rowCount > 0) {
                        console.log(`Data for ${player.full_name} in ${season} already exists. Skipping.`);
                        continue;
                    }

                    const gameLogs = await scrapeAdvancedBoxScores(browser, player, season);
                    for (const log of gameLogs) {
                        await client.query(
                            `INSERT INTO player_game_logs (player_id, season, game_date, opponent, min, pts, reb, ast, stl, blk) 
                      VALUES ($1, $2, $3, $4, $5, $6, $7, $8, $9, $10) 
                      ON CONFLICT (player_id, game_date) DO NOTHING`,
                            [player.player_id, season, log.gameDate, log.opponent, log.min, log.pts, log.reb, log.ast, log.stl, log.blk]
                        );
                    }
                    await sleep(randomDelay(2000, 5000));
                }
            }
        } catch (err) {
            console.error("\n❌ An error occurred during the main process:", err);
        } finally {
            if (client) client.release();
            await pool.end();
            console.log("\n🚀 All advanced box scores have been processed.");
        }
    }

    await browser.close();
    console.log("\nScript finished.");
};

main();
