import React, { useEffect, useMemo, useState } from 'react';
import { Loader } from 'lucide-react';
import { api } from '../lib/api';
import { formatOdds, bestOdds, americanToDecimal, bookLabel, DEFAULT_BOOKS } from '../lib/odds';
import { Panel } from '../components/ui/panel';

// Each market maps to a backend futures endpoint (outrights). The backend
// whitelists the sport keys; we just pick the league + market id here.
const MARKETS = [
  { id: 'champion', league: 'nbabets', label: 'NBA Champion' },
  { id: 'mvp', league: 'nbabets', label: 'NBA MVP' },
  { id: 'superbowl', league: 'nflbets', label: 'Super Bowl Winner' },
];

// Kalshi prediction-market series (served by /kalshi/:market).
const KALSHI_MARKETS = [
  { id: 'nba-champion', label: 'NBA Champion' },
  { id: 'nba-mvp', label: 'NBA MVP' },
  { id: 'nfl-champion', label: 'Super Bowl' },
];

const segCls = (on) =>
  `rounded-md px-3 py-1.5 text-xs font-mono font-semibold uppercase tracking-wide transition ${
    on ? 'bg-purple-500 text-white' : 'text-slate-400 hover:text-slate-50'
  }`;

const fmtVol = (v) =>
  v ? new Intl.NumberFormat('en-US', { notation: 'compact', maximumFractionDigits: 1 }).format(v) : '—';

const cent = (v) => (v == null ? <span className="text-slate-600">—</span> : `${v}¢`);

const Spinner = () => (
  <div className="flex h-72 items-center justify-center">
    <Loader className="h-10 w-10 animate-spin text-purple-500" />
  </div>
);

const EmptyBlock = ({ title, sub }) => (
  <div className="rounded-xl border-2 border-dashed border-slate-700 py-16 text-center text-slate-400">
    <p className="text-lg">{title}</p>
    {sub && <p className="mt-1 text-sm text-slate-500">{sub}</p>}
  </div>
);

/* ------------------------------------------------------------------ */
/* Sportsbook futures (The Odds API outrights)                         */
/* ------------------------------------------------------------------ */

// Pivot Odds API outrights events into one row per outcome (team/player),
// with a price per book. Sorted favorites-first (shortest best price).
function buildFuturesRows(events) {
  const byOutcome = new Map();
  for (const ev of events || []) {
    for (const bm of ev.bookmakers || []) {
      for (const mk of bm.markets || []) {
        if (mk.key !== 'outrights') continue;
        for (const oc of mk.outcomes || []) {
          if (!byOutcome.has(oc.name)) byOutcome.set(oc.name, { name: oc.name, prices: new Map() });
          byOutcome.get(oc.name).prices.set(bm.key, oc.price);
        }
      }
    }
  }
  const rows = [...byOutcome.values()].map((r) => {
    const best = bestOdds([...r.prices.values()]);
    const bestBook = [...r.prices.entries()].find(([, v]) => v === best)?.[0] ?? null;
    return { ...r, best, bestBook };
  });
  rows.sort((x, y) => (americanToDecimal(x.best) ?? Infinity) - (americanToDecimal(y.best) ?? Infinity));
  return rows;
}

