import React from 'react';
import { Link, useOutletContext } from 'react-router-dom';
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
        <div className="text-center text-slate-500 py-16 px-4 border-2 border-dashed border-slate-700 rounded-xl max-w-lg mx-auto">
          <p className="text-lg text-slate-300">No NFL games on the board right now.</p>
          <p className="mt-1">Check back on a game day, or explore player leaderboards and futures while you wait.</p>
          <div className="mt-4 flex justify-center gap-3">
            <Link
              to="/explore"
              className="rounded-lg bg-purple-500 px-4 py-2 text-sm font-semibold text-white transition hover:bg-purple-400"
            >
              Explore stats
            </Link>
            <Link
              to="/futures"
              className="rounded-lg border border-slate-700 px-4 py-2 text-sm font-semibold text-slate-200 transition hover:bg-slate-800"
            >
              View futures
            </Link>
          </div>
        </div>
      )}
    </div>
  );
}
