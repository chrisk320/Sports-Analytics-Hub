import React from 'react';
import { User, X } from 'lucide-react';

const PlayerCard = ({ player, onSelect, onRemove }) => (
  <div className="bg-gray-800 rounded-lg shadow-xl p-6 flex flex-col items-center text-center relative group w-64 transform hover:scale-105 transition-transform duration-300">
    <button 
      onClick={(e) => { e.stopPropagation(); onRemove(player.player_id); }}
      className="absolute top-2 right-2 p-1 bg-red-600 rounded-full text-white opacity-0 group-hover:opacity-100 transition-opacity"
      aria-label="Remove Player"
    >
      <X className="w-4 h-4" />
    </button>
    <div 
      className="cursor-pointer w-full h-full flex flex-col items-center"
      onClick={() => onSelect(player)}
    >
      <div className="w-24 h-24 rounded-full bg-gray-700 border-4 border-blue-500 flex items-center justify-center mb-4">
        <User className="w-12 h-12 text-gray-400" />
      </div>
      <div className="h-14 flex items-center justify-center">
        <h3 className="text-xl font-bold text-white leading-tight">{player.full_name}</h3>
      </div>
    </div>
  </div>
);

export default PlayerCard;