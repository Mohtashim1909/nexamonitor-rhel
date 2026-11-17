import React from 'react';
import { AreaChart as RechartsArea, Area, XAxis, YAxis, CartesianGrid, Tooltip, ResponsiveContainer } from 'recharts';
import type { ChartDataPoint } from '@/types';

interface AreaChartProps {
  data: ChartDataPoint[];
  dataKey: string;
  color?: string;
  height?: number;
  unit?: string;
  label?: string;
}

export function AreaChart({ data, dataKey, color = '#3b82f6', height = 180, unit = '%', label }: AreaChartProps) {
  return (
    <ResponsiveContainer width="100%" height={height}>
      <RechartsArea data={data} margin={{ top: 5, right: 5, left: -20, bottom: 0 }}>
        <defs>
          <linearGradient id={`grad-${dataKey}`} x1="0" y1="0" x2="0" y2="1">
            <stop offset="5%" stopColor={color} stopOpacity={0.2} />
            <stop offset="95%" stopColor={color} stopOpacity={0} />
          </linearGradient>
        </defs>
        <CartesianGrid strokeDasharray="3 3" stroke="#1e2d45" vertical={false} />
        <XAxis dataKey="time" tick={{ fill: '#64748b', fontSize: 10 }} axisLine={false} tickLine={false} interval="preserveStartEnd" />
        <YAxis tick={{ fill: '#64748b', fontSize: 10 }} axisLine={false} tickLine={false} domain={[0, 100]} tickFormatter={v => `${v}${unit}`} />
        <Tooltip contentStyle={{ background: '#1a2234', border: '1px solid #334155', borderRadius: '8px', fontSize: '11px' }} formatter={(v: number) => [`${v.toFixed(1)}${unit}`, label || dataKey]} />
        <Area type="monotone" dataKey={dataKey} stroke={color} strokeWidth={2} fill={`url(#grad-${dataKey})`} dot={false} activeDot={{ r: 4, strokeWidth: 0 }} />
      </RechartsArea>
    </ResponsiveContainer>
  );
}
