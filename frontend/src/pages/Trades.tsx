import { useState, useMemo } from 'react';
import { useTrades } from '@/app/providers/TradeProvider';
import { TradeCardCompact } from '@/components/TradeCard';
import TradeCard from '@/components/TradeCard';
import { cn, formatCurrency, getPnlClass } from '@/lib/utils';
import type { Protocol, TradeStatus } from '@/types';
import { X, SlidersHorizontal, ChevronDown, ChevronUp } from 'lucide-react';

const ALL = '__ALL__';

const PROTOCOLS: (Protocol | typeof ALL)[] = [ALL, 'PROTECTOR', 'HALF_AND_HALF', 'DOUBLE_SCALPER', 'SINGLE_SCALPER', 'TRAIL_RUNNER'];
const STATUSES: (TradeStatus | typeof ALL)[] = [ALL, 'ACTIVE', 'CLOSED', 'SL_HIT', 'KILLED'];

const PROTOCOL_LABELS: Record<string, string> = {
  PROTECTOR:      'Protector',
  HALF_AND_HALF:  'Half & Half',
  DOUBLE_SCALPER: 'Dbl Scalper',
  SINGLE_SCALPER: 'Sgl Scalper',
  TRAIL_RUNNER:   'Trail Run',
};

const STATUS_LABELS: Record<string, string> = {
  ACTIVE: 'Active',
  CLOSED: 'Closed',
  SL_HIT: 'SL Hit',
  KILLED: 'Killed',
};

const STATUS_ACTIVE_CLS: Record<string, string> = {
  ACTIVE: 'text-profit border-profit/40 bg-profit/10',
  CLOSED: 'text-muted border-muted/30 bg-muted/10',
  SL_HIT: 'text-loss border-loss/40 bg-loss/10',
  KILLED: 'text-loss border-loss/40 bg-loss/10',
};

const PROTOCOL_ACTIVE_CLS: Record<string, string> = {
  PROTECTOR:      'text-accent-cyan border-accent-cyan/40 bg-accent-cyan/10',
  HALF_AND_HALF:  'text-accent-purple border-accent-purple/40 bg-accent-purple/10',
  DOUBLE_SCALPER: 'text-warning border-warning/40 bg-warning/10',
  SINGLE_SCALPER: 'text-profit border-profit/40 bg-profit/10',
  TRAIL_RUNNER:   'text-amber-400 border-amber-400/40 bg-amber-400/10',
};

