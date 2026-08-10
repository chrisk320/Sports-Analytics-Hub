import React from 'react';
import { Search } from 'lucide-react';

const SearchBar = ({ searchTerm, onSearchChange, searchResults, onAddPlayer }) => (
  <div className="relative w-full max-w-lg mx-auto">
    <input
      type="text"
      placeholder="Search for a player to add..."
      className="w-full p-4 pl-12 text-lg bg-card border-2 border-input focus:border-ring focus:outline-none focus:ring-0 rounded-lg text-foreground placeholder-muted-foreground"
      value={searchTerm}
      onChange={onSearchChange}
    />
    <Search className="absolute left-4 top-1/2 -translate-y-1/2 w-6 h-6 text-muted-foreground" />

    {/* Search Results Dropdown */}
    {searchResults.length > 0 && searchTerm && (
      <div className="absolute top-full mt-2 w-full bg-popover border border-border rounded-lg max-h-60 overflow-y-auto z-10">
        {searchResults.map(player => (
          <div
            key={player.player_id}
            className="p-4 text-foreground hover:bg-primary hover:text-primary-foreground cursor-pointer"
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