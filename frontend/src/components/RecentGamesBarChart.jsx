import React from 'react';
import { BarChart, Bar, XAxis, YAxis, Tooltip, ResponsiveContainer, CartesianGrid } from 'recharts';

const RecentGamesBarChart = ({ data, stat }) => {
    if (!data || data.length === 0) return null;

    const chartData = data.map(log => ({
        date: new Date(log.game_date).toLocaleDateString('en-US', { month: 'numeric', day: 'numeric' }),
        value: log[stat],
    })).reverse();

    const statName = {
        pts: 'Points',
        reb: 'Rebounds',
        ast: 'Assists'
    }[stat];

    return (
        <ResponsiveContainer width="100%" height={300}>
            <BarChart data={chartData} margin={{ top: 5, right: 20, left: -10, bottom: 5 }}>
                <CartesianGrid strokeDasharray="3 3" stroke="#334155" />
                <XAxis dataKey="date" stroke="#94a3b8" fontSize={12} />
                <YAxis stroke="#94a3b8" fontSize={12} />
                <Tooltip
                    contentStyle={{
                        backgroundColor: '#0f172a',
                        border: '1px solid #334155',
                        borderRadius: '0.5rem'
                    }}
                    labelStyle={{ color: '#f8fafc' }}
                />
                <Bar dataKey="value" name={statName} fill="#a855f7" radius={[4, 4, 0, 0]} />
            </BarChart>
        </ResponsiveContainer>
    );
}

export default RecentGamesBarChart;