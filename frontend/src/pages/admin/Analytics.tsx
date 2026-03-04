import { useState, useEffect } from 'react';
import { supabase } from '@/lib/supabase';
import { cn, calcPnl, formatCurrency, getPnlClass } from '@/lib/utils';
import type { TradeNode } from '@/types';
import { BarChart, Bar, XAxis, YAxis, Tooltip, ResponsiveContainer, LineChart, Line, PieChart, Pie, Cell, Legend } from 'recharts';

const PROTOCOL_COLORS: Record<string, string> = {
  PROTECTOR: '#00D4FF',
  HALF_AND_HALF: '#7B2FBE',
  DOUBLE_SCALPER: '#FF6B35',
  SINGLE_SCALPER: '#00C896',
};

export default function Analytics() {
  const [trades, setTrades] = useState<TradeNode[]>([]);
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    supabase
      .from('trade_nodes')
      .select('*')
      .order('created_at', { ascending: false })
      .limit(1000)
      .then(({ data }) => {
        setTrades((data as TradeNode[]) ?? []);
        setLoading(false);
      });
  }, []);

  const closedTrades = trades.filter((t) => t.exit_price && t.entry_price);
  const totalPnl = closedTrades.reduce((s, t) => s + calcPnl(t.entry_price, t.exit_price!, t.lots * t.lot_size), 0);
  const wins = closedTrades.filter((t) => t.exit_price! > t.entry_price).length;
  const winRate = closedTrades.length > 0 ? ((wins / closedTrades.length) * 100).toFixed(1) : '0';

  // P&L by day (last 14 days)
  const pnlByDay = (() => {
    const map: Record<string, number> = {};
    closedTrades.forEach((t) => {
      const day = t.closed_at ? t.closed_at.slice(0, 10) : t.created_at.slice(0, 10);
      map[day] = (map[day] ?? 0) + calcPnl(t.entry_price, t.exit_price!, t.lots * t.lot_size);
    });
    return Object.entries(map)
      .sort((a, b) => a[0].localeCompare(b[0]))
      .slice(-14)
      .map(([date, pnl]) => ({ date: date.slice(5), pnl: Math.round(pnl) }));
  })();

  // By protocol distribution
  const byProtocol = ['PROTECTOR', 'HALF_AND_HALF', 'DOUBLE_SCALPER', 'SINGLE_SCALPER'].map((p) => {
    const pt = trades.filter((t) => t.protocol === p);
    const closed = pt.filter((t) => t.exit_price);
    const pnl = closed.reduce((s, t) => s + calcPnl(t.entry_price, t.exit_price!, t.lots * t.lot_size), 0);
    return { name: p, count: pt.length, pnl: Math.round(pnl) };
  });

  // Status breakdown
  const statusBreakdown = ['ACTIVE', 'CLOSED', 'SL_HIT', 'KILLED'].map((s) => ({
    name: s,
    value: trades.filter((t) => t.status === s).length,
  }));
  const STATUS_COLORS = ['#00C896', '#00D4FF', '#FF4757', '#FF6B35'];

  const stats = [
    { label: 'Total Trades', value: trades.length, cls: 'text-foreground' },
    { label: 'Closed Trades', value: closedTrades.length, cls: 'text-muted' },
    { label: 'Total P&L', value: formatCurrency(totalPnl, true), cls: getPnlClass(totalPnl) },
    { label: 'Win Rate', value: `${winRate}%`, cls: Number(winRate) >= 50 ? 'text-profit' : 'text-loss' },
    { label: 'Live Trades', value: trades.filter((t) => t.mode === 'LIVE').length, cls: 'text-profit' },
    { label: 'Paper Trades', value: trades.filter((t) => t.mode === 'PAPER').length, cls: 'text-warning' },
  ];

  if (loading) {
    return (
      <div className="flex justify-center py-20">
        <div className="w-8 h-8 rounded-full border-2 border-accent-cyan border-t-transparent animate-spin" />
      </div>
    );
  }

  return (
    <div className="space-y-6">
      {/* Summary stats */}
      <div className="grid grid-cols-3 gap-4">
        {stats.map((s) => (
          <div key={s.label} className="panel p-4">
            <p className="text-xs text-muted mb-1">{s.label}</p>
            <p className={cn('text-2xl font-bold font-mono', s.cls)}>{s.value}</p>
          </div>
        ))}
      </div>

      {/* P&L by day */}
      <div className="panel p-5 space-y-3">
        <h3 className="text-sm font-semibold text-foreground">Daily P&L (last 14 days)</h3>
        <ResponsiveContainer width="100%" height={200}>
          <BarChart data={pnlByDay} margin={{ top: 4, right: 4, left: 4, bottom: 4 }}>
            <XAxis dataKey="date" tick={{ fontSize: 10, fill: '#4A6A99' }} axisLine={false} tickLine={false} />
            <YAxis tick={{ fontSize: 10, fill: '#4A6A99' }} axisLine={false} tickLine={false} tickFormatter={(v) => `₹${v >= 1000 ? `${(v / 1000).toFixed(1)}k` : v}`} />
            <Tooltip
              contentStyle={{ background: '#0F3460', border: '1px solid #2A3A5C', borderRadius: 8, fontSize: 12 }}
              formatter={(val: number | undefined) => [formatCurrency(val ?? 0, true), 'P&L']}
            />
            <Bar dataKey="pnl" radius={[4, 4, 0, 0]}
              fill="#00D4FF"
              label={false}
            >
              {pnlByDay.map((d, i) => (
                <Cell key={i} fill={d.pnl >= 0 ? '#00C896' : '#FF4757'} />
              ))}
            </Bar>
          </BarChart>
        </ResponsiveContainer>
      </div>

      {/* Protocol breakdown */}
      <div className="grid grid-cols-2 gap-4">
        <div className="panel p-5 space-y-3">
          <h3 className="text-sm font-semibold text-foreground">P&L by Protocol</h3>
          <ResponsiveContainer width="100%" height={180}>
            <BarChart data={byProtocol} layout="vertical" margin={{ left: 8 }}>
              <XAxis type="number" tick={{ fontSize: 10, fill: '#4A6A99' }} axisLine={false} tickLine={false} tickFormatter={(v) => `₹${v >= 1000 ? `${(v / 1000).toFixed(1)}k` : v}`} />
              <YAxis type="category" dataKey="name" tick={{ fontSize: 10, fill: '#4A6A99' }} axisLine={false} tickLine={false} width={70} />
              <Tooltip
                contentStyle={{ background: '#0F3460', border: '1px solid #2A3A5C', borderRadius: 8, fontSize: 12 }}
                formatter={(val: number | undefined) => [formatCurrency(val ?? 0, true), 'P&L']}
              />
              <Bar dataKey="pnl" radius={[0, 4, 4, 0]}>
                {byProtocol.map((d, i) => (
                  <Cell key={i} fill={PROTOCOL_COLORS[d.name] ?? '#00D4FF'} />
                ))}
              </Bar>
            </BarChart>
          </ResponsiveContainer>
        </div>

        <div className="panel p-5 space-y-3">
          <h3 className="text-sm font-semibold text-foreground">Trade Status Split</h3>
          <ResponsiveContainer width="100%" height={180}>
            <PieChart>
              <Pie
                data={statusBreakdown.filter((d) => d.value > 0)}
                cx="50%"
                cy="50%"
                innerRadius={40}
                outerRadius={70}
                dataKey="value"
                paddingAngle={3}
                label={({ name, percent }) => `${name} ${((percent ?? 0) * 100).toFixed(0)}%`}
                labelLine={false}
                fontSize={10}
              >
                {statusBreakdown.map((_, i) => (
                  <Cell key={i} fill={STATUS_COLORS[i]} />
                ))}
              </Pie>
              <Tooltip
                contentStyle={{ background: '#0F3460', border: '1px solid #2A3A5C', borderRadius: 8, fontSize: 12 }}
              />
            </PieChart>
          </ResponsiveContainer>
        </div>
      </div>

      {/* Trades by protocol table */}
      <div className="panel overflow-hidden">
        <table className="table-base">
          <thead>
            <tr>
              <th>Protocol</th>
              <th>Total Trades</th>
              <th>P&L</th>
            </tr>
          </thead>
          <tbody>
            {byProtocol.map((p) => (
              <tr key={p.name}>
                <td>
                  <span className="font-medium text-sm" style={{ color: PROTOCOL_COLORS[p.name] }}>
                    {p.name}
                  </span>
                </td>
                <td className="font-mono">{p.count}</td>
                <td className={cn('font-mono font-semibold', getPnlClass(p.pnl))}>
                  {formatCurrency(p.pnl, true)}
                </td>
              </tr>
            ))}
          </tbody>
        </table>
      </div>
    </div>
  );
}
