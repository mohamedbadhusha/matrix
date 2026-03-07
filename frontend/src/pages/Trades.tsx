import { useState, useMemo } from 'react';
import { useTrades } from '@/app/providers/TradeProvider';
import { TradeCardCompact } from '@/components/TradeCard';
import TradeCard from '@/components/TradeCard';
import { cn, formatCurrency, getPnlClass, calcPnl } from '@/lib/utils';
import type { Protocol, TradeStatus, TradeMode, TradeNode } from '@/types';
import { X } from 'lucide-react';

const ALL = '__ALL__';

const PROTOCOLS: (Protocol | typeof ALL)[] = [ALL, 'PROTECTOR', 'HALF_AND_HALF', 'DOUBLE_SCALPER', 'SINGLE_SCALPER'];
const STATUSES: (TradeStatus | typeof ALL)[] = [ALL, 'ACTIVE', 'CLOSED', 'SL_HIT', 'KILLED'];
const MODES: (TradeMode | typeof ALL)[] = [ALL, 'LIVE', 'PAPER'];

export default function Trades() {
  const { allTrades, loadingTrades, deleteTrade } = useTrades();

  const [protocol, setProtocol] = useState<Protocol | typeof ALL>(ALL);
  const [status, setStatus] = useState<TradeStatus | typeof ALL>(ALL);
  const [mode, setMode] = useState<TradeMode | typeof ALL>(ALL);
  const [dateFrom, setDateFrom] = useState('');
  const [dateTo, setDateTo] = useState('');
  const [expandedId, setExpandedId] = useState<string | null>(null);

  const filtered = useMemo(() => {
    return allTrades.filter((t) => {
      if (protocol !== ALL && t.protocol !== protocol) return false;
      if (status !== ALL && t.status !== status) return false;
      if (mode !== ALL && t.mode !== mode) return false;
      if (dateFrom && t.created_at < dateFrom) return false;
      if (dateTo && t.created_at > dateTo + 'T23:59:59') return false;
      return true;
    });
  }, [allTrades, protocol, status, mode, dateFrom, dateTo]);

  const totalPnl = filtered.reduce((sum, t) => {
    if (t.exit_price && t.entry_price) {
      return sum + calcPnl(t.entry_price, t.exit_price, t.lots * t.lot_size);
    }
    return sum;
  }, 0);

  const wins = filtered.filter(
    (t) => t.exit_price && t.entry_price && t.exit_price > t.entry_price,
  ).length;
  const closedCount = filtered.filter((t) => t.status !== 'ACTIVE').length;
  const winRate = closedCount > 0 ? ((wins / closedCount) * 100).toFixed(0) : '—';

  const clearFilters = () => {
    setProtocol(ALL);
    setStatus(ALL);
    setMode(ALL);
    setDateFrom('');
    setDateTo('');
  };

  const hasFilters =
    protocol !== ALL || status !== ALL || mode !== ALL || dateFrom || dateTo;

  return (
    <div className="space-y-6 animate-fade-in">
      {/* Header */}
      <div className="flex items-start justify-between">
        <div>
          <h1 className="text-2xl font-bold text-foreground">Trade History</h1>
          <p className="text-sm text-muted mt-0.5">{filtered.length} trade{filtered.length !== 1 ? 's' : ''}</p>
        </div>
        <div className="text-right">
          <p className={cn('text-xl font-bold font-mono', getPnlClass(totalPnl))}>
            {formatCurrency(totalPnl, true)}
          </p>
          <p className="text-xs text-muted">Filtered P&L · Win {winRate}%</p>
        </div>
      </div>

      {/* Filters */}
      <div className="panel p-4 space-y-3">
        <div className="flex flex-wrap gap-3">
          {/* Protocol filter */}
          <FilterGroup
            label="Protocol"
            options={PROTOCOLS}
            value={protocol}
            onChange={(v) => setProtocol(v as Protocol | typeof ALL)}
            colorMap={{
              PROTECTOR: 'text-accent-cyan border-accent-cyan/40 bg-accent-cyan/10',
              HALF_AND_HALF: 'text-accent-purple border-accent-purple/40 bg-accent-purple/10',
              DOUBLE_SCALPER: 'text-warning border-warning/40 bg-warning/10',
              SINGLE_SCALPER: 'text-profit border-profit/40 bg-profit/10',
            }}
          />
          {/* Status filter */}
          <FilterGroup
            label="Status"
            options={STATUSES}
            value={status}
            onChange={(v) => setStatus(v as TradeStatus | typeof ALL)}
          />
          {/* Mode filter */}
          <FilterGroup
            label="Mode"
            options={MODES}
            value={mode}
            onChange={(v) => setMode(v as TradeMode | typeof ALL)}
          />
        </div>

        {/* Date range */}
        <div className="flex items-center gap-3 flex-wrap">
          <input
            type="date"
            className="input-base w-40 text-xs"
            value={dateFrom}
            onChange={(e) => setDateFrom(e.target.value)}
          />
          <span className="text-muted text-xs">to</span>
          <input
            type="date"
            className="input-base w-40 text-xs"
            value={dateTo}
            onChange={(e) => setDateTo(e.target.value)}
          />
          {hasFilters && (
            <button onClick={clearFilters} className="flex items-center gap-1 text-xs text-muted hover:text-foreground transition-colors">
              <X size={12} /> Clear
            </button>
          )}
        </div>
      </div>

      {/* Trade list */}
      {loadingTrades ? (
        <div className="flex justify-center py-20">
          <div className="w-8 h-8 rounded-full border-2 border-accent-cyan border-t-transparent animate-spin" />
        </div>
      ) : filtered.length === 0 ? (
        <div className="panel p-12 text-center space-y-2">
          <p className="text-2xl">📭</p>
          <p className="text-sm text-muted">No trades match your filters</p>
          {hasFilters && (
            <button onClick={clearFilters} className="text-xs text-accent-cyan underline">
              Clear filters
            </button>
          )}
        </div>
      ) : (
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
              {filtered.map((trade) => (
                <>
                  <TradeCardCompact
                    key={trade.id}
                    trade={trade}
                    onExpand={(id) => setExpandedId((prev) => (prev === id ? null : id))}
                    expanded={expandedId === trade.id}
                    onDelete={deleteTrade}
                  />
                  {expandedId === trade.id && (
                    <tr key={`${trade.id}-expand`}>
                      <td colSpan={9} className="p-4 bg-panel-mid/60">
                        <TradeCard trade={trade} onDelete={deleteTrade} />
                      </td>
                    </tr>
                  )}
                </>
              ))}
            </tbody>
          </table>
        </div>
      )}
    </div>
  );
}

function FilterGroup({
  label,
  options,
  value,
  onChange,
  colorMap,
}: {
  label: string;
  options: (string)[];
  value: string;
  onChange: (v: string) => void;
  colorMap?: Record<string, string>;
}) {
  return (
    <div className="flex items-center gap-2">
      <span className="text-xs text-muted w-14 flex-shrink-0">{label}</span>
      <div className="flex gap-1">
        {options.map((opt) => (
          <button
            key={opt}
            onClick={() => onChange(opt)}
            className={cn(
              'px-2.5 py-1 rounded-lg text-xs border transition-all',
              value === opt
                ? colorMap?.[opt] ?? 'bg-accent-cyan/10 text-accent-cyan border-accent-cyan/30'
                : 'bg-panel-mid text-muted border-border hover:text-foreground',
            )}
          >
            {opt === '__ALL__' ? 'All' : opt}
          </button>
        ))}
      </div>
    </div>
  );
}
