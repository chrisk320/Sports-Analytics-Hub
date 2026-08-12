import React from 'react';
import { NavLink, useParams, useLocation, Link } from 'react-router-dom';
import { BarChart2, Loader } from 'lucide-react';
import Login from './Login.jsx';
import { buttonVariants } from '@/components/ui/button';
import { cn } from '@/lib/utils';
import { SPORTS, DEFAULT_SPORT, isSport, marketsFor } from '@/lib/markets';

// Feature sections, relative to the active sport.
//
// Previously this was a flat list where NFL sat alongside Games/Compare/Explore
// — so "Games" silently meant NBA and "NFL" meant the entire NFL product. That
// taxonomy breaks the moment a third league exists. Sport is now one axis
// (the switcher) and section is the other (this list).
const NAV = [
  { to: '', label: 'Home', end: true },
  { to: 'games', label: 'Games' },
  { to: 'compare', label: 'Compare Books' },
  { to: 'explore', label: 'Explore' },
  { to: 'futures', label: 'Futures' },
];

const linkClass = ({ isActive }) =>
  cn(
    buttonVariants({ variant: isActive ? 'default' : 'ghost' }),
    'rounded-lg px-4 py-2 h-auto font-mono text-xs uppercase tracking-wide',
    !isActive && 'text-secondary-foreground'
  );

const Header = ({ isLoading, user, setToken, authPrompt }) => {
  const { sport: sportParam } = useParams();
  const sport = isSport(sportParam) ? sportParam : DEFAULT_SPORT;
  const { pathname } = useLocation();

  // Switching sport keeps you in the same section: /nba/compare -> /mlb/compare.
  // Falling back to the sport home would lose the user's place on every switch.
  const section = pathname.split('/').slice(2).join('/');
  const sportHref = (id) => `/${id}${section ? `/${section}` : ''}`;

  return (
    <header className="bg-slate-950 text-slate-50 shadow-lg sticky top-0 z-20 border-b border-slate-800">
      <div className="container mx-auto px-4 py-4">
        <div className="flex justify-between items-center mb-4">
          <Link to={`/${sport}`} className="flex items-center space-x-2">
            <BarChart2 className="w-8 h-8 text-purple-500" />
            <div>
              <h1 className="text-2xl font-bold leading-tight">Sports Analytics Hub</h1>
              <p className="hidden text-xs text-slate-400 sm:block">
                Live odds and player props, compared across every sportsbook.
              </p>
            </div>
            {isLoading && <Loader className="w-6 h-6 animate-spin text-purple-500" />}
          </Link>
          <div className={cn('relative rounded-lg transition', authPrompt && 'ring-2 ring-purple-500/60')}>
            <Login user={user} setToken={setToken} />
            {authPrompt && (
              <div className="absolute right-0 top-full mt-2 w-56 rounded-lg border border-purple-500/40 bg-slate-900 px-3 py-2 text-xs text-slate-200 shadow-lg z-30">
                Sign in to save players to your watchlist.
              </div>
            )}
          </div>
        </div>

        {/* Sport axis */}
        <nav className="mb-3 flex justify-center">
          <div className="inline-flex rounded-lg border border-slate-700 bg-slate-900 p-1">
            {SPORTS.map((id) => {
              const active = id === sport;
              return (
                <Link
                  key={id}
                  to={sportHref(id)}
                  className={cn(
                    'rounded-md px-4 py-1.5 text-xs font-mono font-semibold uppercase tracking-wide transition',
                    active ? 'bg-purple-500 text-white' : 'text-slate-400 hover:text-slate-50'
                  )}
                >
                  {marketsFor(id).label}
                </Link>
              );
            })}
          </div>
        </nav>

        {/* Section axis, scoped to the active sport */}
        <nav className="flex justify-center">
          <div className="flex flex-wrap gap-3">
            {NAV.map(({ to, label, end }) => (
              <NavLink key={label} to={`/${sport}${to ? `/${to}` : ''}`} end={end} className={linkClass}>
                {label}
              </NavLink>
            ))}
          </div>
        </nav>
      </div>
    </header>
  );
};

export default Header;
