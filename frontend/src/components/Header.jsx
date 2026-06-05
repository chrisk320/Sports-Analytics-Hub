import React from 'react';
import { NavLink } from 'react-router-dom';
import { BarChart2, Loader } from 'lucide-react';
import Login from './Login.jsx';

const NAV = [
  { to: '/', label: 'Home', end: true },
  { to: '/games', label: 'Games' },
  { to: '/compare', label: 'Compare Books' },
  { to: '/nfl', label: 'NFL' },
];

const linkClass = ({ isActive }) =>
  `px-4 py-2 rounded-lg transition ${
    isActive ? 'bg-purple-600 text-white' : 'text-slate-300 hover:text-slate-50 hover:bg-slate-800'
  }`;

const Header = ({ isLoading, user, setToken }) => (
  <header className="bg-slate-950 text-slate-50 shadow-lg sticky top-0 z-20 border-b border-slate-800">
    <div className="container mx-auto px-4 py-4">
      <div className="flex justify-between items-center mb-4">
        <NavLink to="/" className="flex items-center space-x-2">
          <BarChart2 className="w-8 h-8 text-purple-500" />
          <h1 className="text-2xl font-bold tracking-tight">Sports Analytics Hub</h1>
          {isLoading && <Loader className="w-6 h-6 animate-spin text-purple-500" />}
        </NavLink>
        <Login user={user} setToken={setToken} />
      </div>

      <nav className="flex justify-center">
        <div className="flex flex-wrap gap-3">
          {NAV.map(({ to, label, end }) => (
            <NavLink key={to} to={to} end={end} className={linkClass}>
              {label}
            </NavLink>
          ))}
        </div>
      </nav>
    </div>
  </header>
);

export default Header;
