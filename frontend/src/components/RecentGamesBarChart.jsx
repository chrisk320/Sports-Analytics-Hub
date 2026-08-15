import React from 'react';
import { BarChart, Bar, Cell, XAxis, YAxis, Tooltip, ResponsiveContainer, CartesianGrid, ReferenceLine } from 'recharts';
import { statFromLog } from '../lib/odds';
import { marketLabel } from '../lib/markets';
import { useSport } from '@/context/SportContext';

// Bars for one market across recent games. When a prop `line` is supplied,
// bars are colored by hit/miss and a reference line is drawn.
//
// The old `stat` prop ('pts'|'reb'|'ast') and its STAT_TO_MARKET shim are gone —
// markets are resolved per sport now, so a raw NBA column name is meaningless.

const RecentGamesBarChart = ({ data, marketId, line }) => {
    // Hooks must run before any early return, or React's hook order breaks
    // between renders once `data` arrives.
    const { sport, defaultMarket } = useSport();
    const market = marketId || defaultMarket;

    if (!data || data.length === 0) return null;

    // Add the year only when the window actually spans more than one, which
    // happens whenever the recent-form window reaches back past a season
    // boundary -- an NFL quarterback who missed time can have "last 10" cover
    // two seasons, and without the year two bars both read 12/28 with an
    // eight-month gap between them and no way to tell them apart.
    const short = (d) => d.toLocaleDateString('en-US', { month: 'numeric', day: 'numeric' });
    const dates = data.map((log) => new Date(log.game_date));
    // Show the year only when the short labels would collide. A window that
    // reaches past a season boundary -- an NFL quarterback who missed time can
    // have "last 10" cover two seasons -- otherwise renders two bars both
    // reading 12/28 with eight months between them. Testing for the collision
    // rather than for "more than one calendar year" keeps NBA alone, since a
    // normal basketball window straddles December and January without ever
    // being ambiguous.
    const labels = dates.map(short);
    const ambiguous = new Set(labels).size !== labels.length;
    const dateOpts = ambiguous
        ? { month: 'numeric', day: 'numeric', year: '2-digit' }
        : { month: 'numeric', day: 'numeric' };

    const chartData = data
        .map((log) => ({
            date: new Date(log.game_date).toLocaleDateString('en-US', dateOpts),
            value: statFromLog(sport, log, market),
        }))
        .reverse();

    const hasLine = line != null && !isNaN(line);

    return (
        <ResponsiveContainer width="100%" height={300}>
            <BarChart data={chartData} margin={{ top: 5, right: 20, left: -10, bottom: 5 }}>
                <CartesianGrid strokeDasharray="3 3" stroke="#443b34" />
                <XAxis dataKey="date" stroke="#a8a29e" fontSize={12} />
                <YAxis stroke="#a8a29e" fontSize={12} />
                <Tooltip
                    contentStyle={{ backgroundColor: '#1a1614', border: '1px solid #443b34', borderRadius: '0.5rem' }}
                    labelStyle={{ color: '#fafaf9' }}
                    formatter={(v) => [v, marketLabel(sport, market)]}
                />
                {hasLine && (
                    <ReferenceLine
                        y={line}
                        stroke="#ffd23f"
                        strokeDasharray="4 3"
                        label={{ value: `line ${line}`, fill: '#ffd23f', fontSize: 11, position: 'right' }}
                    />
                )}
                <Bar dataKey="value" name={marketLabel(sport, market)} radius={[4, 4, 0, 0]} fill="#f5a524">
                    {hasLine &&
                        chartData.map((d, i) => (
                            <Cell key={i} fill={d.value >= line ? '#34d399' : '#8a7d73'} />
                        ))}
                </Bar>
            </BarChart>
        </ResponsiveContainer>
    );
};

export default RecentGamesBarChart;
