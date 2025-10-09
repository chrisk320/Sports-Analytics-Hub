import React, { useState, useEffect } from 'react';
import axios from 'axios';
import Header from './components/Header';
import SearchBar from './components/SearchBar';
import PlayerCard from './components/PlayerCard';
import StatsModal from './components/StatsModal';
import ChatBot from './components/ChatBot';

const API_BASE_URL = 'http://localhost:5000';

export default function App() {
  const [token, setToken] = useState(() => {
    const storedToken = localStorage.getItem('authToken');
    return storedToken ? JSON.parse(storedToken) : null;
  });
  const [user, setUser] = useState(null);

  useEffect(() => {
    if (token) {
      // Save the token to localStorage
      localStorage.setItem('authToken', JSON.stringify(token));

      // Fetch user profile
      axios.get(`https://www.googleapis.com/oauth2/v1/userinfo?access_token=${token.access_token}`, {
        headers: {
          Authorization: `Bearer ${token.access_token}`,
          Accept: 'application/json'
        }
      })
        .then(res => {
          setUser(res.data);
        })
        .catch(err => console.log(err));
    } else {
      // If token is cleared (on logout), clear the user profile and remove from localStorage
      localStorage.removeItem('authToken');
      setUser(null);
    }
  }, [token]);

  const [allPlayers, setAllPlayers] = useState([]);
  const [selectedPlayers, setSelectedPlayers] = useState([]);
  const [activePlayer, setActivePlayer] = useState(null);
  const [activePlayerData, setActivePlayerData] = useState({
    seasonAverages: null,
    recentGameLogs: [],
    displayGameLogs: [],
  });
  const [isLoading, setIsLoading] = useState(false);
  const [searchTerm, setSearchTerm] = useState('');
  const [searchResults, setSearchResults] = useState([]);
  const [allTeams, setAllTeams] = useState([]);
  const [isChatOpen, setIsChatOpen] = useState(false);
  const [activeSection, setActiveSection] = useState('nba-player-stats');

  useEffect(() => {
    if (user) {
      const fetchFavorites = async () => {
        try {
          setIsLoading(true);
          const response = await axios.get(`${API_BASE_URL}/users/${user.id}/favorites`);
          setSelectedPlayers(response.data);
        } catch (error) {
          console.error("Failed to fetch favorite players:", error);
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
        const [playersRes, teamsRes] = await Promise.all([
          axios.get(`${API_BASE_URL}/players`),
          axios.get(`${API_BASE_URL}/teams`)
        ]);
        setAllPlayers(playersRes.data);
        setAllTeams(teamsRes.data);
      } catch (error) {
        console.error("Failed to fetch initial data:", error);
      } finally {
        setIsLoading(false);
      }
    };
    fetchInitialData();
  }, []);

  const handleSearchChange = (e) => {
    const term = e.target.value;
    setSearchTerm(term);
    if (term.length > 1) {
      const filtered = allPlayers.filter(player =>
        player.full_name.toLowerCase().includes(term.toLowerCase())
      );
      setSearchResults(filtered.slice(0, 5));
    } else {
      setSearchResults([]);
    }
  };

  const handleFilterByOpponent = async (playerId, opponentAbbr) => {
    if (!playerId || !opponentAbbr) return;

    // If "All Teams" is selected, reset the display logs to the original recent games
    if (opponentAbbr === 'ALL') {
      setActivePlayerData(prevData => ({
        ...prevData,
        displayGameLogs: prevData.recentGameLogs
      }));
      return;
    }

    setIsLoading(true);
    try {
      const response = await axios.get(`${API_BASE_URL}/players/${playerId}/gamelogs/${opponentAbbr}`);
      // ** THE FIX: Only update the displayGameLogs, leave recentGameLogs untouched **
      setActivePlayerData(prevData => ({
        ...prevData,
        displayGameLogs: response.data
      }));
    } catch (error) {
      console.error(`Failed to fetch game logs against ${opponentAbbr}:`, error);
    } finally {
      setIsLoading(false);
    }
  };

  const handleAddPlayer = async (player) => {
    if (!user) {
      alert("Please sign in to add players.");
      return;
    }
    if (!selectedPlayers.find(p => p.player_id === player.player_id)) {
      setSelectedPlayers(prev => [...prev, player]);
      try {
        await axios.post(`${API_BASE_URL}/users/${user.id}/favorites`, { playerId: player.player_id });
      } catch (error) {
        console.error("Failed to save favorite:", error);
        // Optional: remove player from UI if DB save fails
        setSelectedPlayers(prev => prev.filter(p => p.player_id !== player.player_id));
      }
    }
    setSearchTerm('');
    setSearchResults([]);
  };

  const handleRemovePlayer = async (playerId) => {
    if (!user) return;

    const originalPlayers = [...selectedPlayers];
    setSelectedPlayers(prev => prev.filter(p => p.player_id !== playerId));
    try {
      await axios.delete(`${API_BASE_URL}/users/${user.id}/favorites/${playerId}`);
    } catch (error) {
      console.error("Failed to remove favorite:", error);
      setSelectedPlayers(originalPlayers); // Revert UI on error
    }
  };

  const handleSelectPlayer = async (player) => {
    setActivePlayer(player);
    setIsLoading(true);
    try {
      const [averagesRes, gameLogsRes] = await Promise.all([
        axios.get(`${API_BASE_URL}/players/${player.player_id}/season-averages`),
        axios.get(`${API_BASE_URL}/players/${player.player_id}/full-gamelogs`)
      ]);
      setActivePlayerData({
        seasonAverages: averagesRes.data,
        recentGameLogs: gameLogsRes.data,
        displayGameLogs: gameLogsRes.data,
      });
    } catch (error) {
      console.error("Failed to fetch player details:", error);
      setActivePlayerData({ seasonAverages: null, recentGameLogs: [], displayGameLogs: [] });
    } finally {
      setIsLoading(false);
    }
  };

  const handleCloseModal = () => {
    setActivePlayer(null);
    setActivePlayerData(null);
  };

  useEffect(() => {
    document.body.className = 'bg-gray-900';
    return () => { document.body.className = ''; }
  }, []);

  return (
    <div className="min-h-screen bg-gray-900 font-sans text-white flex flex-col">
      <Header isLoading={isLoading} user={user} setToken={setToken} activeSection={activeSection} setActiveSection={setActiveSection} />

      <main className="w-screen px-4 sm:px-6 lg:px-8 py-8 flex-grow">
        {activeSection === 'nba-player-stats' && (
          <div className="space-y-12">
            <SearchBar
              searchTerm={searchTerm}
              onSearchChange={handleSearchChange}
              searchResults={searchResults}
              onAddPlayer={handleAddPlayer}
            />

            <div className="w-full">
              <h2 className="text-3xl font-bold text-center mb-8">NBA Player Stats</h2>
              {selectedPlayers.length > 0 ? (
                <div className="flex flex-wrap justify-center gap-8">
                  {selectedPlayers.map(player => (
                    <PlayerCard
                      key={player.player_id}
                      player={player}
                      onSelect={handleSelectPlayer}
                      onRemove={handleRemovePlayer}
                    />
                  ))}
                </div>
              ) : (
                <div className="text-center text-gray-500 py-16 px-4 border-2 border-dashed border-gray-700 rounded-lg max-w-lg mx-auto">
                  <p className="text-lg">Your dashboard is empty.</p>
                  <p>Search for a player to add them to your list.</p>
                </div>
              )}
            </div>
          </div>
        )}

        {activeSection === 'nba-team-bets' && (
          <div className="text-center text-gray-400">NBA Team Bets (coming soon)</div>
        )}
        {activeSection === 'nfl-team-bets' && (
          <div className="text-center text-gray-400">NFL Team Bets (coming soon)</div>
        )}
        {activeSection === 'nba-player-props' && (
          <div className="text-center text-gray-400">NBA Player Props (coming soon)</div>
        )}
        {activeSection === 'nfl-player-props' && (
          <div className="text-center text-gray-400">NFL Player Props (coming soon)</div>
        )}

        {/* Chat Button */}
        <button
          onClick={() => setIsChatOpen(true)}
          className="fixed bottom-6 right-6 bg-blue-600 hover:bg-blue-700 text-white rounded-full p-4 shadow-lg transition-all duration-200 hover:scale-110 z-40"
          title="Ask AI about NBA stats"
        >
          <svg className="w-6 h-6" fill="none" stroke="currentColor" viewBox="0 0 24 24">
            <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M8 12h.01M12 12h.01M16 12h.01M21 12c0 4.418-4.03 8-9 8a9.863 9.863 0 01-4.255-.949L3 20l1.395-3.72C3.512 15.042 3 13.574 3 12c0-4.418 4.03-8 9-8s9 3.582 9 8z" />
          </svg>
        </button>
      </main>

      <StatsModal
        player={activePlayer}
        playerData={activePlayerData}
        isLoading={isLoading}
        onClose={handleCloseModal}
        allTeams={allTeams}
        onFilter={handleFilterByOpponent}
      />

      <ChatBot 
        isOpen={isChatOpen} 
        onClose={() => setIsChatOpen(false)} 
      />

      <footer className="text-center text-gray-500 py-8 mt-auto">
        <p>NBA Stats Dashboard</p>
      </footer>
    </div>
  );
}