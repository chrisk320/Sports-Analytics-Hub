import React, { useEffect, useMemo, useState } from 'react';
import { useOutletContext, Link } from 'react-router-dom';
import { Loader, Search } from 'lucide-react';
import { api } from '../lib/api';
import { formatOdds, bookLabel, MARKET_ORDER, DEFAULT_BOOKS } from '../lib/odds';
import { buildCompareRows, sortRows, bestBookToday, avgSavings, evCount } from '../lib/compare';
import MarketToggle from '../components/home/MarketToggle';
import OffseasonBanner from '../components/OffseasonBanner';

const POLL_MS = 60000;

const chipCls = (on) =>
  `rounded-lg border px-3 py-1.5 text-sm font-medium transition ${
    on
      ? 'border-purple-500 bg-purple-600/20 text-purple-200'
      : 'border-slate-700 text-slate-400 hover:border-slate-600 hover:text-slate-100'
  }`;

const segCls = (on) =>
  `rounded-md px-3 py-1.5 text-sm font-semibold transition ${
    on ? 'bg-purple-600 text-white' : 'text-slate-400 hover:text-slate-50'
  }`;

function Stat({ label, value, accent = 'text-slate-50' }) {
  return (
    <div>
      <div className="text-xs uppercase tracking-wide text-slate-500">{label}</div>
      <div className={`mt-1 font-mono text-2xl font-bold ${accent}`}>{value}</div>
    </div>
  );
}

function CompareRow({ row, books, onAdd, inSlip }) {
  const slipPick = row.bestBook
    ? {
        playerId: row.playerId,
        playerName: row.playerName,
        market: row.marketId,
        side: 'over',
        line: row.line,
        book: row.bestBook,
        price: row.bestOver,
      }
    : null;
  const added = slipPick ? inSlip(slipPick) : false;

  return (
    <tr className="border-t border-slate-800/70 hover:bg-slate-800/30">
      <td className="whitespace-nowrap px-4 py-2.5 font-medium text-slate-100">
        {row.playerId ? (
          <Link to={`/players/${row.playerId}`} className="hover:text-purple-300">
            {row.playerName}
          </Link>
        ) : (
          row.playerName
        )}
      </td>
      <td className="px-2 py-2.5 text-slate-400">{row.marketLabel}</td>
      <td className="px-2 py-2.5 text-center font-mono tabular-nums text-slate-300">{row.line ?? '—'}</td>

      {books.map((b) => {
        const cell = row.prices.get(b);
        const isBest = b === row.bestBook;
        const offLine = cell && cell.overLine != null && row.line != null && cell.overLine !== row.line;
        return (
          <td
            key={b}
            className={`px-2 py-2.5 text-center font-mono tabular-nums ${
              isBest ? 'rounded bg-amber-400/10 font-bold text-amber-300' : 'text-slate-300'
            }`}
          >
            {cell && cell.over != null ? (
              <span className="whitespace-nowrap">
                {offLine && <span className="mr-1 text-[10px] text-slate-500">{cell.overLine}</span>}
                {formatOdds(cell.over)}
                {isBest && ' ★'}
              </span>
            ) : (
              <span className="text-slate-600">—</span>
            )}
          </td>
        );
      })}

      <td className="px-3 py-2.5 text-right font-mono tabular-nums font-bold text-amber-300">
        {row.savings > 0 ? `+$${row.savings.toFixed(2)}` : '—'}
      </td>
      <td className="px-3 py-2.5 text-right font-mono tabular-nums">
        {row.edgePct != null ? (
          <span
            className={row.edgePct > 0 ? 'font-semibold text-emerald-400' : 'text-slate-500'}
            title={row.fairOdds != null ? `fair ${formatOdds(row.fairOdds)}` : undefined}
          >
            {row.edgePct > 0 ? '+' : ''}
            {row.edgePct.toFixed(1)}%
          </span>
        ) : (
          <span className="text-slate-600">—</span>
        )}
      </td>
      <td className="px-2 py-2.5 text-right">
        {slipPick && (
          <button
            onClick={() => onAdd(slipPick)}
            disabled={added}
            className={`rounded-lg px-2.5 py-1 text-xs font-semibold transition ${
              added ? 'cursor-default bg-slate-800 text-slate-500' : 'bg-purple-600 text-white hover:bg-purple-500'
            }`}
          >
            {added ? 'added' : '＋ slip'}
          </button>
        )}
      </td>
    </tr>
  );
}