export default function Trades() {
  const { allTrades, loadingTrades, deleteTrade, updateTrade } = useTrades();

  const [protocol, setProtocol] = useState<Protocol | typeof ALL>(ALL);
  const [status, setStatus]     = useState<TradeStatus | typeof ALL>(ALL);
  const [dateFrom, setDateFrom] = useState('');
  const [dateTo, setDateTo]     = useState('');
  const [expandedId, setExpandedId] = useState<string | null>(null);
  const [filtersOpen, setFiltersOpen] = useState(false);

  const filtered = useMemo(() => {
    return allTrades
      .filter((t) => {
        if (protocol !== ALL && t.protocol !== protocol) return false;
        if (status  !== ALL && t.status   !== status)   return false;
        if (dateFrom && t.created_at < dateFrom) return false;
        if (dateTo   && t.created_at > dateTo + 'T23:59:59') return false;
        return true;
      })
      .sort((a, b) => new Date(b.created_at).getTime() - new Date(a.created_at).getTime());
  }, [allTrades, protocol, status, dateFrom, dateTo]);

  // P&L: booked_pnl + unrealised for ACTIVE trades
  const totalPnl = filtered.reduce((sum, t) => {
    const ltp = t.ltp ?? t.entry_price;
    const open = t.status === 'ACTIVE' ? (ltp - t.entry_price) * t.remaining_quantity : 0;
    return sum + t.booked_pnl + open;
  }, 0);

  const closedCount = filtered.filter((t) => t.status !== 'ACTIVE').length;
  const wins        = filtered.filter((t) => t.status !== 'ACTIVE' && t.booked_pnl > 0).length;
  const winRate     = closedCount > 0 ? ((wins / closedCount) * 100).toFixed(0) : '—';

  const clearFilters = () => {
    setProtocol(ALL); setStatus(ALL);
    setDateFrom('');  setDateTo('');
  };

  const hasFilters = protocol !== ALL || status !== ALL || !!dateFrom || !!dateTo;
  const filterCount = [protocol !== ALL, status !== ALL, !!dateFrom, !!dateTo].filter(Boolean).length;

  return (
    <div className="space-y-4 animate-fade-in">

      {/* ── Header ────────────────────────────────────────── */}
      <div className="flex items-start justify-between gap-4">
        <div>
          <h1 className="text-xl font-bold text-foreground sm:text-2xl">Trade History</h1>
          <p className="text-sm text-muted mt-0.5">
            {filtered.length} trade{filtered.length !== 1 ? 's' : ''}
            {hasFilters && <span className="text-accent-cyan ml-1.5">filtered</span>}
          </p>
        </div>
        <div className="text-right flex-shrink-0">
          <p className={cn('text-lg font-bold font-mono sm:text-xl', getPnlClass(totalPnl))}>
            {totalPnl >= 0 ? '+' : ''}{formatCurrency(totalPnl)}
          </p>
          <p className="text-[11px] text-muted">P&amp;L · Win {winRate}%</p>
        </div>
      </div>

      {/* ── Filter toggle bar ─────────────────────────────── */}
      <div className="flex items-center gap-3">
        <button
          onClick={() => setFiltersOpen((v) => !v)}
          className={cn(
            'flex items-center gap-2 px-3 py-2 rounded-xl border text-sm font-medium transition-all',
            filtersOpen || hasFilters
              ? 'bg-accent-cyan/10 text-accent-cyan border-accent-cyan/30'
              : 'bg-panel-mid text-muted border-border hover:text-foreground',
          )}
        >
          <SlidersHorizontal size={14} />
          Filters
          {filterCount > 0 && (
            <span className="bg-accent-cyan text-panel-dark rounded-full min-w-[18px] h-[18px] flex items-center justify-center text-[10px] font-bold px-1">
              {filterCount}
            </span>
          )}
          {filtersOpen ? <ChevronUp size={13} /> : <ChevronDown size={13} />}
        </button>
        {hasFilters && (
          <button
            onClick={clearFilters}
            className="flex items-center gap-1 text-xs text-muted hover:text-foreground transition-colors"
          >
            <X size={12} /> Clear
          </button>
        )}
      </div>

      {/* ── Filter panel ──────────────────────────────────── */}
      {filtersOpen && (
        <div className="panel p-4 space-y-4">

          {/* Status */}
          <div>
            <p className="text-[10px] text-muted uppercase tracking-widest mb-2">Status</p>
            <div className="flex flex-wrap gap-1.5">
              {STATUSES.map((opt) => (
                <button
                  key={opt}
                  onClick={() => setStatus(opt as TradeStatus | typeof ALL)}
                  className={cn(
                    'px-2.5 py-1 rounded-lg text-xs border transition-all',
                    status === opt
                      ? opt === ALL
                        ? 'bg-accent-cyan/10 text-accent-cyan border-accent-cyan/30'
                        : STATUS_ACTIVE_CLS[opt]
                      : 'bg-panel-mid text-muted border-border hover:text-foreground',
                  )}
                >
                  {opt === ALL ? 'All' : STATUS_LABELS[opt] ?? opt}
                </button>
              ))}
            </div>
          </div>

          {/* Mode */}
          <div>
            <p className="text-[10px] text-muted uppercase tracking-widest mb-2">Mode</p>
            <p className="text-xs text-muted italic">Controlled by the global switcher in the header.</p>
          </div>

          {/* Protocol */}
          <div>
            <p className="text-[10px] text-muted uppercase tracking-widest mb-2">Protocol</p>
            <div className="flex flex-wrap gap-1.5">
              {PROTOCOLS.map((opt) => (
                <button
                  key={opt}
                  onClick={() => setProtocol(opt as Protocol | typeof ALL)}
                  className={cn(
                    'px-2.5 py-1 rounded-lg text-xs border transition-all',
                    protocol === opt
                      ? opt === ALL
                        ? 'bg-accent-cyan/10 text-accent-cyan border-accent-cyan/30'
                        : PROTOCOL_ACTIVE_CLS[opt]
                      : 'bg-panel-mid text-muted border-border hover:text-foreground',
                  )}
                >
                  {opt === ALL ? 'All' : PROTOCOL_LABELS[opt] ?? opt}
                </button>
              ))}
            </div>
          </div>

          {/* Date range */}
          <div>
            <p className="text-[10px] text-muted uppercase tracking-widest mb-2">Date Range</p>
            <div className="flex items-center gap-2 flex-wrap">
              <input
                type="date"
                className="input-base flex-1 min-w-[130px] text-xs"
                value={dateFrom}
                onChange={(e) => setDateFrom(e.target.value)}
              />
              <span className="text-muted text-xs">→</span>
              <input
                type="date"
                className="input-base flex-1 min-w-[130px] text-xs"
                value={dateTo}
                onChange={(e) => setDateTo(e.target.value)}
              />
            </div>
          </div>

        </div>
      )}

      {/* ── Trade list ────────────────────────────────────── */}
      {loadingTrades ? (
        <div className="flex justify-center py-20">
          <div className="w-8 h-8 rounded-full border-2 border-accent-cyan border-t-transparent animate-spin" />
        </div>
      ) : filtered.length === 0 ? (
        <div className="panel p-12 text-center space-y-2">
          <p className="text-3xl">📭</p>
          <p className="text-sm text-muted">No trades match your filters</p>
          {hasFilters && (
            <button onClick={clearFilters} className="text-xs text-accent-cyan underline">
              Clear filters
            </button>
          )}
        </div>
      ) : (
        <>
          {/* Mobile — full cards */}
          <div className="flex flex-col gap-3 md:hidden">
            {filtered.map((trade) => (
              <TradeCard
                key={trade.id}
                trade={trade}
                onDelete={deleteTrade}
                onEdit={(id, u) => updateTrade(id, u)}
              />
            ))}
          </div>

          {/* Desktop — compact table */}
          <div className="hidden md:block panel overflow-x-auto">
            <table className="table-base">
              <thead>
                <tr>
                  <th>Symbol</th>
                  <th>Protocol</th>
                  <th>Mode</th>
                  <th>Entry</th>
                  <th>Exit / LTP</th>
                  <th>P&amp;L</th>
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
                      onEdit={(id, u) => updateTrade(id, u)}
                    />
                    {expandedId === trade.id && (
                      <tr key={`${trade.id}-expand`}>
                        <td colSpan={9} className="p-4 bg-panel-mid/60">
                          <TradeCard
                            trade={trade}
                            onDelete={deleteTrade}
                            onEdit={(id, u) => updateTrade(id, u)}
                          />
                        </td>
                      </tr>
                    )}
                  </>
                ))}
              </tbody>
            </table>
          </div>
        </>
      )}
    </div>
  );
}
