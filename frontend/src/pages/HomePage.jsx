import React, { useEffect, useMemo, useState } from 'react';
import { useOutletContext, Link } from 'react-router-dom';
import { api } from '../lib/api';
import { computeEdges } from '../lib/odds';
import SearchBar from '../components/SearchBar';
import MarketToggle from '../components/home/MarketToggle';
import LiveTicker from '../components/home/LiveTicker';
import WatchlistGrid from '../components/home/WatchlistGrid';
import MarketDepthPanel from '../components/home/MarketDepthPanel';
import AlertsFeed from '../components/home/AlertsFeed';
import SlipCard from '../components/home/SlipCard';
import HotEdgesTable from '../components/home/HotEdgesTable';
import OffseasonBanner from '../components/OffseasonBanner';

const POLL_MS = 45000;

export default function HomePage() {
  const {
    selectedPlayers,
    nbaGames,
    seasonStatus,
    searchTerm,
    searchResults,
    handleSearchChange,
    handleAddPlayer,
    handleRemovePlayer,
    pinnedPlayerId,
    setPinnedPlayerId,
    hoveredPlayerId,
    setHoveredPlayerId,
    watchlistMarket,
    setWatchlistMarket,
    slip,
    addToSlip,
    removeFromSlip,
    clearSlip,
  } = useOutletContext();

  const isOffseason = seasonStatus && !seasonStatus.nbaInSeason;

  const [todaysProps, setTodaysProps] = useState([]);
  const [lastUpdated, setLastUpdated] = useState(null);
  const [logsByPlayerId, setLogsByPlayerId] = useState({});
  const [topScorers, setTopScorers] = useState([]);

  // Poll tonight's slate of props (skip in the offseason — nothing to fetch).
  useEffect(() => {
    if (isOffseason) return;
    let active = true;
    const load = async () => {
      try {
        const res = await api.get('/playerprops/today');
        if (active) {
          setTodaysProps(res.data || []);
          setLastUpdated(new Date());
        }
      } catch (err) {
        console.error("Failed to fetch today's props:", err);
      }
    };
    load();
    const id = setInterval(load, POLL_MS);
    return () => {
      active = false;
      clearInterval(id);
    };
  }, [isOffseason]);

  // Offseason: load a last-season scoring leaderboard preview (DB-only, no odds spend).
  useEffect(() => {
    if (!isOffseason) return;
    let active = true;
    api
      .get('/players/leaderboard', { params: { stat: 'pts', limit: 5 } })
      .then((res) => active && setTopScorers(res.data || []))
      .catch((err) => console.error('Failed to fetch leaderboard preview:', err));
    return () => {
      active = false;
    };
  }, [isOffseason]);

  // Fetch game logs for each watchlist player (for sparklines + hit rate).
  useEffect(() => {
    let cancelled = false;
    selectedPlayers.forEach(async (p) => {
      if (logsByPlayerId[p.player_id]) return;
      try {
        const res = await api.get(`/players/${p.player_id}/full-gamelogs`);
        if (!cancelled) setLogsByPlayerId((prev) => ({ ...prev, [p.player_id]: res.data || [] }));
      } catch {
        if (!cancelled) setLogsByPlayerId((prev) => ({ ...prev, [p.player_id]: [] }));
      }
    });
    return () => {
      cancelled = true;
    };
  }, [selectedPlayers, logsByPlayerId]);

  const propsByPlayerId = useMemo(() => {
    const m = new Map();
    for (const r of todaysProps) {
      if (r.player_id == null) continue;
      if (!m.has(r.player_id)) m.set(r.player_id, []);
      m.get(r.player_id).push(r);
    }
    return m;
  }, [todaysProps]);

  const edges = useMemo(() => computeEdges(todaysProps), [todaysProps]);

  const activePlayerId = useMemo(() => {
    if (hoveredPlayerId) return hoveredPlayerId;
    if (pinnedPlayerId) return pinnedPlayerId;
    const withProps = selectedPlayers.find((p) => propsByPlayerId.has(p.player_id));
    return withProps?.player_id ?? selectedPlayers[0]?.player_id ?? null;
  }, [hoveredPlayerId, pinnedPlayerId, selectedPlayers, propsByPlayerId]);

  const activePlayer = useMemo(() => {
    if (!activePlayerId) return null;
    const fav = selectedPlayers.find((p) => p.player_id === activePlayerId);
    if (fav) return fav;
    const row = (propsByPlayerId.get(activePlayerId) || [])[0];
    return row
      ? { player_id: activePlayerId, full_name: row.full_name || row.player_name, headshot_url: row.headshot_url }
      : null;
  }, [activePlayerId, selectedPlayers, propsByPlayerId]);

  const activeProps = propsByPlayerId.get(activePlayerId) || [];

  if (isOffseason) {
    return (
      <div className="mx-auto max-w-[1536px] space-y-6">
        <OffseasonBanner sport="NBA" />

        <div className="flex flex-col gap-4 lg:flex-row lg:items-center lg:justify-between">
          <h1 className="text-3xl font-bold">Offseason hub</h1>
          <div className="w-full sm:max-w-xs">
            <SearchBar
              searchTerm={searchTerm}
              onSearchChange={handleSearchChange}
              searchResults={searchResults}
              onAddPlayer={handleAddPlayer}
            />
          </div>
        </div>

        {/* Last-season scoring leaders preview */}
        {topScorers.length > 0 && (
          <div className="rounded-2xl border border-slate-800 bg-slate-900 p-5">
            <div className="mb-3 flex items-center justify-between">
              <h2 className="text-lg font-semibold">Last season's top scorers</h2>
              <Link to="/explore" className="text-sm text-purple-400 hover:text-purple-300">Full leaderboards →</Link>
            </div>
            <div className="grid grid-cols-1 gap-2 sm:grid-cols-2 lg:grid-cols-5">
              {topScorers.map((p, i) => (
                <Link
                  key={p.player_id}
                  to={`/players/${p.player_id}`}
                  className="flex items-center gap-3 rounded-xl border border-slate-800 bg-slate-950 p-3 hover:border-purple-600"
                >
                  <span className="font-mono text-slate-500">{i + 1}</span>
                  {p.headshot_url && <img src={p.headshot_url} alt="" className="h-9 w-9 rounded-full bg-slate-800 object-cover" />}
                  <div className="min-w-0">
                    <div className="truncate text-sm font-medium text-slate-100">{p.full_name}</div>
                    <div className="font-mono text-xs text-amber-300">{p.value} PPG</div>
                  </div>
                </Link>
              ))}
            </div>
          </div>
        )}

        {/* Watchlist still works off historical L10 averages */}
        <div>
          <h2 className="mb-3 text-lg font-semibold">Your watchlist</h2>
          <WatchlistGrid
            players={selectedPlayers}
            marketId={watchlistMarket}
            propsByPlayerId={propsByPlayerId}
            logsByPlayerId={logsByPlayerId}
            pinnedPlayerId={pinnedPlayerId}
            activePlayerId={activePlayerId}
            onHover={setHoveredPlayerId}
            onLeave={() => setHoveredPlayerId(null)}
            onPin={(id) => setPinnedPlayerId(id === pinnedPlayerId ? null : id)}
            onAddToSlip={addToSlip}
            onRemove={handleRemovePlayer}
          />
        </div>
      </div>
    );
  }

  return (
    <div className="mx-auto max-w-[1536px] space-y-6">
      <LiveTicker edges={edges} lastUpdated={lastUpdated} />

      {/* Title + search + market toggle */}
      <div className="flex flex-col gap-4 lg:flex-row lg:items-center lg:justify-between">
        <h1 className="text-3xl font-bold">Tonight's board</h1>
        <div className="flex flex-1 flex-col items-stretch gap-3 sm:flex-row sm:items-center sm:justify-end">
          <div className="w-full sm:max-w-xs">
            <SearchBar
              searchTerm={searchTerm}
              onSearchChange={handleSearchChange}
              searchResults={searchResults}
              onAddPlayer={handleAddPlayer}
            />
          </div>
          <MarketToggle value={watchlistMarket} onChange={setWatchlistMarket} />
        </div>
      </div>

      {/* 3-column main grid */}
      <div className="flex flex-col gap-6 xl:flex-row">
        <div className="xl:flex-[1.4]">
          <WatchlistGrid
            players={selectedPlayers}
            marketId={watchlistMarket}
            propsByPlayerId={propsByPlayerId}
            logsByPlayerId={logsByPlayerId}
            pinnedPlayerId={pinnedPlayerId}
            activePlayerId={activePlayerId}
            onHover={setHoveredPlayerId}
            onLeave={() => setHoveredPlayerId(null)}
            onPin={(id) => setPinnedPlayerId(id === pinnedPlayerId ? null : id)}
            onAddToSlip={addToSlip}
            onRemove={handleRemovePlayer}
          />
        </div>

        <div className="xl:flex-1">
          <MarketDepthPanel
            player={activePlayer}
            props={activeProps}
            marketId={watchlistMarket}
            nbaGames={nbaGames}
            onAddToSlip={addToSlip}
          />
        </div>

        <div className="space-y-6 xl:w-[320px] xl:shrink-0">
          <AlertsFeed edges={edges} gameCount={nbaGames.length} lastUpdated={lastUpdated} />
          <SlipCard slip={slip} onRemove={removeFromSlip} onClear={clearSlip} />
        </div>
      </div>

      <HotEdgesTable edges={edges} onPin={setPinnedPlayerId} />
    </div>
  );
}
