import React from 'react';
import {
  MARKET_ORDER,
  MARKETS,
  summarizeMarket,
  hitRate,
  evPercent,
  formatOdds,
  bookLabel,
} from '../../lib/odds';
import { Panel } from '../ui/panel';

// Per-market prop rows for one player: consensus line, best over book/price,
// L10 hit rate, EV, and a "+ slip" action. Driven by /playerprops/:id.
export default function TonightsPropsSidebar({ playerId, playerName, props = [], logs = [], gameInfo, onAddToSlip }) {
  const rows = MARKET_ORDER.map((id) => summarizeMarket(props, id)).filter(Boolean);

  return (
    <Panel
      header={
        <div>
          <h3 className="font-bold text-slate-50">Tonight's props</h3>
          {gameInfo ? (
            <p className="text-xs text-slate-500">
              {gameInfo.away_team} @ {gameInfo.home_team}
            </p>
          ) : (
            <p className="text-xs text-slate-500">No game on the board</p>
          )}
        </div>
      }
    >
      {rows.length === 0 ? (
        <div className="p-6 text-center text-sm text-slate-500">No props posted for this player.</div>
      ) : (
        <ul className="divide-y divide-slate-800/70">
          {rows.map((s) => {
            const last10 = (logs || []).slice(0, 10);
            const hr = hitRate(last10, s.marketId, s.line, 'over');
            const ev = s.bestOver ? evPercent(hr, s.bestOver.over_odds) : null;
            return (
              <li key={s.marketId} className="p-4">
                <div className="flex items-center justify-between">
                  <div>
                    <span className="font-semibold text-slate-100">{MARKETS[s.marketId]?.label}</span>{' '}
                    <span className="font-mono tabular-nums text-slate-400">O {s.line}</span>
                  </div>
                  {s.bestOver && (
                    <div className="text-right">
                      <div className="font-mono tabular-nums font-bold text-emerald-400">
                        {formatOdds(s.bestOver.over_odds)}
                      </div>
                      <div className="text-[11px] text-amber-300">★ {bookLabel(s.bestOver.bookmaker)}</div>
                    </div>
                  )}
                </div>

                <div className="mt-2 flex items-center justify-between text-xs">
                  <span className="text-slate-400">
                    hit{' '}
                    <span className="font-mono tabular-nums text-slate-200">
                      {hr != null ? `${Math.round(hr * 100)}%` : '—'}
                    </span>
                  </span>
                  <span className={ev != null && ev >= 0 ? 'text-emerald-400' : 'text-rose-400'}>
                    EV{' '}
                    <span className="font-mono tabular-nums">
                      {ev != null ? `${ev >= 0 ? '+' : ''}${ev.toFixed(1)}%` : '—'}
                    </span>
                  </span>
                  {s.overSavings > 0 && (
                    <span className="font-mono tabular-nums text-amber-300">+${s.overSavings.toFixed(2)}/100</span>
                  )}
                </div>

                {s.bestOver && (
                  <button
                    onClick={() =>
                      onAddToSlip?.({
                        playerId,
                        playerName,
                        market: s.marketId,
                        side: 'over',
                        line: s.line,
                        book: s.bestOver.bookmaker,
                        price: s.bestOver.over_odds,
                      })
                    }
                    className="mt-2 w-full rounded-lg bg-purple-500 py-1.5 text-xs font-semibold text-white transition hover:bg-purple-400"
                  >
                    ＋ add to slip
                  </button>
                )}
              </li>
            );
          })}
        </ul>
      )}
    </Panel>
  );
}
