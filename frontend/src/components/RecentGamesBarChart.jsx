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

    const chartData = data
        .map((log) => ({
            date: new Date(log.game_date).toLocaleDateString('en-US', { month: 'numeric', day: 'numeric' }),
            value: statFromLog(sport, log, market),
        }))
        .reverse();

    const hasLine = line != null && !isNaN(line);

    return (
        <ResponsiveContainer width="100%" height={300}>
            <BarChart data={chartData} margin={{ top: 5, right: 20, left: -10, bottom: 5 }}>
                <CartesianGrid strokeDasharray="3 3" stroke="#334155" />
                <XAxis dataKey="date" stroke="#94a3b8" fontSize={12} />
                <YAxis stroke="#94a3b8" fontSize={12} />
                <Tooltip
                    contentStyle={{ backgroundColor: '#0f172a', border: '1px solid #334155', borderRadius: '0.5rem' }}
                    labelStyle={{ color: '#f8fafc' }}
                    formatter={(v) => [v, marketLabel(sport, market)]}
                />
                {hasLine && (
                    <ReferenceLine
                        y={line}
                        stroke="#fbbf24"
                        strokeDasharray="4 3"
                        label={{ value: `line ${line}`, fill: '#fbbf24', fontSize: 11, position: 'right' }}
                    />
                )}
                <Bar dataKey="value" name={marketLabel(sport, market)} radius={[4, 4, 0, 0]} fill="#a855f7">
                    {hasLine &&
                        chartData.map((d, i) => (
                            <Cell key={i} fill={d.value >= line ? '#34d399' : '#64748b'} />
                        ))}
                </Bar>
            </BarChart>
        </ResponsiveContainer>
    );
};

export default RecentGamesBarChart;
