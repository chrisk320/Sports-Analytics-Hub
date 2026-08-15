import React from 'react';
import { Link } from 'react-router-dom';
import { Snowflake } from 'lucide-react';
import { useSport } from '@/context/SportContext';
import { Panel } from './ui/panel';

// Shown on live-data pages (Home/Compare/Games/NFL) when the given sport has no
// games on the board, redirecting users to the offseason-friendly sections.
// `sport` here is the DISPLAY label (e.g. 'NBA'); links use the active
// sport id from context so they stay within the current section.
export default function OffseasonBanner({ sport = 'NBA' }) {
  const { sport: sportId } = useSport();
  return (
    <Panel tone="primary" className="flex flex-col gap-3 sm:flex-row sm:items-center sm:justify-between">
      <div className="flex items-start gap-3">
        <Snowflake className="mt-0.5 h-6 w-6 shrink-0 text-purple-400" />
        <div>
          <p className="font-semibold text-slate-100">{sport} offseason — no games on the board.</p>
          <p className="text-sm text-slate-400">Dig into historical leaders or shop next-season futures.</p>
        </div>
      </div>
      <div className="flex shrink-0 gap-3">
        <Link
          to={`/${sportId}/explore`}
          className="rounded-lg bg-purple-500 px-4 py-2 text-sm font-semibold text-primary-foreground transition hover:bg-purple-400"
        >
          Explore stats
        </Link>
        <Link
          to={`/${sportId}/futures`}
          className="rounded-lg border border-slate-700 px-4 py-2 text-sm font-semibold text-slate-200 transition hover:bg-slate-800"
        >
          View futures
        </Link>
      </div>
    </Panel>
  );
}
