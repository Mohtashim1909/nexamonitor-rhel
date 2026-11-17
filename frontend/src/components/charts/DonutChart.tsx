import React from 'react';
import { PieChart, Pie, Cell, ResponsiveContainer, Tooltip } from 'recharts';

interface DonutChartProps {
  data: { name: string; value: number; color: string }[];
  innerRadius?: number;
  outerRadius?: number;
  height?: number;
}

export function DonutChart({ data, innerRadius = 55, outerRadius = 75, height = 160 }: DonutChartProps) {
  return (
    <ResponsiveContainer width="100%" height={height}>
      <PieChart>
        <Pie data={data} cx="50%" cy="50%" innerRadius={innerRadius} outerRadius={outerRadius} paddingAngle={3} dataKey="value" stroke="none">
          {data.map((entry, i) => <Cell key={i} fill={entry.color} />)}
        </Pie>
        <Tooltip contentStyle={{ background: '#1a2234', border: '1px solid #334155', borderRadius: '8px', fontSize: '11px' }} formatter={(v: number) => [v, '']} />
      </PieChart>
    </ResponsiveContainer>
  );
}
