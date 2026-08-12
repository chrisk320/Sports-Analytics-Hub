import React, { useState, useEffect } from 'react';
import axios from 'axios';
import { Outlet, useParams, Navigate } from 'react-router-dom';
import { api } from './lib/api';
import { DEFAULT_BOOKS } from './lib/odds';
import Header from './components/Header';
import ChatBot from './components/ChatBot';
import { SportProvider } from './context/SportContext';
import { SPORTS, DEFAULT_SPORT, isSport } from './lib/markets';

export default function Layout() {
  // The sport for this whole subtree, from the /:sport route segment.
  const { sport: sportParam } = useParams();
  const sport = isSport(sportParam) ? sportParam : null;

  const [token, setToken] = useState(() => {
    const storedToken = localStorage.getItem('authToken');
    return storedToken ? JSON.parse(storedToken) : null;
  });
  const [user, setUser] = useState(null);

  useEffect(() => {
    if (token) {
      localStorage.setItem('authToken', JSON.stringify(token));
      axios
        .get(`https://www.googleapis.com/oauth2/v1/userinfo?access_token=${token.access_token}`, {
          headers: { Authorization: `Bearer ${token.access_token}`, Accept: 'application/json' },
        })
        .then((res) => setUser(res.data))
        .catch((err) => console.log(err));
    } else {
      localStorage.removeItem('authToken');
      setUser(null);
    }
  }, [token]);

  const [allPlayers, setAllPlayers] = useState([]);
  const [selectedPlayers, setSelectedPlayers] = useState([]);
  const [isLoading, setIsLoading] = useState(false);
  const [searchTerm, setSearchTerm] = useState('');
  const [searchResults, setSearchResults] = useState([]);
  const [allTeams, setAllTeams] = useState([]);
  const [isChatOpen, setIsChatOpen] = useState(false);
  const [authPrompt, setAuthPrompt] = useState(false);
  // One entry per configured sport, so adding a league needs no new state.
  const [gamesBySport, setGamesBySport] = useState(() =>
    Object.fromEntries(SPORTS.map((s) => [s, []]))
  );

  // Betting / watchlist UI state (shared with pages via Outlet context)
  const [pinnedPlayerId, setPinnedPlayerId] = useState(null);
  const [hoveredPlayerId, setHoveredPlayerId] = useState(null);
  const [watchlistMarket, setWatchlistMarket] = useState('PTS');
  const [selectedBooks, setSelectedBooks] = useState(DEFAULT_BOOKS);
  const [slip, setSlip] = useState(() => {
    try {
      const stored = JSON.parse(localStorage.getItem('slip') || '[]');
      // One-time migration: picks saved before the slip was sport-aware have no
      // `sport` and an id without it. Everything that existed then was NBA.
      return stored.map((p) =>
        p.sport ? p : { ...p, sport: DEFAULT_SPORT, id: `${DEFAULT_SPORT}-${p.id}` }
      );
    } catch {
      return [];
    }
  });

  useEffect(() => {
    localStorage.setItem('slip', JSON.stringify(slip));
  }, [slip]);

  // Sport is part of the key: player ids are only unique WITHIN a sport, so an
  // NBA player 23 and an MLB player 23 would otherwise collide in the slip.
  const slipId = (p) => `${p.sport}-${p.playerId}-${p.market}-${p.side}-${p.book}`;
  const addToSlip = (pick) =>
    setSlip((prev) => {
      const withSport = { sport, ...pick };
      const id = slipId(withSport);
      if (prev.some((p) => p.id === id)) return prev;
      return [...prev, { ...withSport, id }];
    });
  const removeFromSlip = (id) => setSlip((prev) => prev.filter((p) => p.id !== id));
  const clearSlip = () => setSlip([]);
  const isInSlip = (pick) => slip.some((p) => p.id === slipId({ sport, ...pick }));

  useEffect(() => {
    if (user) {
      const fetchFavorites = async () => {
        try {
          setIsLoading(true);
          const response = await api.get(`/users/${user.id}/favorites`);
          setSelectedPlayers(response.data);
        } catch (error) {
          console.error('Failed to fetch favorite players:', error);
        } finally {
          setIsLoading(false);
        }
      };
      fetchFavorites();
    }
  }, [user]);

  useEffect(() => {
    const fetchInitialData = async () => {
      setIsLoading(true);
      try {
        const [playersRes, teamsRes] = await Promise.all([api.get('/players'), api.get('/teams')]);
        setAllPlayers(playersRes.data);
        setAllTeams(teamsRes.data);
      } catch (error) {
        console.error('Failed to fetch initial data:', error);
      } finally {
        setIsLoading(false);
      }
    };
    fetchInitialData();
  }, []);

  // Games for every sport. /bets/:sport/games is backed by the Odds API's
  // /events endpoint, which costs 0 credits, so fetching all three is free.
  useEffect(() => {
    let cancelled = false;
    SPORTS.forEach((s) => {
      api
        .get(`/bets/${s}/games`)
        .then((res) => !cancelled && setGamesBySport((prev) => ({ ...prev, [s]: res.data || [] })))
        .catch((err) => console.error(`Failed to fetch ${s} games:`, err));
    });
    return () => {
      cancelled = true;
    };
  }, []);

  const handleSearchChange = (e) => {
    const term = e.target.value;
    setSearchTerm(term);
    if (term.length > 1) {
      const filtered = allPlayers.filter((player) =>
        player.full_name.toLowerCase().includes(term.toLowerCase())
      );
      setSearchResults(filtered.slice(0, 5));
    } else {
      setSearchResults([]);
    }
  };

  const handleAddPlayer = async (player) => {
    if (!user) {
      setAuthPrompt(true);
      setTimeout(() => setAuthPrompt(false), 4000);
      return;
    }
    if (!selectedPlayers.find((p) => p.player_id === player.player_id)) {
      setSelectedPlayers((prev) => [...prev, player]);
      try {
        await api.post(`/users/${user.id}/favorites`, { playerId: player.player_id });
      } catch (error) {
        console.error('Failed to save favorite:', error);
        setSelectedPlayers((prev) => prev.filter((p) => p.player_id !== player.player_id));
      }
    }
    setSearchTerm('');
    setSearchResults([]);
  };

  const handleRemovePlayer = async (playerId) => {
    if (!user) return;
    const originalPlayers = [...selectedPlayers];
    setSelectedPlayers((prev) => prev.filter((p) => p.player_id !== playerId));
    try {
      await api.delete(`/users/${user.id}/favorites/${playerId}`);
    } catch (error) {
      console.error('Failed to remove favorite:', error);
      setSelectedPlayers(originalPlayers);
    }
  };

  useEffect(() => {
    document.body.className = 'bg-slate-950';
    return () => {
      document.body.className = '';
    };
  }, []);

  // An unrecognized /:sport (typo, stale link) redirects rather than rendering
  // a broken page. Placed after every hook so hook order stays stable — an
  // early return above them would break the Rules of Hooks.
  if (!sport) return <Navigate to={`/${DEFAULT_SPORT}`} replace />;

  // Season detection: with no upcoming games (offseason), the live-data pages
  // are empty. Derived from the games already fetched — no extra API spend.
  const seasonStatus = {
    // Per-sport, plus the flags the existing pages already read.
    bySport: Object.fromEntries(SPORTS.map((s) => [s, gamesBySport[s].length > 0])),
    inSeason: gamesBySport[sport].length > 0,
  };

  const context = {
    // data
    allPlayers,
    allTeams,
    selectedPlayers,
    // The active sport's games. Pages read `games`; `gamesBySport` is there for
    // anything that needs the whole picture (e.g. a cross-sport summary).
    games: gamesBySport[sport],
    gamesBySport,
    seasonStatus,
    user,
    isLoading,
    // search
    searchTerm,
    searchResults,
    handleSearchChange,
    handleAddPlayer,
    handleRemovePlayer,
    // betting / watchlist
    pinnedPlayerId,
    setPinnedPlayerId,
    hoveredPlayerId,
    setHoveredPlayerId,
    watchlistMarket,
    setWatchlistMarket,
    selectedBooks,
    setSelectedBooks,
    slip,
    addToSlip,
    removeFromSlip,
    clearSlip,
    isInSlip,
  };

  return (
    <SportProvider sport={sport}>
    <div className="min-h-screen w-full bg-slate-950 font-sans text-slate-50 flex flex-col">
      <Header isLoading={isLoading} user={user} setToken={setToken} authPrompt={authPrompt} />

      <main className="w-full px-4 sm:px-6 lg:px-8 py-8 flex-grow">
        <Outlet context={context} />

        {/* AI assistant FAB */}
        <button
          onClick={() => setIsChatOpen(true)}
          className="fixed bottom-6 right-6 bg-purple-500 hover:bg-purple-400 text-white rounded-full p-4 shadow-lg transition-all duration-200 hover:scale-110 z-40"
          title="Ask AI about player stats"
        >
          <svg className="w-6 h-6" fill="none" stroke="currentColor" viewBox="0 0 24 24">
            <path
              strokeLinecap="round"
              strokeLinejoin="round"
              strokeWidth={2}
              d="M8 12h.01M12 12h.01M16 12h.01M21 12c0 4.418-4.03 8-9 8a9.863 9.863 0 01-4.255-.949L3 20l1.395-3.72C3.512 15.042 3 13.574 3 12c0-4.418 4.03-8 9-8s9 3.582 9 8z"
            />
          </svg>
        </button>
      </main>

      <ChatBot isOpen={isChatOpen} onClose={() => setIsChatOpen(false)} />

      <footer className="text-center text-slate-500 py-8 mt-auto">
        <p>Sports Analytics Hub</p>
      </footer>
    </div>
    </SportProvider>
  );
}
