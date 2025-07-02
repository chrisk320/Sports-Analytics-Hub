import React from 'react';
import { Search } from 'lucide-react';

const SearchBar = () => (
  <div className="relative w-full max-w-lg mx-auto">
    <input
      type="text"
      placeholder="Search for a player..."
      className="w-full p-4 pl-12 text-lg bg-gray-700 border-2 border-transparent focus:border-blue-500 focus:outline-none focus:ring-0 rounded-lg text-white placeholder-gray-400"
    />
    <Search className="absolute left-4 top-1/2 -translate-y-1/2 w-6 h-6 text-gray-400" />
  </div>
);

export default SearchBar;