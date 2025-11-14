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
    console.log('Setting up database tables...');
    const client = await pool.connect();
    
    try {
        await client.query(`
            CREATE TABLE IF NOT EXISTS players (
              player_id INT PRIMARY KEY,
              full_name VARCHAR(255) NOT NULL,
              UNIQUE(player_id)
            );
        `);
        
        try {
            await client.query(`
                ALTER TABLE players 
                ADD COLUMN IF NOT EXISTS headshot_url VARCHAR(512);
            `);
            console.log('✅ "headshot_url" column ensured in "players" table.');
        } catch (err) {
            if (err.code !== '42701') {
                console.warn(`Could not add headshot_url column, it might already exist. Error: ${err.message}`);
            }
        }
        
        try {
            await client.query(`
                ALTER TABLE players 
                ADD COLUMN IF NOT EXISTS team_abbreviation VARCHAR(5);
            `);
            console.log('✅ "team_abbreviation" column ensured in "players" table.');
        } catch (err) {
            if (err.code !== '42701') {
                console.warn(`Could not add team_abbreviation column, it might already exist. Error: ${err.message}`);
            }
        }
        
        await client.query(`
            CREATE TABLE IF NOT EXISTS teams (
              team_id BIGINT PRIMARY KEY,
              team_name VARCHAR(255),
              team_abbreviation VARCHAR(5),
              url_slug VARCHAR(255),
              UNIQUE(team_id)
            );
        `);
        
        console.log('✅ "teams" and "players" tables are ready.');
    } catch (err) {
        console.error('❌ Error setting up database tables:', err);
        process.exit(1);
    } finally {
        client.release();
    }
};

const scrapeTeamRoster = async (browser, team) => {
    const page = await browser.newPage();
    const rosterUrl = `https://www.nba.com/team/${team.team_id}/${team.url_slug}/roster`;
    
    try {
        await page.setUserAgent('Mozilla/5.0 (Macintosh; Intel Mac OS X 10_15_7) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/114.0.0.0 Safari/537.36');
        console.log(`Navigating to ${team.team_name} roster page...`);
        await page.goto(rosterUrl, { waitUntil: 'networkidle2', timeout: 60000 });
        
        // Wait a bit for any dynamic content to load
        await sleep(2000);
        
        try {
            await page.waitForSelector('#onetrust-accept-btn-handler', { timeout: 5000 });
            await page.click('#onetrust-accept-btn-handler');
            await sleep(1000);
        } catch (e) {
            // Cookie consent not found or already handled
        }
        
        // Try multiple selectors for the roster container
        const containerSelectors = [
            'div[class*="TeamRoster_tableContainer"]',
            'div[class*="Roster_tableContainer"]',
            'table[class*="Roster"]',
            'div[class*="roster"] table',
            'table tbody tr'
        ];
        
        let containerSelector = null;
        for (const selector of containerSelectors) {
            try {
                await page.waitForSelector(selector, { timeout: 5000 });
                containerSelector = selector;
                console.log(`Found roster container for ${team.team_name} using selector: ${selector}`);
                break;
            } catch (e) {
                // Try next selector
            }
        }
        
        if (!containerSelector) {
            // Last resort: try to find any table with player links
            const hasTable = await page.evaluate(() => {
                const links = document.querySelectorAll('a[href*="/player/"]');
                return links.length > 0;
            });
            
            if (!hasTable) {
                console.error(`❌ Could not find roster table for ${team.team_name}. URL: ${rosterUrl}`);
                return [];
            }
            // Use a more generic selector
            containerSelector = 'body';
        }

        await page.evaluate((selector) => {
            const element = document.querySelector(selector);
            if (element) {
                element.scrollIntoView({ block: 'center', behavior: 'smooth' });
            }
        }, containerSelector);
        
        // Wait a bit for any lazy-loaded content
        await sleep(2000);

        // Try to find player links with multiple strategies
        const dataSelectors = [
            'td.primary.text a[href*="/player/"]',
            'a[href*="/player/"]',
            'tbody tr td a[href*="/player/"]'
        ];
        
        let foundLinks = false;
        for (const dataSelector of dataSelectors) {
            try {
                await page.waitForSelector(dataSelector, { timeout: 5000 });
                foundLinks = true;
                break;
            } catch (e) {
                // Try next selector
            }
        }
        
        if (!foundLinks) {
            // Check if links exist at all
            const hasLinks = await page.evaluate(() => {
                return document.querySelectorAll('a[href*="/player/"]').length > 0;
            });
            
            if (!hasLinks) {
                console.error(`❌ No player links found for ${team.team_name}`);
                return [];
            }
        }
        
        const result = await page.evaluate((selector) => {
            const players = [];
            
            // First try: look for table rows
            let rows = [];
            const tableContainer = document.querySelector(selector);
            
            if (tableContainer && selector !== 'body') {
                rows = tableContainer.querySelectorAll('tbody tr');
                if (rows.length === 0) {
                    rows = tableContainer.querySelectorAll('tr');
                }
            }
            
            // If no rows found, try to find all player links directly
            if (rows.length === 0) {
                const allPlayerLinks = document.querySelectorAll('a[href*="/player/"]');
                const seenIds = new Set();
                
                allPlayerLinks.forEach((link) => {
                    const href = link.getAttribute('href');
                    if (href) {
                        const hrefParts = href.split('/');
                        const playerId = hrefParts[2];
                        const fullName = link.innerText.trim();
                        
                        if (playerId && /^\d+$/.test(playerId) && fullName && !seenIds.has(playerId)) {
                            seenIds.add(playerId);
                            players.push({
                                player_id: parseInt(playerId, 10),
                                full_name: fullName
                            });
                        }
                    }
                });
                
                return { players };
            }
            
            // Process table rows
            rows.forEach((row) => {
                const primaryCell = row.querySelector('td.primary.text');
                const playerLink = primaryCell ? primaryCell.querySelector('a[href*="/player/"]') : null;
                
                // Fallback: look for any player link in the row
                if (!playerLink) {
                    const anyLink = row.querySelector('a[href*="/player/"]');
                    if (anyLink) {
                        const href = anyLink.getAttribute('href');
                        const hrefParts = href.split('/');
                        const playerId = hrefParts[2];
                        const fullName = anyLink.innerText.trim();
                        
                        if (playerId && /^\d+$/.test(playerId) && fullName) {
                            players.push({
                                player_id: parseInt(playerId, 10),
                                full_name: fullName
                            });
                        }
                    }
                } else {
                    const href = playerLink.getAttribute('href');
                    const hrefParts = href.split('/');
                    const playerId = hrefParts[2];
                    const fullName = playerLink.innerText.trim();

                    if (playerId && /^\d+$/.test(playerId) && fullName) {
                        players.push({
                            player_id: parseInt(playerId, 10),
                            full_name: fullName
                        });
                    }
                }
            });
            
            return { players };
        }, containerSelector);

        if (result.error) {
            console.log(result.error);
            return [];
        }

        console.log(`Found ${result.players.length} players for ${team.team_name}.`);
        return result.players;

    } catch (err) {
        console.error(`❌ Error scraping roster for ${team.team_name}:`, err.message);
        return [];
    } finally {
        if (page && !page.isClosed()) {
            await page.close();
        }
    }
};

