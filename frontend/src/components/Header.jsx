import React from 'react';
import { BarChart2, Loader } from 'lucide-react';
import Login from './Login.jsx'

const Header = ({ isLoading, user, setToken, activeSection, setActiveSection }) => (
  <header className="bg-gray-900 text-white shadow-lg sticky top-0 z-20">
    <div className="container mx-auto px-4 py-4">
      <div className="flex justify-between items-center mb-4">
        <div className="flex items-center space-x-2">
          <BarChart2 className="w-8 h-8 text-blue-400" />
          <h1 className="text-2xl font-bold tracking-tight">Sports Analytics Hub</h1>
          {isLoading && <Loader className="w-6 h-6 animate-spin text-blue-400" />}
        </div>
        <Login user={user} setToken={setToken} />
      </div>

      <nav className="flex justify-center">
        <div className="flex flex-wrap gap-3">
          <button
            onClick={() => setActiveSection('nba-player-stats')}
            className={`px-4 py-2 rounded-lg transition ${activeSection === 'nba-player-stats' ? 'bg-blue-600 text-white' : 'text-gray-300 hover:text-white hover:bg-gray-800'}`}
          >
            NBA Player Stats
          </button>
          <button
            onClick={() => setActiveSection('nba-team-bets')}
            className={`px-4 py-2 rounded-lg transition ${activeSection === 'nba-team-bets' ? 'bg-blue-600 text-white' : 'text-gray-300 hover:text-white hover:bg-gray-800'}`}
          >
            NBA Bets
          </button>
          <button
            onClick={() => setActiveSection('nfl-team-bets')}
            className={`px-4 py-2 rounded-lg transition ${activeSection === 'nfl-team-bets' ? 'bg-blue-600 text-white' : 'text-gray-300 hover:text-white hover:bg-gray-800'}`}
          >
            NFL Bets
          </button>
        </div>
      </nav>
    </div>
  </header>
);

export default Header;