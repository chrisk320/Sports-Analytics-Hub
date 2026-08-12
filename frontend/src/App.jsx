import React from 'react';
import { BrowserRouter, Routes, Route, Navigate, useParams } from 'react-router-dom';
import Layout from './Layout';
import HomePage from './pages/HomePage';
import GamesPage from './pages/GamesPage';
import PlayerDetailPage from './pages/PlayerDetailPage';
import GameDetailPage from './pages/GameDetailPage';
import ComparePage from './pages/ComparePage';
import ExplorePage from './pages/ExplorePage';
import FuturesPage from './pages/FuturesPage';
import { DEFAULT_SPORT } from './lib/markets';

// Preserves the rest of the path when redirecting a legacy URL, so an old
// bookmark to /players/123 lands on /nba/players/123 rather than the home page.
function LegacyRedirect({ to }) {
  const params = useParams();
  const resolved = to.replace(/:(\w+)/g, (_, name) => params[name] ?? '');
  return <Navigate to={resolved} replace />;
}

export default function App() {
  return (
    <BrowserRouter>
      <Routes>
        {/* Legacy paths from before the sport segment existed. These are listed
            BEFORE the /:sport route on purpose — React Router ranks static
            segments above dynamic ones, so /compare resolves here rather than
            matching :sport === 'compare'. */}
        <Route path="/games" element={<Navigate to={`/${DEFAULT_SPORT}/games`} replace />} />
        <Route path="/games/:gameId" element={<LegacyRedirect to={`/${DEFAULT_SPORT}/games/:gameId`} />} />
        <Route path="/players/:playerId" element={<LegacyRedirect to={`/${DEFAULT_SPORT}/players/:playerId`} />} />
        <Route path="/compare" element={<Navigate to={`/${DEFAULT_SPORT}/compare`} replace />} />
        <Route path="/explore" element={<Navigate to={`/${DEFAULT_SPORT}/explore`} replace />} />
        <Route path="/futures" element={<Navigate to={`/${DEFAULT_SPORT}/futures`} replace />} />
        {/* /nfl used to be the whole NFL product; it's now just its games list. */}
        <Route path="/nfl" element={<Navigate to="/nfl/games" replace />} />

        <Route path="/" element={<Navigate to={`/${DEFAULT_SPORT}`} replace />} />

        <Route path="/:sport" element={<Layout />}>
          <Route index element={<HomePage />} />
          <Route path="games" element={<GamesPage />} />
          <Route path="games/:gameId" element={<GameDetailPage />} />
          <Route path="players/:playerId" element={<PlayerDetailPage />} />
          <Route path="compare" element={<ComparePage />} />
          <Route path="explore" element={<ExplorePage />} />
          <Route path="futures" element={<FuturesPage />} />
        </Route>

        {/* Anything else falls back to the default sport's home. */}
        <Route path="*" element={<Navigate to={`/${DEFAULT_SPORT}`} replace />} />
      </Routes>
    </BrowserRouter>
  );
}
