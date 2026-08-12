import React from 'react';
import { useNavigate } from 'react-router-dom';
import { summarizeMarket, formatOdds } from '../../lib/odds';
import { marketLabel, marketDef } from '../../lib/markets';
import { useSport } from '@/context/SportContext';
import { Panel } from '../ui/panel';

// Single markets first, then the combos (PR/PA/RA) set off by a divider.

// Players for one team with their best over price per core market.
// Rows navigate to the player detail page.
export default function TeamPropsTable({ teamName, teamAbbr, players = [] }) {
  const { sport, order, defaultMarket } = useSport();
  // Divider before the first combo column, derived from the registry rather
  // than a hardcoded 'PR' that only made sense for the NBA.
  const comboStart = order.find((id) => marketDef(sport, id)?.group === 'combo');
  const navigate = useNavigate();
  // sort by points line desc so the headliners are on top
  const sorted = [...players].sort(
    (a, b) => (summarizeMarket(sport, b.props, defaultMarket)?.line ?? 0) - (summarizeMarket(sport, a.props, defaultMarket)?.line ?? 0)
  );

  return (
    <Panel
      header={
        <>
          <h3 className="font-bold text-slate-50">{teamName}</h3>
          {teamAbbr && <span className="text-xs text-slate-500">{teamAbbr}</span>}
        </>
      }
    >
      {sorted.length > 0 ? (
        <div className="overflow-x-auto">
          <table className="w-full text-sm">
            <thead>
              <tr className="text-[11px] uppercase text-slate-500">
                <th className="px-4 py-2 text-left font-medium">Player</th>
                {order.map((m) => (
                  <th
                    key={m}
                    className={`px-1.5 py-2 text-center font-medium ${m === comboStart ? 'border-l border-slate-800' : ''}`}
                  >
                    {marketLabel(sport, m)}
                  </th>
                ))}
              </tr>
            </thead>
            <tbody>
              {sorted.map((pl) => (
                <tr
                  key={pl.playerId ?? pl.playerName}
                  onClick={() => pl.playerId && navigate(`/players/${pl.playerId}`)}
                  className={`border-t border-slate-800/70 ${pl.playerId ? 'cursor-pointer hover:bg-slate-800/40' : ''}`}
                >
                  <td className="px-4 py-2 font-medium text-slate-100">{pl.playerName}</td>
                  {order.map((m) => {
                    const s = summarizeMarket(sport, pl.props, m);
                    return (
                      <td
                        key={m}
                        className={`whitespace-nowrap px-1.5 py-2 text-center font-mono tabular-nums ${m === comboStart ? 'border-l border-slate-800/70' : ''}`}
                      >
                        {s ? (
                          <>
                            <span className="text-slate-400">O{s.line}</span>{' '}
                            <span className="text-emerald-400">{formatOdds(s.bestOver?.over_odds)}</span>
                          </>
                        ) : (
                          <span className="text-slate-600">—</span>
                        )}
                      </td>
                    );
                  })}
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      ) : (
        <p className="p-4 text-center text-sm text-slate-500">No props for this team.</p>
      )}
    </Panel>
  );
}
