import React, { useEffect, useMemo, useState } from 'react';
import { Link } from 'react-router-dom';
import { api } from '../../lib/api';
import { formatOdds } from '../../lib/odds';
import { marketLabel } from '../../lib/markets';
import { formatSignedMoney, formatSignedPct, formatPct, signColor, DASH } from '../../lib/format';
import { Panel } from '../ui/panel';
import { Stat } from '../ui/stat';
import { Term } from '../ui/term';
import { useSport } from '@/context/SportContext';

/**
 * How the edges the app flagged actually settled.
 *
 * This is the only place the app is accountable for its own advice. Everything
 * else is a claim about the future -- best price, hit rate, EV -- and this is
 * the receipt. It reads /grades, which joins prop snapshots to the game logs
 * that settle them, so it costs no Odds API credits.
 *
 * One row is one BET, not one book quote: the server keeps only the
 * best-priced quote per (player, market), which is the bet the UI told you to
 * take.
 */

const OUTCOME_STYLE = {
  win: 'bg-emerald-500/10 text-emerald-400',
  loss: 'bg-rose-500/10 text-rose-400',
  push: 'bg-slate-500/10 text-slate-400',
};

function OutcomeBadge({ outcome }) {
  if (!outcome) return <span className="text-slate-600">{DASH}</span>;
  return (
    <span
      className={`rounded px-2 py-0.5 font-mono text-[10px] font-semibold uppercase tracking-wide ${OUTCOME_STYLE[outcome]}`}
    >
      {outcome}
    </span>
  );
}

// The API returns the raw Odds API market key (batter_hits); the registry is
// keyed by our short ids. Reverse it so the table reads "H" like the rest of
// the app rather than exposing a vendor string.
function labelForMarketKey(sport, key, order, defs) {
  const id = order.find((m) => defs[m]?.key === key);
  return id ? marketLabel(sport, id) : key;
}

