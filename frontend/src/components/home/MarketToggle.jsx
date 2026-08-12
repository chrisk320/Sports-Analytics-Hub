import React from 'react';
import { marketLabel } from '../../lib/markets';
import { useSport } from '@/context/SportContext';

// Segmented control for the active prop market.
//
// Defaults to every market the current sport models, so this renders
// PTS/REB/AST/... for the NBA and H/TB/HR/K for the MLB with no change here.
// Callers can still pass `options` to narrow it (e.g. to a player's position).
export default function MarketToggle({ value, onChange, options }) {
  const { sport, order } = useSport();
  const ids = options ?? order;

  return (
    <div className="inline-flex rounded-lg border border-slate-700 bg-slate-900 p-1">
      {ids.map((id) => {
        const active = id === value;
        return (
          <button
            key={id}
            onClick={() => onChange(id)}
            className={`px-3 py-1.5 text-xs font-mono font-semibold uppercase tracking-wide rounded-md transition ${
              active
                ? 'bg-purple-500 text-white'
                : 'text-slate-400 hover:text-slate-50 hover:bg-slate-800'
            }`}
          >
            {marketLabel(sport, id)}
          </button>
        );
      })}
    </div>
  );
}
