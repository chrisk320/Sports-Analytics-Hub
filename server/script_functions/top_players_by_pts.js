// File: seed-gamelogs.js
// Purpose: A standalone script to fetch game-by-game logs for all players
// that ALREADY EXIST in the database.
// To Run: node seed-gamelogs.js

import puppeteer from 'puppeteer';
import pg from 'pg';

// --- SCRIPT CONFIGURATION ---
// Set to true to run for one player and print results to the console.
// Set to false to run for all players and save to the database.
const TEST_MODE = false;

// --- Database Configuration ---
const { Pool } = pg;
const pool = new Pool({
    user: 'christiankim',
    host: 'localhost',
    database: 'nba_stats',
    password: '',
    port: 5432,
});

// --- HELPER FUNCTION FOR HUMAN-LIKE DELAYS ---
const sleep = (ms) => new Promise(r => setTimeout(r, ms));
const randomDelay = (min, max) => Math.random() * (max - min) + min;

/**
 * Ensures the player_game_logs table exists.
 */
const setupDatabase = async () => {
    console.log('Verifying database tables...');
    const createTableQuery = `
    CREATE TABLE IF NOT EXISTS player_game_logs (
      game_log_id SERIAL PRIMARY KEY,
      player_id INT REFERENCES players(player_id),
      season VARCHAR(10) NOT NULL,
      game_date DATE NOT NULL,
      opponent VARCHAR(5),
      min REAL,
      pts INT,
      reb INT,
      ast INT,
      stl INT,
      blk INT,
      UNIQUE(player_id, game_date)
    );
  `;
    try {
        const client = await pool.connect();
        await client.query(createTableQuery);
        client.release();
        console.log('✅ Game logs table is ready.');
    } catch (err) {
        console.error('❌ Error setting up database tables:', err);
        process.exit(1);
    }
};

/**
 * Scrapes all pages of game-by-game logs for a single player for a SPECIFIC season.
 */
const scrapePlayerGameLogs = async (browser, player, season) => {
    if (!player || !player.player_id || !season) {
        console.log('Invalid player or season data provided.');
        return [];
    }
    console.log(`--- Scraping game logs for ${player.full_name} (ID: ${player.player_id}) for the ${season} season ---`);
    const page = await browser.newPage();
    let allGameLogs = [];
    try {
        await page.setUserAgent('Mozilla/5.0 (Macintosh; Intel Mac OS X 10_15_7) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/114.0.0.0 Safari/537.36');

        const url = `https://www.nba.com/stats/player/${player.player_id}/boxscores-traditional?Season=${season}&SeasonType=Regular+Season`;

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
                    if (columns.length > 20) {
                        const combinedText = columns[0]?.innerText || '';
                        const parts = combinedText.split(' - ');
                        const gameDate = parts[0]?.trim();
                        const matchupDetails = parts[1] || '';
                        const matchupParts = matchupDetails.split(' ');
                        const opponent = matchupParts[matchupParts.length - 1];
                        const min = parseFloat(columns[2]?.innerText) || 0;
                        const pts = parseInt(columns[3]?.innerText, 10) || 0;
                        const reb = parseInt(columns[15]?.innerText, 10) || 0;
                        const ast = parseInt(columns[16]?.innerText, 10) || 0;
                        const stl = parseInt(columns[17]?.innerText, 10) || 0;
                        const blk = parseInt(columns[18]?.innerText, 10) || 0;
                        logs.push({ gameDate, opponent, min, pts, reb, ast, stl, blk });
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
        console.log(`Found a total of ${allGameLogs.length} game logs for ${player.full_name} in the ${season} season.`);
        return allGameLogs;
    } catch (err) {
        console.error(`❌ Top-level error scraping game logs for ${player.full_name}:`, err.message);
        return [];
    } finally {
        await page.close();
    }
}

/**
 * Main function to control the scraping process.
 */
const main = async () => {
    const browser = await puppeteer.launch({ executablePath: '/Applications/Google Chrome.app/Contents/MacOS/Google Chrome' });

    if (TEST_MODE) {
        if (TEST_MODE) {
            console.log("--- RUNNING IN TEST MODE ---");
            
            const testPlayer = { player_id: 201939, full_name: 'Stephen Curry' };
            const testSeason = '2023-24';

            const gameLogs = await scrapePlayerGameLogs(browser, testPlayer, testSeason);

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
            console.log('Fetching top 50 players from the database based on 2024-25 PPG...');
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

            const seasonsToProcess = ['2024-25', '2023-24', '2022-23', '2021-22', '2020-21', '2019-20'];

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

                    const gameLogs = await scrapePlayerGameLogs(browser, player, season);
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
            console.log("\n🚀 All game logs have been processed.");
        }
    }

    await browser.close();
    console.log("\nScript finished.");
};

main();
