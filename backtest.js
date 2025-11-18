import fetch from 'node-fetch'; // To make API requests
import { getMovingAverage } from './script_functions/prediction_logic.js';

// --- Configuration ---
const PLAYER_ID_TO_TEST = 201939; // Stephen Curry
const SEASON_TO_TEST = '2023-24';
const MOVING_AVERAGE_WINDOW = 15; // The 'N' in "last N games"
const HYPOTHETICAL_BETTING_LINE_PTS = 25.5; // Example betting line

/**
 * The main function to run the backtest.
 */
const runBacktest = async () => {
    console.log(`--- Starting backtest for player ${PLAYER_ID_TO_TEST} for the ${SEASON_TO_TEST} season ---`);
    console.log(`Simulating bets against a points line of: O/U ${HYPOTHETICAL_BETTING_LINE_PTS}`);

    // Step 1: Fetch all game logs for the player from our API
    let allGameLogs;
    try {
        const response = await fetch(`http://localhost:5000/nba/gamelogs/${PLAYER_ID_TO_TEST}`);
        if (!response.ok) {
            throw new Error(`API request failed with status: ${response.status}`);
        }
        allGameLogs = await response.json();
    } catch (error) {
        console.error('❌ Failed to fetch game logs from the API. Is the server running?');
        console.error(error);
        return;
    }

    if (!allGameLogs || allGameLogs.length === 0) {
        console.log('No game logs found for this player. Exiting backtest.');
        return;
    }

    // Filter game logs for the specific season we want to test
    const seasonGameLogs = allGameLogs.filter(log => log.season === SEASON_TO_TEST);
    console.log(`Found ${seasonGameLogs.length} games for the ${SEASON_TO_TEST} season.`);

    const results = [];
    let wins = 0;
    let losses = 0;

    // Step 2: Loop through each game of the season to make predictions
    for (let i = 0; i < seasonGameLogs.length; i++) {
        const ptsPrediction = getMovingAverage(seasonGameLogs, 'pts', i, MOVING_AVERAGE_WINDOW);

        if (ptsPrediction !== null) {
            const actualGame = seasonGameLogs[i];
            const actualPts = actualGame.pts;
            
            let bet;
            let outcome;

            // Make our "bet" based on the prediction
            if (ptsPrediction > HYPOTHETICAL_BETTING_LINE_PTS) {
                bet = 'OVER';
            } else {
                bet = 'UNDER';
            }

            // Determine the actual outcome
            if (actualPts > HYPOTHETICAL_BETTING_LINE_PTS) {
                outcome = 'OVER';
            } else {
                outcome = 'UNDER';
            }

            // Check if our bet was correct
            if (bet === outcome) {
                wins++;
            } else {
                losses++;
            }

            results.push({
                "Game Date": new Date(actualGame.game_date).toLocaleDateString(),
                "Prediction": ptsPrediction,
                "Bet": bet,
                "Actual PTS": actualPts,
                "Line": HYPOTHETICAL_BETTING_LINE_PTS,
                "Result": (bet === outcome ? "WIN" : "LOSS"),
            });
        }
    }

    // Step 3: Calculate and display the final results
    const totalBets = wins + losses;
    if (totalBets > 0) {
        const winPercentage = (wins / totalBets) * 100;

        console.log(`\n--- Betting Simulation Results ---`);
        console.log(`Total Games Analyzed: ${totalBets}`);
        console.log(`Model's Record: ${wins} Wins - ${losses} Losses`);
        console.log(`Win Percentage: ${winPercentage.toFixed(2)}%`);
        
        // In sports betting, a win rate above 52.4% is generally considered profitable.
        if (winPercentage > 52.4) {
            console.log("✅ This model appears to have a profitable edge against this line.");
        } else {
            console.log("❌ This model does not appear to have a profitable edge against this line.");
        }

        console.log('\n--- Sample Bet Results ---');
        console.table(results.slice(0, 10)); // Show a larger sample

    } else {
        console.log("Could not generate any predictions. Not enough game data for the specified window size.");
    }
};

// Run the main backtesting function
runBacktest();