import React from 'react';
import { LineChart as RechartsLine, Line, XAxis, YAxis, CartesianGrid, Tooltip, ResponsiveContainer, Legend } from 'recharts';
import type { ChartDataPoint } from '@/types';

interface LineConfig {
  key: string;
  color: string;
  label: string;
  unit?: string;
}

interface LineChartProps {
  data: ChartDataPoint[];
  lines: LineConfig[];
  height?: number;
  yDomain?: [number | string, number | string];
  formatYAxis?: (v: number) => string;
}

const CustomTooltip = ({ active, payload, label }: any) => {
  if (!active || !payload?.length) return null;
  return (
    <div className="bg-[#1a2234] border border-slate-700/60 rounded-lg p-3 text-xs shadow-xl">
      <div className="text-slate-400 mb-2">{label}</div>
      {payload.map((p: any) => (
        <div key={p.dataKey} className="flex items-center gap-2 mb-1">
          <div className="w-2 h-2 rounded-full" style={{ background: p.color }} />
          <span className="text-slate-300">{p.name}:</span>
          <span className="text-white font-medium">{typeof p.value === 'number' ? p.value.toFixed(1) : p.value}{p.unit || ''}</span>
        </div>
      ))}
    </div>
  );
};

export function LineChart({ data, lines, height = 220, yDomain = [0, 100], formatYAxis }: LineChartProps) {
  return (
    <ResponsiveContainer width="100%" height={height}>
      <RechartsLine data={data} margin={{ top: 5, right: 10, left: -20, bottom: 0 }}>
        <CartesianGrid strokeDasharray="3 3" stroke="#1e2d45" vertical={false} />
        <XAxis dataKey="time" tick={{ fill: '#64748b', fontSize: 10 }} axisLine={false} tickLine={false} interval="preserveStartEnd" />
        <YAxis domain={yDomain} tick={{ fill: '#64748b', fontSize: 10 }} axisLine={false} tickLine={false} tickFormatter={formatYAxis || ((v) => `${v}%`)} />
        <Tooltip content={<CustomTooltip />} />
        {lines.length > 1 && <Legend iconType="circle" iconSize={8} wrapperStyle={{ fontSize: '11px', paddingTop: '8px' }} />}
        {lines.map(l => (
          <Line key={l.key} type="monotone" dataKey={l.key} name={l.label} stroke={l.color} strokeWidth={2} dot={false} activeDot={{ r: 4, strokeWidth: 0 }} />
        ))}
      </RechartsLine>
    </ResponsiveContainer>
  );
}
