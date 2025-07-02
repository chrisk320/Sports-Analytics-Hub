import React from 'react';
import { User, BarChart2 } from 'lucide-react';

const Header = () => (
  <header className="bg-gray-900 text-white p-4 shadow-lg">
    <div className="container mx-auto flex justify-between items-center">
      <div className="flex items-center space-x-2">
        <BarChart2 className="w-8 h-8 text-blue-400" />
        <h1 className="text-2xl font-bold tracking-tight">NBA Stats Dashboard</h1>
      </div>
      <button className="flex items-center space-x-2 bg-gray-700 hover:bg-gray-600 transition-colors px-4 py-2 rounded-lg">
        <User className="w-5 h-5" />
        <span>Sign In</span>
      </button>
    </div>
  </header>
);

export default Header;