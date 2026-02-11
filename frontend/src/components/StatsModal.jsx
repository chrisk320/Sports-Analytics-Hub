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
      <div className="bg-slate-900 border border-slate-800 rounded-2xl shadow-2xl w-full max-w-6xl max-h-[90vh] flex flex-col text-slate-50 animate-fade-in">
        {/* Modal Header */}
        <div className="flex justify-between items-center p-6 border-b border-slate-800">
          <div className="flex items-center space-x-4">
            <div className="w-20 h-20 rounded-full bg-slate-800 border-4 border-purple-500 flex-shrink-0 overflow-hidden">
              <img src={player.headshot_url} alt={player.full_name} className="w-full h-full object-cover" />
            </div>
            <div>
              <h2 className="text-4xl font-bold">{player.full_name}</h2>
              <p className="text-slate-400">{currentSeason?.season} Season Averages:
                <span className="font-bold text-slate-50"> {currentSeason?.points_avg} PTS</span> |
                <span className="font-bold text-slate-50"> {currentSeason?.rebounds_avg} REB</span> |
                <span className="font-bold text-slate-50"> {currentSeason?.assists_avg} AST</span>
              </p>
            </div>
          </div>
          <div className="flex items-center space-x-2">
            <button className="p-2 rounded-full bg-amber-500 hover:bg-amber-400 transition-colors"><Star className="w-6 h-6 text-white" /></button>
            <button onClick={onClose} className="p-2 rounded-full bg-slate-800 hover:bg-slate-700 transition-colors"><X className="w-6 h-6" /></button>
          </div>
        </div>

        {/* Modal Body */}
        <div className="p-6 overflow-y-auto">
          {isLoading ? (
            <div className="flex justify-center items-center h-96"><Loader className="w-12 h-12 animate-spin text-purple-500" /></div>
          ) : (
            <div className="space-y-8">
              <div>
                <h3 className="text-xl font-semibold mb-4 text-purple-500">Recent {statInfo[activeStat]} per Game</h3>
                <div className="w-full h-[300px] mb-4">
                  <RecentGamesBarChart data={chartGameLogs} stat={activeStat} />
                </div>
                <div className="flex justify-center space-x-2">
                  {Object.keys(statInfo).map(statKey => (
                    <button
                      key={statKey}
                      onClick={() => setActiveStat(statKey)}
                      className={`px-4 py-2 text-sm font-semibold rounded-md transition-colors ${activeStat === statKey
                        ? 'bg-purple-600 text-white'
                        : 'bg-slate-800 text-slate-300 hover:bg-slate-700'
                        }`}
                    >
                      {statInfo[statKey]}
                    </button>
                  ))}
                </div>
              </div>

              <div>
                <div className="flex justify-between items-center mb-4">
                    <h3 className="text-xl font-semibold text-purple-500">
                      {selectedOpponent === 'ALL' ? 'Recent Game Logs' : `Game Logs vs ${selectedOpponent}`}
                    </h3>
                    <div className="flex items-center space-x-2">
                        <label htmlFor="opponent-select" className="text-sm text-slate-400">Filter by Opponent:</label>
                        <select
                          id="opponent-select"
                          value={selectedOpponent}
                          onChange={handleOpponentChange}
                          className="bg-slate-800 border border-slate-700 text-slate-50 text-sm rounded-lg focus:ring-purple-500 focus:border-purple-500 p-2"
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
                    <thead className="text-xs text-slate-400 uppercase bg-slate-800">
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
                        <tr key={log.game_log_id} className="border-b border-slate-800 hover:bg-slate-800/50">
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