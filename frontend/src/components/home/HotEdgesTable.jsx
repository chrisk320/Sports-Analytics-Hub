import React from 'react';
import { Link } from 'react-router-dom';
import { formatOdds, bookLabel } from '../../lib/odds';
import { marketLabel } from '../../lib/markets';
import { useSport } from '@/context/SportContext';
import { Panel } from '../ui/panel';

// Full-width flat table of the slate's best price edges (price-based; no
// per-player game-log fetch). Clicking a row pins that player's depth panel.
export default function HotEdgesTable({ edges = [], onPin, limit = 15 }) {
  const { sport } = useSport();
  const rows = edges.filter((e) => e.savings > 0).slice(0, limit);

  return (
    <Panel
      header={
        <div>
          <h3 className="font-bold text-slate-50">Hot prop edges</h3>
          <p className="text-xs text-slate-500">Best available over price vs the median book, per market.</p>
        </div>
      }
    >
      {rows.length > 0 ? (
        <div className="overflow-x-auto">
          <table className="w-full text-sm">
            <thead>
              <tr className="text-left text-[11px] uppercase text-slate-500">
                <th className="px-4 py-2 font-medium">Player</th>
                <th className="px-2 py-2 font-medium">Market</th>
                <th className="px-2 py-2 text-center font-medium">Line</th>
                <th className="px-2 py-2 text-center font-medium">Best</th>
                <th className="px-2 py-2 font-medium">Book</th>
                <th className="px-4 py-2 text-right font-medium">Save/$100</th>
              </tr>
            </thead>
            <tbody>
              {rows.map((e) => (
                <tr
                  key={e.key}
                  onClick={() => e.playerId && onPin?.(e.playerId)}
                  className="cursor-pointer border-t border-slate-800/70 hover:bg-slate-800/40"
                >
                  <td className="px-4 py-2 font-medium text-slate-100">
                    {e.playerId ? (
                      <Link
                        to={`/${sport}/players/${e.playerId}`}
                        onClick={(ev) => ev.stopPropagation()}
                        className="hover:text-cyan-300"
                      >
                        {e.playerName}
                      </Link>
                    ) : (
                      e.playerName
                    )}
                  </td>
                  <td className="px-2 py-2 text-slate-400">{marketLabel(sport, e.marketId)}</td>
                  <td className="px-2 py-2 text-center font-mono tabular-nums text-slate-300">{e.line}</td>
                  <td className="px-2 py-2 text-center font-mono tabular-nums font-semibold text-emerald-400">
                    {formatOdds(e.odds)}
                  </td>
                  <td className="px-2 py-2 text-slate-300">{bookLabel(e.book)}</td>
                  <td className="px-4 py-2 text-right font-mono tabular-nums font-bold text-amber-300">
                    +${e.savings.toFixed(2)}
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      ) : (
        <div className="p-8 text-center text-sm text-slate-500">
          No price edges available. Try refreshing tonight's props on the backend.
        </div>
      )}
    </Panel>
  );
}
