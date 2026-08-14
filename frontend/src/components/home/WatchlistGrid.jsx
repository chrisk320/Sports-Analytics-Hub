import React from 'react';
import WatchlistCard from './WatchlistCard';
import { useSport } from '@/context/SportContext';

export default function WatchlistGrid({
  players,
  marketId,
  propsByPlayerId,
  logsByPlayerId,
  pinnedPlayerId,
  activePlayerId,
  onHover,
  onLeave,
  onPin,
  onAddToSlip,
  onRemove,
}) {
  const { label } = useSport();
  if (!players || players.length === 0) {
    return (
      // Names the sport on purpose. Watchlists are per-sport, so arriving on
      // /nfl right after /nba showed five players makes a generic "empty" read
      // like a loading failure rather than the correct answer.
      <div className="rounded-xl border-2 border-dashed border-slate-700 py-12 px-4 text-center text-slate-500">
        <p className="text-lg text-slate-300">No {label} players saved yet.</p>
        <p>Search for a player above to track their prop lines, hit rate, and best current price across books.</p>
        <p className="mt-1 text-xs text-slate-600">
          Watchlists are per sport — your other leagues keep their own.
        </p>
      </div>
    );
  }

  return (
    <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
      {players.map((player) => (
        <WatchlistCard
          key={player.player_id}
          player={player}
          marketId={marketId}
          props={propsByPlayerId.get(player.player_id) || []}
          logs={logsByPlayerId[player.player_id] || []}
          isPinned={pinnedPlayerId === player.player_id}
          isActive={activePlayerId === player.player_id}
          onHover={onHover}
          onLeave={onLeave}
          onPin={onPin}
          onAddToSlip={onAddToSlip}
          onRemove={onRemove}
        />
      ))}
    </div>
  );
}
