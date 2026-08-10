import React, { useState } from 'react';
import {
    Dialog,
    DialogContent,
    DialogHeader,
    DialogTitle,
    DialogDescription,
} from '@/components/ui/dialog';
import { Tabs, TabsList, TabsTrigger } from '@/components/ui/tabs';
import { Card, CardHeader, CardTitle, CardContent } from '@/components/ui/card';

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
        <Dialog open={!!game} onOpenChange={(open) => !open && onClose()}>
            <DialogContent className="sm:max-w-6xl max-h-[90vh] overflow-y-auto">
                <DialogHeader>
                    <DialogTitle className="text-2xl font-bold">
                        {game.away_team} @ {game.home_team}
                    </DialogTitle>
                    <DialogDescription>
                        {new Date(game.commence_time).toLocaleString()}
                    </DialogDescription>
                </DialogHeader>

                <div>
                    {isLoading ? (
                        <div className="flex justify-center items-center py-8">
                            <div className="animate-spin rounded-full h-8 w-8 border-b-2 border-primary"></div>
                            <span className="ml-3 text-muted-foreground">Loading betting lines...</span>
                        </div>
                    ) : (
                        <div className="space-y-6">
                            {/* Team Lines */}
                            {gameLines?.teamLines?.bookmakers && (
                                <div>
                                    <h3 className="text-xl font-semibold text-foreground mb-4">Team Lines</h3>
                                    <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-4">
                                        {gameLines.teamLines.bookmakers.map((bookmaker) => (
                                            <Card key={bookmaker.key} className="rounded-lg">
                                                <CardHeader>
                                                    <CardTitle className="text-lg font-semibold text-center">
                                                        {bookmaker.title}
                                                    </CardTitle>
                                                </CardHeader>
                                                <CardContent>
                                                    {bookmaker.markets.find(m => m.key === 'h2h') && (
                                                        <div className="mb-4">
                                                            <h5 className="text-sm font-bold text-primary uppercase tracking-wide mb-2 border-b border-border pb-1">Moneyline</h5>
                                                            <div className="space-y-1">
                                                                {bookmaker.markets.find(m => m.key === 'h2h').outcomes.map((outcome, index) => (
                                                                    <div key={index} className="flex justify-between text-sm">
                                                                        <span className="text-secondary-foreground">{outcome.name}</span>
                                                                        <span className="text-foreground font-medium">
                                                                            {formatOdds(outcome.price)}
                                                                        </span>
                                                                    </div>
                                                                ))}
                                                            </div>
                                                        </div>
                                                    )}

                                                    {bookmaker.markets.find(m => m.key === 'spreads') && (
                                                        <div className="mb-4">
                                                            <h5 className="text-sm font-bold text-primary uppercase tracking-wide mb-2 border-b border-border pb-1">Spread</h5>
                                                            <div className="space-y-1">
                                                                {bookmaker.markets.find(m => m.key === 'spreads').outcomes.map((outcome, index) => (
                                                                    <div key={index} className="flex justify-between text-sm">
                                                                        <span className="text-secondary-foreground">
                                                                            {outcome.name} {formatSpread(outcome.point)}
                                                                        </span>
                                                                        <span className="text-foreground font-medium">
                                                                            {formatOdds(outcome.price)}
                                                                        </span>
                                                                    </div>
                                                                ))}
                                                            </div>
                                                        </div>
                                                    )}

                                                    {bookmaker.markets.find(m => m.key === 'totals') && (
                                                        <div>
                                                            <h5 className="text-sm font-bold text-primary uppercase tracking-wide mb-2 border-b border-border pb-1">Total</h5>
                                                            <div className="space-y-1">
                                                                {bookmaker.markets.find(m => m.key === 'totals').outcomes.map((outcome, index) => (
                                                                    <div key={index} className="flex justify-between text-sm">
                                                                        <span className="text-secondary-foreground">
                                                                            {outcome.name} {outcome.point}
                                                                        </span>
                                                                        <span className="text-foreground font-medium">
                                                                            {formatOdds(outcome.price)}
                                                                        </span>
                                                                    </div>
                                                                ))}
                                                            </div>
                                                        </div>
                                                    )}
                                                </CardContent>
                                            </Card>
                                        ))}
                                    </div>
                                </div>
                            )}

                            {!isLoading && (!gameLines?.teamLines?.bookmakers || gameLines.teamLines.bookmakers.length === 0) && (
                                <div className="text-center py-8">
                                    <p className="text-muted-foreground">No betting lines available for this game.</p>
                                </div>
                            )}

                            {/* Player Props */}
                            {gameLines?.playerProps?.bookmakers && gameLines.playerProps.bookmakers.length > 0 && (
                                <div className="mt-8">
                                    <h3 className="text-xl font-semibold text-foreground mb-4">Player Props</h3>

                                    {/* Market Selector Tabs */}
                                    <Tabs value={selectedMarket} onValueChange={setSelectedMarket} className="mb-4">
                                        <TabsList className="flex-wrap h-auto">
                                            {Object.entries(PROP_MARKETS).map(([key, label]) => (
                                                <TabsTrigger key={key} value={key}>
                                                    {label}
                                                </TabsTrigger>
                                            ))}
                                        </TabsList>
                                    </Tabs>

                                    {/* Props by Bookmaker */}
                                    <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-4">
                                        {gameLines.playerProps.bookmakers.map((bookmaker) => {
                                            const playerProps = getMarketProps(bookmaker, selectedMarket);
                                            const playerNames = Object.keys(playerProps);

                                            if (playerNames.length === 0) return null;

                                            return (
                                                <Card key={bookmaker.key} className="rounded-lg">
                                                    <CardHeader>
                                                        <CardTitle className="text-lg font-semibold text-center">
                                                            {bookmaker.title}
                                                        </CardTitle>
                                                    </CardHeader>
                                                    <CardContent>
                                                        <h5 className="text-sm font-bold text-primary uppercase tracking-wide mb-2 border-b border-border pb-1">
                                                            {PROP_MARKETS[selectedMarket]}
                                                        </h5>
                                                        <div className="space-y-2 max-h-64 overflow-y-auto">
                                                            {playerNames.map((playerName) => {
                                                                const props = playerProps[playerName];
                                                                return (
                                                                    <div key={playerName} className="text-sm">
                                                                        <div className="text-secondary-foreground font-medium mb-1">{playerName}</div>
                                                                        <div className="flex justify-between gap-4 text-xs">
                                                                            {props.over && (
                                                                                <div className="flex-1 flex justify-between bg-muted rounded px-2 py-1">
                                                                                    <span className="text-success">O {props.over.point}</span>
                                                                                    <span className="text-foreground">{formatOdds(props.over.price)}</span>
                                                                                </div>
                                                                            )}
                                                                            {props.under && (
                                                                                <div className="flex-1 flex justify-between bg-muted rounded px-2 py-1">
                                                                                    <span className="text-rose-400">U {props.under.point}</span>
                                                                                    <span className="text-foreground">{formatOdds(props.under.price)}</span>
                                                                                </div>
                                                                            )}
                                                                        </div>
                                                                    </div>
                                                                );
                                                            })}
                                                        </div>
                                                    </CardContent>
                                                </Card>
                                            );
                                        })}
                                    </div>

                                    {/* No props message */}
                                    {gameLines.playerProps.bookmakers.every(b => {
                                        const props = getMarketProps(b, selectedMarket);
                                        return Object.keys(props).length === 0;
                                    }) && (
                                        <div className="text-center py-4">
                                            <p className="text-muted-foreground">No {PROP_MARKETS[selectedMarket]} props available.</p>
                                        </div>
                                    )}
                                </div>
                            )}
                        </div>
                    )}
                </div>
            </DialogContent>
        </Dialog>
    );
};

export default GameModal;
