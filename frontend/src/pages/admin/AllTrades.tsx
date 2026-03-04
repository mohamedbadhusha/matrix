import { useState, useEffect, useMemo } from 'react';
import { supabase } from '@/lib/supabase';
import { TradeCardCompact } from '@/components/TradeCard';
import { cn, calcPnl, formatCurrency, getPnlClass } from '@/lib/utils';
import type { TradeNode, Protocol, TradeStatus, TradeMode } from '@/types';
import { RefreshCw } from 'lucide-react';

const ALL = '__ALL__';

export default function AllTrades() {
  const [trades, setTrades] = useState<TradeNode[]>([]);
  const [loading, setLoading] = useState(true);
  const [protocol, setProtocol] = useState(ALL);
  const [status, setStatus] = useState(ALL);
  const [mode, setMode] = useState(ALL);
  const [expandedId, setExpandedId] = useState<string | null>(null);

  const fetchTrades = async () => {
    setLoading(true);
    const { data } = await supabase
      .from('trade_nodes')
      .select('*')
      .order('created_at', { ascending: false })
      .limit(500);
    setTrades((data as TradeNode[]) ?? []);
    setLoading(false);
  };

  useEffect(() => { fetchTrades(); }, []);

  const filtered = useMemo(() => {
    return trades.filter((t) => {
      if (protocol !== ALL && t.protocol !== protocol) return false;
      if (status !== ALL && t.status !== status) return false;
      if (mode !== ALL && t.mode !== mode) return false;
      return true;
    });
  }, [trades, protocol, status, mode]);

  const totalPnl = filtered.reduce((s, t) =>
    t.exit_price ? s + calcPnl(t.entry_price, t.exit_price, t.lots * t.lot_size) : s, 0);
  const active = filtered.filter((t) => t.status === 'ACTIVE').length;
  const closed = filtered.filter((t) => t.status !== 'ACTIVE').length;

  return (
    <div className="space-y-4">
      {/* Summary */}
      <div className="grid grid-cols-4 gap-3">
        {[
          { label: 'Total', value: filtered.length, cls: 'text-foreground' },
          { label: 'Active', value: active, cls: 'text-profit' },
          { label: 'Closed', value: closed, cls: 'text-muted' },
          { label: 'P&L', value: formatCurrency(totalPnl, true), cls: getPnlClass(totalPnl) },
        ].map((s) => (
          <div key={s.label} className="panel p-3 text-center">
            <p className="text-xs text-muted">{s.label}</p>
            <p className={cn('text-lg font-bold font-mono', s.cls)}>{s.value}</p>
          </div>
        ))}
      </div>

      {/* Filters */}
      <div className="panel p-3 flex flex-wrap gap-3 items-center">
        {/* Protocol */}
        <div className="flex gap-1">
          {[ALL, 'PROTECTOR', 'HALF_AND_HALF', 'DOUBLE_SCALPER', 'SINGLE_SCALPER'].map((p) => (
            <button
              key={p}
              onClick={() => setProtocol(p)}
              className={cn(
                'px-2.5 py-1 rounded-lg text-xs border transition-all',
                protocol === p
                  ? 'bg-accent-cyan/10 text-accent-cyan border-accent-cyan/30'
                  : 'bg-panel-mid text-muted border-border',
              )}
            >
              {p === ALL ? 'All' : p}
            </button>
          ))}
        </div>
        {/* Status */}
        <div className="flex gap-1">
          {[ALL, 'ACTIVE', 'CLOSED', 'SL_HIT', 'KILLED'].map((s) => (
            <button
              key={s}
              onClick={() => setStatus(s)}
              className={cn(
                'px-2.5 py-1 rounded-lg text-xs border transition-all',
                status === s
                  ? 'bg-accent-cyan/10 text-accent-cyan border-accent-cyan/30'
                  : 'bg-panel-mid text-muted border-border',
              )}
            >
              {s === ALL ? 'All' : s}
            </button>
          ))}
        </div>
        {/* Mode */}
        <div className="flex gap-1">
          {[ALL, 'LIVE', 'PAPER'].map((m) => (
            <button
              key={m}
              onClick={() => setMode(m)}
              className={cn(
                'px-2.5 py-1 rounded-lg text-xs border transition-all',
                mode === m
                  ? 'bg-accent-cyan/10 text-accent-cyan border-accent-cyan/30'
                  : 'bg-panel-mid text-muted border-border',
              )}
            >
              {m === ALL ? 'All' : m}
            </button>
          ))}
        </div>
        <button onClick={fetchTrades} className="ml-auto text-xs flex items-center gap-1.5 text-muted hover:text-foreground">
          <RefreshCw size={12} className={loading ? 'animate-spin' : ''} />
          Refresh
        </button>
      </div>

      {/* Table */}
      <div className="panel overflow-hidden">
        <table className="table-base">
          <thead>
            <tr>
              <th>Symbol</th>
              <th>Protocol</th>
              <th>Mode</th>
              <th>Entry</th>
              <th>Exit / LTP</th>
              <th>P&L</th>
              <th>Status</th>
              <th>Date</th>
              <th></th>
            </tr>
          </thead>
          <tbody>
            {loading ? (
              <tr>
                <td colSpan={9} className="text-center py-10">
                  <div className="w-6 h-6 rounded-full border-2 border-accent-cyan border-t-transparent animate-spin mx-auto" />
                </td>
              </tr>
            ) : filtered.length === 0 ? (
              <tr>
                <td colSpan={9} className="text-center py-8 text-muted text-sm">No trades</td>
              </tr>
            ) : (
              filtered.map((trade) => (
                <TradeCardCompact
                  key={trade.id}
                  trade={trade}
                  onExpand={(id) => setExpandedId((prev) => (prev === id ? null : id))}
                  expanded={expandedId === trade.id}
                />
              ))
            )}
          </tbody>
        </table>
      </div>
    </div>
  );
}
