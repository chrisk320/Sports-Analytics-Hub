import React from 'react';
import { useOutletContext, useNavigate } from 'react-router-dom';
import TeamCard from '../components/TeamCard';
import OffseasonBanner from '../components/OffseasonBanner';

export default function GamesPage() {
  const { nbaGames, seasonStatus } = useOutletContext();
  const navigate = useNavigate();

  return (
    <div className="space-y-8 max-w-7xl mx-auto">
      <h2 className="text-3xl font-bold text-center">NBA Games</h2>
      {!seasonStatus?.nbaInSeason && <OffseasonBanner sport="NBA" />}
      {nbaGames.length > 0 ? (
        <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-6">
          {nbaGames.map((game) => (
            <TeamCard key={game.id} game={game} onSelect={(g) => navigate(`/games/${g.id}`)} />
          ))}
        </div>
      ) : (
        <div className="text-center text-slate-500 py-16 px-4 border-2 border-dashed border-slate-700 rounded-lg max-w-lg mx-auto">
          <p className="text-lg">No NBA games available.</p>
          <p>Games will appear here when available.</p>
        </div>
      )}
    </div>
  );
}
