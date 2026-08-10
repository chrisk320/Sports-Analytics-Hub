import React from 'react';
import { NavLink } from 'react-router-dom';
import { BarChart2, Loader } from 'lucide-react';
import Login from './Login.jsx';
import { buttonVariants } from '@/components/ui/button';
import { cn } from '@/lib/utils';

const NAV = [
  { to: '/', label: 'Home', end: true },
  { to: '/games', label: 'Games' },
  { to: '/compare', label: 'Compare Books' },
  { to: '/explore', label: 'Explore' },
  { to: '/futures', label: 'Futures' },
  { to: '/nfl', label: 'NFL' },
];

const linkClass = ({ isActive }) =>
  cn(
    buttonVariants({ variant: isActive ? 'default' : 'ghost' }),
    'rounded-lg px-4 py-2 h-auto font-mono text-xs uppercase tracking-wide',
    !isActive && 'text-secondary-foreground'
  );

const Header = ({ isLoading, user, setToken, authPrompt }) => (
  <header className="bg-slate-950 text-slate-50 shadow-lg sticky top-0 z-20 border-b border-slate-800">
    <div className="container mx-auto px-4 py-4">
      <div className="flex justify-between items-center mb-4">
        <NavLink to="/" className="flex items-center space-x-2">
          <BarChart2 className="w-8 h-8 text-purple-500" />
          <div>
            <h1 className="text-2xl font-bold leading-tight">Sports Analytics Hub</h1>
            <p className="hidden text-xs text-slate-400 sm:block">Live odds and player props, compared across every sportsbook.</p>
          </div>
          {isLoading && <Loader className="w-6 h-6 animate-spin text-purple-500" />}
        </NavLink>
        <div className={cn('relative rounded-lg transition', authPrompt && 'ring-2 ring-purple-500/60')}>
          <Login user={user} setToken={setToken} />
          {authPrompt && (
            <div className="absolute right-0 top-full mt-2 w-56 rounded-lg border border-purple-500/40 bg-slate-900 px-3 py-2 text-xs text-slate-200 shadow-lg z-30">
              Sign in to save players to your watchlist.
            </div>
          )}
        </div>
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
