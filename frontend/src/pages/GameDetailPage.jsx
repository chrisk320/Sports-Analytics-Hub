import React from 'react';
import { useParams, Link } from 'react-router-dom';

// Placeholder — two-team split layout is built in Step 3 (replaces GameModal).
export default function GameDetailPage() {
  const { gameId } = useParams();
  return (
    <div className="max-w-3xl mx-auto text-center py-20 text-slate-400">
      <h2 className="text-2xl font-bold text-slate-50 mb-2">Game Detail</h2>
      <p>Full game page for {gameId} arrives in Step 3.</p>
      <Link to="/games" className="text-purple-400 hover:text-purple-300 mt-4 inline-block">
        ← Back to games
      </Link>
    </div>
  );
}
