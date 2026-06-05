import React from 'react';
import WatchlistCard from './WatchlistCard';

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
  if (!players || players.length === 0) {
    return (
      <div className="rounded-xl border-2 border-dashed border-slate-700 py-12 px-4 text-center text-slate-500">
        <p className="text-lg text-slate-300">Your watchlist is empty.</p>
        <p>Search above to add players and track tonight's lines.</p>
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
