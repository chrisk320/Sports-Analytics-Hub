import React from 'react';
import { BrowserRouter, Routes, Route } from 'react-router-dom';
import Layout from './Layout';
import HomePage from './pages/HomePage';
import GamesPage from './pages/GamesPage';
import NFLPage from './pages/NFLPage';
import PlayerDetailPage from './pages/PlayerDetailPage';
import GameDetailPage from './pages/GameDetailPage';
import ComparePage from './pages/ComparePage';
import ExplorePage from './pages/ExplorePage';
import FuturesPage from './pages/FuturesPage';

export default function App() {
  return (
    <BrowserRouter>
      <Routes>
        <Route element={<Layout />}>
          <Route index element={<HomePage />} />
          <Route path="games" element={<GamesPage />} />
          <Route path="games/:gameId" element={<GameDetailPage />} />
          <Route path="players/:playerId" element={<PlayerDetailPage />} />
          <Route path="nfl" element={<NFLPage />} />
          <Route path="compare" element={<ComparePage />} />
          <Route path="explore" element={<ExplorePage />} />
          <Route path="futures" element={<FuturesPage />} />
        </Route>
      </Routes>
    </BrowserRouter>
  );
}
