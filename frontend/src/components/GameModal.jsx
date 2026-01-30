import React from 'react';
import { X } from 'lucide-react';

const GameModal = ({ game, gameLines, isLoading, onClose }) => {
    if (!game) return null;

    const formatOdds = (price) => {
        if (price > 0) return `+${price}`;
        return price.toString();
    };

    const formatSpread = (spread) => {
        if (spread > 0) return `+${spread}`;
        return spread.toString();
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
                                                        <h5 className="text-sm font-medium text-gray-300 mb-2">Moneyline</h5>
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
                                                        <h5 className="text-sm font-medium text-gray-300 mb-2">Spread</h5>
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
                                                        <h5 className="text-sm font-medium text-gray-300 mb-2">Total</h5>
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
                        </div>
                    )}
                </div>
            </div>
        </div>
    );
};

export default GameModal;
