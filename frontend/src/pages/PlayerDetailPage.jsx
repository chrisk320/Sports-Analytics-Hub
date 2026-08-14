import React, { useEffect, useMemo, useState } from 'react';
import { useParams, useOutletContext, Link, Navigate } from 'react-router-dom';
import { User, Star, Loader, ChevronLeft } from 'lucide-react';
import { api } from '../lib/api';
import { summarizeMarket, avgFromLogs, statFromLog } from '../lib/odds';
import { marketLabel, marketsForRole, defaultMarketFor, marketOrder } from '../lib/markets';
import { useSport } from '@/context/SportContext';
import RecentGamesBarChart from '../components/RecentGamesBarChart';
import MarketToggle from '../components/home/MarketToggle';
import TonightsPropsSidebar from '../components/player/TonightsPropsSidebar';
import { Panel } from '../components/ui/panel';

const fallbackImg = (e) => {
  e.target.src = 'https://cdn.nba.com/headshots/nba/latest/1040x760/fallback.png';
};

function StatCell({ label, value, suffix = '', title }) {
  return (
    <div
      title={title}
      className={`rounded-lg bg-slate-800/60 px-3 py-2 text-center ${title ? 'cursor-help' : ''}`}
    >
      <div className="text-[10px] uppercase tracking-wide text-slate-500">{label}</div>
      <div className="font-mono tabular-nums text-lg font-bold text-slate-50">
        {value != null ? value : '—'}
        {value != null && suffix}
      </div>
    </div>
  );
}

// Basketball Reference's per-game ORtg/DRtg are INDIVIDUAL ratings (Dean Oliver:
// points produced/allowed per 100 individual possessions) — not NBA.com's
// on-court team ratings. Surfaced as tooltips + a footnote so they're not confused.
const RATING_NOTE =
  "Basketball Reference individual rating (points per 100 individual possessions) — not NBA.com's on-court team rating.";

