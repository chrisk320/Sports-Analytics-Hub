import React from 'react';
import { parlayOdds, americanToDecimal, formatOdds, bookLabel, MARKETS } from '../../lib/odds';

const STAKE = 10;

export default function SlipCard({ slip = [], onRemove, onClear }) {
  const parlay = parlayOdds(slip.map((p) => p.price));
  const dec = americanToDecimal(parlay);
  const payout = dec ? (STAKE * dec).toFixed(2) : null;

  return (
    <div className="rounded-xl border border-slate-800 bg-slate-900">
      <div className="flex items-center justify-between border-b border-slate-800 p-4">
        <h3 className="font-bold text-slate-50">
          My slip <span className="text-slate-500">({slip.length})</span>
        </h3>
        {slip.length > 0 && (
          <button onClick={onClear} className="text-xs text-slate-500 hover:text-rose-400">
            clear
          </button>
        )}
      </div>

      {slip.length === 0 ? (
        <div className="p-6 text-center text-sm text-slate-500">
          Add picks from your watchlist or the depth panel.
        </div>
      ) : (
        <>
          <ul className="divide-y divide-slate-800/70">
            {slip.map((p) => (
              <li key={p.id} className="flex items-center justify-between gap-2 px-4 py-2.5">
                <div className="min-w-0">
                  <p className="truncate text-sm font-medium text-slate-100">{p.playerName}</p>
                  <p className="text-xs text-slate-500">
                    {p.side === 'over' ? 'Over' : 'Under'} {p.line} {MARKETS[p.market]?.label} ·{' '}
                    {bookLabel(p.book)}
                  </p>
                </div>
                <div className="flex items-center gap-2">
                  <span className="font-mono tabular-nums text-sm text-emerald-400">{formatOdds(p.price)}</span>
                  <button
                    onClick={() => onRemove?.(p.id)}
                    className="text-slate-600 hover:text-rose-400 text-lg leading-none"
                    aria-label="Remove pick"
                  >
                    ×
                  </button>
                </div>
              </li>
            ))}
          </ul>

          <div className="border-t border-slate-800 p-4 text-sm">
            <div className="flex items-center justify-between">
              <span className="text-slate-400">{slip.length > 1 ? 'Parlay odds' : 'Odds'}</span>
              <span className="font-mono tabular-nums font-bold text-slate-50">{formatOdds(parlay)}</span>
            </div>
            <div className="mt-1 flex items-center justify-between text-xs text-slate-500">
              <span>${STAKE} returns</span>
              <span className="font-mono tabular-nums text-emerald-400">{payout ? `$${payout}` : '—'}</span>
            </div>
          </div>
        </>
      )}
    </div>
  );
}
