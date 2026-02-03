import React, { useState } from 'react';
import { X } from 'lucide-react';

const PROP_MARKETS = {
    player_points: 'Points',
    player_rebounds: 'Rebounds',
    player_assists: 'Assists',
    player_points_rebounds: 'PTS+REB',
    player_points_assists: 'PTS+AST',
    player_rebounds_assists: 'REB+AST',
};

const GameModal = ({ game, gameLines, isLoading, onClose }) => {
    const [selectedMarket, setSelectedMarket] = useState('player_points');

    if (!game) return null;

    const formatOdds = (price) => {
        if (price > 0) return `+${price}`;
        return price.toString();
    };

    const formatSpread = (spread) => {
        if (spread > 0) return `+${spread}`;
        return spread.toString();
    };

    // Group player prop outcomes by player name
    const groupOutcomesByPlayer = (outcomes) => {
        const grouped = {};
        outcomes?.forEach((outcome) => {
            const playerName = outcome.description; // Player name is in 'description'
            if (!grouped[playerName]) {
                grouped[playerName] = { over: null, under: null };
            }
            if (outcome.name === 'Over') { // Over/Under is in 'name'
                grouped[playerName].over = outcome;
            } else if (outcome.name === 'Under') {
                grouped[playerName].under = outcome;
            }
        });
        return grouped;
    };

    // Get props for selected market from a bookmaker
    const getMarketProps = (bookmaker, marketKey) => {
        const market = bookmaker.markets?.find(m => m.key === marketKey);
        return market ? groupOutcomesByPlayer(market.outcomes) : {};
    };

    return (
        <div className="fixed inset-0 bg-black bg-opacity-75 flex items-center justify-center p-4 z-50">
            <div className="bg-gray-800 rounded-lg max-w-6xl w-full max-h-[90vh] overflow-y-auto">
                {/* Header */}
                <div className="flex justify-between items-center p-6 border-b border-gray-700">
                    <div>
                        <h2 className="text-2xl font-bold text-white">
                            {game.away_team} @ {game.home_team}
                        </h2>
                        <p className="text-gray-400 mt-1">
                            {new Date(game.commence_time).toLocaleString()}
                        </p>
                    </div>
                    <button
                        onClick={onClose}
                        className="p-2 rounded-full bg-gray-700 hover:bg-gray-600 transition-colors"
                    >
                        <X className="w-6 h-6" />
                    </button>
                </div>

                <div className="p-6">
                    {isLoading ? (
                        <div className="flex justify-center items-center py-8">
                            <div className="animate-spin rounded-full h-8 w-8 border-b-2 border-blue-500"></div>
                            <span className="ml-3 text-gray-400">Loading betting lines...</span>
                        </div>
                    ) : (
                        <div className="space-y-6">
                            {/* Team Lines */}
                            {gameLines?.teamLines?.bookmakers && (
                                <div>
                                    <h3 className="text-xl font-semibold text-white mb-4">Team Lines</h3>
                                    <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-4">
                                        {gameLines.teamLines.bookmakers.map((bookmaker) => (
                                            <div key={bookmaker.key} className="bg-gray-700 rounded-lg p-4">
                                                <h4 className="text-lg font-semibold text-white mb-3 text-center">
                                                    {bookmaker.title}
                                                </h4>

                                                {bookmaker.markets.find(m => m.key === 'h2h') && (
                                                    <div className="mb-4">
                                                        <h5 className="text-sm font-bold text-blue-400 uppercase tracking-wide mb-2 border-b border-gray-600 pb-1">Moneyline</h5>
                                                        <div className="space-y-1">
                                                            {bookmaker.markets.find(m => m.key === 'h2h').outcomes.map((outcome, index) => (
                                                                <div key={index} className="flex justify-between text-sm">
                                                                    <span className="text-gray-300">{outcome.name}</span>
                                                                    <span className="text-white font-medium">
                                                                        {formatOdds(outcome.price)}
                                                                    </span>
                                                                </div>
                                                            ))}
                                                        </div>
                                                    </div>
                                                )}

                                                {bookmaker.markets.find(m => m.key === 'spreads') && (
                                                    <div className="mb-4">
                                                        <h5 className="text-sm font-bold text-blue-400 uppercase tracking-wide mb-2 border-b border-gray-600 pb-1">Spread</h5>
                                                        <div className="space-y-1">
                                                            {bookmaker.markets.find(m => m.key === 'spreads').outcomes.map((outcome, index) => (
                                                                <div key={index} className="flex justify-between text-sm">
                                                                    <span className="text-gray-300">
                                                                        {outcome.name} {formatSpread(outcome.point)}
                                                                    </span>
                                                                    <span className="text-white font-medium">
                                                                        {formatOdds(outcome.price)}
                                                                    </span>
                                                                </div>
                                                            ))}
                                                        </div>
                                                    </div>
                                                )}

                                                {bookmaker.markets.find(m => m.key === 'totals') && (
                                                    <div>
                                                        <h5 className="text-sm font-bold text-blue-400 uppercase tracking-wide mb-2 border-b border-gray-600 pb-1">Total</h5>
                                                        <div className="space-y-1">
                                                            {bookmaker.markets.find(m => m.key === 'totals').outcomes.map((outcome, index) => (
                                                                <div key={index} className="flex justify-between text-sm">
                                                                    <span className="text-gray-300">
                                                                        {outcome.name} {outcome.point}
                                                                    </span>
                                                                    <span className="text-white font-medium">
                                                                        {formatOdds(outcome.price)}
                                                                    </span>
                                                                </div>
                                                            ))}
                                                        </div>
                                                    </div>
                                                )}
                                            </div>
                                        ))}
                                    </div>
                                </div>
                            )}

                            {!isLoading && (!gameLines?.teamLines?.bookmakers || gameLines.teamLines.bookmakers.length === 0) && (
                                <div className="text-center py-8">
                                    <p className="text-gray-400">No betting lines available for this game.</p>
                                </div>
                            )}

                            {/* Player Props */}
                            {gameLines?.playerProps?.bookmakers && gameLines.playerProps.bookmakers.length > 0 && (
                                <div className="mt-8">
                                    <h3 className="text-xl font-semibold text-white mb-4">Player Props</h3>

                                    {/* Market Selector Tabs */}
                                    <div className="flex flex-wrap gap-2 mb-4">
                                        {Object.entries(PROP_MARKETS).map(([key, label]) => (
                                            <button
                                                key={key}
                                                onClick={() => setSelectedMarket(key)}
                                                className={`px-3 py-1.5 rounded-md text-sm font-medium transition-colors ${
                                                    selectedMarket === key
                                                        ? 'bg-blue-600 text-white'
                                                        : 'bg-gray-700 text-gray-300 hover:bg-gray-600'
                                                }`}
                                            >
                                                {label}
                                            </button>
                                        ))}
                                    </div>

                                    {/* Props by Bookmaker */}
                                    <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-4">
                                        {gameLines.playerProps.bookmakers.map((bookmaker) => {
                                            const playerProps = getMarketProps(bookmaker, selectedMarket);
                                            const playerNames = Object.keys(playerProps);

                                            if (playerNames.length === 0) return null;

                                            return (
                                                <div key={bookmaker.key} className="bg-gray-700 rounded-lg p-4">
                                                    <h4 className="text-lg font-semibold text-white mb-3 text-center">
                                                        {bookmaker.title}
                                                    </h4>
                                                    <h5 className="text-sm font-bold text-blue-400 uppercase tracking-wide mb-2 border-b border-gray-600 pb-1">
                                                        {PROP_MARKETS[selectedMarket]}
                                                    </h5>
                                                    <div className="space-y-2 max-h-64 overflow-y-auto">
                                                        {playerNames.map((playerName) => {
                                                            const props = playerProps[playerName];
                                                            return (
                                                                <div key={playerName} className="text-sm">
                                                                    <div className="text-gray-300 font-medium mb-1">{playerName}</div>
                                                                    <div className="flex justify-between gap-4 text-xs">
                                                                        {props.over && (
                                                                            <div className="flex-1 flex justify-between bg-gray-600 rounded px-2 py-1">
                                                                                <span className="text-green-400">O {props.over.point}</span>
                                                                                <span className="text-white">{formatOdds(props.over.price)}</span>
                                                                            </div>
                                                                        )}
                                                                        {props.under && (
                                                                            <div className="flex-1 flex justify-between bg-gray-600 rounded px-2 py-1">
                                                                                <span className="text-red-400">U {props.under.point}</span>
                                                                                <span className="text-white">{formatOdds(props.under.price)}</span>
                                                                            </div>
                                                                        )}
                                                                    </div>
                                                                </div>
                                                            );
                                                        })}
                                                    </div>
                                                </div>
                                            );
                                        })}
                                    </div>

                                    {/* No props message */}
                                    {gameLines.playerProps.bookmakers.every(b => {
                                        const props = getMarketProps(b, selectedMarket);
                                        return Object.keys(props).length === 0;
                                    }) && (
                                        <div className="text-center py-4">
                                            <p className="text-gray-400">No {PROP_MARKETS[selectedMarket]} props available.</p>
                                        </div>
                                    )}
                                </div>
                            )}
                        </div>
                    )}
                </div>
            </div>
        </div>
    );
};

export default GameModal;
