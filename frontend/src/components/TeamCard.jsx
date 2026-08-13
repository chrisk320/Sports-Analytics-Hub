import React from 'react';
import { Card, CardContent } from '@/components/ui/card';

const TeamCard = ({game, onSelect, hasProps}) => {
    return (
        <Card
            className="cursor-pointer w-full h-full hover:bg-accent transition-colors"
            onClick={() => onSelect && onSelect(game)}
        >
            <CardContent className="flex flex-col items-center">
                <div className="h-14 flex items-center justify-center">
                    <h3 className="text-xl font-bold text-foreground leading-tight">{game.home_team} vs {game.away_team}</h3>
                </div>
                <div className="text-sm text-muted-foreground mt-2">
                    {new Date(game.commence_time).toLocaleDateString()}
                </div>
                {/* Prop coverage is a sampled subset of each slate, so most games
                    have none. Marking it here means a click that lands on a
                    props-free page is an informed one. `hasProps` is undefined
                    where the caller has not looked it up, which renders nothing. */}
                {hasProps === true && (
                    <span className="mt-2 rounded-full bg-emerald-500/10 px-2 py-0.5 font-mono text-[10px] uppercase tracking-wide text-emerald-400">
                        player props
                    </span>
                )}
                {hasProps === false && (
                    <span className="mt-2 font-mono text-[10px] uppercase tracking-wide text-slate-600">
                        no props yet
                    </span>
                )}
            </CardContent>
        </Card>
    );
}

export default TeamCard;