/**
 * Positions.tsx
 * Live Dhan positions viewer with P&L summary and broker selector.
 */
import { useState, useEffect, useCallback } from 'react';
import { useAuth } from '@/app/providers/AuthProvider';
import { supabase } from '@/lib/supabase';
import { cn } from '@/lib/utils';
import { toast } from 'sonner';
import type { BrokerAccount, DhanPosition, DhanPositionType } from '@/types';
import {
  RefreshCw,
  TrendingUp,
  TrendingDown,
  ArrowUpRight,
  ArrowDownRight,
  Activity,
  ChevronDown,
} from 'lucide-react';

// ─────────────────────────────────────────────────────────────────────────────
// Helpers
// ─────────────────────────────────────────────────────────────────────────────

function pnlColor(v: number) {
  return v > 0 ? 'text-profit' : v < 0 ? 'text-loss' : 'text-muted';
}

function fmt(v: number | undefined, digits = 2) {
  if (v === undefined || v === null) return '—';
  const abs = Math.abs(v).toLocaleString('en-IN', { minimumFractionDigits: digits, maximumFractionDigits: digits });
  return (v >= 0 ? '+' : '-') + '₹' + abs;
}

function fmtPrice(v: number | undefined) {
  if (v === undefined || v === null) return '—';
  return v.toLocaleString('en-IN', { minimumFractionDigits: 2, maximumFractionDigits: 2 });
}

// ─────────────────────────────────────────────────────────────────────────────
// Position type badge
// ─────────────────────────────────────────────────────────────────────────────

function PosBadge({ type }: { type: DhanPositionType | string }) {
  return (
    <span className={cn(
      'inline-flex items-center gap-0.5 text-[10px] font-bold px-2 py-0.5 rounded-full border',
      type === 'LONG'
        ? 'bg-profit/10 text-profit border-profit/30'
        : 'bg-loss/10 text-loss border-loss/30',
    )}>
      {type === 'LONG' ? <ArrowUpRight size={9} /> : <ArrowDownRight size={9} />}
      {type}
    </span>
  );
}

// ─────────────────────────────────────────────────────────────────────────────
// Page
// ─────────────────────────────────────────────────────────────────────────────

