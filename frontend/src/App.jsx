import React, { useState, useEffect } from 'react';
import Header from './components/Header';
import SearchBar from './components/SearchBar';
import PlayerCard from './components/PlayerCard';
import StatsModal from './components/StatsModal';
import './App.css'

const MOCK_PLAYERS = [
  { player_id: 201939, full_name: 'Stephen Curry', team: 'GSW', position: 'G' },
  { player_id: 2544, full_name: 'LeBron James', team: 'LAL', position: 'F' },
  { player_id: 203999, full_name: 'Nikola Jokic', team: 'DEN', position: 'C' },
];

export default function App() {
  const [selectedPlayers, setSelectedPlayers] = useState(MOCK_PLAYERS);
  const [activePlayer, setActivePlayer] = useState(null);

  const handleSelectPlayer = (player) => {
    setActivePlayer(player);
  };

  const handleCloseModal = () => {
    setActivePlayer(null);
  };

  useEffect(() => {
    document.body.className = 'bg-gray-900';
    return () => { document.body.className = ''; }
  }, []);

  return (
    <div className="min-h-screen bg-gray-900 font-sans">
      <Header />

      <main className="container mx-auto p-4 md:p-8">
        <div className="space-y-8">
          <SearchBar />

          <div>
            <h2 className="text-2xl font-bold text-white mb-4">My Players</h2>
            <div className="grid grid-cols-1 sm:grid-cols-2 md:grid-cols-3 lg:grid-cols-4 gap-6">
              {selectedPlayers.map(player => (
                <PlayerCard key={player.player_id} player={player} onSelect={handleSelectPlayer} />
              ))}
            </div>
          </div>
        </div>
      </main>

      <StatsModal player={activePlayer} onClose={handleCloseModal} />

      <footer className="text-center text-gray-500 py-8 mt-8">
        <p>NBA Stats Dashboard</p>
      </footer>
    </div>
  );
}
