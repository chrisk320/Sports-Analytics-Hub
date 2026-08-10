import React from 'react';
import { ExternalLink } from 'lucide-react';
import { formatCents } from '../../lib/kalshi';
import { Panel } from '../ui/panel';

// Kalshi game-winner market as a per-team table: yes price (cents), implied
// probability, and volume. `market` comes from buildKalshiMarket().
export default function KalshiMarketCard({ market }) {
  const { title, url, sides, totalVolume } = market;
  return (
    <Panel
      header={
        <>
          <h3 className="font-bold text-slate-50">{title}</h3>
          <a
            href={url}
            target="_blank"
            rel="noopener noreferrer"
            className="flex items-center gap-1 text-xs text-cyan-400 hover:text-cyan-300"
          >
            Kalshi <ExternalLink className="h-3 w-3" />
          </a>
        </>
      }
    >
      {sides.length > 0 ? (
        <div className="overflow-x-auto">
          <table className="w-full text-sm">
            <thead>
              <tr className="text-[11px] uppercase text-slate-500">
                <th className="px-4 py-2 text-left font-medium">Team</th>
                <th className="px-2 py-2 text-center font-medium">Yes</th>
                <th className="px-2 py-2 text-center font-medium">Implied</th>
                <th className="px-2 py-2 text-center font-medium">Volume</th>
              </tr>
            </thead>
            <tbody className="font-mono tabular-nums">
              {sides.map((s) => (
                <tr key={s.team} className="border-t border-slate-800/70">
                  <td className="px-4 py-2 font-sans text-slate-300">{s.team}</td>
                  <td className="px-2 py-2 text-center text-slate-200">
                    {formatCents(s.lastPrice)}
                    {s.yesBid != null && s.yesAsk != null && (
                      <span className="ml-1 text-xs text-slate-400">
                        {s.yesBid}/{s.yesAsk}
                      </span>
                    )}
                  </td>
                  <td className="px-2 py-2 text-center font-bold text-amber-300">
                    {s.impliedProb != null ? `${Math.round(s.impliedProb * 100)}%` : '—'}
                  </td>
                  <td className="px-2 py-2 text-center text-slate-400">
                    {s.volume != null ? s.volume.toLocaleString() : '—'}
                  </td>
                </tr>
              ))}
              {totalVolume > 0 && (
                <tr className="border-t border-slate-800/70 text-xs">
                  <td className="px-4 py-2 font-sans text-slate-500" colSpan={3}>
                    Total contracts traded
                  </td>
                  <td className="px-2 py-2 text-center text-slate-400">{totalVolume.toLocaleString()}</td>
                </tr>
              )}
            </tbody>
          </table>
        </div>
      ) : (
        <p className="p-4 text-center text-sm text-slate-500">No market data.</p>
      )}
    </Panel>
  );
}
