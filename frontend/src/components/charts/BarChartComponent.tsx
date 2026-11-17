import React from 'react';
import { BarChart, Bar, XAxis, YAxis, CartesianGrid, Tooltip, ResponsiveContainer, Cell } from 'recharts';

interface BarData {
  name: string;
  value: number;
  color?: string;
}

interface BarChartComponentProps {
  data: BarData[];
  color?: string;
  height?: number;
  unit?: string;
  horizontal?: boolean;
}

export function BarChartComponent({ data, color = '#3b82f6', height = 200, unit = '%', horizontal = false }: BarChartComponentProps) {
  if (horizontal) {
    return (
      <ResponsiveContainer width="100%" height={height}>
        <BarChart data={data} layout="vertical" margin={{ top: 0, right: 10, left: 0, bottom: 0 }}>
          <CartesianGrid strokeDasharray="3 3" stroke="#1e2d45" horizontal={false} />
          <XAxis type="number" tick={{ fill: '#64748b', fontSize: 10 }} axisLine={false} tickLine={false} domain={[0, 100]} tickFormatter={v => `${v}${unit}`} />
          <YAxis type="category" dataKey="name" tick={{ fill: '#94a3b8', fontSize: 11 }} axisLine={false} tickLine={false} width={100} />
          <Tooltip contentStyle={{ background: '#1a2234', border: '1px solid #334155', borderRadius: '8px', fontSize: '11px' }} formatter={(v: number) => [`${v.toFixed(1)}${unit}`, 'Value']} />
          <Bar dataKey="value" radius={[0, 4, 4, 0]}>
            {data.map((entry, i) => <Cell key={i} fill={entry.color || color} />)}
          </Bar>
        </BarChart>
      </ResponsiveContainer>
    );
  }
  return (
    <ResponsiveContainer width="100%" height={height}>
      <BarChart data={data} margin={{ top: 5, right: 10, left: -20, bottom: 0 }}>
        <CartesianGrid strokeDasharray="3 3" stroke="#1e2d45" vertical={false} />
        <XAxis dataKey="name" tick={{ fill: '#64748b', fontSize: 10 }} axisLine={false} tickLine={false} />
        <YAxis tick={{ fill: '#64748b', fontSize: 10 }} axisLine={false} tickLine={false} domain={[0, 100]} tickFormatter={v => `${v}${unit}`} />
        <Tooltip contentStyle={{ background: '#1a2234', border: '1px solid #334155', borderRadius: '8px', fontSize: '11px' }} formatter={(v: number) => [`${v.toFixed(1)}${unit}`, 'Value']} />
        <Bar dataKey="value" fill={color} radius={[4, 4, 0, 0]}>
          {data.map((entry, i) => <Cell key={i} fill={entry.color || color} />)}
        </Bar>
      </BarChart>
    </ResponsiveContainer>
  );
}