export default function EdgeResultsPanel({ days = 14, limit = 25 }) {
  const { sport, order, markets } = useSport();
  const [data, setData] = useState(null);
  const [loading, setLoading] = useState(true);
  const [failed, setFailed] = useState(false);

  useEffect(() => {
    let active = true;
    setLoading(true);
    setFailed(false);
    api
      .get('/grades', { params: { sport, days } })
      .then((res) => active && setData(res.data))
      .catch((err) => {
        console.error('Failed to fetch graded props:', err);
        if (active) setFailed(true);
      })
      .finally(() => active && setLoading(false));
    return () => {
      active = false;
    };
  }, [sport, days]);

  const summary = data?.summary;
  const rows = useMemo(
    () => (data?.results || []).filter((r) => r.outcome != null).slice(0, limit),
    [data, limit]
  );

  const header = (
    <div>
      <h3 className="font-bold text-slate-50">How our edges did</h3>
      <p className="text-xs text-slate-500">
        Every flagged edge, settled at the best price we showed. Last {days} days.
      </p>
    </div>
  );

  if (loading) {
    return <Panel header={header}><div className="p-8 text-center text-sm text-slate-500">Loading results…</div></Panel>;
  }

  // A failed request and an empty-but-healthy response mean different things and
  // must not share a message: one is a bug to chase, the other is Tuesday
  // morning before any game has finished.
  if (failed) {
    return (
      <Panel header={header}>
        <div className="p-8 text-center text-sm text-rose-400">
          Couldn&apos;t load results. The grading endpoint didn&apos;t respond.
        </div>
      </Panel>
    );
  }

  if (!summary || summary.graded === 0) {
    return (
      <Panel header={header}>
        <div className="p-8 text-center text-sm text-slate-500">
          <p className="text-slate-300">No settled bets yet.</p>
          <p className="mt-1">
            Results appear the morning after a slate, once box scores land for games we posted lines on.
          </p>
        </div>
      </Panel>
    );
  }

  const roi = summary.profitPer100Staked;
  // With one props fetch a day the opening and closing snapshots are the same
  // row, so CLV is identically 0 -- which would read as "we measured it and it
  // was flat" rather than "there is nothing to measure yet".
  const clvMeaningful = summary.avgClv != null && summary.avgClv !== 0;

  return (
    <div className="space-y-4">
      <Panel tone="primary" className="grid grid-cols-2 gap-4 p-5 sm:grid-cols-4">
        <Stat
          label="Record"
          value={`${summary.wins}-${summary.losses}${summary.pushes ? `-${summary.pushes}` : ''}`}
          hint={summary.pushes ? `${summary.pushes} push` : undefined}
        />
        <Stat label="Win rate" value={formatPct(summary.winRate)} hint={`${summary.graded} settled`} />
        <Stat
          label={<Term define="roi">ROI</Term>}
          value={formatSignedPct(roi)}
          accent={signColor(roi)}
          hint="per $100 staked"
        />
        <Stat
          label={<Term define="clv">Avg CLV</Term>}
          value={clvMeaningful ? formatSignedPct(summary.avgClv) : DASH}
          accent={clvMeaningful ? signColor(summary.avgClv) : 'text-slate-600'}
          hint={clvMeaningful ? undefined : 'needs >1 fetch/day'}
        />
      </Panel>

      <Panel header={header} className="overflow-x-auto">
        <table className="w-full text-sm">
          <thead>
            <tr className="text-left text-[11px] uppercase text-slate-500">
              <th className="px-4 py-2 font-medium">Player</th>
              <th className="px-4 py-2 font-medium">Market</th>
              <th className="px-4 py-2 text-right font-medium">Line</th>
              <th className="px-4 py-2 text-right font-medium">Price</th>
              <th className="px-4 py-2 text-right font-medium">Actual</th>
              <th className="px-4 py-2 text-center font-medium">Result</th>
              <th className="px-4 py-2 text-right font-medium">P/L</th>
            </tr>
          </thead>
          <tbody>
            {rows.map((r) => (
              <tr
                key={`${r.player_id}-${r.market}-${r.game_id}`}
                className="border-t border-slate-800/70 hover:bg-slate-800/40"
              >
                <td className="whitespace-nowrap px-4 py-2">
                  {r.player_id ? (
                    <Link to={`/${sport}/players/${r.player_id}`} className="font-medium text-slate-100 hover:text-cyan-300">
                      {r.full_name}
                    </Link>
                  ) : (
                    <span className="font-medium text-slate-100">{r.full_name}</span>
                  )}
                </td>
                <td className="px-4 py-2 font-mono text-xs uppercase text-slate-400">
                  {labelForMarketKey(sport, r.market, order, markets)}
                </td>
                <td className="px-4 py-2 text-right font-mono tabular-nums text-slate-300">
                  {r.line ?? DASH}
                </td>
                <td className="px-4 py-2 text-right font-mono tabular-nums text-slate-300">
                  {formatOdds(r.odds)}
                </td>
                <td className="px-4 py-2 text-right font-mono tabular-nums font-semibold text-slate-50">
                  {r.actual ?? DASH}
                </td>
                <td className="px-4 py-2 text-center">
                  <OutcomeBadge outcome={r.outcome} />
                </td>
                <td className={`px-4 py-2 text-right font-mono tabular-nums ${signColor(r.profit_per_100)}`}>
                  {formatSignedMoney(r.profit_per_100)}
                </td>
              </tr>
            ))}
          </tbody>
        </table>
        {summary.ungraded > 0 && (
          <p className="px-4 py-3 text-xs text-slate-600">
            {summary.ungraded} prop{summary.ungraded === 1 ? '' : 's'} couldn&apos;t be settled — the player
            didn&apos;t appear, or the market isn&apos;t one we can grade.
          </p>
        )}
      </Panel>
    </div>
  );
}
