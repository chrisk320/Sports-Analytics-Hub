import React from 'react';
import { formatOdds, bookLabel } from '../../lib/odds';
import { marketLabel } from '../../lib/markets';
import { useSport } from '@/context/SportContext';

// Single-line scrolling strip of the slate's best price edges.
export default function LiveTicker({ edges = [], lastUpdated }) {
  const { sport } = useSport();
  const items = edges.filter((e) => e.savings > 0).slice(0, 20);
  // Duplicate the list so the marquee can loop seamlessly (-50% translate).
  const loop = items.length ? [...items, ...items] : [];

  return (
    <div className="flex items-center gap-3 overflow-hidden rounded-lg border border-slate-800 bg-slate-900/80 py-2">
      <div className="flex shrink-0 items-center gap-2 pl-3 pr-2">
        <span className="h-2 w-2 animate-pulse rounded-full bg-emerald-400" />
        <span className="text-xs font-semibold uppercase tracking-wide text-emerald-400">Live</span>
      </div>

      <div className="relative flex-1 overflow-hidden">
        {loop.length > 0 ? (
          <div className="flex w-max animate-marquee gap-8 whitespace-nowrap">
            {loop.map((e, i) => (
              <span key={`${e.key}-${i}`} className="text-sm text-slate-300">
                <span className="font-semibold text-slate-100">{e.playerName}</span>{' '}
                {marketLabel(sport, e.marketId)} o{e.line}{' '}
                <span className="font-mono tabular-nums text-emerald-400">{formatOdds(e.odds)}</span>{' '}
                <span className="text-slate-500">{bookLabel(e.book)}</span>{' '}
                <span className="font-mono tabular-nums text-amber-300">+${e.savings.toFixed(2)}/100</span>
              </span>
            ))}
          </div>
        ) : (
          <span className="text-sm text-slate-500">No live edges right now.</span>
        )}
      </div>

      {lastUpdated && (
        <span className="shrink-0 px-3 text-xs text-slate-600">
          updated {lastUpdated.toLocaleTimeString([], { hour: '2-digit', minute: '2-digit' })}
        </span>
      )}
    </div>
  );
}
