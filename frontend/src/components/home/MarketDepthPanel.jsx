import React from 'react';
import { Link } from 'react-router-dom';
import {
  MARKETS,
  summarizeMarket,
  americanToImpliedProb,
  formatOdds,
  bookLabel,
} from '../../lib/odds';
import { Panel } from '../ui/panel';
import { Term } from '../ui/term';

function vig(over, under) {
  const a = americanToImpliedProb(over);
  const b = americanToImpliedProb(under);
  if (a == null || b == null) return null;
  return (a + b - 1) * 100;
}

export default function MarketDepthPanel({ player, props = [], marketId, nbaGames = [], onAddToSlip, hasWatchlist = true }) {
  const summary = summarizeMarket(props, marketId);
  const rows = summary?.rows || [];
  const bestOverBook = summary?.bestOver?.bookmaker;
  const bestUnderBook = summary?.bestUnder?.bookmaker;

  return (
    <Panel
      header={
        <>
          <div>
            <h3 className="font-bold text-slate-50">{player ? player.full_name : 'Market depth'}</h3>
            <p className="text-xs text-slate-500">
              {MARKETS[marketId]?.label} {summary?.line != null ? `· line ${summary.line}` : ''}
            </p>
          </div>
          {summary?.bestOver && (
            <button
              onClick={() =>
                onAddToSlip?.({
                  playerId: player?.player_id,
                  playerName: player?.full_name,
                  market: marketId,
                  side: 'over',
                  line: summary.line,
                  book: summary.bestOver.bookmaker,
                  price: summary.bestOver.over_odds,
                })
              }
              className="rounded-lg bg-purple-500 px-3 py-1.5 text-xs font-semibold text-white transition hover:bg-purple-400"
            >
              ＋ best price
            </button>
          )}
        </>
      }
    >
      {rows.length > 0 ? (
        <div className="overflow-x-auto">
          <table className="w-full text-sm">
            <thead>
              <tr className="text-left text-[11px] uppercase text-slate-500">
                <th className="px-4 py-2 font-medium">Book</th>
                <th className="px-2 py-2 text-center font-medium">Line</th>
                <th className="px-2 py-2 text-center font-medium">Over</th>
                <th className="px-2 py-2 text-center font-medium">Under</th>
                <th className="px-4 py-2 text-right font-medium"><Term define="vig">Vig</Term></th>
              </tr>
            </thead>
            <tbody className="font-mono tabular-nums">
              {rows.map((r) => {
                const v = vig(r.over_odds, r.under_odds);
                return (
                  <tr key={r.bookmaker} className="border-t border-slate-800/70">
                    <td className="px-4 py-2 font-sans text-slate-300">{bookLabel(r.bookmaker)}</td>
                    <td className="px-2 py-2 text-center text-slate-400">{r.over_line ?? '—'}</td>
                    <td
                      className={`px-2 py-2 text-center ${
                        r.bookmaker === bestOverBook
                          ? 'rounded bg-amber-400/10 font-bold text-amber-300'
                          : 'text-slate-200'
                      }`}
                    >
                      {formatOdds(r.over_odds)}
                      {r.bookmaker === bestOverBook && ' ★'}
                    </td>
                    <td
                      className={`px-2 py-2 text-center ${
                        r.bookmaker === bestUnderBook
                          ? 'rounded bg-amber-400/10 font-bold text-amber-300'
                          : 'text-slate-200'
                      }`}
                    >
                      {formatOdds(r.under_odds)}
                      {r.bookmaker === bestUnderBook && ' ★'}
                    </td>
                    <td className="px-4 py-2 text-right text-slate-500">{v != null ? `${v.toFixed(1)}%` : '—'}</td>
                  </tr>
                );
              })}
            </tbody>
          </table>
        </div>
      ) : (
        <div className="p-6 text-center text-sm text-slate-500">
          {player
            ? 'No lines for this market tonight.'
            : hasWatchlist
              ? 'Hover a watchlist card to see its book table.'
              : 'Add a player to your watchlist to compare book prices side-by-side here.'}
        </div>
      )}

      {/* Tonight's games strip */}
      <div className="border-t border-slate-800 p-4">
        <h4 className="mb-2 text-[11px] uppercase tracking-wide text-slate-500">Tonight's games</h4>
        {nbaGames.length > 0 ? (
          <div className="flex flex-wrap gap-2">
            {nbaGames.slice(0, 8).map((g) => (
              <Link
                key={g.id}
                to={`/games/${g.id}`}
                className="rounded-lg border border-slate-700 bg-slate-800/60 px-2.5 py-1 text-xs text-slate-300 transition hover:border-purple-500 hover:text-slate-50"
              >
                {g.away_team} @ {g.home_team}
              </Link>
            ))}
          </div>
        ) : (
          <p className="text-xs text-slate-600">No games scheduled.</p>
        )}
      </div>
    </Panel>
  );
}
