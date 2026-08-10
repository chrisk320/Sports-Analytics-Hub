import React from 'react';
import { User, X } from 'lucide-react';
import { Card } from '@/components/ui/card';
import { Button } from '@/components/ui/button';
import { Avatar } from '@/components/ui/avatar';

const PlayerCard = ({ player, onSelect, onRemove }) => {
  const addDefaultSrc = (ev) => {
    ev.target.src = 'https://cdn.nba.com/headshots/nba/latest/1040x760/fallback.png';
  };

  return (
    <Card className="shadow-xl p-6 flex flex-col items-center text-center relative group w-64 transform hover:scale-105 transition-transform duration-300">
      <Button
        onClick={(e) => { e.stopPropagation(); onRemove(player.player_id); }}
        variant="destructive"
        size="icon"
        className="absolute top-2 right-2 size-7 rounded-full bg-destructive text-white hover:bg-destructive/90 opacity-0 group-hover:opacity-100 transition-opacity"
        aria-label="Remove Player"
      >
        <X className="w-4 h-4" />
      </Button>
      <div
        className="cursor-pointer w-full h-full flex flex-col items-center"
        onClick={() => onSelect(player)}
      >
        <Avatar className="w-24 h-24 border-4 border-cyan-400 mb-4">
          {player.headshot_url ? (
            <img
              src={player.headshot_url}
              alt={player.full_name}
              className="w-full h-full object-cover"
              onError={addDefaultSrc}
            />
          ) : (
            <div className="w-full h-full flex items-center justify-center bg-secondary">
              <User className="w-12 h-12 text-muted-foreground" />
            </div>
          )}
        </Avatar>
        <div className="h-14 flex items-center justify-center">
          <h3 className="text-xl font-bold text-foreground leading-tight">{player.full_name}</h3>
        </div>
      </div>
    </Card>
  )
};

export default PlayerCard;