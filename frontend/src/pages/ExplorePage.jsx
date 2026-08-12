import React, { useEffect, useMemo, useState } from 'react';
import { useOutletContext, Link } from 'react-router-dom';
import { Loader, Trophy } from 'lucide-react';
import { api } from '../lib/api';
import SearchBar from '../components/SearchBar';
import { Panel } from '../components/ui/panel';
import { useSport } from '@/context/SportContext';

// Leaderboard stats per sport. Ids must match the backend whitelist
// (LEADERBOARD_STATS_BY_SPORT in stats.controllers.js) — the backend rejects
// anything else, so these two lists have to stay in step.
const STATS_BY_SPORT = {
  nba: [
    { id: 'pts', label: 'Points', unit: '' },
    { id: 'reb', label: 'Rebounds', unit: '' },
    { id: 'ast', label: 'Assists', unit: '' },
    { id: 'stl', label: 'Steals', unit: '' },
    { id: 'blk', label: 'Blocks', unit: '' },
    { id: 'ts', label: 'True Shooting', unit: '%' },
    { id: 'usage', label: 'Usage', unit: '%' },
  ],
  nfl: [
    { id: 'pass_yds', label: 'Pass Yards', unit: '' },
    { id: 'pass_tds', label: 'Pass TDs', unit: '' },
    { id: 'rush_yds', label: 'Rush Yards', unit: '' },
    { id: 'rec', label: 'Receptions', unit: '' },
    { id: 'rec_yds', label: 'Rec Yards', unit: '' },
    { id: 'ppr', label: 'Fantasy (PPR)', unit: '' },
  ],
  // Batting and pitching are separate populations, so these leaderboards are
  // role-scoped server-side. Without that a hitter's 180 strikeouts would
  // outrank every pitcher on the strikeout board.
  mlb: [
    { id: 'hits', label: 'Hits', unit: '' },
    { id: 'home_runs', label: 'Home Runs', unit: '' },
    { id: 'total_bases', label: 'Total Bases', unit: '' },
    { id: 'rbi', label: 'RBI', unit: '' },
    { id: 'strikeouts', label: 'Strikeouts Thrown', unit: '' },
    { id: 'earned_runs', label: 'Earned Runs Allowed', unit: '' },
  ],
};

const RECAP_BY_SPORT = {
  nba: [
    { id: 'pts', label: 'Points leader' },
    { id: 'reb', label: 'Rebounds leader' },
    { id: 'ast', label: 'Assists leader' },
  ],
  nfl: [
    { id: 'pass_yds', label: 'Passing leader' },
    { id: 'rush_yds', label: 'Rushing leader' },
    { id: 'rec_yds', label: 'Receiving leader' },
  ],
  mlb: [
    { id: 'hits', label: 'Hits leader' },
    { id: 'home_runs', label: 'Home run leader' },
    { id: 'strikeouts', label: 'Strikeouts (pitching)' },
  ],
};

const segCls = (on) =>
  `rounded-md px-3 py-1.5 text-xs font-mono font-semibold uppercase tracking-wide transition ${
    on ? 'bg-purple-500 text-white' : 'text-slate-400 hover:text-slate-50'
  }`;

function StatCol({ label, a, b }) {
  const lead = a != null && b != null ? (a > b ? 'a' : b > a ? 'b' : null) : null;
  const fmt = (v) => (v == null ? '—' : v);
  return (
    <div className="grid grid-cols-3 items-center border-t border-slate-800 py-2 text-center">
      <div className={`font-mono text-lg font-bold ${lead === 'a' ? 'text-emerald-400' : 'text-slate-200'}`}>{fmt(a)}</div>
      <div className="text-xs uppercase tracking-wide text-slate-500">{label}</div>
      <div className={`font-mono text-lg font-bold ${lead === 'b' ? 'text-emerald-400' : 'text-slate-200'}`}>{fmt(b)}</div>
    </div>
  );
}

