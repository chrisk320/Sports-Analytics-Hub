import React from 'react';
import { User, BarChart2, Loader } from 'lucide-react';

// Added isLoading prop to show a loading indicator
const Header = ({ isLoading }) => (
  <header className="bg-gray-900 text-white p-4 shadow-lg sticky top-0 z-20">
    <div className="container mx-auto flex justify-between items-center">
      <div className="flex items-center space-x-2">
        <BarChart2 className="w-8 h-8 text-blue-400" />
        <h1 className="text-2xl font-bold tracking-tight">NBA Stats Dashboard</h1>
        {isLoading && <Loader className="w-6 h-6 animate-spin text-blue-400" />}
      </div>
      <button className="flex items-center space-x-2 bg-gray-700 hover:bg-gray-600 transition-colors px-4 py-2 rounded-lg">
        <User className="w-5 h-5" />
        <span>Sign In</span>
      </button>
    </div>
  </header>
);

export default Header;