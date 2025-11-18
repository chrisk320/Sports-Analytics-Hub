function getMovingAverage(gameLogs, stat, gameIndex, windowSize) {
    if (gameIndex < windowSize) {
        return null; 
    }

    const startIndex = gameIndex - windowSize;
    const relevantGames = gameLogs.slice(startIndex, gameIndex);

    const sum = relevantGames.reduce((acc, game) => acc + game[stat], 0);

    const average = sum / windowSize;

    return parseFloat(average.toFixed(1));
}

export { getMovingAverage };