export default function Positions() {
  const { profile } = useAuth();
  const [brokers, setBrokers] = useState<BrokerAccount[]>([]);
  const [selectedBroker, setSelectedBroker] = useState('');
  const [positions, setPositions] = useState<DhanPosition[]>([]);
  const [loading, setLoading] = useState(false);
  const [filterSegment, setFilterSegment] = useState('ALL');
  const [filterProduct, setFilterProduct] = useState('ALL');
  const [filterType, setFilterType] = useState<'ALL' | 'LONG' | 'SHORT'>('ALL');
  const [sortField, setSortField] = useState<'unrealizedProfit' | 'realizedProfit' | 'netQty' | 'symbol'>('unrealizedProfit');
  const [sortDir, setSortDir] = useState<'asc' | 'desc'>('desc');

  // ── Load brokers ──────────────────────────────────────────────────────────
  useEffect(() => {
    if (!profile) return;
    supabase
      .from('broker_accounts')
      .select('id, broker_name, client_id, is_active, health_status')
      .eq('user_id', profile.id)
      .eq('is_active', true)
      .then(({ data }) => {
        const list = (data ?? []) as BrokerAccount[];
        setBrokers(list);
        if (list.length > 0 && !selectedBroker) setSelectedBroker(list[0].id);
      });
  }, [profile]);

  // ── Fetch positions ───────────────────────────────────────────────────────
  const fetchPositions = useCallback(async () => {
    if (!selectedBroker) return;
    setLoading(true);
    try {
      const res = await fetch('/api/dhan-positions', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ brokerId: selectedBroker }),
      });
      const data = await res.json() as DhanPosition[] | { error?: string };
      if (!res.ok) {
        toast.error((data as { error?: string }).error ?? 'Failed to fetch positions');
        setPositions([]);
      } else {
        setPositions(Array.isArray(data) ? data : []);
      }
    } catch {
      toast.error('Network error fetching positions');
    }
    setLoading(false);
  }, [selectedBroker]);

  useEffect(() => {
    fetchPositions();
  }, [fetchPositions]);

  // ── Derived values ────────────────────────────────────────────────────────
  const segments  = ['ALL', ...Array.from(new Set(positions.map(p => p.exchangeSegment)))];
  const products  = ['ALL', ...Array.from(new Set(positions.map(p => p.productType)))];

  const filtered = positions.filter(p => {
    if (filterSegment !== 'ALL' && p.exchangeSegment !== filterSegment) return false;
    if (filterProduct !== 'ALL' && p.productType !== filterProduct) return false;
    if (filterType !== 'ALL' && p.positionType !== filterType) return false;
    return true;
  }).sort((a, b) => {
    let va: number | string = 0;
    let vb: number | string = 0;
    if (sortField === 'symbol')            { va = a.tradingSymbol; vb = b.tradingSymbol; }
    else if (sortField === 'unrealizedProfit') { va = a.unrealizedProfit; vb = b.unrealizedProfit; }
    else if (sortField === 'realizedProfit')   { va = a.realizedProfit;   vb = b.realizedProfit; }
    else if (sortField === 'netQty')           { va = a.netQty;           vb = b.netQty; }
    if (typeof va === 'string') return sortDir === 'asc' ? va.localeCompare(vb as string) : (vb as string).localeCompare(va);
    return sortDir === 'asc' ? (va as number) - (vb as number) : (vb as number) - (va as number);
  });

  const totalUnrealized = filtered.reduce((s, p) => s + (p.unrealizedProfit ?? 0), 0);
  const totalRealized   = filtered.reduce((s, p) => s + (p.realizedProfit ?? 0), 0);
  const totalNet        = totalUnrealized + totalRealized;
  const openPositions   = filtered.filter(p => p.netQty !== 0).length;
  const dayBuyValue     = filtered.reduce((s, p) => s + (p.dayBuyValue ?? 0), 0);
  const daySellValue    = filtered.reduce((s, p) => s + (p.daySellValue ?? 0), 0);

  function toggleSort(field: typeof sortField) {
    if (sortField === field) setSortDir(d => d === 'asc' ? 'desc' : 'asc');
    else { setSortField(field); setSortDir('desc'); }
  }

  const broker = brokers.find(b => b.id === selectedBroker);

  return (
    <div className="space-y-5 p-6">

      {/* ── Header ─────────────────────────────────────────────────────────── */}
      <div className="flex items-center justify-between">
        <div>
          <h1 className="text-xl font-bold text-foreground flex items-center gap-2">
            <Activity size={20} className="text-accent-cyan" />
            Positions
          </h1>
          <p className="text-xs text-muted mt-0.5">Live Dhan positions — updated on refresh</p>
        </div>

        <div className="flex items-center gap-3">
          {/* Broker selector */}
          <div className="relative">
            <select
              value={selectedBroker}
              onChange={e => setSelectedBroker(e.target.value)}
              className="input-base pr-8 text-sm min-w-[160px]"
            >
              {brokers.length === 0 && <option value="">No brokers</option>}
              {brokers.map(b => (
                <option key={b.id} value={b.id}>
                  {b.broker_name} · {b.client_id}
                </option>
              ))}
            </select>
            <ChevronDown size={12} className="absolute right-2.5 top-1/2 -translate-y-1/2 text-muted pointer-events-none" />
          </div>

          {broker && (
            <span className={cn(
              'text-[10px] font-semibold px-2 py-1 rounded-full border',
              broker.health_status === 'OK'
                ? 'bg-profit/10 text-profit border-profit/30'
                : 'bg-loss/10 text-loss border-loss/30',
            )}>
              {broker.health_status ?? 'UNKNOWN'}
            </span>
          )}

          <button
            onClick={fetchPositions}
            disabled={loading || !selectedBroker}
            className="btn-secondary gap-2"
          >
            <RefreshCw size={14} className={loading ? 'animate-spin' : ''} />
            Refresh
          </button>
        </div>
      </div>

      {/* ── Summary Cards ──────────────────────────────────────────────────── */}
      <div className="grid grid-cols-2 md:grid-cols-3 lg:grid-cols-6 gap-3">
        {[
          { label: 'Net P&L',        value: totalNet,        highlight: true },
          { label: 'Unrealized',     value: totalUnrealized, highlight: false },
          { label: 'Realized',       value: totalRealized,   highlight: false },
          { label: 'Open Positions', value: openPositions,   isCount: true },
          { label: 'Day Buy',        value: dayBuyValue,     isRaw: true },
          { label: 'Day Sell',       value: daySellValue,    isRaw: true },
        ].map(({ label, value, highlight, isCount, isRaw }) => (
          <div key={label} className={cn('panel px-4 py-3 space-y-1', highlight && 'border-accent-cyan/30')}>
            <p className="text-[10px] text-muted font-medium uppercase tracking-wide">{label}</p>
            {isCount ? (
              <p className="text-lg font-bold font-mono text-foreground">{value}</p>
            ) : isRaw ? (
              <p className="text-sm font-bold font-mono text-foreground">
                ₹{Math.abs(value as number).toLocaleString('en-IN', { maximumFractionDigits: 0 })}
              </p>
            ) : (
              <p className={cn('text-sm font-bold font-mono', pnlColor(value as number))}>
                {fmt(value as number, 0)}
              </p>
            )}
          </div>
        ))}
      </div>

      {/* ── Filters ────────────────────────────────────────────────────────── */}
      <div className="flex flex-wrap items-center gap-2">
        <span className="text-xs text-muted">Segment:</span>
        {segments.map(s => (
          <button key={s} onClick={() => setFilterSegment(s)}
            className={cn('text-[11px] px-2.5 py-1 rounded-lg border transition-all',
              filterSegment === s ? 'border-accent-cyan bg-accent-cyan/10 text-accent-cyan' : 'border-border text-muted hover:text-foreground')}>
            {s}
          </button>
        ))}
        <span className="text-xs text-muted ml-2">Product:</span>
        {products.map(p => (
          <button key={p} onClick={() => setFilterProduct(p)}
            className={cn('text-[11px] px-2.5 py-1 rounded-lg border transition-all',
              filterProduct === p ? 'border-accent-cyan bg-accent-cyan/10 text-accent-cyan' : 'border-border text-muted hover:text-foreground')}>
            {p}
          </button>
        ))}
        <span className="text-xs text-muted ml-2">Type:</span>
        {(['ALL','LONG','SHORT'] as const).map(t => (
          <button key={t} onClick={() => setFilterType(t)}
            className={cn('text-[11px] px-2.5 py-1 rounded-lg border transition-all',
              filterType === t
                ? t === 'LONG'  ? 'border-profit bg-profit/10 text-profit'
                : t === 'SHORT' ? 'border-loss bg-loss/10 text-loss'
                :                 'border-accent-cyan bg-accent-cyan/10 text-accent-cyan'
                : 'border-border text-muted hover:text-foreground')}>
            {t}
          </button>
        ))}
      </div>

      {/* ── Table ──────────────────────────────────────────────────────────── */}
      {loading ? (
        <div className="flex justify-center py-20">
          <div className="w-7 h-7 rounded-full border-2 border-accent-cyan border-t-transparent animate-spin" />
        </div>
      ) : filtered.length === 0 ? (
        <div className="panel p-12 text-center">
          <Activity size={32} className="mx-auto mb-3 text-muted opacity-40" />
          <p className="text-sm text-muted">
            {positions.length === 0 ? 'No open positions — click Refresh to fetch' : 'No positions match the current filters'}
          </p>
        </div>
      ) : (
        <div className="panel overflow-hidden">
          <div className="overflow-x-auto">
            <table className="w-full text-xs">
              <thead>
                <tr className="border-b border-border">
                  {[
                    { label: 'Symbol',     field: 'symbol'            as const },
                    { label: 'Exchange',   field: null },
                    { label: 'Product',    field: null },
                    { label: 'Type',       field: null },
                    { label: 'Net Qty',    field: 'netQty'            as const },
                    { label: 'Buy Avg',    field: null },
                    { label: 'Sell Avg',   field: null },
                    { label: 'Day Buy',    field: null },
                    { label: 'Day Sell',   field: null },
                    { label: 'Unrealized', field: 'unrealizedProfit'  as const },
                    { label: 'Realized',   field: 'realizedProfit'    as const },
                    { label: 'Net P&L',    field: null },
                  ].map(({ label, field }) => (
                    <th key={label}
                      onClick={field ? () => toggleSort(field) : undefined}
                      className={cn('text-left text-muted font-medium px-3 py-2.5 whitespace-nowrap select-none',
                        field && 'cursor-pointer hover:text-foreground')}>
                      <span className="flex items-center gap-1">
                        {label}
                        {field && sortField === field && (
                          <span className="text-accent-cyan">{sortDir === 'desc' ? '↓' : '↑'}</span>
                        )}
                      </span>
                    </th>
                  ))}
                </tr>
              </thead>
              <tbody className="divide-y divide-border/50">
                {filtered.map((pos, i) => {
                  const netPnl = (pos.unrealizedProfit ?? 0) + (pos.realizedProfit ?? 0);
                  return (
                    <tr key={`${pos.securityId}-${pos.productType}-${pos.exchangeSegment}-${i}`}
                      className="hover:bg-border/20 transition-colors">
                      <td className="px-3 py-2.5">
                        <div>
                          <p className="font-mono font-semibold text-foreground">{pos.tradingSymbol}</p>
                          {pos.drvExpiryDate && (
                            <p className="text-[10px] text-muted">{pos.drvExpiryDate}{pos.drvOptionType ? ` · ${pos.drvOptionType} ${pos.drvStrikePrice}` : ''}</p>
                          )}
                        </div>
                      </td>
                      <td className="px-3 py-2.5 text-muted text-[11px]">{pos.exchangeSegment}</td>
                      <td className="px-3 py-2.5 text-muted">{pos.productType}</td>
                      <td className="px-3 py-2.5"><PosBadge type={pos.positionType} /></td>
                      <td className="px-3 py-2.5 font-mono font-semibold text-foreground">{pos.netQty}</td>
                      <td className="px-3 py-2.5 font-mono text-foreground">{fmtPrice(pos.buyAvg)}</td>
                      <td className="px-3 py-2.5 font-mono text-foreground">{fmtPrice(pos.sellAvg)}</td>
                      <td className="px-3 py-2.5 font-mono text-muted">
                        {pos.dayBuyQty > 0 ? <><span className="text-profit">{pos.dayBuyQty}</span> @ {fmtPrice(pos.dayBuyQty > 0 ? pos.dayBuyValue / pos.dayBuyQty : 0)}</> : '—'}
                      </td>
                      <td className="px-3 py-2.5 font-mono text-muted">
                        {pos.daySellQty > 0 ? <><span className="text-loss">{pos.daySellQty}</span> @ {fmtPrice(pos.daySellQty > 0 ? pos.daySellValue / pos.daySellQty : 0)}</> : '—'}
                      </td>
                      <td className={cn('px-3 py-2.5 font-mono font-semibold', pnlColor(pos.unrealizedProfit))}>
                        {fmt(pos.unrealizedProfit, 0)}
                      </td>
                      <td className={cn('px-3 py-2.5 font-mono font-semibold', pnlColor(pos.realizedProfit))}>
                        {fmt(pos.realizedProfit, 0)}
                      </td>
                      <td className={cn('px-3 py-2.5 font-mono font-bold', pnlColor(netPnl))}>
                        <span className="flex items-center gap-1">
                          {netPnl > 0 ? <TrendingUp size={11} /> : netPnl < 0 ? <TrendingDown size={11} /> : null}
                          {fmt(netPnl, 0)}
                        </span>
                      </td>
                    </tr>
                  );
                })}
              </tbody>
            </table>
          </div>
          <div className="border-t border-border px-4 py-2.5 flex items-center justify-between">
            <p className="text-xs text-muted">
              {filtered.length} position{filtered.length !== 1 ? 's' : ''}
              {filtered.length !== positions.length ? ` (${positions.length} total)` : ''}
            </p>
            <p className={cn('text-xs font-mono font-semibold', pnlColor(totalNet))}>
              Net: {fmt(totalNet, 0)}
            </p>
          </div>
        </div>
      )}
    </div>
  );
}
