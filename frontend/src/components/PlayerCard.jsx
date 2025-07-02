import React from 'react';
import { User } from 'lucide-react';

const PlayerCard = ({ player, onSelect }) => (
  <div 
    className="bg-gray-800 rounded-lg shadow-xl p-6 flex flex-col items-center text-center cursor-pointer transform hover:scale-105 hover:bg-gray-700 transition-all duration-300"
    onClick={() => onSelect(player)}
  >
    <div className="w-24 h-24 rounded-full bg-gray-700 border-4 border-blue-500 flex items-center justify-center mb-4">
      <User className="w-12 h-12 text-gray-400" />
    </div>
    <h3 className="text-xl font-bold text-white">{player.full_name}</h3>
    <p className="text-gray-400">{player.team} - {player.position}</p>
  </div>
);

export default PlayerCard;