const main = async () => {
    if (!TEST_MODE) {
        await setupDatabase();
    }
    
    const browser = await puppeteer.launch({ 
        executablePath: '/Applications/Google Chrome.app/Contents/MacOS/Google Chrome' 
    });
    
    const client = await pool.connect();
    
    try {
        const teamsQuery = TEST_MODE 
            ? 'SELECT team_id, url_slug, team_name, team_abbreviation FROM teams LIMIT 1'
            : 'SELECT team_id, url_slug, team_name, team_abbreviation FROM teams';
            
        const teamsResult = await client.query(teamsQuery);
        const teamsToProcess = teamsResult.rows;
        
        // Reset all players' team_abbreviation to NULL before processing
        // This handles players who are no longer in the league
        await client.query('UPDATE players SET team_abbreviation = NULL');
        console.log('✅ Reset all players\' team_abbreviation to NULL.');
        
        if (teamsToProcess.length === 0) {
            console.error('❌ No teams found in the "teams" table. Please run your team seeding script first.');
            return;
        }

        console.log(`Processing ${teamsToProcess.length} team${teamsToProcess.length > 1 ? 's' : ''}...`);

        for (const team of teamsToProcess) {
            const players = await scrapeTeamRoster(browser, team);
            
            const playersWithHeadshots = players.map(player => ({
                ...player,
                headshot_url: `https://cdn.nba.com/headshots/nba/latest/1040x760/${player.player_id}.png`,
                team_abbreviation: team.team_abbreviation
            }));

            if (TEST_MODE) {
                console.log(`\n--- TEST RESULTS for ${team.team_name} ---`);
                if (playersWithHeadshots.length > 0) {
                    console.table(playersWithHeadshots);
                } else {
                    console.log("No players found for this team.");
                }
                console.log("--- END OF TEST ---");
            } else {
                if (playersWithHeadshots.length > 0) {
                    console.log(`Saving ${playersWithHeadshots.length} players for ${team.team_name}...`);
                    
                    for (const player of playersWithHeadshots) {
                        const query = `
                            INSERT INTO players (player_id, full_name, headshot_url, team_abbreviation)
                            VALUES ($1, $2, $3, $4)
                            ON CONFLICT (player_id) 
                            DO UPDATE SET 
                                full_name = EXCLUDED.full_name,
                                headshot_url = EXCLUDED.headshot_url,
                                team_abbreviation = EXCLUDED.team_abbreviation;
                        `;
                        await client.query(query, [player.player_id, player.full_name, player.headshot_url, team.team_abbreviation]);
                    }
                    console.log(`✅ ${team.team_name} completed.`);
                }
                
                await sleep(randomDelay(1500, 4000));
            }
        }
        
    } catch (err) {
        console.error('❌ An error occurred during the main process:', err);
    } finally {
        if (client) client.release();
        await pool.end();
        await browser.close();
        console.log('\n🚀 Roster scraping completed.');
    }
};

main();