import React, { useState, useEffect } from 'react'; // Import useState
import { User, X, Star, Loader } from 'lucide-react';
import RecentGamesBarChart from './RecentGamesBarChart';

const StatsModal = ({ player, playerData, isLoading, onClose }) => {
  const [activeStat, setActiveStat] = useState('pts');

  useEffect(() => {
    if (player) {
      setActiveStat('pts');
    }
  }, [player]);

  if (!player) return null;

  const statInfo = {
    pts: 'Points',
    reb: 'Rebounds',
    ast: 'Assists'
  };

  const addDefaultSrc = (ev) => {
    ev.target.src = 'https://cdn.nba.com/headshots/nba/latest/1040x760/fallback.png';
  };

  return (
    <div className="fixed inset-0 bg-black bg-opacity-75 flex items-center justify-center p-4 z-50">
      <div className="bg-gray-800 rounded-2xl shadow-2xl w-full max-w-4xl max-h-[90vh] flex flex-col text-white animate-fade-in">
        {/* Modal Header */}
        <div className="flex justify-between items-center p-6 border-b border-gray-700">
          <div className="flex items-center space-x-4">
            <div className="w-16 h-16 rounded-full bg-gray-700 border-4 border-blue-500 flex items-center justify-center overflow-hidden">
              {player.headshot_url ? (
                <img
                  src={player.headshot_url}
                  alt={player.full_name}
                  className="w-full h-full object-cover"
                  onError={addDefaultSrc}
                />
              ) : (
                <User className="w-8 h-8 text-gray-400" />
              )}
            </div>
            <div>
              <h2 className="text-3xl font-bold">{player.full_name}</h2>
            </div>
          </div>
          <div className="flex items-center space-x-4">
            <button className="p-2 rounded-full bg-yellow-500 hover:bg-yellow-400 transition-colors">
              <Star className="w-6 h-6 text-white" />
            </button>
            <button onClick={onClose} className="p-2 rounded-full bg-gray-700 hover:bg-gray-600 transition-colors">
              <X className="w-6 h-6" />
            </button>
          </div>
        </div>

        {/* Modal Body */}
        <div className="p-6 overflow-y-auto">
          {isLoading ? (
            <div className="flex justify-center items-center h-64">
              <Loader className="w-12 h-12 animate-spin text-blue-500" />
            </div>
          ) : (
            <div className="space-y-8">
              {/* Recent Games Chart Section */}
              <div>
                {/* Title now updates dynamically */}
                <h3 className="text-xl font-semibold mb-4 text-blue-400">Recent {statInfo[activeStat]} per Game</h3>
                <div className="w-full h-[300px] mb-4">
                  {/* Pass the activeStat to the chart component */}
                  <RecentGamesBarChart data={playerData?.gameLogs} stat={activeStat} />
                </div>
                {/* ** NEW: Stat selection buttons ** */}
                <div className="flex justify-center space-x-2">
                  {Object.keys(statInfo).map(statKey => (
                    <button
                      key={statKey}
                      onClick={() => setActiveStat(statKey)}
                      className={`px-4 py-2 text-sm font-semibold rounded-md transition-colors ${activeStat === statKey
                        ? 'bg-blue-500 text-white'
                        : 'bg-gray-700 text-gray-300 hover:bg-gray-600'
                        }`}
                    >
                      {statInfo[statKey]}
                    </button>
                  ))}
                </div>
              </div>

              {/* Season Averages */}
              <div>
                <h3 className="text-xl font-semibold mb-4 text-blue-400">Season Averages</h3>
                <div className="space-y-3">
                  {playerData?.seasonAverages?.map(season => (
                    <div key={season.season} className="bg-gray-700 p-4 rounded-lg">
                      <p className="text-lg font-bold">{season.season}</p>
                      <div className="grid grid-cols-2 sm:grid-cols-4 gap-2 mt-2 text-sm">
                        <p><strong>GP:</strong> {season.games_played}</p>
                        <p><strong>PTS:</strong> {season.points_avg}</p>
                        <p><strong>REB:</strong> {season.rebounds_avg}</p>
                        <p><strong>AST:</strong> {season.assists_avg}</p>
                      </div>
                    </div>
                  ))}
                </div>
              </div>
            </div>
          )}
        </div>
      </div>
    </div>
  );
};

export default StatsModal;