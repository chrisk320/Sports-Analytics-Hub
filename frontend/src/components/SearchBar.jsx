import React from 'react';
import { Search } from 'lucide-react';

const SearchBar = ({ searchTerm, onSearchChange, searchResults, onAddPlayer }) => (
  <div className="relative w-full max-w-lg mx-auto">
    <input
      type="text"
      placeholder="Search for a player to add..."
      className="w-full p-4 pl-12 text-lg bg-slate-800 border-2 border-slate-700 focus:border-purple-500 focus:outline-none focus:ring-0 rounded-lg text-slate-50 placeholder-slate-400"
      value={searchTerm}
      onChange={onSearchChange}
    />
    <Search className="absolute left-4 top-1/2 -translate-y-1/2 w-6 h-6 text-slate-400" />

    {/* Search Results Dropdown */}
    {searchResults.length > 0 && searchTerm && (
      <div className="absolute top-full mt-2 w-full bg-slate-900 border border-slate-700 rounded-lg max-h-60 overflow-y-auto z-10">
        {searchResults.map(player => (
          <div
            key={player.player_id}
            className="p-4 text-slate-50 hover:bg-purple-600 hover:text-white cursor-pointer"
            onClick={() => onAddPlayer(player)}
          >
            {player.full_name}
          </div>
        ))}
      </div>
    )}
  </div>
);

export default SearchBar;