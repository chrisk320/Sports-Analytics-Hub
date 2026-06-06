import React, { useState, useEffect } from 'react';
import { Outlet } from 'react-router-dom';
import { api } from './lib/api';
import { decodeJwt } from './lib/jwt';
import { DEFAULT_BOOKS } from './lib/odds';
import Header from './components/Header';
import GameModal from './components/GameModal';
import ChatBot from './components/ChatBot';

export default function Layout() {
  const [token, setToken] = useState(() => {
    const storedToken = localStorage.getItem('authToken');
    return storedToken ? JSON.parse(storedToken) : null;
  });
  const [user, setUser] = useState(null);

  // GIS returns an ID-token credential (JWT). Decode it for the user's profile;
  // `sub` is the stable id we key favorites on. Old access_token-shaped tokens
  // (no `credential`) simply resolve to logged-out.
  useEffect(() => {
    const claims = token?.credential ? decodeJwt(token.credential) : null;
    if (claims) {
      localStorage.setItem('authToken', JSON.stringify(token));
      setUser({ id: claims.sub, name: claims.name, email: claims.email, picture: claims.picture });
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
  const [nflGames, setNflGames] = useState([]);
  const [isChatOpen, setIsChatOpen] = useState(false);
  const [activeNFLGame, setActiveNFLGame] = useState(null);
  const [activeNFLGameLines, setActiveNFLGameLines] = useState({ teamLines: [], playerProps: [] });
  const [nbaGames, setNbaGames] = useState([]);

  // Betting / watchlist UI state (shared with pages via Outlet context)
  const [pinnedPlayerId, setPinnedPlayerId] = useState(null);
  const [hoveredPlayerId, setHoveredPlayerId] = useState(null);
  const [watchlistMarket, setWatchlistMarket] = useState('PTS');
  const [selectedBooks, setSelectedBooks] = useState(DEFAULT_BOOKS);
  const [slip, setSlip] = useState(() => {
    try {
      return JSON.parse(localStorage.getItem('slip') || '[]');
    } catch {
      return [];
    }
  });

  useEffect(() => {
    localStorage.setItem('slip', JSON.stringify(slip));
  }, [slip]);

  const slipId = (p) => `${p.playerId}-${p.market}-${p.side}-${p.book}`;
  const addToSlip = (pick) =>
    setSlip((prev) => {
      const id = slipId(pick);
      if (prev.some((p) => p.id === id)) return prev;
      return [...prev, { ...pick, id }];
    });
  const removeFromSlip = (id) => setSlip((prev) => prev.filter((p) => p.id !== id));
  const clearSlip = () => setSlip([]);
  const isInSlip = (pick) => slip.some((p) => p.id === slipId(pick));

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

  useEffect(() => {
    api
      .get('/nflbets/nflgames')
      .then((res) => setNflGames(res.data))
      .catch((err) => console.error('Failed to fetch NFL games:', err));
  }, []);

  useEffect(() => {
    api
      .get('/nbabets/nbagames')
      .then((res) => setNbaGames(res.data))
      .catch((err) => console.error('Failed to fetch NBA games:', err));
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
      alert('Please sign in to add players.');
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

  const handleSelectNFLGame = async (game) => {
    setActiveNFLGame(game);
    setIsLoading(true);
    try {
      const [teamLinesRes, playerPropsRes] = await Promise.all([
        api.get(`/nflbets/nflteamlines/${game.id}`),
        api.get(`/nflbets/nflplayerprops/${game.id}`),
      ]);
      setActiveNFLGameLines({ teamLines: teamLinesRes.data, playerProps: playerPropsRes.data });
    } catch (error) {
      console.error('Failed to fetch NFL game details:', error);
      setActiveNFLGame(null);
      setActiveNFLGameLines({ teamLines: [], playerProps: [] });
    } finally {
      setIsLoading(false);
    }
  };

  const handleCloseModal = () => {
    setActiveNFLGame(null);
    setActiveNFLGameLines({ teamLines: [], playerProps: [] });
  };

  useEffect(() => {
    document.body.className = 'bg-slate-950';
    return () => {
      document.body.className = '';
    };
  }, []);

  const context = {
    // data
    allPlayers,
    allTeams,
    selectedPlayers,
    nbaGames,
    nflGames,
    user,
    isLoading,
    // search
    searchTerm,
    searchResults,
    handleSearchChange,
    handleAddPlayer,
    handleRemovePlayer,
    // NFL games still use the modal (NBA games now route to /games/:id)
    handleSelectNFLGame,
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
    <div className="min-h-screen w-full bg-slate-950 font-sans text-slate-50 flex flex-col">
      <Header isLoading={isLoading} user={user} setToken={setToken} />

      <main className="w-full px-4 sm:px-6 lg:px-8 py-8 flex-grow">
        <Outlet context={context} />

        {/* AI assistant FAB */}
        <button
          onClick={() => setIsChatOpen(true)}
          className="fixed bottom-6 right-6 bg-purple-600 hover:bg-purple-500 text-white rounded-full p-4 shadow-lg transition-all duration-200 hover:scale-110 z-40"
          title="Ask AI about NBA stats"
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

      <GameModal game={activeNFLGame} gameLines={activeNFLGameLines} isLoading={isLoading} onClose={handleCloseModal} />

      <ChatBot isOpen={isChatOpen} onClose={() => setIsChatOpen(false)} />

      <footer className="text-center text-slate-500 py-8 mt-auto">
        <p>Sports Analytics Hub</p>
      </footer>
    </div>
  );
}
