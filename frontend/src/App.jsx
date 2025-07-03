import React, { useState, useEffect } from 'react';
import axios from 'axios';
import Header from './components/Header';
import SearchBar from './components/SearchBar';
import PlayerCard from './components/PlayerCard';
import StatsModal from './components/StatsModal';

const API_BASE_URL = 'http://localhost:5000';

export default function App() {
  const [allPlayers, setAllPlayers] = useState([]);
  const [selectedPlayers, setSelectedPlayers] = useState([]);
  const [activePlayer, setActivePlayer] = useState(null);
  const [activePlayerData, setActivePlayerData] = useState(null);
  const [isLoading, setIsLoading] = useState(false);
  const [searchTerm, setSearchTerm] = useState('');
  const [searchResults, setSearchResults] = useState([]);

  useEffect(() => {
    const fetchAllPlayers = async () => {
      try {
        setIsLoading(true);
        const response = await axios.get(`${API_BASE_URL}/players`);
        setAllPlayers(response.data);
      } catch (error) {
        console.error("Failed to fetch players:", error);
      } finally {
        setIsLoading(false);
      }
    };
    fetchAllPlayers();
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

  const handleAddPlayer = (player) => {
    if (!selectedPlayers.find(p => p.player_id === player.player_id)) {
      setSelectedPlayers(prev => [...prev, player]);
    }
    setSearchTerm('');
    setSearchResults([]);
  };

  const handleRemovePlayer = (playerId) => {
    setSelectedPlayers(prev => prev.filter(p => p.player_id !== playerId));
  };

  const handleSelectPlayer = async (player) => {
    setActivePlayer(player);
    setIsLoading(true);
    try {
      const [averagesRes, gameLogsRes] = await Promise.all([
        axios.get(`${API_BASE_URL}/players/${player.player_id}/season-averages`),
        axios.get(`${API_BASE_URL}/players/${player.player_id}/gamelogs`)
      ]);
      setActivePlayerData({ 
        seasonAverages: averagesRes.data, 
        gameLogs: gameLogsRes.data 
      });
    } catch (error) {
      console.error("Failed to fetch player details:", error);
      setActivePlayerData(null);
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
      <Header isLoading={isLoading} />
      
      <main className="w-screen px-4 sm:px-6 lg:px-8 py-8 flex-grow">
        <div className="space-y-12">
          <SearchBar 
            searchTerm={searchTerm}
            onSearchChange={handleSearchChange}
            searchResults={searchResults}
            onAddPlayer={handleAddPlayer}
          />

          <div className="w-full">
            <h2 className="text-3xl font-bold text-center mb-8">My Players</h2>
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
      </main>

      <StatsModal 
        player={activePlayer} 
        playerData={activePlayerData}
        isLoading={isLoading}
        onClose={handleCloseModal} 
      />
      
      <footer className="text-center text-gray-500 py-8 mt-auto">
        <p>NBA Stats Dashboard</p>
      </footer>
    </div>
  );
}