import React from 'react';
import { MARKETS, MARKET_ORDER } from '../../lib/odds';

// Segmented control for the active prop market. Defaults to all backed markets
// (PTS/REB/AST + the three combos — 3PM isn't fetched by the backend).
export default function MarketToggle({ value, onChange, options = MARKET_ORDER }) {
  return (
    <div className="inline-flex rounded-lg border border-slate-700 bg-slate-900 p-1">
      {options.map((id) => {
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
            {MARKETS[id]?.label || id}
          </button>
        );
      })}
    </div>
  );
}
