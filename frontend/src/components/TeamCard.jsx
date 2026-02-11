import React from 'react';

const TeamCard = ({game, onSelect}) => {
    return (
        <div
            className="cursor-pointer w-full h-full flex flex-col items-center bg-slate-900 border border-slate-800 rounded-lg p-4 hover:bg-slate-800 transition-colors"
            onClick={() => onSelect && onSelect(game)}
        >
            <div className="h-14 flex items-center justify-center">
                <h3 className="text-xl font-bold text-slate-50 leading-tight">{game.home_team} vs {game.away_team}</h3>
            </div>
            <div className="text-sm text-slate-400 mt-2">
                {new Date(game.commence_time).toLocaleDateString()}
            </div>
        </div>
    );
}

export default TeamCard;