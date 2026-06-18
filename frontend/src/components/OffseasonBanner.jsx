import React from 'react';
import { Link } from 'react-router-dom';
import { Snowflake } from 'lucide-react';

// Shown on live-data pages (Home/Compare/Games/NFL) when the given sport has no
// games on the board, redirecting users to the offseason-friendly sections.
export default function OffseasonBanner({ sport = 'NBA' }) {
  return (
    <div className="flex flex-col gap-3 rounded-2xl border border-purple-700/40 bg-gradient-to-r from-purple-900/30 to-slate-900 p-5 sm:flex-row sm:items-center sm:justify-between">
      <div className="flex items-start gap-3">
        <Snowflake className="mt-0.5 h-6 w-6 shrink-0 text-purple-400" />
        <div>
          <p className="font-semibold text-slate-100">{sport} offseason — no games on the board.</p>
          <p className="text-sm text-slate-400">Dig into historical leaders or shop next-season futures.</p>
        </div>
      </div>
      <div className="flex shrink-0 gap-3">
        <Link
          to="/explore"
          className="rounded-lg bg-purple-600 px-4 py-2 text-sm font-semibold text-white transition hover:bg-purple-500"
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
  );
}