function SportsbookFutures() {
  const [marketId, setMarketId] = useState('champion');
  const [events, setEvents] = useState([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState(null);

  const market = useMemo(() => MARKETS.find((m) => m.id === marketId), [marketId]);

  useEffect(() => {
    let active = true;
    setLoading(true);
    setError(null);
    api
      .get(`/${market.league}/futures/${market.id}`)
      .then((res) => active && setEvents(Array.isArray(res.data) ? res.data : []))
      .catch((err) => {
        console.error('Failed to fetch futures:', err);
        if (active) setError('Could not load this market.');
      })
      .finally(() => active && setLoading(false));
    return () => {
      active = false;
    };
  }, [market]);

  const rows = useMemo(() => buildFuturesRows(events), [events]);
  // Only show book columns that actually have prices in this market.
  const books = useMemo(() => {
    const present = new Set();
    rows.forEach((r) => r.prices.forEach((_, b) => present.add(b)));
    return DEFAULT_BOOKS.filter((b) => present.has(b));
  }, [rows]);

  return (
    <div className="space-y-6">
      <div className="inline-flex flex-wrap rounded-lg border border-slate-700 bg-slate-900 p-1">
        {MARKETS.map((m) => (
          <button key={m.id} onClick={() => setMarketId(m.id)} className={segCls(marketId === m.id)}>
            {m.label}
          </button>
        ))}
      </div>

      {loading ? (
        <Spinner />
      ) : error ? (
        <EmptyBlock title={error} />
      ) : rows.length > 0 ? (
        <Panel padded={false}>
          <div className="overflow-x-auto">
            <table className="w-full text-sm">
              <thead>
                <tr className="text-left text-[11px] uppercase text-slate-500">
                  <th className="px-4 py-3 font-medium">{market.label}</th>
                  {books.map((b) => (
                    <th key={b} className="px-3 py-3 text-center font-medium">{bookLabel(b)}</th>
                  ))}
                  <th className="px-3 py-3 text-right font-medium">Best</th>
                </tr>
              </thead>
              <tbody>
                {rows.map((r) => (
                  <tr key={r.name} className="border-t border-slate-800/70 hover:bg-slate-800/30">
                    <td className="whitespace-nowrap px-4 py-2.5 font-medium text-slate-100">{r.name}</td>
                    {books.map((b) => {
                      const price = r.prices.get(b);
                      const isBest = b === r.bestBook;
                      return (
                        <td
                          key={b}
                          className={`px-3 py-2.5 text-center font-mono tabular-nums ${
                            isBest ? 'rounded bg-amber-400/10 font-bold text-amber-300' : 'text-slate-300'
                          }`}
                        >
                          {price != null ? (
                            <>
                              {formatOdds(price)}
                              {isBest && ' ★'}
                            </>
                          ) : (
                            <span className="text-slate-600">—</span>
                          )}
                        </td>
                      );
                    })}
                    <td className="px-3 py-2.5 text-right font-mono tabular-nums font-bold text-amber-300">
                      {formatOdds(r.best)}
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        </Panel>
      ) : (
        <EmptyBlock
          title="No odds posted for this market right now."
          sub="Futures markets open and close throughout the year."
        />
      )}
    </div>
  );
}

/* ------------------------------------------------------------------ */
/* Kalshi prediction markets (public API, prices in ¢ = implied prob)  */
/* ------------------------------------------------------------------ */

function KalshiFutures() {
  const [marketId, setMarketId] = useState('nba-champion');
  const [data, setData] = useState({ label: '', markets: [] });
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState(null);

  useEffect(() => {
    let active = true;
    setLoading(true);
    setError(null);
    api
      .get(`/kalshi/${marketId}`)
      .then((res) => active && setData(res.data || { label: '', markets: [] }))
      .catch((err) => {
        console.error('Failed to fetch Kalshi market:', err);
        if (active) setError('Could not load this market.');
      })
      .finally(() => active && setLoading(false));
    return () => {
      active = false;
    };
  }, [marketId]);

  const markets = data.markets || [];

  return (
    <div className="space-y-6">
      <div className="inline-flex flex-wrap rounded-lg border border-slate-700 bg-slate-900 p-1">
        {KALSHI_MARKETS.map((m) => (
          <button key={m.id} onClick={() => setMarketId(m.id)} className={segCls(marketId === m.id)}>
            {m.label}
          </button>
        ))}
      </div>

      {loading ? (
        <Spinner />
      ) : error ? (
        <EmptyBlock title={error} />
      ) : markets.length > 0 ? (
        <>
          <Panel padded={false}>
            <div className="overflow-x-auto">
              <table className="w-full text-sm">
                <thead>
                  <tr className="text-left text-[11px] uppercase text-slate-500">
                    <th className="px-4 py-3 font-medium">#</th>
                    <th className="px-2 py-3 font-medium">{data.label}</th>
                    <th className="px-3 py-3 text-center font-medium">Bid</th>
                    <th className="px-3 py-3 text-center font-medium">Ask</th>
                    <th className="px-3 py-3 text-center font-medium">Last</th>
                    <th className="px-3 py-3 text-right font-medium">Volume</th>
                  </tr>
                </thead>
                <tbody>
                  {markets.map((m, i) => (
                    <tr key={m.ticker} className="border-t border-slate-800/70 hover:bg-slate-800/30">
                      <td className="px-4 py-2.5 font-mono text-slate-500">{i + 1}</td>
                      <td className="whitespace-nowrap px-2 py-2.5 font-medium text-slate-100">{m.outcome}</td>
                      <td className="px-3 py-2.5 text-center font-mono tabular-nums text-slate-400">{cent(m.yesBid)}</td>
                      <td className="px-3 py-2.5 text-center font-mono tabular-nums text-slate-400">{cent(m.yesAsk)}</td>
                      <td className="px-3 py-2.5 text-center font-mono tabular-nums font-bold text-amber-300">{cent(m.last)}</td>
                      <td className="px-3 py-2.5 text-right font-mono tabular-nums text-slate-400">{fmtVol(m.volume)}</td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
          </Panel>
          <p className="px-1 text-xs text-slate-600">
            Prices are in cents on Kalshi's 0–100¢ scale — a price of <span className="text-amber-300">22¢</span> means a
            ~22% implied probability. <span className="text-slate-400">Bid/Ask</span> is the current market; <span className="text-amber-300">Last</span> is the
            last trade. Sorted by highest standing bid.
          </p>
        </>
      ) : (
        <EmptyBlock
          title="No Kalshi markets open right now."
          sub="Prediction markets open and close throughout the year."
        />
      )}
    </div>
  );
}

/* ------------------------------------------------------------------ */

export default function FuturesPage() {
  const [source, setSource] = useState('books'); // 'books' | 'kalshi'

  return (
    <div className="mx-auto max-w-[1536px] space-y-6">
      <div>
        <h1 className="text-3xl font-bold">Futures</h1>
        <p className="text-sm text-slate-400">
          Next-season markets from sportsbooks (American odds) and Kalshi (prediction-market prices).
        </p>
      </div>

      <div className="inline-flex rounded-lg border border-slate-700 bg-slate-900 p-1">
        <button onClick={() => setSource('books')} className={segCls(source === 'books')}>Sportsbooks</button>
        <button onClick={() => setSource('kalshi')} className={segCls(source === 'kalshi')}>Kalshi</button>
      </div>

      {source === 'books' ? <SportsbookFutures /> : <KalshiFutures />}
    </div>
  );
}