export default function ComparePage() {
  const { selectedBooks, setSelectedBooks, addToSlip, isInSlip, seasonStatus } = useOutletContext();

  const [props, setProps] = useState([]);
  const [loading, setLoading] = useState(true);
  const [lastUpdated, setLastUpdated] = useState(null);

  const [marketFilter, setMarketFilter] = useState('ALL');
  const [query, setQuery] = useState('');
  const [sortKey, setSortKey] = useState('savings');
  const [edgesOnly, setEdgesOnly] = useState(false);

  useEffect(() => {
    let active = true;
    const load = async () => {
      try {
        const res = await api.get('/playerprops/today');
        if (active) {
          setProps(res.data || []);
          setLastUpdated(new Date());
        }
      } catch (e) {
        console.error('Failed to fetch props:', e);
      } finally {
        if (active) setLoading(false);
      }
    };
    load();
    const id = setInterval(load, POLL_MS);
    return () => {
      active = false;
      clearInterval(id);
    };
  }, []);

  const books = selectedBooks?.length ? selectedBooks : DEFAULT_BOOKS;
  // Stable column order regardless of toggle order.
  const orderedBooks = useMemo(() => DEFAULT_BOOKS.filter((b) => books.includes(b)), [books]);

  const allRows = useMemo(() => buildCompareRows(props, books), [props, books]);

  const filtered = useMemo(() => {
    let r = allRows;
    if (marketFilter !== 'ALL') r = r.filter((x) => x.marketId === marketFilter);
    if (query.trim()) {
      const q = query.trim().toLowerCase();
      r = r.filter((x) => x.playerName?.toLowerCase().includes(q));
    }
    if (edgesOnly) r = r.filter((x) => x.savings > 0 || (x.edgePct ?? 0) > 0);
    return sortRows(r, sortKey);
  }, [allRows, marketFilter, query, edgesOnly, sortKey]);

  const summary = useMemo(
    () => ({
      markets: filtered.length,
      avg: avgSavings(filtered),
      best: bestBookToday(filtered),
      ev: evCount(filtered),
    }),
    [filtered]
  );

  const toggleBook = (b) =>
    setSelectedBooks((prev) => {
      const list = prev?.length ? prev : DEFAULT_BOOKS;
      const has = list.includes(b);
      if (has && list.length === 1) return list; // keep at least one
      return has ? list.filter((x) => x !== b) : [...list, b];
    });

  return (
    <div className="mx-auto max-w-[1536px] space-y-6">
      {!seasonStatus?.nbaInSeason && <OffseasonBanner sport="NBA" />}

      {/* Title */}
      <div className="flex flex-col gap-3 lg:flex-row lg:items-end lg:justify-between">
        <div>
          <h1 className="text-3xl font-bold">Best line finder</h1>
          <p className="text-sm text-slate-400">
            For every prop, we surface the highest-paying book. Shop your lines — it's free money.
          </p>
        </div>
        {lastUpdated && (
          <span className="flex items-center gap-2 text-xs text-slate-500">
            <span className="h-2 w-2 animate-pulse rounded-full bg-emerald-500" />
            updated {lastUpdated.toLocaleTimeString([], { hour: '2-digit', minute: '2-digit' })}
          </span>
        )}
      </div>

      {/* Summary strip */}
      <div className="grid grid-cols-2 gap-4 rounded-2xl border border-slate-800 bg-slate-900 p-5 sm:grid-cols-4">
        <Stat label="Markets compared" value={summary.markets} />
        <Stat label="Avg savings / $100" value={`$${summary.avg.toFixed(2)}`} accent="text-emerald-400" />
        <Stat label="Best book today" value={summary.best ? bookLabel(summary.best.book) : '—'} />
        <Stat label="+EV markets" value={summary.ev} accent="text-emerald-400" />
      </div>

      {/* Filters */}
      <div className="flex flex-col gap-3 lg:flex-row lg:items-center lg:justify-between">
        <MarketToggle value={marketFilter} onChange={setMarketFilter} options={['ALL', ...MARKET_ORDER]} />
        <div className="flex flex-wrap items-center gap-3">
          <div className="relative">
            <Search className="absolute left-3 top-1/2 h-4 w-4 -translate-y-1/2 text-slate-500" />
            <input
              value={query}
              onChange={(e) => setQuery(e.target.value)}
              placeholder="Search player"
              className="w-52 rounded-lg border border-slate-700 bg-slate-900 py-2 pl-9 pr-3 text-sm text-slate-100 placeholder-slate-500 focus:border-purple-500 focus:outline-none"
            />
          </div>
          <button onClick={() => setEdgesOnly((v) => !v)} className={chipCls(edgesOnly)}>
            edges only
          </button>
          <div className="inline-flex rounded-lg border border-slate-700 bg-slate-900 p-1">
            <button onClick={() => setSortKey('savings')} className={segCls(sortKey === 'savings')}>
              Savings
            </button>
            <button onClick={() => setSortKey('edge')} className={segCls(sortKey === 'edge')}>
              Edge
            </button>
          </div>
        </div>
      </div>

      {/* Book filter */}
      <div className="flex flex-wrap items-center gap-2">
        <span className="mr-1 text-xs uppercase tracking-wide text-slate-500">Books</span>
        {DEFAULT_BOOKS.map((b) => (
          <button key={b} onClick={() => toggleBook(b)} className={chipCls(books.includes(b))}>
            {bookLabel(b)}
          </button>
        ))}
      </div>

      {/* Ledger */}
      {loading ? (
        <div className="flex h-72 items-center justify-center">
          <Loader className="h-10 w-10 animate-spin text-purple-500" />
        </div>
      ) : filtered.length > 0 ? (
        <>
          <div className="rounded-xl border border-slate-800 bg-slate-900">
            <div className="overflow-x-auto">
              <table className="w-full text-sm">
                <thead>
                  <tr className="text-left text-[11px] uppercase text-slate-500">
                    <th className="px-4 py-3 font-medium">Player</th>
                    <th className="px-2 py-3 font-medium">Market</th>
                    <th className="px-2 py-3 text-center font-medium">Line</th>
                    {orderedBooks.map((b) => (
                      <th key={b} className="px-2 py-3 text-center font-medium">
                        {bookLabel(b)}
                      </th>
                    ))}
                    <th className="px-3 py-3 text-right font-medium">Save/$100</th>
                    <th className="px-3 py-3 text-right font-medium">Edge</th>
                    <th className="px-2 py-3" />
                  </tr>
                </thead>
                <tbody>
                  {filtered.map((row) => (
                    <CompareRow key={row.key} row={row} books={orderedBooks} onAdd={addToSlip} inSlip={isInSlip} />
                  ))}
                </tbody>
              </table>
            </div>
          </div>
          <p className="px-1 text-xs text-slate-600">
            Best over price at the consensus line is highlighted (★). <span className="text-amber-300">Save/$100</span>{' '}
            is the extra profit on a $100 stake vs. the median book. <span className="text-emerald-400">Edge</span> is the
            best price's EV vs. the de-vigged consensus (fair) odds — positive means +EV. A small grey number marks a book
            sitting on an alternate line.
          </p>
        </>
      ) : (
        <div className="rounded-xl border-2 border-dashed border-slate-700 py-20 text-center text-slate-400">
          {allRows.length === 0 ? (
            <>
              <p className="text-lg">No props on the board right now.</p>
              <p className="mt-1 text-sm text-slate-500">
                Lines appear here on game days once tonight's props are fetched.
              </p>
              <Link to="/games" className="mt-4 inline-block text-purple-400 hover:text-purple-300">
                Browse games →
              </Link>
            </>
          ) : (
            <p className="text-lg">No markets match your filters.</p>
          )}
        </div>
      )}
    </div>
  );
}
