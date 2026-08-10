import React from 'react';
import { Card, CardContent } from '@/components/ui/card';

const TeamCard = ({game, onSelect}) => {
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
            </CardContent>
        </Card>
    );
}

export default TeamCard;