import React from 'react';
import { useOutletContext } from 'react-router-dom';
import TeamCard from '../components/TeamCard';
import OffseasonBanner from '../components/OffseasonBanner';

export default function NFLPage() {
  const { nflGames, handleSelectNFLGame, seasonStatus } = useOutletContext();

  return (
    <div className="space-y-8 max-w-7xl mx-auto">
      <h2 className="text-3xl font-bold text-center">NFL Games</h2>
      {!seasonStatus?.nflInSeason && <OffseasonBanner sport="NFL" />}
      {nflGames.length > 0 ? (
        <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-6">
          {nflGames.map((game) => (
            <TeamCard key={game.id} game={game} onSelect={handleSelectNFLGame} />
          ))}
        </div>
      ) : (
        <div className="text-center text-slate-500 py-16 px-4 border-2 border-dashed border-slate-700 rounded-lg max-w-lg mx-auto">
          <p className="text-lg">No NFL games available.</p>
          <p>Games will appear here when available.</p>
        </div>
      )}
    </div>
  );
}