export default function ExplorePage() {
  const { allPlayers } = useOutletContext();
  const { sport, label: sportLabel } = useSport();
  // Memoized so they're stable identities in effect/memo dependency lists.
  const STATS = useMemo(() => STATS_BY_SPORT[sport] ?? [], [sport]);
  const RECAP_CATEGORIES = useMemo(() => RECAP_BY_SPORT[sport] ?? [], [sport]);

  const [seasons, setSeasons] = useState([]);
  const [season, setSeason] = useState('');
  const [stat, setStat] = useState(STATS[0]?.id);

  const [rows, setRows] = useState([]);
  // Whether this stat is a season total or a per-game rate is the server's
  // call -- it owns the SQL. Reading it back off the rows keeps the heading
  // honest instead of duplicating the aggregation table on the client.
  const aggSuffix = rows[0]?.agg === 'total' ? '' : ' per game';

  const [loading, setLoading] = useState(true);
  const [recap, setRecap] = useState({});

  // Compare panel state (local search over allPlayers — independent of favorites).
  const [term, setTerm] = useState('');
  const [results, setResults] = useState([]);
  const [compare, setCompare] = useState([]); // up to 2 { player, avgs }

  // Load available seasons; default to the latest.
  useEffect(() => {
    api
      .get('/players/seasons', { params: { sport } })
      .then((res) => {
        const list = res.data || [];
        setSeasons(list);
        setSeason(list[0] || '');
      })
      .catch((err) => console.error('Failed to fetch seasons:', err));
  }, [sport]);

  // Switching sport invalidates the selected stat (NBA 'pts' is meaningless for
  // the NFL, and the backend rejects it), so snap back to the sport's first.
  useEffect(() => {
    setStat(STATS[0]?.id);
  }, [sport]); // eslint-disable-line react-hooks/exhaustive-deps

  // Leaderboard for the selected season + stat.
  useEffect(() => {
    if (!season) return;
    let active = true;
    setLoading(true);
    api
      .get('/players/leaderboard', { params: { sport, season, stat, limit: 25 } })
      .then((res) => active && setRows(res.data || []))
      .catch((err) => console.error('Failed to fetch leaderboard:', err))
      .finally(() => active && setLoading(false));
    return () => {
      active = false;
    };
  }, [sport, season, stat]);

  // Season recap — top player in each core category.
  useEffect(() => {
    if (!season) return;
    let active = true;
    Promise.all(
      RECAP_CATEGORIES.map((c) =>
        api
          .get('/players/leaderboard', { params: { sport, season, stat: c.id, limit: 1 } })
          .then((res) => [c.id, (res.data || [])[0] || null])
          .catch(() => [c.id, null])
      )
    ).then((entries) => active && setRecap(Object.fromEntries(entries)));
    return () => {
      active = false;
    };
  }, [sport, season, RECAP_CATEGORIES]);

  const statLabel = useMemo(() => STATS.find((s) => s.id === stat) || STATS[0] || { label: '—' }, [stat, STATS]);

  const handleSearchChange = (e) => {
    const v = e.target.value;
    setTerm(v);
    if (v.length > 1) {
      setResults(
        allPlayers.filter((p) => p.full_name.toLowerCase().includes(v.toLowerCase())).slice(0, 5)
      );
    } else {
      setResults([]);
    }
  };

  const addToCompare = async (player) => {
    setTerm('');
    setResults([]);
    if (compare.some((c) => c.player.player_id === player.player_id) || compare.length >= 2) return;
    try {
      const res = await api.get(`/players/${player.player_id}/season-averages`);
      setCompare((prev) => [...prev, { player, avgs: res.data }]);
    } catch (err) {
      console.error('Failed to fetch season averages:', err);
    }
  };

  const removeFromCompare = (playerId) =>
    setCompare((prev) => prev.filter((c) => c.player.player_id !== playerId));

  const [a, b] = compare;

  return (
    <div className="mx-auto max-w-[1536px] space-y-8">
      <div>
        <h1 className="text-3xl font-bold">{sportLabel} Stats Explorer</h1>
        <p className="text-sm text-slate-400">Season leaderboards, recaps, and head-to-head comparisons from historical data.</p>
      </div>

      {/* Season recap */}
      <Panel tone="primary">
        <div className="mb-4 flex items-center gap-2">
          <Trophy className="h-5 w-5 text-amber-400" />
          <h2 className="text-lg font-semibold">{season ? `${season} leaders` : 'Season leaders'}</h2>
        </div>
        <div className="grid grid-cols-1 gap-4 sm:grid-cols-3">
          {RECAP_CATEGORIES.map((c) => {
            const r = recap[c.id];
            return (
              <div key={c.id} className="rounded-xl border border-slate-800 bg-slate-950 p-4">
                <div className="text-xs uppercase tracking-wide text-slate-500">{c.label}</div>
                {r ? (
                  <Link to={`/${sport}/players/${r.player_id}`} className="mt-2 flex items-center gap-3 hover:text-cyan-300">
                    {r.headshot_url && <img src={r.headshot_url} alt="" className="h-10 w-10 rounded-full bg-slate-800 object-cover" />}
                    <div>
                      <div className="font-semibold text-slate-100">{r.full_name}</div>
                      <div className="font-mono text-sm text-amber-300">{r.value}{r.agg === 'total' ? '' : ' per game'}</div>
                    </div>
                  </Link>
                ) : (
                  <div className="mt-2 text-sm text-slate-600">—</div>
                )}
              </div>
            );
          })}
        </div>
      </Panel>

      {/* Leaderboard */}
      <div className="space-y-4">
        <div className="flex flex-col gap-3 lg:flex-row lg:items-center lg:justify-between">
          <h2 className="text-lg font-semibold">Leaderboard — {statLabel.label}{aggSuffix}</h2>
          <div className="flex flex-wrap items-center gap-3">
            <select
              value={season}
              onChange={(e) => setSeason(e.target.value)}
              className="rounded-lg border border-slate-700 bg-slate-900 px-3 py-2 text-sm text-slate-100 focus:border-purple-500 focus:outline-none"
            >
              {seasons.map((s) => (
                <option key={s} value={s}>{s}</option>
              ))}
            </select>
            <div className="inline-flex flex-wrap rounded-lg border border-slate-700 bg-slate-900 p-1">
              {STATS.map((s) => (
                <button key={s.id} onClick={() => setStat(s.id)} className={segCls(stat === s.id)}>
                  {s.label}
                </button>
              ))}
            </div>
          </div>
        </div>

        {loading ? (
          <div className="flex h-72 items-center justify-center">
            <Loader className="h-10 w-10 animate-spin text-purple-500" />
          </div>
        ) : rows.length > 0 ? (
          <Panel padded={false}>
            <div className="overflow-x-auto">
              <table className="w-full text-sm">
                <thead>
                  <tr className="text-left text-[11px] uppercase text-slate-500">
                    <th className="px-4 py-3 font-medium">#</th>
                    <th className="px-2 py-3 font-medium">Player</th>
                    <th className="px-3 py-3 text-center font-medium">GP</th>
                    <th className="px-3 py-3 text-right font-medium">{statLabel.label}{statLabel.unit}</th>
                  </tr>
                </thead>
                <tbody>
                  {rows.map((r, i) => (
                    <tr key={r.player_id} className="border-t border-slate-800/70 hover:bg-slate-800/30">
                      <td className="px-4 py-2.5 font-mono text-slate-500">{i + 1}</td>
                      <td className="px-2 py-2.5">
                        <Link to={`/${sport}/players/${r.player_id}`} className="flex items-center gap-3 font-medium text-slate-100 hover:text-cyan-300">
                          {r.headshot_url && <img src={r.headshot_url} alt="" className="h-8 w-8 rounded-full bg-slate-800 object-cover" />}
                          {r.full_name}
                        </Link>
                      </td>
                      <td className="px-3 py-2.5 text-center font-mono tabular-nums text-slate-400">{r.games_played}</td>
                      <td className="px-3 py-2.5 text-right font-mono tabular-nums font-bold text-amber-300">{r.value}</td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
          </Panel>
        ) : (
          <div className="rounded-xl border-2 border-dashed border-slate-700 py-16 text-center text-slate-400">
            No data for this season.
          </div>
        )}
      </div>

      {/* Head-to-head compare */}
      <div className="space-y-4">
        <h2 className="text-lg font-semibold">Compare players</h2>
        <div className="max-w-md">
          <SearchBar searchTerm={term} onSearchChange={handleSearchChange} searchResults={results} onAddPlayer={addToCompare} />
        </div>

        {compare.length > 0 && (
          <Panel tone="primary">
            <div className="grid grid-cols-3 items-center pb-3 text-center">
              {[a, b].map((c, idx) =>
                c ? (
                  <div key={c.player.player_id} className={idx === 1 ? 'order-3' : 'order-1'}>
                    <Link to={`/${sport}/players/${c.player.player_id}`} className="flex flex-col items-center gap-2 hover:text-cyan-300">
                      {c.player.headshot_url && <img src={c.player.headshot_url} alt="" className="h-14 w-14 rounded-full bg-slate-800 object-cover" />}
                      <span className="font-semibold text-slate-100">{c.player.full_name}</span>
                      <span className="text-xs text-slate-500">{c.avgs?.season || ''}</span>
                    </Link>
                    <button onClick={() => removeFromCompare(c.player.player_id)} className="mt-1 text-xs text-slate-500 hover:text-rose-400">
                      remove
                    </button>
                  </div>
                ) : (
                  <div key={`empty-${idx}`} className={`text-sm text-slate-600 ${idx === 1 ? 'order-3' : 'order-1'}`}>
                    Add a player
                  </div>
                )
              )}
              <div className="order-2 text-xs uppercase tracking-wide text-slate-600">vs</div>
            </div>
            <StatCol label="PPG" a={a?.avgs?.points_avg} b={b?.avgs?.points_avg} />
            <StatCol label="RPG" a={a?.avgs?.rebounds_avg} b={b?.avgs?.rebounds_avg} />
            <StatCol label="APG" a={a?.avgs?.assists_avg} b={b?.avgs?.assists_avg} />
            <StatCol label="TS%" a={a?.avgs?.ts_pct} b={b?.avgs?.ts_pct} />
            <StatCol label="USG%" a={a?.avgs?.usg_pct} b={b?.avgs?.usg_pct} />
          </Panel>
        )}
      </div>
    </div>
  );
}
