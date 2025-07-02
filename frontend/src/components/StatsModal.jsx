import React from 'react';
import { User, X, Calendar, Star } from 'lucide-react';

// Mock data for now, will be passed as props later
const MOCK_SEASON_AVERAGES = [
    { season: '2023-24', games_played: 74, points_avg: 26.4, rebounds_avg: 6.1, assists_avg: 5.1 },
    { season: '2022-23', games_played: 56, points_avg: 29.4, rebounds_avg: 6.1, assists_avg: 6.3 },
];

const MOCK_GAME_LOGS = [
    { game_date: '2024-04-14', opponent: 'UTA', pts: 23, reb: 7, ast: 8 },
    { game_date: '2024-04-12', opponent: 'NOP', pts: 33, reb: 4, ast: 5 },
    { game_date: '2024-04-11', opponent: 'POR', pts: 22, reb: 7, ast: 11 },
];

const StatsModal = ({ player, onClose }) => {
  if (!player) return null;

  return (
    <div className="fixed inset-0 bg-black bg-opacity-75 flex items-center justify-center p-4 z-50">
      <div className="bg-gray-800 rounded-2xl shadow-2xl w-full max-w-4xl max-h-[90vh] flex flex-col text-white animate-fade-in">
        {/* Modal Header */}
        <div className="flex justify-between items-center p-6 border-b border-gray-700">
          <div className="flex items-center space-x-4">
            <div className="w-16 h-16 rounded-full bg-gray-700 border-4 border-blue-500 flex items-center justify-center">
              <User className="w-8 h-8 text-gray-400" />
            </div>
            <div>
              <h2 className="text-3xl font-bold">{player.full_name}</h2>
              <p className="text-gray-400">{player.team} - {player.position}</p>
            </div>
          </div>
           <div className="flex items-center space-x-4">
             <button className="p-2 rounded-full bg-yellow-500 hover:bg-yellow-400 transition-colors">
                <Star className="w-6 h-6 text-white"/>
             </button>
             <button onClick={onClose} className="p-2 rounded-full bg-gray-700 hover:bg-gray-600 transition-colors">
                <X className="w-6 h-6"/>
             </button>
           </div>
        </div>

        {/* Modal Body */}
        <div className="p-6 overflow-y-auto">
          <div className="grid grid-cols-1 md:grid-cols-2 gap-6">
            {/* Season Averages */}
            <div>
              <h3 className="text-xl font-semibold mb-4 text-blue-400">Season Averages</h3>
              <div className="space-y-3">
                {MOCK_SEASON_AVERAGES.map(season => (
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

            {/* Recent Games */}
            <div>
              <h3 className="text-xl font-semibold mb-4 text-blue-400">Recent Games</h3>
              <div className="space-y-2">
                {MOCK_GAME_LOGS.map(log => (
                  <div key={log.game_date} className="flex justify-between items-center bg-gray-700 p-3 rounded-lg">
                    <div className="flex items-center space-x-2">
                        <Calendar className="w-4 h-4 text-gray-400"/>
                        <span>{new Date(log.game_date).toLocaleDateString()} vs {log.opponent}</span>
                    </div>
                    <div className="flex space-x-4 font-mono text-sm">
                      <span>PTS: {log.pts}</span>
                      <span>REB: {log.reb}</span>
                      <span>AST: {log.ast}</span>
                    </div>
                  </div>
                ))}
              </div>
            </div>
          </div>
        </div>
      </div>
    </div>
  );
};

export default StatsModal;