export default function PlayerDetailPage() {
  const { playerId } = useParams();
  const { allPlayers, allTeams, addToSlip, selectedPlayers, handleAddPlayer, handleRemovePlayer } =
    useOutletContext();
  const { sport, defaultMarket, recentWindow, recentLabel } = useSport();

  const [loading, setLoading] = useState(true);
  const [fetchedPlayer, setFetchedPlayer] = useState(null);
  const [season, setSeason] = useState(null);
  const [logs, setLogs] = useState([]);
  const [props, setProps] = useState([]);
  const [gameInfo, setGameInfo] = useState(null);
  const [chartMarket, setChartMarket] = useState(defaultMarket);
  const [selectedOpp, setSelectedOpp] = useState('ALL');
  const [displayLogs, setDisplayLogs] = useState([]);
  const [oppSplit, setOppSplit] = useState(null);

  const playerFromList = useMemo(
    () => allPlayers.find((p) => String(p.player_id) === String(playerId)),
    [allPlayers, playerId]
  );
  const player = playerFromList || fetchedPlayer;

  // Self-correct when the URL names the wrong sport for this player.
  //
  // /players/:id with no sport still exists as a legacy redirect and sends
  // everything to the default sport, so a bookmark to an MLB player lands on
  // /nba/players/123 and renders basketball markets against baseball logs.
  // Rather than trust every caller to build the path correctly forever, the
  // page checks the sport the API reports for this player and redirects once.
  //
  // Reads fetchedPlayer specifically: allPlayers is already scoped to the route
  // sport, so a mismatch is exactly the case where the list lookup misses and
  // only the by-id fetch knows the truth.
  const trueSport = fetchedPlayer?.sport;
  const wrongSport = trueSport && trueSport !== sport;

  // Positions have disjoint stat sets: a tight end never throws and a pitcher
  // rarely bats, so offering (and defaulting to) the wrong market renders an
  // empty chart. Narrow the toggle and the selected market to what this player
  // actually produces.
  //
  // The role comes from the game logs rather than from `position`. In football
  // the two agree, but in baseball they do not -- position is 'SS' or 'P'
  // while the market registry is keyed on 'batter' / 'pitcher'. Reading the
  // logs also handles a two-way player correctly: someone who both bats and
  // pitches has rows under both roles and gets the union of the two market
  // sets, rather than being forced into one.
  const rolesInLogs = useMemo(() => {
    const counts = new Map();
    for (const l of logs) {
      if (l.role) counts.set(l.role, (counts.get(l.role) ?? 0) + 1);
    }
    return [...counts.entries()].sort((a, b) => b[1] - a[1]).map(([r]) => r);
  }, [logs]);

  // Fall back to position for sports whose logs carry no role (NBA writes '').
  const role = rolesInLogs[0] ?? player?.position;
  const roleMarkets = useMemo(() => {
    if (!rolesInLogs.length) return marketsForRole(sport, player?.position);
    const ids = new Set();
    for (const r of rolesInLogs) marketsForRole(sport, r).forEach((id) => ids.add(id));
    return marketOrder(sport).filter((id) => ids.has(id));
  }, [sport, rolesInLogs, player?.position]);
  useEffect(() => {
    if (roleMarkets.length && !roleMarkets.includes(chartMarket)) {
      setChartMarket(defaultMarketFor(sport, role));
    }
    // chartMarket is deliberately omitted: this only corrects a market the
    // player cannot produce, and depending on it would fight manual selection.
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [sport, role, roleMarkets]);

  // Core data fetch (keyed on playerId only)
  useEffect(() => {
    let cancelled = false;
    setLoading(true);
    setSelectedOpp('ALL');
    setChartMarket(defaultMarket);
    (async () => {
      const [seasonRes, logsRes, propsRes, gameRes, playerRes] = await Promise.all([
        api.get(`/players/${playerId}/season-averages`).catch(() => ({ data: null })),
        api.get(`/players/${playerId}/full-gamelogs`, { params: { limit: recentWindow } }).catch(() => ({ data: [] })),
        api.get(`/playerprops/${playerId}`).catch(() => ({ data: [] })),
        api.get(`/playerprops/${playerId}/game`).catch(() => ({ data: null })),
        api.get(`/players/${playerId}`).catch(() => ({ data: null })),
      ]);
      if (cancelled) return;
      setSeason(seasonRes.data);
      setLogs(logsRes.data || []);
      setDisplayLogs(logsRes.data || []);
      setProps(propsRes.data || []);
      setGameInfo(gameRes.data);
      setFetchedPlayer(playerRes.data);
      setLoading(false);
    })();
    return () => {
      cancelled = true;
    };
  }, [playerId, defaultMarket, recentWindow]);

  // Resolve tonight's opponent + fetch the player's splits vs them
  useEffect(() => {
    if (!gameInfo || !season?.team_abbreviation || !allTeams.length) {
      setOppSplit(null);
      return;
    }
    const myName = allTeams.find((t) => t.team_abbreviation === season.team_abbreviation)?.team_name;
    const oppName = gameInfo.home_team === myName ? gameInfo.away_team : gameInfo.home_team;
    const oppAbbr = allTeams.find((t) => t.team_name === oppName)?.team_abbreviation;
    if (!oppAbbr) {
      setOppSplit(null);
      return;
    }
    let cancelled = false;
    api
      .get(`/players/${playerId}/gamelogs/${oppAbbr}`)
      .then((res) => !cancelled && setOppSplit({ opp: oppAbbr, logs: res.data || [] }))
      .catch(() => !cancelled && setOppSplit({ opp: oppAbbr, logs: [] }));
    return () => {
      cancelled = true;
    };
  }, [gameInfo, season, allTeams, playerId]);

  const handleOpp = async (e) => {
    const opp = e.target.value;
    setSelectedOpp(opp);
    if (opp === 'ALL') {
      setDisplayLogs(logs);
      return;
    }
    try {
      const res = await api.get(`/players/${playerId}/gamelogs/${opp}`);
      setDisplayLogs(res.data || []);
    } catch {
      setDisplayLogs([]);
    }
  };

  // Placed after every hook, like the invalid-sport guard in Layout: an early
  // return above them would break the Rules of Hooks.
  if (wrongSport) {
    return <Navigate to={`/${trueSport}/players/${playerId}`} replace />;
  }

  const isFav = selectedPlayers.some((p) => String(p.player_id) === String(playerId));
  const toggleFav = () => {
    if (!player) return;
    isFav ? handleRemovePlayer(player.player_id) : handleAddPlayer(player);
  };

  const chartSummary = summarizeMarket(sport, props, chartMarket);
  const chartLine = chartSummary?.line ?? null;
  const last10 = logs.slice(0, recentWindow);
  // Label the sample that is actually on screen, not the configured maximum.
  // The server caps the window at the player's latest season, so a short or
  // young season returns fewer games -- Joe Burrow's 2025 was 8. Badging that
  // "L10" would overstate the base every hit rate and average is computed on.
  const windowLabel = last10.length ? `L${last10.length}` : recentLabel;
  const l10avg = avgFromLogs(sport, last10, chartMarket);
  const oppAvg = oppSplit ? avgFromLogs(sport, oppSplit.logs, chartMarket) : null;

  const addHeadlineToSlip = () => {
    const s = summarizeMarket(sport, props, defaultMarketFor(sport, role)) || summarizeMarket(sport, props, chartMarket);
    if (!s?.bestOver || !player) return;
    addToSlip({
      playerId: player.player_id,
      playerName: player.full_name,
      market: s.marketId,
      side: 'over',
      line: s.line,
      book: s.bestOver.bookmaker,
      price: s.bestOver.over_odds,
    });
  };

  if (loading) {
    return (
      <div className="flex h-96 items-center justify-center">
        <Loader className="h-10 w-10 animate-spin text-purple-500" />
      </div>
    );
  }

  if (!player) {
    return (
      <div className="mx-auto max-w-3xl py-20 text-center text-slate-400">
        <p>Player not found.</p>
        <Link to={`/${sport}`} className="mt-4 inline-block text-cyan-400 hover:text-cyan-300">
          ← Back to dashboard
        </Link>
      </div>
    );
  }

  return (
    <div className="mx-auto max-w-[1536px] space-y-6">
      {/* Breadcrumb */}
      <div className="flex items-center gap-2 text-sm text-slate-400">
        <Link to={`/${sport}`} className="flex items-center gap-1 hover:text-slate-200">
          <ChevronLeft className="h-4 w-4" /> <Star className="h-3.5 w-3.5" /> My players
        </Link>
        <span className="text-slate-600">/</span>
        <span className="text-slate-200">{player.full_name}</span>
      </div>

      {/* Hero */}
      <Panel tone="primary">
        <div className="flex flex-col gap-6 lg:flex-row lg:items-center">
          <div className="flex items-center gap-4">
            <div className="h-28 w-28 shrink-0 overflow-hidden rounded-full border-4 border-purple-500 bg-slate-800 flex items-center justify-center">
              {player.headshot_url ? (
                <img src={player.headshot_url} alt={player.full_name} className="h-full w-full object-cover" onError={fallbackImg} />
              ) : (
                <User className="h-14 w-14 text-slate-400" />
              )}
            </div>
            <div>
              <h1 className="text-3xl font-bold">{player.full_name}</h1>
              <p className="text-slate-400">
                {season?.team_abbreviation || player.team_abbreviation || '—'}
                {season?.season ? ` · ${season.season}` : ''}
                {season?.games_played ? ` · ${season.games_played} GP` : ''}
              </p>
              {gameInfo && (
                <p className="mt-1 text-xs text-amber-300">Tonight: {gameInfo.away_team} @ {gameInfo.home_team}</p>
              )}
            </div>
          </div>

          <div className="flex-1" />

          <div className="flex flex-col items-stretch gap-2 sm:flex-row sm:items-center">
            <button
              onClick={addHeadlineToSlip}
              disabled={!summarizeMarket(sport, props, defaultMarket)?.bestOver}
              className="rounded-lg bg-purple-500 px-4 py-2 text-sm font-semibold text-white transition hover:bg-purple-400 disabled:cursor-not-allowed disabled:opacity-40"
            >
              ＋ slip
            </button>
            <button
              onClick={toggleFav}
              className={`flex items-center justify-center gap-1.5 rounded-lg px-4 py-2 text-sm font-semibold transition ${
                isFav ? 'bg-amber-500 text-white hover:bg-amber-400' : 'bg-slate-800 text-slate-200 hover:bg-slate-700'
              }`}
            >
              <Star className={`h-4 w-4 ${isFav ? 'fill-current' : ''}`} /> {isFav ? 'Favorited' : 'Favorite'}
            </button>
          </div>
        </div>

        {/* Stat strip */}
        <div className="mt-5 grid grid-cols-3 gap-2 sm:grid-cols-4 lg:grid-cols-7">
          {sport === 'nba' ? (
            <>
              <StatCell label="PTS" value={season?.points_avg} />
              <StatCell label="REB" value={season?.rebounds_avg} />
              <StatCell label="AST" value={season?.assists_avg} />
              <StatCell label="STL" value={season?.steals_avg} />
              <StatCell label="TS%" value={season?.ts_pct} />
              <StatCell label="USG%" value={season?.usg_pct} />
              <StatCell label="ORtg" value={season?.off_rating} title={RATING_NOTE} />
            </>
          ) : (
            // Other sports have no season-averages endpoint yet (it computes
            // basketball columns), so derive per-game averages for the markets
            // this player's position actually produces. Showing the NBA strip
            // here rendered seven empty cells, which reads as broken data.
            roleMarkets.map((id) => (
              <StatCell
                key={id}
                label={`${marketLabel(sport, id)} ${windowLabel}`}
                value={avgFromLogs(sport, logs, id)?.toFixed(1)}
                title={`Average over the last ${last10.length} games. Season totals are not yet computed for ${sport.toUpperCase()}.`}
              />
            ))
          )}
        </div>
      </Panel>

      {/* Body: chart + logs (main) | props + matchup (sidebar) */}
      <div className="flex flex-col gap-6 xl:flex-row">
        <div className="min-w-0 flex-1 space-y-6">
          {/* Chart card */}
          <Panel tone="primary">
            <div className="mb-4 flex flex-wrap items-center justify-between gap-3">
              <div>
                <h3 className="font-bold text-slate-50">Last {last10.length} games · {marketLabel(sport, chartMarket)}</h3>
                <p className="text-xs text-slate-500">
                  {windowLabel} avg <span className="font-mono tabular-nums text-slate-300">{l10avg != null ? l10avg.toFixed(1) : '—'}</span>
                  {oppAvg != null && (
                    <> · vs {oppSplit.opp} <span className="font-mono tabular-nums text-slate-300">{oppAvg.toFixed(1)}</span></>
                  )}
                  {chartLine != null && (
                    <> · line <span className="font-mono tabular-nums text-amber-300">{chartLine}</span></>
                  )}
                </p>
              </div>
              <MarketToggle value={chartMarket} onChange={setChartMarket} options={roleMarkets} />
            </div>
            <RecentGamesBarChart data={last10} marketId={chartMarket} line={chartLine} />
          </Panel>

          {/* Game logs table */}
          <Panel tone="primary">
            <div className="mb-4 flex flex-wrap items-center justify-between gap-3">
              <h3 className="font-bold text-slate-50">
                {selectedOpp === 'ALL' ? 'Recent game logs' : `Game logs vs ${selectedOpp}`}
              </h3>
              <div className="flex items-center gap-2">
                <label htmlFor="opp" className="text-xs text-slate-400">Opponent</label>
                <select
                  id="opp"
                  value={selectedOpp}
                  onChange={handleOpp}
                  className="rounded-lg border border-slate-700 bg-slate-800 p-2 text-sm text-slate-50 focus:border-purple-500 focus:outline-none"
                >
                  <option value="ALL">All teams</option>
                  {allTeams.map((t) => (
                    <option key={t.team_abbreviation} value={t.team_abbreviation}>{t.team_name}</option>
                  ))}
                </select>
              </div>
            </div>
            <div className="overflow-x-auto">
              <table className="w-full text-sm">
                <thead>
                  <tr className="text-left text-[11px] uppercase text-slate-500">
                    <th className="px-3 py-2 font-medium">Date</th>
                    <th className="px-3 py-2 font-medium">Opp</th>
                    {sport === 'nba' ? (
                      <>
                        <th className="px-3 py-2 text-right font-medium">MIN</th>
                        <th className="px-3 py-2 text-right font-medium">PTS</th>
                        <th className="px-3 py-2 text-right font-medium">REB</th>
                        <th className="px-3 py-2 text-right font-medium">AST</th>
                        <th className="px-3 py-2 text-right font-medium">STL</th>
                        <th className="px-3 py-2 text-right font-medium">USG%</th>
                        <th className="px-3 py-2 text-right font-medium">TS%</th>
                        <th className="px-3 py-2 text-right font-medium">
                          <span title={RATING_NOTE} className="cursor-help underline decoration-dotted decoration-slate-600 underline-offset-2">ORtg</span>
                        </th>
                        <th className="px-3 py-2 text-right font-medium">
                          <span title={RATING_NOTE} className="cursor-help underline decoration-dotted decoration-slate-600 underline-offset-2">DRtg</span>
                        </th>
                      </>
                    ) : (
                      // Outside basketball the advanced-metric columns do not
                      // exist, so the table follows the same market registry
                      // that drives the chart and the toggle.
                      roleMarkets.map((id) => (
                        <th key={id} className="px-3 py-2 text-right font-medium">{marketLabel(sport, id)}</th>
                      ))
                    )}
                  </tr>
                </thead>
                <tbody className="font-mono tabular-nums">
                  {displayLogs.map((log) => (
                    <tr key={log.game_log_id} className="border-t border-slate-800/70 hover:bg-slate-800/40">
                      <td className="px-3 py-2 font-sans text-slate-300">
                        {new Date(log.game_date).toLocaleDateString('en-US', { month: '2-digit', day: '2-digit', year: '2-digit' })}
                      </td>
                      <td className="px-3 py-2 font-sans text-slate-300">{log.opponent}</td>
                      {sport === 'nba' ? (
                        <>
                          <td className="px-3 py-2 text-right text-slate-400">{log.min}</td>
                          <td className="px-3 py-2 text-right font-bold text-slate-50">{log.pts}</td>
                          <td className="px-3 py-2 text-right text-slate-200">{log.reb}</td>
                          <td className="px-3 py-2 text-right text-slate-200">{log.ast}</td>
                          <td className="px-3 py-2 text-right text-slate-200">{log.stl}</td>
                          <td className="px-3 py-2 text-right text-slate-400">{log.usage_percentage ?? '\u2014'}</td>
                          <td className="px-3 py-2 text-right text-slate-400">{log.true_shooting_percentage ?? '\u2014'}</td>
                          <td className="px-3 py-2 text-right text-slate-400">{log.offensive_rating ?? '\u2014'}</td>
                          <td className="px-3 py-2 text-right text-slate-400">{log.defensive_rating ?? '\u2014'}</td>
                        </>
                      ) : (
                        roleMarkets.map((id, i) => (
                          <td key={id} className={`px-3 py-2 text-right ${i === 0 ? 'font-bold text-slate-50' : 'text-slate-200'}`}>
                            {statFromLog(sport, log, id) ?? '\u2014'}
                          </td>
                        ))
                      )}
                    </tr>
                  ))}
                </tbody>
              </table>
              {displayLogs.length === 0 && (
                <p className="py-6 text-center text-sm text-slate-500">No games found{selectedOpp !== 'ALL' ? ` vs ${selectedOpp}` : ''}.</p>
              )}
            </div>
            <p className="mt-3 text-[11px] leading-snug text-slate-500">
              ORtg/DRtg are Basketball Reference <span className="text-slate-400">individual</span> ratings (points
              produced/allowed per 100 individual possessions) — not NBA.com's on-court team ratings, so they read
              differently than the numbers on nba.com.
            </p>
          </Panel>
        </div>

        {/* Sidebar */}
        <div className="space-y-6 xl:w-[360px] xl:shrink-0">
          <TonightsPropsSidebar
            playerId={player.player_id}
            playerName={player.full_name}
            props={props}
            logs={logs}
            gameInfo={gameInfo}
            onAddToSlip={addToSlip}
          />

          <Panel>
            <h3 className="mb-2 font-bold text-slate-50">Matchup</h3>
            {gameInfo && oppSplit ? (
              <div className="text-sm text-slate-300">
                <p className="text-slate-400">
                  vs <span className="font-semibold text-slate-100">{oppSplit.opp}</span> · last {oppSplit.logs.length} meetings
                </p>
                {oppSplit.logs.length > 0 ? (
                  <div className="mt-2 grid grid-cols-3 gap-2">
                    {roleMarkets.slice(0, 3).map((id) => (
                      <StatCell
                        key={id}
                        label={marketLabel(sport, id)}
                        value={avgFromLogs(sport, oppSplit.logs, id)?.toFixed(1)}
                      />
                    ))}
                  </div>
                ) : (
                  <p className="mt-2 text-xs text-slate-500">No prior meetings on record this season.</p>
                )}
              </div>
            ) : (
              <p className="text-sm text-slate-500">No game scheduled — matchup splits appear on game days.</p>
            )}
          </Panel>
        </div>
      </div>
    </div>
  );
}
