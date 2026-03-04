/**
 * Statement.tsx
 * Ledger Report + Trade History with date range pickers and pagination.
 */
import { useState, useEffect } from 'react';
import { useAuth } from '@/app/providers/AuthProvider';
import { supabase } from '@/lib/supabase';
import { cn } from '@/lib/utils';
import { toast } from 'sonner';
import type { BrokerAccount, DhanLedgerEntry, DhanTradeHistoryEntry } from '@/types';
import { FileText, ChevronDown, RefreshCw, ChevronLeft, ChevronRight, TrendingUp, BookOpen } from 'lucide-react';

// ── Helpers ──────────────────────────────────────────────────────────────────
const today = () => new Date().toISOString().slice(0, 10);
const nDaysAgo = (n: number) => {
  const d = new Date();
  d.setDate(d.getDate() - n);
  return d.toISOString().slice(0, 10);
};

function fmtAmt(v: string | undefined, cls?: string) {
  const n = parseFloat(v ?? '0');
  if (isNaN(n) || n === 0) return <span className="text-muted">—</span>;
  return <span className={cls}>{new Intl.NumberFormat('en-IN', { style: 'currency', currency: 'INR', maximumFractionDigits: 2 }).format(n)}</span>;
}

// ── Main ─────────────────────────────────────────────────────────────────────
type Tab = 'ledger' | 'trades';

export default function Statement() {
  const { profile } = useAuth();
  const [brokers, setBrokers]               = useState<BrokerAccount[]>([]);
  const [selectedBroker, setSelectedBroker] = useState('');
  const [activeTab, setActiveTab]           = useState<Tab>('ledger');

  useEffect(() => {
    if (!profile) return;
    supabase
      .from('broker_accounts')
      .select('id, broker, client_id, is_active, health_status')
      .eq('user_id', profile.id)
      .eq('is_active', true)
      .then(({ data }) => {
        const list = (data ?? []) as BrokerAccount[];
        setBrokers(list);
        if (list.length > 0 && !selectedBroker) setSelectedBroker(list[0].id);
      });
  }, [profile]);

  return (
    <div className="space-y-5 p-6">
      <div className="flex items-center justify-between">
        <div>
          <h1 className="text-xl font-bold text-foreground flex items-center gap-2"><FileText size={20} className="text-accent-cyan" /> Statement</h1>
          <p className="text-xs text-muted mt-0.5">Ledger report and trade history from your Dhan account</p>
        </div>
        <div className="relative">
          <select value={selectedBroker} onChange={e => setSelectedBroker(e.target.value)} className="input-base pr-8 text-sm min-w-[160px]">
            {brokers.length === 0 && <option value="">No brokers</option>}
            {brokers.map(b => <option key={b.id} value={b.id}>{b.broker} · {b.client_id}</option>)}
          </select>
          <ChevronDown size={12} className="absolute right-2.5 top-1/2 -translate-y-1/2 text-muted pointer-events-none" />
        </div>
      </div>

      {/* Tab strip */}
      <div className="flex gap-1 p-1 bg-border/10 rounded-xl w-fit border border-border/30">
        {([
          { key: 'ledger', label: 'Ledger', icon: BookOpen },
          { key: 'trades', label: 'Trade History', icon: TrendingUp },
        ] as const).map(({ key, label, icon: Icon }) => (
          <button key={key} onClick={() => setActiveTab(key)}
            className={cn('flex items-center gap-1.5 px-4 py-1.5 rounded-lg text-xs font-semibold transition-all',
              activeTab === key ? 'bg-accent-cyan/10 text-accent-cyan border border-accent-cyan/30' : 'text-muted hover:text-foreground')}>
            <Icon size={13} />{label}
          </button>
        ))}
      </div>

      {activeTab === 'ledger' && <LedgerTab brokerId={selectedBroker} />}
      {activeTab === 'trades' && <TradesTab  brokerId={selectedBroker} />}
    </div>
  );
}

