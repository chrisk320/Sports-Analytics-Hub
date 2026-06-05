import React from 'react';
import { BarChart, Bar, Cell, ReferenceLine, ResponsiveContainer } from 'recharts';

// Compact last-N bar chart for a watchlist card. Bars that cleared the line
// are emerald, misses are slate. Optional reference line marks the prop line.
export default function MiniSparkline({ values, line, height = 44 }) {
  if (!values || values.length === 0) {
    return <div className="text-xs text-slate-600" style={{ height }} />;
  }
  const data = values.map((v, i) => ({ i, v }));

  return (
    <ResponsiveContainer width="100%" height={height}>
      <BarChart data={data} margin={{ top: 2, right: 0, left: 0, bottom: 0 }} barCategoryGap={2}>
        {line != null && (
          <ReferenceLine y={line} stroke="#fbbf24" strokeDasharray="3 2" strokeWidth={1} />
        )}
        <Bar dataKey="v" radius={[2, 2, 0, 0]} isAnimationActive={false}>
          {data.map((d) => (
            <Cell key={d.i} fill={line != null && d.v >= line ? '#34d399' : '#475569'} />
          ))}
        </Bar>
      </BarChart>
    </ResponsiveContainer>
  );
}
