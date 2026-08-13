import React from 'react';
import { formatOdds, bookLabel } from '../../lib/odds';
import { marketLabel } from '../../lib/markets';
import { useSport } from '@/context/SportContext';
import { Panel } from '../ui/panel';

const TAG_STYLES = {
  BEST: 'bg-amber-400/10 text-amber-300 border-amber-400/40',
  EDGE: 'bg-emerald-400/10 text-emerald-300 border-emerald-400/40',
  STATUS: 'bg-slate-700/40 text-slate-300 border-slate-600',
};

function Tag({ kind }) {
  return (
    <span className={`rounded border px-1.5 py-0.5 text-[10px] font-bold uppercase ${TAG_STYLES[kind]}`}>
      {kind}
    </span>
  );
}

// Derived feed — BEST/EDGE signals from current prices + a STATUS line.
// True line-move/injury alerts need data we don't store yet (see plan).
export default function AlertsFeed({ edges = [], gameCount = 0, freshness = null }) {
  const { sport } = useSport();
  // The odds' own timestamp, so a stalled pipeline shows here as an age
  // rather than as a reassuring clock reading.
  const stamp = freshness ? (freshness.stale ? `stale, ${freshness.age}` : freshness.label) : '';

  const top = edges.filter((e) => e.savings > 0).slice(0, 8);

  const items = [
    {
      id: 'status',
      kind: 'STATUS',
      text: `${gameCount} game${gameCount === 1 ? '' : 's'} on tonight's slate · ${edges.length} markets tracked`,
    },
    ...top.map((e, i) => ({
      id: e.key,
      kind: i === 0 ? 'EDGE' : 'BEST',
      text: (
        <>
          <span className="font-semibold text-slate-100">{e.playerName}</span>{' '}
          {marketLabel(sport, e.marketId)} o{e.line} best at {bookLabel(e.book)}{' '}
          <span className="font-mono tabular-nums text-emerald-400">{formatOdds(e.odds)}</span>{' '}
          <span className="font-mono tabular-nums text-amber-300">(+${e.savings.toFixed(2)}/100)</span>
        </>
      ),
    })),
  ];

  return (
    <Panel
      header={
        <>
          <h3 className="font-bold text-slate-50">Alerts</h3>
          {stamp && <span className="text-xs text-slate-600">{stamp}</span>}
        </>
      }
    >
      <ul className="max-h-[420px] divide-y divide-slate-800/70 overflow-y-auto">
        {items.map((it) => (
          <li key={it.id} className="flex items-start gap-2 px-4 py-2.5 text-sm text-slate-300">
            <Tag kind={it.kind} />
            <span className="leading-snug">{it.text}</span>
          </li>
        ))}
        {items.length === 1 && (
          <li className="px-4 py-6 text-center text-sm text-slate-500">No price edges right now.</li>
        )}
      </ul>
    </Panel>
  );
}
