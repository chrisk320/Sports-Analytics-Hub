import React from 'react';
import { useOutletContext } from 'react-router-dom';
import TeamCard from '../components/TeamCard';

export default function GamesPage() {
  // NBA games still open the existing GameModal in Step 1; Step 3 rewires this
  // to navigate to the full /games/:id detail page.
  const { nbaGames, handleSelectNBAGame } = useOutletContext();

  return (
    <div className="space-y-8 max-w-7xl mx-auto">
      <h2 className="text-3xl font-bold text-center">NBA Games</h2>
      {nbaGames.length > 0 ? (
        <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-6">
          {nbaGames.map((game) => (
            <TeamCard key={game.id} game={game} onSelect={handleSelectNBAGame} />
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
