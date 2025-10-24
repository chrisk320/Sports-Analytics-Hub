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
        await page.goto(rosterUrl, { waitUntil: 'domcontentloaded', timeout: 60000 });
        
        try {
            await page.waitForSelector('#onetrust-accept-btn-handler', { timeout: 5000 });
            await page.click('#onetrust-accept-btn-handler');
        } catch (e) {
        }
        
        const containerSelector = 'div[class*="TeamRoster_tableContainer"]'; 
        await page.waitForSelector(containerSelector, { timeout: 30000 });

        await page.evaluate((selector) => {
            document.querySelector(selector)?.scrollIntoView({ block: 'center' });
        }, containerSelector);

        const dataSelector = 'td.primary.text a[href*="/player/"]';
        await page.waitForSelector(dataSelector, { timeout: 15000 });
        
        const result = await page.evaluate((selector) => {
            const players = [];
            const tableContainer = document.querySelector(selector);
            
            if (!tableContainer) {
                return { error: 'Table container not found' };
            }

            const rows = tableContainer.querySelectorAll('tbody tr');
            if (rows.length === 0) {
                return { error: 'No player rows found' };
            }
            
            rows.forEach((row) => {
                const primaryCell = row.querySelector('td.primary.text');
                const playerLink = primaryCell ? primaryCell.querySelector('a[href*="/player/"]') : null;
                
                if (playerLink) {
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
            ? 'SELECT team_id, url_slug, team_name FROM teams LIMIT 1'
            : 'SELECT team_id, url_slug, team_name FROM teams';
            
        const teamsResult = await client.query(teamsQuery);
        const teamsToProcess = teamsResult.rows;
        
        if (teamsToProcess.length === 0) {
            console.error('❌ No teams found in the "teams" table. Please run your team seeding script first.');
            return;
        }

        console.log(`Processing ${teamsToProcess.length} team${teamsToProcess.length > 1 ? 's' : ''}...`);

        for (const team of teamsToProcess) {
            const players = await scrapeTeamRoster(browser, team);
            
            const playersWithHeadshots = players.map(player => ({
                ...player,
                headshot_url: `https://cdn.nba.com/headshots/nba/latest/1040x760/${player.player_id}.png`
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
                            INSERT INTO players (player_id, full_name, headshot_url)
                            VALUES ($1, $2, $3)
                            ON CONFLICT (player_id) 
                            DO UPDATE SET 
                                full_name = EXCLUDED.full_name,
                                headshot_url = EXCLUDED.headshot_url;
                        `;
                        await client.query(query, [player.player_id, player.full_name, player.headshot_url]);
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