// ── Ledger Tab ────────────────────────────────────────────────────────────────
function LedgerTab({ brokerId }: { brokerId: string }) {
  const [fromDate, setFrom] = useState(nDaysAgo(30));
  const [toDate, setTo]     = useState(today());
  const [loading, setLoading] = useState(false);
  const [rows, setRows]       = useState<DhanLedgerEntry[]>([]);

  const fetch_ = async () => {
    if (!brokerId) { toast.error('Select a broker'); return; }
    setLoading(true);
    try {
      const res  = await fetch(`/api/dhan-ledger?brokerId=${brokerId}&fromDate=${fromDate}&toDate=${toDate}`);
      const data = await res.json() as DhanLedgerEntry[] | { error?: string };
      if (!res.ok) throw new Error((data as { error?: string }).error ?? 'Fetch failed');
      setRows(Array.isArray(data) ? data : []);
    } catch (err) { toast.error(err instanceof Error ? err.message : 'Error'); }
    setLoading(false);
  };

  // Running balance summary
  const totalCredit = rows.reduce((s, r) => s + parseFloat(r.credit ?? '0'), 0);
  const totalDebit  = rows.reduce((s, r) => s + parseFloat(r.debit ?? '0'), 0);
  const lastBalance = rows[0]?.runbal;

  return (
    <div className="space-y-4">
      {/* Controls */}
      <div className="flex flex-wrap items-end gap-3">
        <div><label className="block text-xs text-muted mb-1.5">From Date</label>
          <input type="date" className="input-base text-sm" value={fromDate} max={toDate} onChange={e => setFrom(e.target.value)} />
        </div>
        <div><label className="block text-xs text-muted mb-1.5">To Date</label>
          <input type="date" className="input-base text-sm" value={toDate} min={fromDate} onChange={e => setTo(e.target.value)} />
        </div>
        <button onClick={fetch_} disabled={loading || !brokerId} className="btn-primary gap-2 self-end">
          <RefreshCw size={13} className={loading ? 'animate-spin' : ''} /> Fetch
        </button>
      </div>

      {/* Summary cards */}
      {rows.length > 0 && (
        <div className="grid grid-cols-3 gap-3">
          <div className="panel p-3 text-center">
            <p className="text-[10px] text-muted">Total Credit</p>
            <p className="text-profit font-mono font-semibold text-sm mt-1">
              ₹{new Intl.NumberFormat('en-IN').format(totalCredit)}
            </p>
          </div>
          <div className="panel p-3 text-center">
            <p className="text-[10px] text-muted">Total Debit</p>
            <p className="text-loss font-mono font-semibold text-sm mt-1">
              ₹{new Intl.NumberFormat('en-IN').format(totalDebit)}
            </p>
          </div>
          {lastBalance && (
            <div className="panel p-3 text-center">
              <p className="text-[10px] text-muted">Latest Balance</p>
              <p className="text-accent-cyan font-mono font-semibold text-sm mt-1">
                ₹{new Intl.NumberFormat('en-IN').format(parseFloat(lastBalance))}
              </p>
            </div>
          )}
        </div>
      )}

      {/* Table */}
      {loading ? (
        <div className="flex justify-center py-16"><div className="w-6 h-6 rounded-full border-2 border-accent-cyan border-t-transparent animate-spin" /></div>
      ) : rows.length === 0 ? (
        <div className="panel p-12 text-center">
          <BookOpen size={28} className="mx-auto mb-3 text-muted opacity-30" />
          <p className="text-sm text-muted">Select a date range and click Fetch to load ledger</p>
        </div>
      ) : (
        <div className="panel overflow-hidden">
          <div className="overflow-x-auto">
            <table className="w-full text-xs">
              <thead>
                <tr className="border-b border-border">
                  {['Date', 'Narration', 'Exchange', 'Voucher Desc', 'Voucher #', 'Debit', 'Credit', 'Balance'].map(h => (
                    <th key={h} className="px-3 py-2.5 text-left font-semibold text-muted whitespace-nowrap">{h}</th>
                  ))}
                </tr>
              </thead>
              <tbody>
                {rows.map((row, i) => (
                  <tr key={i} className="border-b border-border/40 hover:bg-border/5 transition-colors">
                    <td className="px-3 py-2 font-mono whitespace-nowrap">{row.voucherdate}</td>
                    <td className="px-3 py-2 max-w-[200px] truncate" title={row.narration}>{row.narration}</td>
                    <td className="px-3 py-2 text-muted whitespace-nowrap">{row.exchange}</td>
                    <td className="px-3 py-2 text-muted whitespace-nowrap">{row.voucherdesc}</td>
                    <td className="px-3 py-2 font-mono text-muted">{row.vouchernumber}</td>
                    <td className="px-3 py-2 font-mono">{fmtAmt(row.debit, 'text-loss')}</td>
                    <td className="px-3 py-2 font-mono">{fmtAmt(row.credit, 'text-profit')}</td>
                    <td className="px-3 py-2 font-mono text-accent-cyan">
                      {parseFloat(row.runbal ?? '0').toLocaleString('en-IN', { minimumFractionDigits: 2 })}
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
          <div className="px-3 py-2 text-[10px] text-muted border-t border-border">{rows.length} entries</div>
        </div>
      )}
    </div>
  );
}

// ── Trade History Tab ─────────────────────────────────────────────────────────
function TradesTab({ brokerId }: { brokerId: string }) {
  const [fromDate, setFrom] = useState(nDaysAgo(30));
  const [toDate, setTo]     = useState(today());
  const [page, setPage]     = useState(0);
  const [loading, setLoading] = useState(false);
  const [rows, setRows]       = useState<DhanTradeHistoryEntry[]>([]);
  const [hasMore, setHasMore] = useState(false);

  const fetch_ = async (p = page) => {
    if (!brokerId) { toast.error('Select a broker'); return; }
    setLoading(true);
    try {
      const res  = await fetch(`/api/dhan-trade-history?brokerId=${brokerId}&fromDate=${fromDate}&toDate=${toDate}&page=${p}`);
      const data = await res.json() as DhanTradeHistoryEntry[] | { error?: string };
      if (!res.ok) throw new Error((data as { error?: string }).error ?? 'Fetch failed');
      const list = Array.isArray(data) ? data : [];
      setRows(list);
      setHasMore(list.length >= 50); // Dhan typically returns 50 per page
      setPage(p);
    } catch (err) { toast.error(err instanceof Error ? err.message : 'Error'); }
    setLoading(false);
  };

  const totalCharges = rows.reduce((s, r) => s + (r.sebiTax ?? 0) + (r.stt ?? 0) + (r.brokerageCharges ?? 0) + (r.serviceTax ?? 0) + (r.exchangeTransactionCharges ?? 0) + (r.stampDuty ?? 0), 0);

  return (
    <div className="space-y-4">
      {/* Controls */}
      <div className="flex flex-wrap items-end gap-3">
        <div><label className="block text-xs text-muted mb-1.5">From Date</label>
          <input type="date" className="input-base text-sm" value={fromDate} max={toDate} onChange={e => setFrom(e.target.value)} />
        </div>
        <div><label className="block text-xs text-muted mb-1.5">To Date</label>
          <input type="date" className="input-base text-sm" value={toDate} min={fromDate} onChange={e => setTo(e.target.value)} />
        </div>
        <button onClick={() => fetch_(0)} disabled={loading || !brokerId} className="btn-primary gap-2 self-end">
          <RefreshCw size={13} className={loading ? 'animate-spin' : ''} /> Fetch
        </button>
        {/* Pagination */}
        {rows.length > 0 && (
          <div className="flex items-center gap-2 self-end ml-auto">
            <span className="text-xs text-muted">Page {page}</span>
            <button disabled={page === 0 || loading} onClick={() => fetch_(page - 1)} className="p-1.5 rounded-lg border border-border hover:border-accent-cyan/50 disabled:opacity-40">
              <ChevronLeft size={13} />
            </button>
            <button disabled={!hasMore || loading} onClick={() => fetch_(page + 1)} className="p-1.5 rounded-lg border border-border hover:border-accent-cyan/50 disabled:opacity-40">
              <ChevronRight size={13} />
            </button>
          </div>
        )}
      </div>

      {/* Summary */}
      {rows.length > 0 && (
        <div className="grid grid-cols-3 gap-3">
          <div className="panel p-3 text-center">
            <p className="text-[10px] text-muted">Trades</p>
            <p className="text-foreground font-semibold text-lg mt-0.5">{rows.length}</p>
          </div>
          <div className="panel p-3 text-center">
            <p className="text-[10px] text-muted">Buy</p>
            <p className="text-profit font-semibold text-lg mt-0.5">{rows.filter(r => r.transactionType === 'BUY').length}</p>
          </div>
          <div className="panel p-3 text-center">
            <p className="text-[10px] text-muted">Total Charges</p>
            <p className="text-loss font-mono font-semibold text-sm mt-1">₹{totalCharges.toLocaleString('en-IN', { minimumFractionDigits: 4 })}</p>
          </div>
        </div>
      )}

      {/* Table */}
      {loading ? (
        <div className="flex justify-center py-16"><div className="w-6 h-6 rounded-full border-2 border-accent-cyan border-t-transparent animate-spin" /></div>
      ) : rows.length === 0 ? (
        <div className="panel p-12 text-center">
          <TrendingUp size={28} className="mx-auto mb-3 text-muted opacity-30" />
          <p className="text-sm text-muted">Select a date range and click Fetch to load trade history</p>
        </div>
      ) : (
        <div className="panel overflow-hidden">
          <div className="overflow-x-auto">
            <table className="w-full text-xs">
              <thead>
                <tr className="border-b border-border">
                  {['Exchange Time', 'Symbol', 'Side', 'Exchange', 'Product', 'Type', 'Qty', 'Price', 'Turnover', 'STT', 'Brokerage', 'Expiry'].map(h => (
                    <th key={h} className="px-3 py-2.5 text-left font-semibold text-muted whitespace-nowrap">{h}</th>
                  ))}
                </tr>
              </thead>
              <tbody>
                {rows.map((t, i) => {
                  const turnover = t.tradedQuantity * t.tradedPrice;
                  return (
                    <tr key={i} className="border-b border-border/40 hover:bg-border/5 transition-colors">
                      <td className="px-3 py-2 font-mono whitespace-nowrap text-muted">{t.exchangeTime}</td>
                      <td className="px-3 py-2 font-semibold whitespace-nowrap">{t.customSymbol || t.tradingSymbol || t.securityId}</td>
                      <td className="px-3 py-2">
                        <span className={cn('text-[10px] font-bold px-1.5 py-0.5 rounded', t.transactionType === 'BUY' ? 'bg-profit/10 text-profit' : 'bg-loss/10 text-loss')}>
                          {t.transactionType}
                        </span>
                      </td>
                      <td className="px-3 py-2 text-muted whitespace-nowrap">{t.exchangeSegment}</td>
                      <td className="px-3 py-2 text-muted">{t.productType}</td>
                      <td className="px-3 py-2 text-muted">{t.orderType}</td>
                      <td className="px-3 py-2 font-mono">{t.tradedQuantity.toLocaleString()}</td>
                      <td className="px-3 py-2 font-mono">₹{t.tradedPrice.toLocaleString('en-IN', { minimumFractionDigits: 2 })}</td>
                      <td className="px-3 py-2 font-mono text-accent-cyan">₹{turnover.toLocaleString('en-IN', { maximumFractionDigits: 2 })}</td>
                      <td className="px-3 py-2 font-mono text-muted">{t.stt}</td>
                      <td className="px-3 py-2 font-mono text-muted">{t.brokerageCharges}</td>
                      <td className="px-3 py-2 font-mono text-muted whitespace-nowrap">
                        {t.drvExpiryDate && t.drvExpiryDate !== 'NA' ? t.drvExpiryDate : '—'}
                        {t.drvOptionType && t.drvOptionType !== 'NA' && ` ${t.drvOptionType}`}
                        {t.drvStrikePrice ? ` @${t.drvStrikePrice}` : ''}
                      </td>
                    </tr>
                  );
                })}
              </tbody>
            </table>
          </div>
          <div className="px-3 py-2 text-[10px] text-muted border-t border-border flex items-center justify-between">
            <span>{rows.length} trades · page {page}</span>
            {hasMore && <span className="text-accent-cyan">More pages available →</span>}
          </div>
        </div>
      )}
    </div>
  );
}
