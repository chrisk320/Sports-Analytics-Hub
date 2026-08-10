// Small statistical helpers shared across scripts.
//
// getMovingAverage was rescued from the (now-deleted) server/script_functions/
// directory, which held retired Puppeteer scrapers superseded by the Python
// pipeline in server/python_scripts/. This was the only function in there still
// imported by live code (server/backtest.js).

// Trailing average of `stat` over the `windowSize` games BEFORE gameIndex.
// Returns null when there isn't a full window of history yet, so callers don't
// silently compare against a short, noisier sample.
export function getMovingAverage(gameLogs, stat, gameIndex, windowSize) {
    if (gameIndex < windowSize) {
        return null;
    }

    const startIndex = gameIndex - windowSize;
    const relevantGames = gameLogs.slice(startIndex, gameIndex);

    const sum = relevantGames.reduce((acc, game) => acc + game[stat], 0);
    const average = sum / windowSize;

    return parseFloat(average.toFixed(1));
}
