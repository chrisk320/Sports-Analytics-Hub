import React from 'react';
import { useParams, Link } from 'react-router-dom';

// Placeholder — full stat sheet is built in Step 2 (replaces StatsModal).
export default function PlayerDetailPage() {
  const { playerId } = useParams();
  return (
    <div className="max-w-3xl mx-auto text-center py-20 text-slate-400">
      <h2 className="text-2xl font-bold text-slate-50 mb-2">Player Detail</h2>
      <p>Full player page for #{playerId} arrives in Step 2.</p>
      <Link to="/" className="text-purple-400 hover:text-purple-300 mt-4 inline-block">
        ← Back to dashboard
      </Link>
    </div>
  );
}
