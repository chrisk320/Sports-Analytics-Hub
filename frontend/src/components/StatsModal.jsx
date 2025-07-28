import React, { useState, useEffect } from 'react'; // Import useState
import { User, X, Star, Loader } from 'lucide-react';
import RecentGamesBarChart from './RecentGamesBarChart';

const StatsModal = ({ player, playerData, isLoading, onClose, allTeams, onFilter }) => {
  const [activeStat, setActiveStat] = useState('pts');
  const [selectedOpponent, setSelectedOpponent] = useState('ALL');

  useEffect(() => {
    if (player) {
      setActiveStat('pts');
      setSelectedOpponent('ALL');
    }
  }, [player]);

  if (!player) return null;

  const currentSeason = playerData?.seasonAverages;
  const chartGameLogs = playerData?.recentGameLogs || [];
  const tableGameLogs = playerData?.displayGameLogs || [];
  const statInfo = { pts: 'Points', reb: 'Rebounds', ast: 'Assists' };

  const handleOpponentChange = (e) => {
    const opponentAbbr = e.target.value;
    setSelectedOpponent(opponentAbbr);
    onFilter(player.player_id, opponentAbbr);
  };

  return (
    <div className="fixed inset-0 bg-black bg-opacity-75 flex items-center justify-center p-4 z-50">
      <div className="bg-gray-800 rounded-2xl shadow-2xl w-full max-w-6xl max-h-[90vh] flex flex-col text-white animate-fade-in">
        {/* Modal Header */}
        <div className="flex justify-between items-center p-6 border-b border-gray-700">
          <div className="flex items-center space-x-4">
            <div className="w-20 h-20 rounded-full bg-gray-700 border-4 border-blue-500 flex-shrink-0 overflow-hidden">
              <img src={player.headshot_url} alt={player.full_name} className="w-full h-full object-cover" />
            </div>
            <div>
              <h2 className="text-4xl font-bold">{player.full_name}</h2>
              <p className="text-gray-400">{currentSeason?.season} Season Averages:
                <span className="font-bold text-white"> {currentSeason?.points_avg} PTS</span> |
                <span className="font-bold text-white"> {currentSeason?.rebounds_avg} REB</span> |
                <span className="font-bold text-white"> {currentSeason?.assists_avg} AST</span>
              </p>
            </div>
          </div>
          <div className="flex items-center space-x-2">
            <button className="p-2 rounded-full bg-yellow-500 hover:bg-yellow-400 transition-colors"><Star className="w-6 h-6 text-white" /></button>
            <button onClick={onClose} className="p-2 rounded-full bg-gray-700 hover:bg-gray-600 transition-colors"><X className="w-6 h-6" /></button>
          </div>
        </div>

        {/* Modal Body */}
        <div className="p-6 overflow-y-auto">
          {isLoading ? (
            <div className="flex justify-center items-center h-96"><Loader className="w-12 h-12 animate-spin text-blue-500" /></div>
          ) : (
            <div className="space-y-8">
              <div>
                <h3 className="text-xl font-semibold mb-4 text-blue-400">Recent {statInfo[activeStat]} per Game</h3>
                <div className="w-full h-[300px] mb-4">
                  <RecentGamesBarChart data={chartGameLogs} stat={activeStat} />
                </div>
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

              <div>
                <div className="flex justify-between items-center mb-4">
                    <h3 className="text-xl font-semibold text-blue-400">
                      {selectedOpponent === 'ALL' ? 'Recent Game Logs' : `Game Logs vs ${selectedOpponent}`}
                    </h3>
                    <div className="flex items-center space-x-2">
                        <label htmlFor="opponent-select" className="text-sm text-gray-400">Filter by Opponent:</label>
                        <select 
                          id="opponent-select"
                          value={selectedOpponent}
                          onChange={handleOpponentChange}
                          className="bg-gray-700 border border-gray-600 text-white text-sm rounded-lg focus:ring-blue-500 focus:border-blue-500 p-2"
                        >
                          <option value="ALL">All Teams</option>
                          {allTeams.map(team => (
                            <option key={team.team_abbreviation} value={team.team_abbreviation}>
                              {team.team_name}
                            </option>
                          ))}
                        </select>
                    </div>
                </div>
                <div className="overflow-x-auto">
                  <table className="w-full text-sm text-left">
                    <thead className="text-xs text-gray-400 uppercase bg-gray-700">
                      <tr>
                        <th className="px-4 py-3">Date</th>
                        <th className="px-4 py-3">Opp</th>
                        <th className="px-4 py-3 text-right">MIN</th>
                        <th className="px-4 py-3 text-right">PTS</th>
                        <th className="px-4 py-3 text-right">REB</th>
                        <th className="px-4 py-3 text-right">AST</th>
                        <th className="px-4 py-3 text-right">STL</th>
                        <th className="px-4 py-3 text-right">USG%</th>
                        <th className="px-4 py-3 text-right">TS%</th>
                        <th className="px-4 py-3 text-right">OffRtg</th>
                        <th className="px-4 py-3 text-right">DefRtg</th>
                      </tr>
                    </thead>
                    <tbody>
                      {tableGameLogs.map(log => (
                        <tr key={log.game_log_id} className="border-b border-gray-700 hover:bg-gray-700/50">
                          <td className="px-4 py-3">{new Date(log.game_date).toLocaleDateString('en-US', { year: '2-digit', month: '2-digit', day: '2-digit' })}</td>
                          <td className="px-4 py-3">{log.opponent}</td>
                          <td className="px-4 py-3 text-right">{log.min}</td>
                          <td className="px-4 py-3 text-right font-bold">{log.pts}</td>
                          <td className="px-4 py-3 text-right">{log.reb}</td>
                          <td className="px-4 py-3 text-right">{log.ast}</td>
                          <td className="px-4 py-3 text-right">{log.stl}</td>
                          <td className="px-4 py-3 text-right">{log.usage_percentage || '-'}</td>
                          <td className="px-4 py-3 text-right">{log.true_shooting_percentage || '-'}</td>
                          <td className="px-4 py-3 text-right">{log.offensive_rating || '-'}</td>
                          <td className="px-4 py-3 text-right">{log.defensive_rating || '-'}</td>
                        </tr>
                      ))}
                    </tbody>
                  </table>
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