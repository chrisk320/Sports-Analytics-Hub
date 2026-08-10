import React from 'react';
import { formatOdds, bookLabel } from '../../lib/odds';
import { Panel } from '../ui/panel';

function Cell({ cell, best }) {
  return (
    <td className={`px-2 py-2 text-center ${best ? 'rounded bg-amber-400/10 font-bold text-amber-300' : 'text-slate-200'}`}>
      {cell.point != null && <span className="mr-1 text-xs text-slate-400">{cell.point}</span>}
      {formatOdds(cell.price)}
      {best && cell.price != null && ' ★'}
    </td>
  );
}

// One team market (Spread / Total / Moneyline) as a per-book table, best price
// per side highlighted. `market` comes from buildTeamMarkets().
export default function TeamMarketCard({ market }) {
  const { title, colA, colB, rows, bestA, bestB } = market;
  return (
    <Panel header={<h3 className="font-bold text-slate-50">{title}</h3>}>
      {rows.length > 0 ? (
        <div className="overflow-x-auto">
          <table className="w-full text-sm">
            <thead>
              <tr className="text-[11px] uppercase text-slate-500">
                <th className="px-4 py-2 text-left font-medium">Book</th>
                <th className="px-2 py-2 text-center font-medium">{colA}</th>
                <th className="px-2 py-2 text-center font-medium">{colB}</th>
              </tr>
            </thead>
            <tbody className="font-mono tabular-nums">
              {rows.map((r) => (
                <tr key={r.book} className="border-t border-slate-800/70">
                  <td className="px-4 py-2 font-sans text-slate-300">{bookLabel(r.book)}</td>
                  <Cell cell={r.a} best={r.book === bestA} />
                  <Cell cell={r.b} best={r.book === bestB} />
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      ) : (
        <p className="p-4 text-center text-sm text-slate-500">No lines available.</p>
      )}
    </Panel>
  );
}
