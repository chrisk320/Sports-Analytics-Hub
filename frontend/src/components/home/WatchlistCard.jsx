import React from 'react';
import { Link } from 'react-router-dom';
import { User } from 'lucide-react';
import MiniSparkline from './MiniSparkline';
import { Term } from '../ui/term';
import { marketLabel } from '../../lib/markets';
import { formatSignedPct, signColor } from '../../lib/format';
import { useSport } from '@/context/SportContext';
import {
  summarizeMarket,
  statFromLog,
  avgFromLogs,
  hitRate,
  evPercent,
  formatOdds,
  bookLabel,
} from '../../lib/odds';

const fallbackImg = (e) => {
  e.target.src = 'https://cdn.nba.com/headshots/nba/latest/1040x760/fallback.png';
};

export default function WatchlistCard({
  player,
  marketId,
  props = [],
  logs = [],
  isPinned,
  isActive,
  onHover,
  onLeave,
  onPin,
  onAddToSlip,
  onRemove,
}) {
  const last10 = (logs || []).slice(0, 10);
  const { sport } = useSport();
  const summary = summarizeMarket(sport, props, marketId);
  const line = summary?.line ?? null;
  const best = summary?.bestOver ?? null;
  const avg = avgFromLogs(sport, last10, marketId);
  const hr = hitRate(sport, last10, marketId, line, 'over');
  const ev = best ? evPercent(hr, best.over_odds) : null;
  const sparkValues = [...last10].reverse().map((l) => statFromLog(sport, l, marketId));
  const overCount = line != null ? last10.filter((l) => statFromLog(sport, l, marketId) >= line).length : null;

  return (
    <div
      onMouseEnter={() => onHover?.(player.player_id)}
      onMouseLeave={() => onLeave?.()}
      onClick={() => onPin?.(player.player_id)}
      className={`group relative cursor-pointer rounded-xl border bg-slate-900 p-4 transition ${
        isActive ? 'border-purple-500 ring-1 ring-purple-500/40' : 'border-slate-800 hover:border-slate-600'
      }`}
    >
      {isPinned && (
        <span className="absolute top-2 right-2 text-[10px] font-bold uppercase tracking-wide text-purple-300">
          ● pinned
        </span>
      )}

      <div className="flex items-center gap-3">
        <div className="h-12 w-12 shrink-0 overflow-hidden rounded-full border-2 border-cyan-400 bg-slate-800 flex items-center justify-center">
          {player.headshot_url ? (
            <img src={player.headshot_url} alt={player.full_name} className="h-full w-full object-cover" onError={fallbackImg} />
          ) : (
            <User className="h-6 w-6 text-slate-400" />
          )}
        </div>
        <div className="min-w-0 flex-1">
          <Link
            to={`/${sport}/players/${player.player_id}`}
            onClick={(e) => e.stopPropagation()}
            className="block truncate font-bold text-slate-50 hover:text-cyan-300"
          >
            {player.full_name}
          </Link>
          <p className="text-xs text-slate-500">{marketLabel(sport, marketId)} market · click to pin</p>
        </div>
        {onRemove && (
          <button
            onClick={(e) => {
              e.stopPropagation();
              onRemove(player.player_id);
            }}
            className="text-slate-600 opacity-0 transition group-hover:opacity-100 hover:text-rose-400 text-lg leading-none"
            aria-label="Remove from watchlist"
          >
            ×
          </button>
        )}
      </div>

      {line != null ? (
        <>
          <div className="mt-3 grid grid-cols-3 gap-2 text-center">
            <div className="rounded-lg bg-slate-800/60 py-1.5">
              <div className="text-[10px] uppercase text-slate-500">Line</div>
              <div className="font-mono tabular-nums font-semibold text-slate-50">{line}</div>
            </div>
            <div className="rounded-lg bg-slate-800/60 py-1.5">
              <div className="text-[10px] uppercase text-slate-500">Best</div>
              <div className="font-mono tabular-nums font-semibold text-emerald-400">
                {best ? formatOdds(best.over_odds) : '—'}
              </div>
            </div>
            <div className="rounded-lg bg-slate-800/60 py-1.5">
              <div className="text-[10px] uppercase text-slate-500">
                <Term define="l10">L10</Term>
              </div>
              <div className="font-mono tabular-nums font-semibold text-slate-50">
                {overCount != null ? `${overCount}/${last10.length}` : '—'}
              </div>
            </div>
          </div>

          <div className="mt-2">
            <MiniSparkline values={sparkValues} line={line} />
          </div>

          <div className="mt-2 flex items-center justify-between text-xs">
            <span className="text-slate-400">
              avg <span className="font-mono tabular-nums text-slate-200">{avg != null ? avg.toFixed(1) : '—'}</span>
            </span>
            <span className={signColor(ev)}>
              <Term define="ev">EV</Term>{' '}
              <span className="font-mono tabular-nums">{formatSignedPct(ev)}</span>
            </span>
          </div>

          {best && (
            <button
              onClick={(e) => {
                e.stopPropagation();
                onAddToSlip?.({
                  playerId: player.player_id,
                  playerName: player.full_name,
                  market: marketId,
                  side: 'over',
                  line,
                  book: best.bookmaker,
                  price: best.over_odds,
                });
              }}
              className="mt-3 w-full rounded-lg bg-purple-500 py-1.5 text-xs font-semibold text-white transition hover:bg-purple-400"
            >
              ＋ add over {line} ({bookLabel(best.bookmaker)})
            </button>
          )}
        </>
      ) : (
        <div className="mt-4 rounded-lg border border-dashed border-slate-700 py-4 text-center text-xs text-slate-500">
          No prop line tonight
          {avg != null && (
            <div className="mt-1 text-slate-400">
              L10 avg <span className="font-mono tabular-nums">{avg.toFixed(1)}</span>
            </div>
          )}
        </div>
      )}
    </div>
  );
}
